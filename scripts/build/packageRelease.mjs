#!/usr/bin/env node
/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "child_process";
import crypto from "crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..", "..");
const DIST_DIR = join(ROOT_DIR, "dist");

console.log("[Burgercord Release] Building standalone production bundles...");
execFileSync(process.execPath, [
    "--require=./scripts/suppressExperimentalWarnings.js",
    "scripts/build/build.mjs",
    "--standalone"
], {
    cwd: ROOT_DIR,
    stdio: "inherit"
});

const pkg = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf-8"));
const bundleFiles = [
    "patcher.js",
    "preload.js",
    "renderer.js",
    "renderer.css",
    "burgercord.ico",
    "burgercord.png"
];

const filesMeta = {};
const combinedHash = crypto.createHash("sha256");

for (const file of bundleFiles) {
    const fullPath = join(DIST_DIR, file);
    if (!existsSync(fullPath)) continue;
    const buf = readFileSync(fullPath);
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    const size = statSync(fullPath).size;
    filesMeta[file] = { sha256, size };
    combinedHash.update(`${file}:${sha256}\n`);
}

const releaseHash = process.env.VENCORD_HASH || combinedHash.digest("hex").slice(0, 8);

const manifest = {
    name: "Burgercord",
    version: pkg.version,
    gitHash: releaseHash,
    buildTimestamp: Date.now(),
    changelog: process.env.BURGERCORD_CHANGELOG || `Burgercord v${pkg.version} (${releaseHash}) automatic release bundle`,
    files: filesMeta
};

const manifestPath = join(DIST_DIR, "burgercord-manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

console.log(`[Burgercord Release] Wrote ${manifestPath}`);
console.log(`[Burgercord Release] Upload dist/burgercord-manifest.json and dist/{patcher.js,preload.js,renderer.js,renderer.css,burgercord.ico} to your GitHub Release or update server.`);
