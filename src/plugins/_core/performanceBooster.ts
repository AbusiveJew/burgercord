/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { enableStyle } from "@api/Styles";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { FluxDispatcher, SelectedChannelStore } from "@webpack/common";

import perfBoosterCss from "./performanceBooster.css?managed";

let coalescedEventsCount = 0;
let originalDispatch: ((event: any) => any) | null = null;

export function getPerformanceBoosterStats() {
    return {
        coalescedEventsCount
    };
}

const settings = definePluginSettings({
    coalesceBackgroundFlux: {
        type: OptionType.BOOLEAN,
        description: "Skip redundant UI-only TYPING_START and non-active channel dispatches while the window is minimized/hidden",
        default: true,
        onChange() {
            syncContainmentClass();
        }
    },
    enableCssContainment: {
        type: OptionType.BOOLEAN,
        description: "Apply CSS content-visibility: auto containment to off-screen chat messages and member list items",
        default: true,
        onChange() {
            syncContainmentClass();
        }
    }
});

function syncContainmentClass() {
    try {
        document.documentElement.classList.toggle(
            "burgercord-css-containment",
            Boolean(settings.store.enableCssContainment)
        );
    } catch { }
}

export default definePlugin({
    name: "PerformanceBooster",
    description: "Burgercord client response time optimizer: Flux background event coalescing and CSS layout containment",
    authors: [Devs.Ven],
    required: true,
    startAt: StartAt.WebpackReady,
    settings,

    start() {
        enableStyle(perfBoosterCss);
        syncContainmentClass();

        try {
            if (FluxDispatcher && typeof FluxDispatcher.dispatch === "function" && !originalDispatch) {
                originalDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);
                FluxDispatcher.dispatch = function (event: any) {
                    if (
                        settings.store.coalesceBackgroundFlux &&
                        document.hidden &&
                        event &&
                        typeof event.type === "string"
                    ) {
                        // Drop UI-only typing indicator events for non-selected channels while window is minimized
                        if (event.type === "TYPING_START") {
                            const activeChannelId = SelectedChannelStore?.getChannelId?.();
                            if (!activeChannelId || event.channelId !== activeChannelId) {
                                coalescedEventsCount++;
                                return Promise.resolve();
                            }
                        }
                    }
                    return originalDispatch!(event);
                };
            }
        } catch { }
    },

    stop() {
        if (originalDispatch && FluxDispatcher) {
            FluxDispatcher.dispatch = originalDispatch;
            originalDispatch = null;
        }
        document.documentElement.classList.remove("burgercord-css-containment");
    }
});
