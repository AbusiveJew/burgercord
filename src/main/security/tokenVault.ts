/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SECURITY_VAULT_DIR } from "@main/utils/constants";
import crypto from "crypto";
import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import { join } from "path";

export interface BlockedAccessEntry {
    timestamp: number;
    source: string;
    reason: string;
    stackPreview?: string;
}

export interface SecurityStatus {
    vaultActive: boolean;
    vaultHasToken: boolean;
    vaultPath: string;
    keyFilePath: string;
    entropyMode: "SHA256+AES256GCM+EncryptedKeyFile+DPAPI" | "SHA256+AES256GCM+EncryptedKeyFile";
    levelDbScrubbed: boolean;
    canaryDeployed: boolean;
    canaryTriggeredCount: number;
    coreIntegrityVerified: boolean;
    coreFilesChecked: number;
    coreTamperEventsHealed: number;
    tokenStoreGuardActive: boolean;
    blockedAccessCount: number;
    blockedAccessLog: BlockedAccessEntry[];
    lastVerifiedAt: number;
}

const sessionNonce = crypto.randomBytes(32).toString("hex");

// File 1: where the encrypted discord token lives
const VAULT_FILE = join(SECURITY_VAULT_DIR, "token.vault.enc");

const blockedAccessLog: BlockedAccessEntry[] = [];
let levelDbScrubbed = false;

function getKeyStoreDir(): string {
    const localAppData = process.env.LOCALAPPDATA || join(app.getPath("userData"), "..", "..", "Local");
    const dir = join(localAppData, "BurgercordKeyStore");
    mkdirSync(dir, { recursive: true });
    return dir;
}

// File 2: master encryption key, saved separately from the vault file
function getEncryptedKeyFilePath(): string {
    return join(getKeyStoreDir(), "master.key.enc");
}

// Tie the key derivation to this machine so copied files are useless on other devices
function deriveMachineKek(salt: Buffer): Buffer {
    const info = [
        "BURGERCORD_VAULT_V2",
        os.hostname(),
        os.userInfo().username,
        os.arch(),
        os.platform(),
        os.cpus()[0]?.model ?? "burgercord-cpu"
    ].join("|");

    const digest = crypto.createHash("sha256").update(info, "utf-8").digest();
    return crypto.pbkdf2Sync(digest, salt, 100_000, 32, "sha256");
}

// Grab our master key from disk or make a new one on first run
function getOrCreateDecryptedMasterKey(): Buffer {
    const keyFilePath = getEncryptedKeyFilePath();

    if (existsSync(keyFilePath)) {
        try {
            const raw = readFileSync(keyFilePath);
            // Header layout: "BGCK" (4b) + dpapi flag (1b) + salt (32b) + iv (12b) + tag (16b) + sha (32b) + data
            if (raw.length > 97 && raw.subarray(0, 4).toString("ascii") === "BGCK") {
                const usedSafeStorage = raw[4] === 1;
                const salt = raw.subarray(5, 37);
                const iv = raw.subarray(37, 49);
                const authTag = raw.subarray(49, 65);
                const expectedSha256 = raw.subarray(65, 97);
                const ciphertext = raw.subarray(97);

                const kek = deriveMachineKek(salt);
                const decipher = crypto.createDecipheriv("aes-256-gcm", kek, iv);
                decipher.setAAD(Buffer.from("BURGERCORD_KEYFILE_V2", "utf-8"));
                decipher.setAuthTag(authTag);

                const unwrapped = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                const dek = (usedSafeStorage && safeStorage.isEncryptionAvailable())
                    ? Buffer.from(safeStorage.decryptString(unwrapped), "hex")
                    : unwrapped;

                const actualSha256 = crypto.createHash("sha256").update(dek).digest();
                if (crypto.timingSafeEqual(actualSha256, expectedSha256) && dek.length === 32) {
                    return dek;
                }
            }
        } catch (err) {
            console.warn("[Burgercord Security] Rebuilding master key after read error:", err);
        }
    }

    // First run or corrupted file - generate fresh 256-bit key
    const dek = crypto.randomBytes(32);
    const sha256Digest = crypto.createHash("sha256").update(dek).digest();
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const kek = deriveMachineKek(salt);

    let innerKeyPayload: Buffer;
    let usedSafeStorage = 0;
    if (safeStorage.isEncryptionAvailable()) {
        innerKeyPayload = safeStorage.encryptString(dek.toString("hex"));
        usedSafeStorage = 1;
    } else {
        innerKeyPayload = dek;
    }

    const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
    cipher.setAAD(Buffer.from("BURGERCORD_KEYFILE_V2", "utf-8"));
    const ciphertext = Buffer.concat([cipher.update(innerKeyPayload), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const header = Buffer.from([0x42, 0x47, 0x43, 0x4B, usedSafeStorage]); // "BGCK"
    const keyFileBuf = Buffer.concat([header, salt, iv, authTag, sha256Digest, ciphertext]);

    try {
        writeFileSync(keyFilePath, keyFileBuf, { mode: 0o600 });
    } catch { }

    return dek;
}

export function claimSessionNonce(): string {
    return sessionNonce;
}

export function verifySessionNonce(candidate: unknown): boolean {
    if (typeof candidate !== "string" || candidate.length !== sessionNonce.length) {
        return false;
    }
    try {
        return crypto.timingSafeEqual(Buffer.from(candidate, "utf-8"), Buffer.from(sessionNonce, "utf-8"));
    } catch {
        return false;
    }
}

/**
 * Encrypts the Discord token payload using the decrypted Master Key from `master.key.enc`
 * plus a SHA-256 integrity hash, and writes it to `token.vault.enc`.
 */
export function storeTokenInVault(nonce: string, rawTokenBlob: string): boolean {
    if (!verifySessionNonce(nonce)) {
        recordBlockedAccess("MainIPC:storeTokenInVault", "Invalid or missing session nonce");
        return false;
    }
    if (!rawTokenBlob || typeof rawTokenBlob !== "string") return false;

    try {
        mkdirSync(SECURITY_VAULT_DIR, { recursive: true });

        const masterKey = getOrCreateDecryptedMasterKey();
        const salt = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);

        // derive ephemeral subkey per write
        const subKey = crypto.createHmac("sha256", masterKey).update(salt).digest();
        const payloadBuf = Buffer.from(rawTokenBlob, "utf-8");
        const payloadSha256 = crypto.createHash("sha256").update(payloadBuf).digest();

        const cipher = crypto.createCipheriv("aes-256-gcm", subKey, iv);
        cipher.setAAD(Buffer.from("BURGERCORD_TOKEN_VAULT_V2", "utf-8"));
        const encrypted = Buffer.concat([cipher.update(payloadBuf), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // format: "BGCV" (4b) + v2 (1b) + salt (32b) + iv (12b) + tag (16b) + sha (32b) + data
        const header = Buffer.from([0x42, 0x47, 0x43, 0x56, 0x02]);
        const vaultBuffer = Buffer.concat([header, salt, iv, authTag, payloadSha256, encrypted]);

        writeFileSync(VAULT_FILE, vaultBuffer, { mode: 0o600 });
        levelDbScrubbed = true;
        return true;
    } catch (err) {
        console.error("[Burgercord Security] Failed to save token:", err);
        return false;
    }
}

// Reads master.key.enc, decrypts it, and decrypts token.vault.enc for startup
export function retrieveTokenFromVault(nonce: string): string | null {
    if (!verifySessionNonce(nonce)) {
        recordBlockedAccess("MainIPC:retrieveTokenFromVault", "Unauthorized vault read attempt with invalid session nonce");
        return null;
    }
    if (!existsSync(VAULT_FILE)) return null;

    try {
        const buf = readFileSync(VAULT_FILE);
        if (buf.length < 97) return null;
        if (buf.subarray(0, 4).toString("ascii") !== "BGCV" || buf[4] !== 0x02) return null;

        const salt = buf.subarray(5, 37);
        const iv = buf.subarray(37, 49);
        const authTag = buf.subarray(49, 65);
        const expectedSha256 = buf.subarray(65, 97);
        const ciphertext = buf.subarray(97);

        const masterKey = getOrCreateDecryptedMasterKey();
        const subKey = crypto.createHmac("sha256", masterKey).update(salt).digest();

        const decipher = crypto.createDecipheriv("aes-256-gcm", subKey, iv);
        decipher.setAAD(Buffer.from("BURGERCORD_TOKEN_VAULT_V2", "utf-8"));
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const actualSha256 = crypto.createHash("sha256").update(decrypted).digest();

        if (!crypto.timingSafeEqual(actualSha256, expectedSha256)) {
            recordBlockedAccess("MainIPC:retrieveTokenFromVault", "SHA-256 digest mismatch on token.vault.enc");
            return null;
        }

        return decrypted.toString("utf-8");
    } catch (err) {
        recordBlockedAccess("MainIPC:retrieveTokenFromVault", `Vault decryption failed: ${String(err)}`);
        return null;
    }
}

export function hasVaultedToken(): boolean {
    return existsSync(VAULT_FILE);
}

export function isLevelDbScrubbed(): boolean {
    return levelDbScrubbed || existsSync(VAULT_FILE);
}

export function markLevelDbScrubbed() {
    levelDbScrubbed = true;
}

export function recordBlockedAccess(source: string, reason: string, stackPreview?: string) {
    const entry: BlockedAccessEntry = {
        timestamp: Date.now(),
        source,
        reason,
        stackPreview: stackPreview?.slice(0, 400)
    };
    blockedAccessLog.unshift(entry);
    if (blockedAccessLog.length > 100) {
        blockedAccessLog.pop();
    }
    console.warn(`[Burgercord Security] Blocked suspicious token/module access from ${source}: ${reason}`);
}

export function getBlockedAccessLog(): BlockedAccessEntry[] {
    return [...blockedAccessLog];
}

export function getVaultPath(): string {
    return VAULT_FILE;
}

export function getKeyPath(): string {
    return getEncryptedKeyFilePath();
}
