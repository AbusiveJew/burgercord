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

// File 1: Encrypted Token Vault File
const VAULT_FILE = join(SECURITY_VAULT_DIR, "token.vault.enc");

const blockedAccessLog: BlockedAccessEntry[] = [];
let levelDbScrubbed = false;

function getKeyStoreDir(): string {
    const localAppData = process.env.LOCALAPPDATA || join(app.getPath("userData"), "..", "..", "Local");
    const dir = join(localAppData, "BurgercordKeyStore");
    mkdirSync(dir, { recursive: true });
    return dir;
}

// File 2: Encrypted Master Key File (separate directory from the token vault)
function getEncryptedKeyFilePath(): string {
    return join(getKeyStoreDir(), "master.key.enc");
}

/**
 * Derives a 256-bit Key-Encryption-Key (KEK) using SHA-256 and PBKDF2-HMAC-SHA256
 * bound to this machine's hardware/OS identity.
 */
function deriveMachineKek(salt: Buffer): Buffer {
    const machineIdentity = [
        "BURGERCORD_SHA256_KEK_V2",
        os.hostname(),
        os.userInfo().username,
        os.arch(),
        os.platform(),
        os.cpus()[0]?.model ?? "burgercord-cpu"
    ].join("|");

    const sha256IdentityDigest = crypto.createHash("sha256").update(machineIdentity, "utf-8").digest();
    return crypto.pbkdf2Sync(sha256IdentityDigest, salt, 100_000, 32, "sha256");
}

/**
 * Loads and decrypts the 256-bit Data Encryption Key (DEK) from `master.key.enc`,
 * or generates and encrypts a new one on first run.
 */
function getOrCreateDecryptedMasterKey(): Buffer {
    const keyFilePath = getEncryptedKeyFilePath();

    if (existsSync(keyFilePath)) {
        try {
            const raw = readFileSync(keyFilePath);
            // Format: [magic "BGCK"(4B)] [usedSafeStorage(1B)] [salt(32B)] [iv(12B)] [authTag(16B)] [sha256Digest(32B)] [ciphertext]
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
            console.warn("[Burgercord Security] Regenerating master key file after read error:", err);
        }
    }

    // Generate a fresh 256-bit DEK and encrypt it into master.key.enc
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

        // Derive per-write subkey using HMAC-SHA256(masterKey, salt)
        const subKey = crypto.createHmac("sha256", masterKey).update(salt).digest();
        const payloadBuf = Buffer.from(rawTokenBlob, "utf-8");
        const payloadSha256 = crypto.createHash("sha256").update(payloadBuf).digest();

        const cipher = crypto.createCipheriv("aes-256-gcm", subKey, iv);
        cipher.setAAD(Buffer.from("BURGERCORD_TOKEN_VAULT_V2", "utf-8"));
        const encrypted = Buffer.concat([cipher.update(payloadBuf), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Layout: [magic "BGCV"(4B)] [version 0x02(1B)] [salt(32B)] [iv(12B)] [authTag(16B)] [payloadSha256(32B)] [ciphertext]
        const header = Buffer.from([0x42, 0x47, 0x43, 0x56, 0x02]);
        const vaultBuffer = Buffer.concat([header, salt, iv, authTag, payloadSha256, encrypted]);

        writeFileSync(VAULT_FILE, vaultBuffer, { mode: 0o600 });
        levelDbScrubbed = true;
        return true;
    } catch (err) {
        console.error("[Burgercord Security] Failed to store token in vault:", err);
        return false;
    }
}

/**
 * Synchronously reads `master.key.enc`, decrypts the Master Key, and uses it to
 * decrypt `token.vault.enc` and verify its SHA-256 digest when Burgercord opens.
 */
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
