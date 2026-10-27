/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { enableStyle } from "@api/Styles";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

import callPerfCss from "./callPerformance.css?managed";

let inActiveCall = false;

const settings = definePluginSettings({
    enableCallQos: {
        type: OptionType.BOOLEAN,
        description: "Automatically disable background throttling and elevate OS process priority during active voice/video calls",
        default: true
    },
    throttleUnfocusedSpeakingRings: {
        type: OptionType.BOOLEAN,
        description: "Eliminate high-frequency speaking-ring CSS transitions when the window is unfocused during a call",
        default: true
    },
    preventIdleCallDisconnect: {
        type: OptionType.BOOLEAN,
        description: "Prevent Discord from disconnecting solo calls after 3 minutes",
        default: true,
        restartNeeded: true
    }
});

function updateUnfocusedCallClass() {
    try {
        const shouldThrottle = inActiveCall
            && settings.store.throttleUnfocusedSpeakingRings
            && (document.hidden || !document.hasFocus());
        document.documentElement.classList.toggle("burgercord-call-unfocused", shouldThrottle);
    } catch { }
}

export default definePlugin({
    name: "CallPerformance",
    description: "Burgercord low-latency Call QoS booster, WebRTC priority manager, and unfocused call renderer optimizer",
    authors: [Devs.Ven],
    required: true,
    settings,

    patches: [
        {
            find: "this.idleTimeout.start(",
            predicate: () => settings.store.preventIdleCallDisconnect,
            replacement: {
                match: /this\.idleTimeout\.(start|stop)/g,
                replace: "$self.noop"
            }
        },
        {
            find: "handleIdleUpdate(){",
            predicate: () => settings.store.preventIdleCallDisconnect,
            replacement: {
                match: "handleIdleUpdate(){",
                replace: "handleIdleUpdate(){return;"
            }
        }
    ],

    flux: {
        RTC_CONNECTION_STATE(event: { state?: string; channelId?: string; }) {
            const isConnected = event?.state === "RTC_CONNECTED" || event?.state === "CONNECTING";
            const isDisconnected = event?.state === "DISCONNECTED";

            if (isConnected && !inActiveCall) {
                inActiveCall = true;
                updateUnfocusedCallClass();
                if (settings.store.enableCallQos) {
                    VencordNative?.performance?.setCallQosMode?.(true, event.channelId ?? "Voice Call");
                }
            } else if (isDisconnected && inActiveCall) {
                inActiveCall = false;
                updateUnfocusedCallClass();
                VencordNative?.performance?.setCallQosMode?.(false);
            }
        }
    },

    start() {
        enableStyle(callPerfCss);
        window.addEventListener("blur", updateUnfocusedCallClass);
        window.addEventListener("focus", updateUnfocusedCallClass);
        document.addEventListener("visibilitychange", updateUnfocusedCallClass);
    },

    stop() {
        window.removeEventListener("blur", updateUnfocusedCallClass);
        window.removeEventListener("focus", updateUnfocusedCallClass);
        document.removeEventListener("visibilitychange", updateUnfocusedCallClass);
        document.documentElement.classList.remove("burgercord-call-unfocused");
    },

    noop() { }
});
