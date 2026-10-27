/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow } from "electron";
import os from "os";

export interface CallQosStatus {
    active: boolean;
    activeSince: number | null;
    currentChannel: string | null;
    totalCallsBoosted: number;
    gpuFlagsApplied: string[];
    processPriority: "ABOVE_NORMAL" | "NORMAL";
    backgroundThrottlingDisabled: boolean;
}

const state: CallQosStatus = {
    active: false,
    activeSince: null,
    currentChannel: null,
    totalCallsBoosted: 0,
    gpuFlagsApplied: [],
    processPriority: "NORMAL",
    backgroundThrottlingDisabled: false,
};

export function applyCallPerformanceFlags() {
    try {
        const switches: Array<[string, string?]> = [
            ["enable-gpu-rasterization"],
            ["enable-zero-copy"],
            ["webrtc-max-cpu-consumption-percentage", "100"],
            ["enable-features", "CanvasOopRasterization,WebRtcHideLocalIpsWithMdns"],
        ];

        for (const [flag, value] of switches) {
            if (value !== undefined) {
                app.commandLine.appendSwitch(flag, value);
                state.gpuFlagsApplied.push(`--${flag}=${value}`);
            } else {
                app.commandLine.appendSwitch(flag);
                state.gpuFlagsApplied.push(`--${flag}`);
            }
        }
        console.log("[Burgercord] Applied low-latency Call & GPU performance switches:", state.gpuFlagsApplied.join(" "));
    } catch (err) {
        console.error("[Burgercord] Failed to append performance switches:", err);
    }
}

export function setCallQosMode(win: BrowserWindow | null, active: boolean, channelName?: string): CallQosStatus {
    const wasActive = state.active;
    state.active = active;

    if (active) {
        if (!wasActive) {
            state.activeSince = Date.now();
            state.totalCallsBoosted++;
        }
        state.currentChannel = channelName ?? "Active Voice Channel";

        try {
            os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
            state.processPriority = "ABOVE_NORMAL";
        } catch { }

        try {
            if (win && !win.isDestroyed()) {
                win.webContents.setBackgroundThrottling(false);
                state.backgroundThrottlingDisabled = true;
            }
        } catch { }
    } else {
        state.activeSince = null;
        state.currentChannel = null;

        try {
            os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL);
            state.processPriority = "NORMAL";
        } catch { }

        try {
            if (win && !win.isDestroyed()) {
                win.webContents.setBackgroundThrottling(true);
                state.backgroundThrottlingDisabled = false;
            }
        } catch { }
    }

    return { ...state };
}

export function getCallQosStatus(): CallQosStatus {
    return { ...state };
}
