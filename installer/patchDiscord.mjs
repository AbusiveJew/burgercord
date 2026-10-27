/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync, spawn } from "child_process";
import crypto from "crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import os from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = join(__dirname, "..");
export const ASSETS_DIR = join(ROOT_DIR, "assets");
export const LOCAL_DIST_DIR = join(ROOT_DIR, "dist");

export function getBurgercordDataDir() {
    if (process.env.BURGERCORD_USER_DATA_DIR) return process.env.BURGERCORD_USER_DATA_DIR;
    const appData = process.env.APPDATA || join(os.homedir(), "AppData", "Roaming");
    return join(appData, "Burgercord");
}

export function getInstalledDistDir() {
    return join(getBurgercordDataDir(), "dist");
}

/**
 * Builds a valid Chromium/Electron v4 ASAR archive in memory containing:
 * - package.json: { "name": "discord", "main": "index.js" }
 * - index.js: require("<installedDistDir>/patcher.js")
 */
export function buildBurgercordAsarBuffer(patcherJsPath) {
    const pkgContent = Buffer.from(
        JSON.stringify({ name: "discord", main: "index.js" }),
        "utf-8"
    );
    const indexContent = Buffer.from(
        `require(${JSON.stringify(patcherJsPath)});\n`,
        "utf-8"
    );

    const sha256 = buf => crypto.createHash("sha256").update(buf).digest("hex");

    const headerObj = {
        files: {
            "package.json": {
                size: pkgContent.length,
                offset: "0",
                integrity: {
                    algorithm: "SHA256",
                    hash: sha256(pkgContent),
                    blockSize: 4194304,
                    blocks: [sha256(pkgContent)]
                }
            },
            "index.js": {
                size: indexContent.length,
                offset: String(pkgContent.length),
                integrity: {
                    algorithm: "SHA256",
                    hash: sha256(indexContent),
                    blockSize: 4194304,
                    blocks: [sha256(indexContent)]
                }
            }
        }
    };

    const headerString = JSON.stringify(headerObj);
    const headerStringBuf = Buffer.from(headerString, "utf-8");
    const headerStringSize = headerStringBuf.length;
    const paddingSize = (4 - (headerStringSize % 4)) % 4;
    const alignedHeaderSize = headerStringSize + paddingSize;

    const pickleHeader = Buffer.alloc(16 + alignedHeaderSize);
    pickleHeader.writeUInt32LE(4, 0);
    pickleHeader.writeUInt32LE(alignedHeaderSize + 8, 4);
    pickleHeader.writeUInt32LE(alignedHeaderSize + 4, 8);
    pickleHeader.writeUInt32LE(headerStringSize, 12);
    headerStringBuf.copy(pickleHeader, 16);

    return Buffer.concat([pickleHeader, pkgContent, indexContent]);
}

function compareAppVersions(a, b) {
    const pa = a.replace(/^app-/, "").split(".").map(Number);
    const pb = b.replace(/^app-/, "").split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

export function isDiscordRunning(folderName) {
    if (process.platform !== "win32") return false;
    const exeName = `${folderName}.exe`;
    try {
        const listOut = execFileSync("tasklist.exe", ["/FI", `IMAGENAME eq ${exeName}`, "/NH"], {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"]
        });
        return listOut.toLowerCase().includes(exeName.toLowerCase());
    } catch {
        return false;
    }
}

export function detectDiscordInstallations() {
    const installations = [];
    const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");

    const branches = [
        { id: "stable", name: "Discord Stable", folder: "Discord" },
        { id: "ptb", name: "Discord PTB", folder: "DiscordPTB" },
        { id: "canary", name: "Discord Canary", folder: "DiscordCanary" },
        { id: "development", name: "Discord Development", folder: "DiscordDevelopment" },
    ];

    for (const b of branches) {
        const rootPath = join(localAppData, b.folder);
        if (!existsSync(rootPath)) continue;

        try {
            const appFolders = readdirSync(rootPath, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name.startsWith("app-"))
                .map(d => d.name)
                .sort(compareAppVersions);

            if (appFolders.length === 0) continue;

            const latestApp = appFolders[appFolders.length - 1];
            const resourcesDir = join(rootPath, latestApp, "resources");
            if (!existsSync(resourcesDir)) continue;

            const isPatched = existsSync(join(resourcesDir, "_app.asar"));
            const isRunning = isDiscordRunning(b.folder);

            installations.push({
                id: b.id,
                name: b.name,
                folder: b.folder,
                rootPath,
                latestApp,
                appDir: join(rootPath, latestApp),
                resourcesDir,
                isPatched,
                isRunning
            });
        } catch { }
    }

    return installations;
}

export function syncDistToBurgercordDataDir() {
    const targetDist = getInstalledDistDir();
    mkdirSync(targetDist, { recursive: true });

    const filesToCopy = [
        "patcher.js",
        "patcher.js.map",
        "preload.js",
        "preload.js.map",
        "renderer.js",
        "renderer.js.map",
        "renderer.css",
        "burgercord.ico",
        "burgercord.png",
        "burgercord-tray.png",
        "burgercord-tray-unread.png",
        "burgercord-manifest.json"
    ];

    for (const file of filesToCopy) {
        const src = existsSync(join(LOCAL_DIST_DIR, file))
            ? join(LOCAL_DIST_DIR, file)
            : join(ASSETS_DIR, file);
        if (existsSync(src)) {
            copyFileSync(src, join(targetDist, file));
        }
    }

    return targetDist;
}

function updateWindowsShortcuts(install, burgerIcoPath, restore = false) {
    if (process.platform !== "win32") return;

    const appData = process.env.APPDATA || "";
    const desktopDir = join(os.homedir(), "Desktop");
    const startMenuDir = join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Discord Inc");

    const psScript = restore
        ? `
$WshShell = New-Object -ComObject WScript.Shell
$origIco = "${install.rootPath.replace(/\\/g, "\\\\")}\\app.ico"
foreach ($lnk in @(
    "${join(desktopDir, "Burgercord.lnk").replace(/\\/g, "\\\\")}",
    "${join(desktopDir, `${install.folder}.lnk`).replace(/\\/g, "\\\\")}",
    "${join(startMenuDir, `${install.folder}.lnk`).replace(/\\/g, "\\\\")}"
)) {
    if (Test-Path $lnk) {
        $s = $WshShell.CreateShortcut($lnk)
        $s.IconLocation = "$origIco,0"
        $s.Save()
    }
}
`
        : `
$WshShell = New-Object -ComObject WScript.Shell
$ico = "${burgerIcoPath.replace(/\\/g, "\\\\")}"
$updateExe = "${join(install.rootPath, "Update.exe").replace(/\\/g, "\\\\")}"
$desktopBurgerLnk = "${join(desktopDir, "Burgercord.lnk").replace(/\\/g, "\\\\")}"
$s = $WshShell.CreateShortcut($desktopBurgerLnk)
$s.TargetPath = $updateExe
$s.Arguments = "--processStart ${install.folder}.exe"
$s.WorkingDirectory = "${install.appDir.replace(/\\/g, "\\\\")}"
$s.Description = "Burgercord - High-Performance & Token-Hardened Discord Client"
$s.IconLocation = "$ico,0"
$s.Save()

foreach ($existing in @(
    "${join(desktopDir, `${install.folder}.lnk`).replace(/\\/g, "\\\\")}",
    "${join(startMenuDir, `${install.folder}.lnk`).replace(/\\/g, "\\\\")}"
)) {
    if (Test-Path $existing) {
        $sc = $WshShell.CreateShortcut($existing)
        $sc.IconLocation = "$ico,0"
        $sc.Description = "Burgercord"
        $sc.Save()
    }
}
`;

    try {
        execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
            stdio: "ignore"
        });
    } catch { }
}

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLockRetry(fn, maxAttempts = 12, delayMs = 400) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return fn();
        } catch (err) {
            lastErr = err;
            if (err && (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES")) {
                sleepSync(delayMs);
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
}

function closeDiscordIfRunning(install) {
    if (process.platform !== "win32") return false;
    const exeName = `${install.folder}.exe`;
    if (!isDiscordRunning(install.folder)) {
        return false;
    }

    console.log(`[Burgercord Installer] Detected ${exeName} is open — closing all ${exeName} processes...`);
    for (let i = 0; i < 6; i++) {
        try {
            execFileSync("taskkill.exe", ["/F", "/IM", exeName, "/T"], {
                stdio: "ignore"
            });
        } catch { }
        sleepSync(500);
        if (!isDiscordRunning(install.folder)) {
            console.log(`[Burgercord Installer] Confirmed ${exeName} is closed.`);
            sleepSync(500);
            return true;
        }
    }
    return true;
}

function relaunchDiscord(install) {
    if (process.platform !== "win32") return;
    const updateExe = join(install.rootPath, "Update.exe");
    const exeName = `${install.folder}.exe`;
    if (!existsSync(updateExe)) return;
    try {
        console.log(`[Burgercord Installer] Relaunching ${install.name} (Burgercord)...`);
        const child = spawn(updateExe, ["--processStart", exeName], {
            cwd: install.rootPath,
            detached: true,
            stdio: "ignore"
        });
        child.unref();
    } catch { }
}

export function installBurgercordToBranch(install) {
    const wasRunning = closeDiscordIfRunning(install);

    const targetDist = syncDistToBurgercordDataDir();
    const patcherPath = join(targetDist, "patcher.js");
    const burgerIcoPath = join(targetDist, "burgercord.ico");

    const appAsar = join(install.resourcesDir, "app.asar");
    const backupAsar = join(install.resourcesDir, "_app.asar");

    // back up original app.asar to _app.asar if it hasn't been backed up yet
    if (existsSync(appAsar) && !existsSync(backupAsar)) {
        withLockRetry(() => {
            renameSync(appAsar, backupAsar);
        });
    }

    // clear out any existing asar stub
    if (existsSync(appAsar)) {
        withLockRetry(() => {
            rmSync(appAsar, { recursive: true, force: true });
        });
    }

    // write asar bootstrap pointing to patcher.js in appdata
    const asarBuffer = buildBurgercordAsarBuffer(patcherPath);
    withLockRetry(() => {
        writeFileSync(appAsar, asarBuffer);
    });

    // swap out discord's default icon for burgercord.ico
    if (existsSync(burgerIcoPath)) {
        for (const icoTarget of [join(install.rootPath, "app.ico"), join(install.appDir, "app.ico")]) {
            try {
                if (existsSync(icoTarget)) {
                    const icoBackup = icoTarget.replace(/app\.ico$/, "_app.ico");
                    if (!existsSync(icoBackup)) {
                        copyFileSync(icoTarget, icoBackup);
                    }
                }
                withLockRetry(() => copyFileSync(burgerIcoPath, icoTarget), 5, 250);
            } catch { }
        }
        updateWindowsShortcuts(install, burgerIcoPath, false);
    }

    if (wasRunning) {
        relaunchDiscord(install);
    }

    return {
        ok: true,
        branch: install.name,
        resourcesDir: install.resourcesDir,
        patcherPath
    };
}

export function uninstallBurgercordFromBranch(install) {
    const wasRunning = closeDiscordIfRunning(install);

    const appAsar = join(install.resourcesDir, "app.asar");
    const backupAsar = join(install.resourcesDir, "_app.asar");

    if (existsSync(backupAsar)) {
        if (existsSync(appAsar)) {
            withLockRetry(() => rmSync(appAsar, { recursive: true, force: true }));
        }
        withLockRetry(() => renameSync(backupAsar, appAsar));
    }

    for (const icoTarget of [join(install.rootPath, "app.ico"), join(install.appDir, "app.ico")]) {
        const icoBackup = icoTarget.replace(/app\.ico$/, "_app.ico");
        try {
            if (existsSync(icoBackup)) {
                withLockRetry(() => copyFileSync(icoBackup, icoTarget), 5, 250);
                rmSync(icoBackup, { force: true });
            }
        } catch { }
    }

    updateWindowsShortcuts(install, "", true);

    if (wasRunning) {
        relaunchDiscord(install);
    }

    return {
        ok: true,
        branch: install.name,
        restored: true
    };
}
