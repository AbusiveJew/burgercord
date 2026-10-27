/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ipcMain } from "electron";
import { IpcEvents } from "@shared/IpcEvents";
import gitRemote from "~git-remote";
import { checkForUpdatesOnBoot } from "./autoUpdater";
import { serializeErrors } from "./common";

// Check if any files actually differ from remote SHA-256 manifest
async function calculateGitChanges() {
    try {
        const res = await checkForUpdatesOnBoot(false);
        if (!res.updateAvailable) {
            return [];
        }
        return [{
            hash: res.remoteHash ?? "update",
            author: "Burgercord",
            message: `Burgercord update ${res.remoteVersion ?? "available"}`
        }];
    } catch {
        return [];
    }
}

async function fetchUpdates() {
    try {
        const res = await checkForUpdatesOnBoot(false);
        return Boolean(res.updateAvailable);
    } catch {
        return false;
    }
}

async function applyUpdates() {
    return true;
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${gitRemote}`));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
