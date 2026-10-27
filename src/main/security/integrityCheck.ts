/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SECURITY_VAULT_DIR } from "@main/utils/constants";
import { existsSync, FSWatcher, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from "fs";
import { join } from "path";

import { recordBlockedAccess } from "./tokenVault";

const CLEAN_CORE_INDEX = "module.exports = require('./core.asar');\n";

let coreIntegrityVerified = false;
let coreFilesChecked = 0;
let coreTamperEventsHealed = 0;
let lastVerifiedAt = Date.now();
const watchedFiles = new Map<string, FSWatcher>();

function findDiscordCoreIndexFiles(): string[] {
    const results: string[] = [];
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return results;

    const discordDirs = ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"];
    for (const branch of discordDirs) {
        const branchRoot = join(localAppData, branch);
        if (!existsSync(branchRoot)) continue;

        try {
            const entries = readdirSync(branchRoot, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || !entry.name.startsWith("app-")) continue;
                const modulesDir = join(branchRoot, entry.name, "modules");
                if (!existsSync(modulesDir)) continue;

                const moduleFolders = readdirSync(modulesDir, { withFileTypes: true });
                for (const mod of moduleFolders) {
                    if (!mod.isDirectory() || !mod.name.startsWith("discord_desktop_core")) continue;
                    const indexPath = join(modulesDir, mod.name, "discord_desktop_core", "index.js");
                    if (existsSync(indexPath)) {
                        results.push(indexPath);
                    }
                }
            }
        } catch { }
    }
    return results;
}

function inspectAndHealCoreFile(filePath: string): boolean {
    try {
        const content = readFileSync(filePath, "utf-8").trim();
        // A clean discord_desktop_core/index.js only loads ./core.asar
        const isClean = content === "module.exports = require('./core.asar');"
            || content === 'module.exports = require("./core.asar");'
            || content === "module.exports = require('./core.asar')";

        if (!isClean) {
            // Quarantine the tampered file for user inspection and restore clean loader
            const quarantineDir = join(SECURITY_VAULT_DIR, "quarantine");
            mkdirSync(quarantineDir, { recursive: true });
            const backupName = `tampered_core_index_${Date.now()}.js.quarantine`;
            try {
                writeFileSync(join(quarantineDir, backupName), content, "utf-8");
            } catch { }

            writeFileSync(filePath, CLEAN_CORE_INDEX, "utf-8");
            coreTamperEventsHealed++;
            recordBlockedAccess(
                "CoreIntegrityGuard",
                `Detected & healed unauthorized code injection in ${filePath} (quarantined as ${backupName})`,
                content.slice(0, 300)
            );
            return false;
        }
        return true;
    } catch (err) {
        console.error("[Burgercord Security] Failed to verify core file:", filePath, err);
        return true;
    }
}

export function runCoreIntegrityCheck() {
    const files = findDiscordCoreIndexFiles();
    coreFilesChecked = files.length;
    lastVerifiedAt = Date.now();

    for (const file of files) {
        inspectAndHealCoreFile(file);

        if (!watchedFiles.has(file)) {
            try {
                const watcher = watch(file, eventType => {
                    if (eventType === "change" || eventType === "rename") {
                        inspectAndHealCoreFile(file);
                    }
                });
                watchedFiles.set(file, watcher);
            } catch { }
        }
    }

    coreIntegrityVerified = true;
    return {
        coreIntegrityVerified,
        coreFilesChecked,
        coreTamperEventsHealed,
        lastVerifiedAt
    };
}

export function getIntegrityStatus() {
    return {
        coreIntegrityVerified,
        coreFilesChecked,
        coreTamperEventsHealed,
        lastVerifiedAt
    };
}
