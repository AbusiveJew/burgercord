#!/usr/bin/env node
/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

import {
    ASSETS_DIR,
    detectDiscordInstallations,
    getBurgercordDataDir,
    installBurgercordToBranch,
    LOCAL_DIST_DIR,
    ROOT_DIR,
    syncDistToBurgercordDataDir,
    uninstallBurgercordFromBranch
} from "./patchDiscord.mjs";

const args = process.argv.slice(2);
const isInstall = args.includes("--install") || args.includes("-i");
const isUninstall = args.includes("--uninstall") || args.includes("-u");
const isRepair = args.includes("--repair") || args.includes("-r");
const isStatus = args.includes("--status");
const isGui = args.includes("--gui") || (!isInstall && !isUninstall && !isRepair && !isStatus);

const branchIdx = args.indexOf("--branch");
const targetBranch = branchIdx !== -1 ? (args[branchIdx + 1] || "all").toLowerCase() : "all";

function ensureBundleBuilt() {
    if (!existsSync(join(LOCAL_DIST_DIR, "patcher.js")) || !existsSync(join(LOCAL_DIST_DIR, "renderer.js"))) {
        console.log("[Burgercord Installer] Building Burgercord bundles first...");
        spawnSync(process.execPath, [
            "--require=./scripts/suppressExperimentalWarnings.js",
            "scripts/build/build.mjs"
        ], {
            cwd: ROOT_DIR,
            stdio: "inherit"
        });
    }
}

function runCliAction(mode) {
    if (mode !== "uninstall" && mode !== "status") {
        ensureBundleBuilt();
    }

    const installs = detectDiscordInstallations();
    if (installs.length === 0) {
        console.log("[Burgercord Installer] No Discord installation detected in %LOCALAPPDATA%, syncing bundle to %APPDATA%\\Burgercord\\dist...");
        const distDir = syncDistToBurgercordDataDir();
        console.log(`[Burgercord Installer] Bundle staged at: ${distDir}`);
        return;
    }

    const filtered = targetBranch === "all"
        ? installs
        : installs.filter(i => i.id === targetBranch || i.folder.toLowerCase() === targetBranch);

    for (const inst of filtered) {
        if (mode === "status") {
            const runLabel = inst.isRunning ? "OPEN (will auto-close on install)" : "CLOSED";
            console.log(`- ${inst.name} (${inst.latestApp}): ${inst.isPatched ? "PATCHED WITH BURGERCORD" : "UNPATCHED"} | Process: ${runLabel}\n  Path: ${inst.resourcesDir}`);
        } else if (mode === "install" || mode === "repair") {
            const res = installBurgercordToBranch(inst);
            console.log(`[Burgercord Installer] Installed Burgercord + Burger Icon to ${res.branch} (${res.resourcesDir})`);
        } else if (mode === "uninstall") {
            const res = uninstallBurgercordFromBranch(inst);
            console.log(`[Burgercord Installer] Uninstalled Burgercord and restored original icon on ${res.branch}`);
        }
    }
}

function launchWindowsGui() {
    ensureBundleBuilt();
    syncDistToBurgercordDataDir();

    const icoPath = join(ASSETS_DIR, "burgercord.ico").replace(/'/g, "''");
    const pngPath = join(ASSETS_DIR, "burgercord.png").replace(/'/g, "''");
    const nodeExe = process.execPath.replace(/'/g, "''");
    const installerScript = join(ROOT_DIR, "installer", "index.mjs").replace(/'/g, "''");
    const dataDir = getBurgercordDataDir().replace(/'/g, "''");

    const psGui = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "Burgercord Installer"
$form.Size = New-Object System.Drawing.Size(520, 420)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(30, 31, 34)
$form.ForeColor = [System.Drawing.Color]::White

if (Test-Path '${icoPath}') {
    $form.Icon = New-Object System.Drawing.Icon('${icoPath}')
}

$pic = New-Object System.Windows.Forms.PictureBox
$pic.Size = New-Object System.Drawing.Size(72, 72)
$pic.Location = New-Object System.Drawing.Point(24, 20)
$pic.SizeMode = "Zoom"
if (Test-Path '${pngPath}') {
    $pic.Image = [System.Drawing.Image]::FromFile('${pngPath}')
}
$form.Controls.Add($pic)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Burgercord Installer"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(110, 22)
$title.AutoSize = $true
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = "High-Performance Call Engine • 5-Layer Token Vault • Boot Auto-Updater"
$sub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$sub.ForeColor = [System.Drawing.Color]::FromArgb(181, 186, 193)
$sub.Location = New-Object System.Drawing.Point(112, 58)
$sub.AutoSize = $true
$form.Controls.Add($sub)

$statusBox = New-Object System.Windows.Forms.TextBox
$statusBox.Multiline = $true
$statusBox.ReadOnly = $true
$statusBox.BackColor = [System.Drawing.Color]::FromArgb(43, 45, 49)
$statusBox.ForeColor = [System.Drawing.Color]::FromArgb(219, 222, 225)
$statusBox.BorderStyle = "FixedSingle"
$statusBox.Font = New-Object System.Drawing.Font("Consolas", 9.5)
$statusBox.Location = New-Object System.Drawing.Point(24, 110)
$statusBox.Size = New-Object System.Drawing.Size(456, 175)
$form.Controls.Add($statusBox)

function Refresh-Status {
    $out = & '${nodeExe}' '${installerScript}' --status 2>&1 | Out-String
    $statusBox.Text = "Detected Discord Installations:\`r\`n\`r\`n" + $out.Trim()
}

$btnInstall = New-Object System.Windows.Forms.Button
$btnInstall.Text = "Install Burgercord"
$btnInstall.BackColor = [System.Drawing.Color]::FromArgb(88, 101, 242)
$btnInstall.ForeColor = [System.Drawing.Color]::White
$btnInstall.FlatStyle = "Flat"
$btnInstall.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnInstall.Location = New-Object System.Drawing.Point(24, 305)
$btnInstall.Size = New-Object System.Drawing.Size(145, 44)
$btnInstall.Add_Click({
    $res = & '${nodeExe}' '${installerScript}' --install 2>&1 | Out-String
    Refresh-Status
    $statusBox.AppendText("\`r\`n\`r\`n" + $res.Trim())
})
$form.Controls.Add($btnInstall)

$btnRepair = New-Object System.Windows.Forms.Button
$btnRepair.Text = "Repair / Update"
$btnRepair.BackColor = [System.Drawing.Color]::FromArgb(240, 156, 31)
$btnRepair.ForeColor = [System.Drawing.Color]::FromArgb(20, 20, 22)
$btnRepair.FlatStyle = "Flat"
$btnRepair.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnRepair.Location = New-Object System.Drawing.Point(180, 305)
$btnRepair.Size = New-Object System.Drawing.Size(145, 44)
$btnRepair.Add_Click({
    $res = & '${nodeExe}' '${installerScript}' --repair 2>&1 | Out-String
    Refresh-Status
    $statusBox.AppendText("\`r\`n\`r\`n" + $res.Trim())
})
$form.Controls.Add($btnRepair)

$btnUninstall = New-Object System.Windows.Forms.Button
$btnUninstall.Text = "Uninstall"
$btnUninstall.BackColor = [System.Drawing.Color]::FromArgb(218, 55, 60)
$btnUninstall.ForeColor = [System.Drawing.Color]::White
$btnUninstall.FlatStyle = "Flat"
$btnUninstall.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnUninstall.Location = New-Object System.Drawing.Point(335, 305)
$btnUninstall.Size = New-Object System.Drawing.Size(145, 44)
$btnUninstall.Add_Click({
    $res = & '${nodeExe}' '${installerScript}' --uninstall 2>&1 | Out-String
    Refresh-Status
    $statusBox.AppendText("\`r\`n\`r\`n" + $res.Trim())
})
$form.Controls.Add($btnUninstall)

Refresh-Status
[void]$form.ShowDialog()
`;

    spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psGui], {
        stdio: "inherit"
    });
}

if (isStatus) {
    runCliAction("status");
} else if (isInstall) {
    runCliAction("install");
} else if (isRepair) {
    runCliAction("repair");
} else if (isUninstall) {
    runCliAction("uninstall");
} else if (isGui && process.platform === "win32") {
    launchWindowsGui();
} else {
    runCliAction("install");
}
