/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import crypto from "crypto";
import { app } from "electron";
import { existsSync, FSWatcher, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "fs";
import { join } from "path";

import { recordBlockedAccess } from "./tokenVault";

let canaryDeployed = false;
let canaryTriggeredCount = 0;
let canaryWatcher: FSWatcher | null = null;
let expectedCanaryPayload = "";

export function getLevelDbDir(): string {
    return join(app.getPath("userData"), "Local Storage", "leveldb");
}

export function getLocalStorageRootDir(): string {
    return join(app.getPath("userData"), "Local Storage");
}

export function deployCanaryHoneyfile() {
    try {
        // clean out any old .ldb files so chromium leveldb doesn't get confused and log the user out
        const legacyLdbCanary = join(getLevelDbDir(), "000099_burgercord_canary.ldb");
        if (existsSync(legacyLdbCanary)) {
            try {
                rmSync(legacyLdbCanary, { force: true });
            } catch { }
        }

        const storageDir = getLocalStorageRootDir();
        mkdirSync(storageDir, { recursive: true });

        const canaryFile = join(storageDir, "burgercord_token_canary.log");
        const fakeEncryptedBlob = Buffer.from(
            "BURGERCORD_CANARY_HONEYTOKEN_INVALID_DO_NOT_USE_" + crypto.randomBytes(24).toString("hex"),
            "utf-8"
        ).toString("base64");

        expectedCanaryPayload = [
            "https://discord.com\x00\x01tokens",
            `{"canary":"dQw4w9WgXcQ:${fakeEncryptedBlob}"}`,
            `token\x00"dQw4w9WgXcQ:${fakeEncryptedBlob}"`
        ].join("\n");

        writeFileSync(canaryFile, expectedCanaryPayload, "utf-8");
        canaryDeployed = true;

        if (!canaryWatcher) {
            try {
                canaryWatcher = watch(canaryFile, eventType => {
                    if (eventType === "change" || eventType === "rename") {
                        try {
                            const current = existsSync(canaryFile) ? readFileSync(canaryFile, "utf-8") : "";
                            if (current !== expectedCanaryPayload) {
                                canaryTriggeredCount++;
                                recordBlockedAccess(
                                    "CanaryHoneyfile",
                                    `External modification/deletion detected on ${canaryFile} — restored decoy honeyfile`
                                );
                                writeFileSync(canaryFile, expectedCanaryPayload, "utf-8");
                            }
                        } catch { }
                    }
                });
            } catch { }
        }
    } catch (err) {
        console.error("[Burgercord Security] Failed to deploy canary honeyfile:", err);
    }
}

export function getCanaryStatus() {
    return {
        canaryDeployed,
        canaryTriggeredCount
    };
}
