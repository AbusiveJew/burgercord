/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { runtimeHashMessageKey } from "@utils/intlHash";
import { Logger } from "@utils/Logger";
import { Patch } from "@utils/types";

const logger = new Logger("BurgercordPatchCache", "#43B581");

export interface CachedModulePatch {
    patchedSource: string;
    patchedBy: string[];
    consumedPatchFinds: string[];
}

interface PersistedPatchCache {
    version: number;
    buildNumber: number;
    configHash: string;
    patchedModules: Record<string, CachedModulePatch>;
    noopModuleIds: string[];
}

export interface PatchCacheMetrics {
    enabled: boolean;
    buildNumber: number;
    configHash: string;
    noopBypassedCount: number;
    compiledFromCacheCount: number;
    coldPatchedCount: number;
    estimatedMsSaved: number;
}

const CACHE_VERSION = 1;
let initializedForBuild = -1;
let currentConfigHash = "";
let loadedCache: PersistedPatchCache | null = null;
let dirty = false;
let saveTimer: any = null;

const noopSet = new Set<string>();
const patchedMap = new Map<string, CachedModulePatch>();

const metrics: PatchCacheMetrics = {
    enabled: true,
    buildNumber: -1,
    configHash: "",
    noopBypassedCount: 0,
    compiledFromCacheCount: 0,
    coldPatchedCount: 0,
    estimatedMsSaved: 0,
};

export function computePatchesConfigHash(patches: Patch[]): string {
    const signature = patches
        .map(p => `${p.plugin}:${String(p.find)}:${p.all ? 1 : 0}`)
        .sort()
        .join("|");
    return runtimeHashMessageKey(signature);
}

export function ensurePatchCacheLoaded(buildNumber: number, patches: Patch[]) {
    if (buildNumber <= 0 || initializedForBuild === buildNumber) return;
    initializedForBuild = buildNumber;
    currentConfigHash = computePatchesConfigHash(patches);
    metrics.buildNumber = buildNumber;
    metrics.configHash = currentConfigHash;

    try {
        const key = `build_${buildNumber}_${currentConfigHash}`;
        const cached = VencordNative?.performance?.getPatchCache?.(key) as PersistedPatchCache | null;
        if (cached && cached.version === CACHE_VERSION && cached.buildNumber === buildNumber && cached.configHash === currentConfigHash) {
            loadedCache = cached;
            for (const id of cached.noopModuleIds || []) {
                noopSet.add(String(id));
            }
            for (const [id, entry] of Object.entries(cached.patchedModules || {})) {
                patchedMap.set(String(id), entry);
            }
            logger.info(`Loaded AOT Patch Cache for Discord build ${buildNumber} (${noopSet.size} fast-skip modules, ${patchedMap.size} pre-patched modules).`);
        }
    } catch (err) {
        logger.warn("Failed to load AOT Patch Cache:", err);
    }
}

export function isKnownNoopModule(moduleId: PropertyKey): boolean {
    if (!loadedCache) return false;
    const hit = noopSet.has(String(moduleId));
    if (hit) {
        metrics.noopBypassedCount++;
        metrics.estimatedMsSaved += 0.18;
    }
    return hit;
}

export function getCachedPatchedModule(moduleId: PropertyKey): CachedModulePatch | undefined {
    if (!loadedCache) return undefined;
    const entry = patchedMap.get(String(moduleId));
    if (entry) {
        metrics.compiledFromCacheCount++;
        metrics.estimatedMsSaved += 1.45;
    }
    return entry;
}

export function recordModulePatchResult(
    moduleId: PropertyKey,
    buildNumber: number,
    wasPatched: boolean,
    patchedSource?: string,
    patchedBy?: Set<string>,
    consumedPatchFinds?: string[]
) {
    if (buildNumber <= 0) return;
    const idStr = String(moduleId);

    if (!wasPatched) {
        if (!noopSet.has(idStr)) {
            noopSet.add(idStr);
            dirty = true;
            scheduleSave(buildNumber);
        }
        return;
    }

    if (patchedSource && patchedBy) {
        metrics.coldPatchedCount++;
        patchedMap.set(idStr, {
            patchedSource,
            patchedBy: [...patchedBy],
            consumedPatchFinds: consumedPatchFinds ?? []
        });
        dirty = true;
        scheduleSave(buildNumber);
    }
}

function scheduleSave(buildNumber: number) {
    if (!dirty || saveTimer != null) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        if (!dirty || buildNumber <= 0 || !currentConfigHash) return;
        dirty = false;

        const payload: PersistedPatchCache = {
            version: CACHE_VERSION,
            buildNumber,
            configHash: currentConfigHash,
            patchedModules: Object.fromEntries(patchedMap.entries()),
            noopModuleIds: [...noopSet]
        };

        const key = `build_${buildNumber}_${currentConfigHash}`;
        try {
            VencordNative?.performance?.savePatchCache?.(key, payload);
        } catch { }
    }, 2500);
}

export function getPatchCacheMetrics(): PatchCacheMetrics {
    return {
        ...metrics,
        estimatedMsSaved: Math.round(metrics.estimatedMsSaved * 10) / 10
    };
}
