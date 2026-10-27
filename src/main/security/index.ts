/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { safeStorage } from "electron";

import { deployCanaryHoneyfile, getCanaryStatus } from "./canaryHoneyfile";
import { getIntegrityStatus, runCoreIntegrityCheck } from "./integrityCheck";
import {
    claimSessionNonce,
    getBlockedAccessLog,
    getKeyPath,
    getVaultPath,
    hasVaultedToken,
    isLevelDbScrubbed,
    recordBlockedAccess,
    retrieveTokenFromVault,
    SecurityStatus,
    storeTokenInVault
} from "./tokenVault";

export function scrubRealTokensFromLevelDbFiles(): number {
    // Handled cleanly via the Renderer Vault + Encrypted Key File lifecycle
    // so Chromium's binary LevelDB CRC checksums are never corrupted.
    return 0;
}

export function initMainSecurity() {
    try {
        runCoreIntegrityCheck();
        deployCanaryHoneyfile();
        console.log("[Burgercord Security] Initialized Two-File Encrypted Token Vault (token.vault.enc + master.key.enc), Core Integrity Guard, and Canary.");
    } catch (err) {
        console.error("[Burgercord Security] Initialization error:", err);
    }
}

export function getFullSecurityStatus(): SecurityStatus {
    const canary = getCanaryStatus();
    const integrity = getIntegrityStatus();
    const blockedLog = getBlockedAccessLog();

    return {
        vaultActive: true,
        vaultHasToken: hasVaultedToken(),
        vaultPath: getVaultPath(),
        keyFilePath: getKeyPath(),
        entropyMode: safeStorage.isEncryptionAvailable()
            ? "SHA256+AES256GCM+EncryptedKeyFile+DPAPI"
            : "SHA256+AES256GCM+EncryptedKeyFile",
        levelDbScrubbed: isLevelDbScrubbed(),
        canaryDeployed: canary.canaryDeployed,
        canaryTriggeredCount: canary.canaryTriggeredCount,
        coreIntegrityVerified: integrity.coreIntegrityVerified,
        coreFilesChecked: integrity.coreFilesChecked,
        coreTamperEventsHealed: integrity.coreTamperEventsHealed,
        tokenStoreGuardActive: true,
        blockedAccessCount: blockedLog.length,
        blockedAccessLog: blockedLog,
        lastVerifiedAt: integrity.lastVerifiedAt,
    };
}

export {
    claimSessionNonce,
    deployCanaryHoneyfile,
    recordBlockedAccess,
    retrieveTokenFromVault,
    runCoreIntegrityCheck,
    storeTokenInVault
};
