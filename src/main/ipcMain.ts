/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./updater";
import "./ipcPlugins";
import "./settings";

import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { BrowserWindow, ipcMain, nativeTheme, shell, systemPreferences } from "electron";
import monacoHtml from "file://monacoWin.html?minify&base64";
import { FSWatcher, mkdirSync, readFileSync, watch, writeFileSync } from "fs";
import { open, readdir, readFile } from "fs/promises";
import { release } from "os";
import { join } from "path";

import { registerCspIpcHandlers } from "./csp/manager";
import { getCallQosStatus, setCallQosMode } from "./callBooster";
import {
    claimSessionNonce,
    deployCanaryHoneyfile,
    getFullSecurityStatus,
    recordBlockedAccess,
    retrieveTokenFromVault,
    runCoreIntegrityCheck,
    scrubRealTokensFromLevelDbFiles,
    storeTokenInVault
} from "./security";
import { getThemeInfo, stripBOM, UserThemeHeader } from "./themes";
import { ALLOWED_PROTOCOLS, PATCH_CACHE_DIR, QUICK_CSS_PATH, SETTINGS_DIR, THEMES_DIR } from "./utils/constants";
import { ensureSafePath } from "./utils/ensureSafePath";
import { makeLinksOpenExternally } from "./utils/externalLinks";

const RENDERER_CSS_PATH = join(__dirname, IS_VESKTOP ? "vencordDesktopRenderer.css" : "renderer.css");

mkdirSync(THEMES_DIR, { recursive: true });
mkdirSync(PATCH_CACHE_DIR, { recursive: true });

registerCspIpcHandlers();

function readCss() {
    return readFile(QUICK_CSS_PATH, "utf-8").catch(() => "");
}

async function listThemes(): Promise<UserThemeHeader[]> {
    const files = await readdir(THEMES_DIR).catch(() => []);

    const themeInfo: UserThemeHeader[] = [];

    for (const fileName of files) {
        if (!fileName.endsWith(".css")) continue;

        const data = await getThemeData(fileName).then(stripBOM).catch(() => null);
        if (data == null) continue;

        themeInfo.push(getThemeInfo(data, fileName));
    }

    return themeInfo;
}

function getThemeData(fileName: string) {
    fileName = fileName.replace(/\?v=\d+$/, "");
    const safePath = ensureSafePath(THEMES_DIR, fileName);
    if (!safePath) return Promise.reject(`Unsafe path ${fileName}`);
    return readFile(safePath, "utf-8");
}

ipcMain.handle(IpcEvents.OPEN_QUICKCSS, () => shell.openPath(QUICK_CSS_PATH));

ipcMain.handle(IpcEvents.OPEN_EXTERNAL, (_, url) => {
    try {
        var { protocol } = new URL(url);
    } catch {
        throw "Malformed URL";
    }
    if (!ALLOWED_PROTOCOLS.includes(protocol))
        throw "Disallowed protocol.";

    shell.openExternal(url)
        .catch(err => console.error("[Vencord] Failed to open external link", url, err));
});


ipcMain.handle(IpcEvents.GET_QUICK_CSS, () => readCss());
ipcMain.handle(IpcEvents.SET_QUICK_CSS, (_, css) =>
    writeFileSync(QUICK_CSS_PATH, css)
);

ipcMain.handle(IpcEvents.GET_THEMES_LIST, () => listThemes());
ipcMain.handle(IpcEvents.GET_THEME_DATA, (_, fileName) => getThemeData(fileName));
ipcMain.handle(IpcEvents.GET_THEME_SYSTEM_VALUES, () => {
    let accentColor = systemPreferences.getAccentColor?.() ?? "";

    if (accentColor.length && accentColor[0] !== "#") {
        accentColor = `#${accentColor}`;
    }

    return {
        "os-accent-color": accentColor
    };
});

ipcMain.handle(IpcEvents.OPEN_THEMES_FOLDER, () => shell.openPath(THEMES_DIR));
ipcMain.handle(IpcEvents.OPEN_SETTINGS_FOLDER, () => shell.openPath(SETTINGS_DIR));

let fsWatchers = [] as FSWatcher[];

ipcMain.handle(IpcEvents.INIT_FILE_WATCHERS, ({ sender }) => {
    fsWatchers.forEach(w => w.close());

    let quickCssWatcher: FSWatcher | undefined;
    let rendererCssWatcher: FSWatcher | undefined;

    open(QUICK_CSS_PATH, "a+").then(fd => {
        fd.close();
        quickCssWatcher = watch(QUICK_CSS_PATH, { persistent: false }, debounce(async () => {
            sender.postMessage(IpcEvents.QUICK_CSS_UPDATE, await readCss());
        }, 50));
    }).catch(() => { });

    const themesWatcher = watch(THEMES_DIR, { persistent: false }, debounce(() => {
        sender.postMessage(IpcEvents.THEME_UPDATE, void 0);
    }));

    if (IS_DEV) {
        rendererCssWatcher = watch(RENDERER_CSS_PATH, { persistent: false }, async () => {
            sender.postMessage(IpcEvents.RENDERER_CSS_UPDATE, await readFile(RENDERER_CSS_PATH, "utf-8"));
        });
    }

    fsWatchers = [quickCssWatcher, themesWatcher, rendererCssWatcher].filter(Boolean) as FSWatcher[];

    sender.once("destroyed", () => {
        quickCssWatcher?.close();
        themesWatcher.close();
        rendererCssWatcher?.close();
        fsWatchers = [];
    });
});

ipcMain.on(IpcEvents.GET_MONACO_THEME, e => {
    e.returnValue = nativeTheme.shouldUseDarkColors ? "vs-dark" : "vs-light";
});

ipcMain.handle(IpcEvents.OPEN_MONACO_EDITOR, async () => {
    const title = "Burgercord QuickCSS Editor";
    const existingWindow = BrowserWindow.getAllWindows().find(w => w.title === title);
    if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.focus();
        return;
    }

    const win = new BrowserWindow({
        title,
        autoHideMenuBar: true,
        darkTheme: true,
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "white",
        webPreferences: {
            preload: join(__dirname, IS_DISCORD_DESKTOP ? "preload.js" : "vencordDesktopPreload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    makeLinksOpenExternally(win);

    await win.loadURL(`data:text/html;base64,${monacoHtml}`);
});

ipcMain.handle(IpcEvents.GET_RENDERER_CSS, () => readFile(RENDERER_CSS_PATH, "utf-8"));

if (IS_DISCORD_DESKTOP) {
    ipcMain.on(IpcEvents.PRELOAD_GET_RENDERER_JS, e => {
        e.returnValue = readFileSync(join(__dirname, "renderer.js"), "utf-8");
    });
}

ipcMain.on(IpcEvents.SUPPORTS_WINDOWS_MATERIAL, e => {
    e.returnValue = process.platform === "win32" && Number(release().split(".")[2]) >= 22621;
});

// Burgercord Security & Token Vault IPC Handlers
ipcMain.on(IpcEvents.SECURITY_GET_SESSION_NONCE, e => {
    e.returnValue = claimSessionNonce();
});

ipcMain.on(IpcEvents.SECURITY_VAULT_STORE_TOKEN, (e, nonce: string, tokenBlob: string) => {
    const ok = storeTokenInVault(nonce, tokenBlob);
    if (ok) {
        deployCanaryHoneyfile();
    }
    e.returnValue = ok;
});

ipcMain.handle(IpcEvents.SECURITY_VAULT_STORE_TOKEN, (_, nonce: string, tokenBlob: string) => {
    const ok = storeTokenInVault(nonce, tokenBlob);
    if (ok) {
        deployCanaryHoneyfile();
    }
    return ok;
});

ipcMain.on(IpcEvents.SECURITY_VAULT_GET_TOKEN, (e, nonce: string) => {
    e.returnValue = retrieveTokenFromVault(nonce);
});

ipcMain.handle(IpcEvents.SECURITY_VAULT_GET_TOKEN, (_, nonce: string) => {
    return retrieveTokenFromVault(nonce);
});

ipcMain.handle(IpcEvents.SECURITY_GET_STATUS, () => {
    return getFullSecurityStatus();
});

ipcMain.handle(IpcEvents.SECURITY_LOG_BLOCKED_ACCESS, (_, source: string, reason: string, stackPreview?: string) => {
    recordBlockedAccess(source, reason, stackPreview);
    return true;
});

ipcMain.handle(IpcEvents.SECURITY_VERIFY_INTEGRITY, () => {
    runCoreIntegrityCheck();
    deployCanaryHoneyfile();
    scrubRealTokensFromLevelDbFiles();
    return getFullSecurityStatus();
});

ipcMain.handle(IpcEvents.SECURITY_RUN_SELF_TEST, () => {
    const testNonce = claimSessionNonce();
    const existingToken = retrieveTokenFromVault(testNonce);
    const testPayload = existingToken || JSON.stringify({ selfTest: "BURGERCORD_SELF_TEST_TOKEN_" + Date.now() });
    const stored = storeTokenInVault(testNonce, testPayload);
    const roundTrip = retrieveTokenFromVault(testNonce) === testPayload;
    const invalidBlocked = retrieveTokenFromVault("invalid_forged_nonce") === null;
    if (existingToken) {
        storeTokenInVault(testNonce, existingToken);
    }
    runCoreIntegrityCheck();
    deployCanaryHoneyfile();
    return {
        passed: stored && roundTrip && invalidBlocked,
        vaultRoundTrip: stored && roundTrip,
        forgedNonceRejected: invalidBlocked,
        status: getFullSecurityStatus()
    };
});

// Burgercord Call Performance & QoS IPC Handlers
ipcMain.handle(IpcEvents.SET_CALL_QOS_MODE, ({ sender }, active: boolean, channelName?: string) => {
    const win = BrowserWindow.fromWebContents(sender);
    return setCallQosMode(win, active, channelName);
});

ipcMain.handle(IpcEvents.GET_CALL_QOS_STATUS, () => {
    return getCallQosStatus();
});

// Burgercord Build-Indexed AOT Patch Cache IPC Handlers
ipcMain.on(IpcEvents.GET_PATCH_CACHE, (e, buildKey: string) => {
    try {
        const safeKey = String(buildKey).replace(/[^a-zA-Z0-9._-]/g, "_");
        const cacheFile = ensureSafePath(PATCH_CACHE_DIR, `${safeKey}.json`);
        if (cacheFile) {
            e.returnValue = JSON.parse(readFileSync(cacheFile, "utf-8"));
            return;
        }
    } catch { }
    e.returnValue = null;
});

ipcMain.handle(IpcEvents.SAVE_PATCH_CACHE, (_, buildKey: string, data: unknown) => {
    try {
        const safeKey = String(buildKey).replace(/[^a-zA-Z0-9._-]/g, "_");
        const cacheFile = ensureSafePath(PATCH_CACHE_DIR, `${safeKey}.json`);
        if (cacheFile) {
            writeFileSync(cacheFile, JSON.stringify(data), "utf-8");
            return true;
        }
    } catch { }
    return false;
});

ipcMain.handle(IpcEvents.CLEAR_PATCH_CACHE, async () => {
    try {
        const files = await readdir(PATCH_CACHE_DIR).catch(() => []);
        const { unlink } = await import("fs/promises");
        for (const f of files) {
            if (f.endsWith(".json")) {
                const p = ensureSafePath(PATCH_CACHE_DIR, f);
                if (p) await unlink(p).catch(() => { });
            }
        }
        return true;
    } catch {
        return false;
    }
});
