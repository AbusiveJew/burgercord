/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RendererSettings } from "@main/settings";
import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import crypto from "crypto";
import { ipcMain } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

export interface BurgercordReleaseManifest {
    name?: string;
    version: string;
    gitHash: string;
    buildTimestamp: number;
    changelog?: string;
    files: Record<string, {
        sha256: string;
        size?: number;
        url?: string;
    }>;
}

export interface AutoUpdateStatus {
    enabled: boolean;
    checkedOnBoot: boolean;
    lastCheckedAt: number | null;
    updateAvailable: boolean;
    updateAppliedOnBoot: boolean;
    currentVersion: string;
    currentHash: string;
    remoteVersion: string | null;
    remoteHash: string | null;
    endpointUrl: string;
    lastError: string | null;
}

const DEFAULT_UPDATE_ENDPOINT = process.env.BURGERCORD_UPDATE_URL
    || `https://github.com/${gitRemote || "mrvonderplanitz/burgercord"}/releases/latest/download/burgercord-manifest.json`;

const status: AutoUpdateStatus = {
    enabled: true,
    checkedOnBoot: false,
    lastCheckedAt: null,
    updateAvailable: false,
    updateAppliedOnBoot: false,
    currentVersion: VERSION,
    currentHash: gitHash,
    remoteVersion: null,
    remoteHash: null,
    endpointUrl: DEFAULT_UPDATE_ENDPOINT,
    lastError: null,
};

function sha256Buffer(buf: Buffer): string {
    return crypto.createHash("sha256").update(buf).digest("hex");
}

function getLocalFileSha256(filename: string): string | null {
    const filePath = join(__dirname, filename);
    if (!existsSync(filePath)) return null;
    try {
        return sha256Buffer(readFileSync(filePath));
    } catch {
        return null;
    }
}

export function getUpdateEndpointUrl(): string {
    try {
        const customUrl = (RendererSettings.store as any)?.burgercordUpdateUrl;
        if (customUrl && typeof customUrl === "string" && customUrl.startsWith("http")) {
            return customUrl;
        }
    } catch { }
    return DEFAULT_UPDATE_ENDPOINT;
}

export async function checkForUpdatesOnBoot(isBoot = true): Promise<AutoUpdateStatus> {
    status.endpointUrl = getUpdateEndpointUrl();
    status.lastCheckedAt = Date.now();
    if (isBoot) status.checkedOnBoot = true;

    try {
        const manifest = await Promise.race([
            fetchJson<BurgercordReleaseManifest>(status.endpointUrl, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": VENCORD_USER_AGENT
                }
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Boot update check timed out after 3000ms")), 3000)
            )
        ]);

        if (!manifest || typeof manifest !== "object" || !manifest.files) {
            throw new Error("Invalid burgercord-manifest.json format");
        }

        status.remoteVersion = manifest.version;
        status.remoteHash = manifest.gitHash;
        status.lastError = null;

        const baseUrl = status.endpointUrl.slice(0, status.endpointUrl.lastIndexOf("/") + 1);
        const filesToUpdate: Array<{ name: string; url: string; expectedSha256: string; }> = [];

        for (const [name, meta] of Object.entries(manifest.files)) {
            if (!meta?.sha256) continue;
            const localSha = getLocalFileSha256(name);
            if (localSha !== meta.sha256) {
                filesToUpdate.push({
                    name,
                    url: meta.url || (baseUrl + name),
                    expectedSha256: meta.sha256
                });
            }
        }

        if (filesToUpdate.length === 0) {
            status.updateAvailable = false;
            console.log(`[Burgercord AutoUpdater] Up to date (${status.currentVersion} @ ${status.currentHash}).`);
            return { ...status };
        }

        status.updateAvailable = true;
        console.log(`[Burgercord AutoUpdater] Found ${filesToUpdate.length} updated bundle file(s). Downloading & verifying SHA-256...`);

        const stagingDir = join(__dirname, ".staging");
        mkdirSync(stagingDir, { recursive: true });

        const stagedFiles: Array<{ tempPath: string; targetPath: string; }> = [];

        for (const item of filesToUpdate) {
            const buf = await fetchBuffer(item.url);
            const actualSha = sha256Buffer(buf);
            if (actualSha.toLowerCase() !== item.expectedSha256.toLowerCase()) {
                throw new Error(`SHA-256 mismatch for ${item.name}: expected ${item.expectedSha256}, got ${actualSha}`);
            }

            const tempPath = join(stagingDir, `${item.name}.tmp`);
            const targetPath = join(__dirname, item.name);
            writeFileSync(tempPath, buf);
            stagedFiles.push({ tempPath, targetPath });
        }

        // Atomically swap verified files into place
        for (const { tempPath, targetPath } of stagedFiles) {
            try {
                renameSync(tempPath, targetPath);
            } catch {
                writeFileSync(targetPath, readFileSync(tempPath));
            }
        }

        status.updateAppliedOnBoot = true;
        status.updateAvailable = false;
        status.currentVersion = manifest.version;
        status.currentHash = manifest.gitHash;
        console.log(`[Burgercord AutoUpdater] Successfully auto-updated Burgercord to ${manifest.version} (${manifest.gitHash})!`);
    } catch (err: any) {
        status.lastError = err?.message ?? String(err);
        // Non-fatal on boot when offline or before remote repository publishes its first release
        console.log(`[Burgercord AutoUpdater] Boot update check skipped/offline: ${status.lastError}`);
    }

    return { ...status };
}

export function initBootAutoUpdater() {
    // Run immediately on boot
    checkForUpdatesOnBoot(true).catch(() => { });

    // Also check periodically every 30 minutes while the app is open
    setInterval(() => {
        checkForUpdatesOnBoot(false).catch(() => { });
    }, 30 * 60 * 1000);

    ipcMain.handle(IpcEvents.CHECK_BOOT_UPDATES, () => checkForUpdatesOnBoot(false));
    ipcMain.handle(IpcEvents.GET_AUTO_UPDATE_STATUS, () => ({ ...status }));
}
