/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { enableStyle } from "@api/Styles";
import { BURGERCORD_ICON_DATA_URI, BURGERCORD_NAME } from "@utils/burgerIcon";
import { Devs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";

import burgerBrandingCss from "./burgerBranding.css?managed";

let titleObserver: MutationObserver | null = null;

function applyBurgercordRootVariables() {
    try {
        document.documentElement.style.setProperty(
            "--burgercord-logo-url",
            `url("${BURGERCORD_ICON_DATA_URI}")`
        );
    } catch { }
}

function enforceBurgercordDocumentTitle() {
    try {
        if (document.title && /\bDiscord\b/.test(document.title)) {
            document.title = document.title.replace(/\bDiscord\b/g, BURGERCORD_NAME);
        }
    } catch { }
}

export default definePlugin({
    name: "BurgerBranding",
    description: "Rebrands Discord's icons, Home button, titlebar wordmark, and window title to Burgercord",
    authors: [Devs.Ven],
    required: true,
    startAt: StartAt.Init,

    start() {
        applyBurgercordRootVariables();
        enableStyle(burgerBrandingCss);
        enforceBurgercordDocumentTitle();

        const watchTitle = () => {
            enforceBurgercordDocumentTitle();
            const titleEl = document.querySelector("title");
            if (titleEl && !titleObserver) {
                titleObserver = new MutationObserver(() => {
                    enforceBurgercordDocumentTitle();
                });
                titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
            }
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", watchTitle, { once: true });
        } else {
            watchTitle();
        }
    },

    stop() {
        titleObserver?.disconnect();
        titleObserver = null;
    }
});
