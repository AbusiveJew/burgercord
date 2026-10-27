/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

import { isTrustedCallerStack } from "./tokenGuard";

const logger = new Logger("BurgercordChunkGuard", "#F09C1F");

export function installWebpackChunkGuard() {
    try {
        const chunkObj = (window as any).webpackChunkdiscord_app;
        if (!chunkObj || typeof chunkObj.push !== "function" || chunkObj.__burgercordChunkGuarded) {
            return;
        }

        const origPush = chunkObj.push.bind(chunkObj);
        Object.defineProperty(chunkObj, "__burgercordChunkGuarded", {
            value: true,
            enumerable: false
        });

        chunkObj.push = function (chunk: any) {
            // check if a runtime callback is passed (common webpack scraping pattern)
            if (Array.isArray(chunk) && typeof chunk[2] === "function") {
                const stack = new Error().stack;
                const check = isTrustedCallerStack(stack);
                const fnSource = Function.prototype.toString.call(chunk[2]);

                if (!check.trusted || /getToken|sendBeacon|webhook/i.test(fnSource)) {
                    logger.warn("Blocked suspicious webpackChunkdiscord_app.push runtime callback:", check.reason);
                    try {
                        VencordNative?.security?.logBlockedAccess?.(
                            "webpackChunkdiscord_app.push",
                            `${check.reason} (Callback source: ${fnSource.slice(0, 140)})`,
                            stack
                        );
                    } catch { }
                    return 0;
                }
            }
            return origPush(chunk);
        };

        logger.info("Installed webpackChunkdiscord_app.push anti-scraper guard.");
    } catch (err) {
        logger.error("Failed to install webpackChunk guard:", err);
    }
}
