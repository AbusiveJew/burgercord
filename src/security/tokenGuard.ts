/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

const logger = new Logger("BurgercordTokenGuard", "#5865F2");

const PROTECTED_KEYS = ["token", "tokens", "MultiAccountStore", "user_id_cache"] as const;
const PROTECTED_KEY_SET = new Set<string>(PROTECTED_KEYS);

const inMemoryTokenStore = new Map<string, string>();
let localBlockedCount = 0;
let tokenGuardInitialized = false;

function isInvalidOrCanaryValue(val: string | null | undefined): boolean {
    if (!val) return true;
    return (
        val.includes("BURGERCORD_VAULTED_CANARY") ||
        val.includes("REDACTED_BY_BURGERCORD") ||
        val === '""' ||
        val === "{}" ||
        val === "null"
    );
}

/**
 * Verifies whether a call to getToken() or localStorage.getItem("token")
 * originates from legitimate Discord bundle assets or internal Burgercord code,
 * rather than a console paste, injected <script>, or rogue webpackChunk scraper.
 */
export function isTrustedCallerStack(stack?: string): { trusted: boolean; reason: string; } {
    if (!stack) {
        return { trusted: false, reason: "Missing call stack" };
    }

    const lines = stack.split("\n").slice(1);

    for (const line of lines) {
        if (
            line.includes("<anonymous>:") ||
            line.includes("debugger://") ||
            line.includes("userscript.html") ||
            line.includes("Tampermonkey") ||
            line.includes("Violentmonkey") ||
            line.includes("handleSimulateTokenGrabAttempt")
        ) {
            if (!line.includes("WebpackModule")) {
                return {
                    trusted: false,
                    reason: `Untrusted execution frame detected: ${line.trim().slice(0, 120)}`
                };
            }
        }
    }

    const hasLegitFrame = lines.some(line =>
        line.includes("/assets/") ||
        line.includes("WebpackModule") ||
        line.includes("renderer.js") ||
        line.includes("discord.com") ||
        line.includes("discordapp.com")
    );

    if (!hasLegitFrame) {
        return {
            trusted: false,
            reason: "No verified Discord bundle or WebpackModule frame in call stack"
        };
    }

    return { trusted: true, reason: "Verified bundle caller" };
}

function reportBlockedTokenAccess(source: string, reason: string, stack?: string) {
    localBlockedCount++;
    logger.warn(`Blocked unauthorized token read (${source}): ${reason}`);
    try {
        VencordNative?.security?.logBlockedAccess?.(source, reason, stack);
    } catch { }
}

function persistMemoryToVaultSync() {
    try {
        const obj: Record<string, string> = {};
        for (const [k, v] of inMemoryTokenStore.entries()) {
            if (!isInvalidOrCanaryValue(v)) {
                obj[k] = v;
            }
        }
        if (Object.keys(obj).length > 0) {
            VencordNative?.security?.storeTokenSync?.(JSON.stringify(obj));
        }
    } catch { }
}

export function initTokenGuard() {
    if (tokenGuardInitialized) return;
    tokenGuardInitialized = true;

    try {
        const origGetItem = Storage.prototype.getItem;
        const origSetItem = Storage.prototype.setItem;
        const origRemoveItem = Storage.prototype.removeItem;

        // 1. Clean up any legacy canary strings that could cause Discord to reject the session
        for (const key of PROTECTED_KEYS) {
            try {
                const cur = origGetItem.call(window.localStorage, key);
                if (cur && (cur.includes("BURGERCORD_VAULTED_CANARY") || cur.includes("REDACTED_BY_BURGERCORD"))) {
                    origRemoveItem.call(window.localStorage, key);
                }
            } catch { }
        }

        // 2. Synchronously decrypt token.vault.enc (using master.key.enc) BEFORE Discord loads
        try {
            const vaultedJson = VencordNative?.security?.retrieveTokenSync?.();
            if (vaultedJson) {
                const parsed = JSON.parse(vaultedJson) as Record<string, string>;
                for (const [k, v] of Object.entries(parsed)) {
                    if (typeof v === "string" && !isInvalidOrCanaryValue(v)) {
                        inMemoryTokenStore.set(k, v);
                        // Restore directly into localStorage before Discord's auth check runs
                        const existing = origGetItem.call(window.localStorage, k);
                        if (isInvalidOrCanaryValue(existing)) {
                            origSetItem.call(window.localStorage, k, v);
                        }
                    }
                }
                logger.info("Synchronously decrypted & restored session from token.vault.enc + master.key.enc.");
            }
        } catch (err) {
            logger.error("Failed synchronous vault hydration:", err);
        }

        // 3. Capture any live valid token currently in localStorage into our encrypted vault
        try {
            let capturedAny = false;
            for (const key of PROTECTED_KEYS) {
                const existing = origGetItem.call(window.localStorage, key);
                if (existing && !isInvalidOrCanaryValue(existing)) {
                    inMemoryTokenStore.set(key, existing);
                    capturedAny = true;
                }
            }
            if (capturedAny) {
                persistMemoryToVaultSync();
            }
        } catch { }

        // 4. Intercept Storage.prototype.getItem / setItem / removeItem
        //    - Allows Discord's internal code (both getItem and direct bracket localStorage[key] reads)
        //      to work seamlessly without ever logging you out
        //    - Blocks untrusted console / injected script getItem("token") calls
        //    - Automatically encrypts any new token into token.vault.enc
        Storage.prototype.getItem = function (key: string): string | null {
            if (this === window.localStorage && PROTECTED_KEY_SET.has(key)) {
                const stack = new Error().stack;
                const check = isTrustedCallerStack(stack);
                if (!check.trusted) {
                    reportBlockedTokenAccess(`localStorage.getItem("${key}")`, check.reason, stack);
                    return '"REDACTED_BY_BURGERCORD"';
                }
                const liveVal = origGetItem.call(this, key);
                if (!isInvalidOrCanaryValue(liveVal)) {
                    return liveVal;
                }
                if (inMemoryTokenStore.has(key)) {
                    const vaultedVal = inMemoryTokenStore.get(key)!;
                    origSetItem.call(this, key, vaultedVal);
                    return vaultedVal;
                }
            }
            return origGetItem.call(this, key);
        };

        Storage.prototype.setItem = function (key: string, value: string): void {
            if (this === window.localStorage && PROTECTED_KEY_SET.has(key)) {
                if (!isInvalidOrCanaryValue(value)) {
                    inMemoryTokenStore.set(key, value);
                    persistMemoryToVaultSync();
                } else if (inMemoryTokenStore.has(key)) {
                    // Prevent Discord's accidental token-hiding from wiping a valid session unless explicitly logging out
                    const stack = new Error().stack || "";
                    if (stack.includes("setDevtoolsCallbacks") || stack.includes("hideToken")) {
                        return;
                    }
                }
            }
            origSetItem.call(this, key, value);
        };

        Storage.prototype.removeItem = function (key: string): void {
            if (this === window.localStorage && PROTECTED_KEY_SET.has(key)) {
                const stack = new Error().stack || "";
                // Block Discord's automatic token deletion when DevTools/window closes;
                // only allow removal if user explicitly clicked Log Out (handleLogout / logout)
                if (!/logout|switchAccount/i.test(stack) && inMemoryTokenStore.has(key)) {
                    return;
                }
                inMemoryTokenStore.delete(key);
            }
            origRemoveItem.call(this, key);
        };

        // Periodically back up valid tokens from localStorage to token.vault.enc
        setInterval(() => {
            try {
                let updated = false;
                for (const key of PROTECTED_KEYS) {
                    const val = origGetItem.call(window.localStorage, key);
                    if (val && !isInvalidOrCanaryValue(val) && inMemoryTokenStore.get(key) !== val) {
                        inMemoryTokenStore.set(key, val);
                        updated = true;
                    }
                }
                if (updated) {
                    persistMemoryToVaultSync();
                }
            } catch { }
        }, 5000);

        logger.info("Initialized Two-File Encrypted Token Vault (token.vault.enc + master.key.enc) & Session Persistence Guard.");
    } catch (err) {
        logger.error("Failed to initialize Token Guard:", err);
    }
}

export function wrapTokenStoreModule(tokenModule: any) {
    if (!tokenModule || typeof tokenModule.getToken !== "function" || tokenModule.__burgercordGuarded) {
        return;
    }

    try {
        const origGetToken = tokenModule.getToken.bind(tokenModule);
        Object.defineProperty(tokenModule, "__burgercordGuarded", {
            value: true,
            configurable: false,
            enumerable: false
        });

        // Prevent Discord's hideToken() method from deleting the token from storage and logging the user out
        if (typeof tokenModule.hideToken === "function") {
            tokenModule.hideToken = () => { };
        }

        tokenModule.getToken = function (...args: any[]) {
            const stack = new Error().stack;
            const check = isTrustedCallerStack(stack);
            if (!check.trusted) {
                reportBlockedTokenAccess("TokenStore.getToken()", check.reason, stack);
                return "REDACTED_BY_BURGERCORD";
            }
            return origGetToken(...args);
        };
        logger.info("Hardened Discord TokenStore.getToken() and neutralized hideToken() self-logout.");
    } catch (err) {
        logger.error("Failed to wrap TokenStore.getToken:", err);
    }
}

export function getLocalBlockedCount(): number {
    return localBlockedCount;
}
