/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    BURGERCORD_ICON_DATA_URI,
    BURGERCORD_NAME,
    BURGERCORD_TRAY_DATA_URI,
    BURGERCORD_TRAY_UNREAD_DATA_URI
} from "@utils/burgerIcon";
import electron, { app, BrowserWindow, nativeImage, NativeImage } from "electron";
import { existsSync } from "fs";
import { join } from "path";

import { DATA_DIR } from "./utils/constants";

let cachedWindowIcon: NativeImage | string | null = null;
let cachedTrayIcon: NativeImage | null = null;
let cachedTrayUnreadIcon: NativeImage | null = null;

export function getBurgercordIconPath(): string | null {
    const candidates = [
        join(__dirname, "burgercord.ico"),
        join(__dirname, "..", "assets", "burgercord.ico"),
        join(DATA_DIR, "dist", "burgercord.ico"),
        join(__dirname, "burgercord.png"),
        join(__dirname, "..", "assets", "burgercord.png"),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

export function getBurgercordWindowIcon(): NativeImage | string {
    if (cachedWindowIcon) return cachedWindowIcon;
    const iconPath = getBurgercordIconPath();
    if (iconPath) {
        cachedWindowIcon = iconPath;
        return iconPath;
    }
    cachedWindowIcon = nativeImage.createFromDataURL(BURGERCORD_ICON_DATA_URI);
    return cachedWindowIcon;
}

export function getBurgercordTrayIcon(unread = false): NativeImage {
    if (unread) {
        if (!cachedTrayUnreadIcon) {
            cachedTrayUnreadIcon = nativeImage.createFromDataURL(BURGERCORD_TRAY_UNREAD_DATA_URI).resize({ width: 16, height: 16 });
        }
        return cachedTrayUnreadIcon;
    }
    if (!cachedTrayIcon) {
        cachedTrayIcon = nativeImage.createFromDataURL(BURGERCORD_TRAY_DATA_URI).resize({ width: 16, height: 16 });
    }
    return cachedTrayIcon;
}

export function rewriteDiscordTitle(title: string): string {
    if (!title) return BURGERCORD_NAME;
    return title.replace(/\bDiscord\b/g, BURGERCORD_NAME);
}

export function applyMainBranding() {
    try {
        app.setName(BURGERCORD_NAME);
    } catch { }
}

export function applyWindowBranding(win: BrowserWindow) {
    try {
        const icon = getBurgercordWindowIcon();
        const origSetIcon = win.setIcon.bind(win);
        const origSetTitle = win.setTitle.bind(win);

        try {
            origSetIcon(icon as any);
        } catch { }

        origSetTitle(rewriteDiscordTitle(win.getTitle() || BURGERCORD_NAME));

        // Prevent Discord from resetting the taskbar icon back to Clyde
        win.setIcon = (_newIcon: NativeImage | string) => {
            try {
                origSetIcon(icon as any);
            } catch { }
        };

        // Rewrite all window title updates from "Discord" to "Burgercord"
        win.setTitle = (newTitle: string) => {
            origSetTitle(rewriteDiscordTitle(newTitle));
        };

        win.on("page-title-updated", (event, title) => {
            const branded = rewriteDiscordTitle(title);
            if (branded !== title) {
                event.preventDefault();
                origSetTitle(branded);
            }
        });
    } catch (err) {
        console.error("[Burgercord] Failed to apply window branding:", err);
    }
}

export function createBrandedTrayClass(OriginalTray: typeof electron.Tray): typeof electron.Tray {
    class BurgercordTray extends OriginalTray {
        constructor(image: NativeImage | string, guid?: string) {
            const initialIcon = getBurgercordTrayIcon(false);
            super(initialIcon, guid);

            const origSetImage = this.setImage.bind(this);
            const origSetToolTip = this.setToolTip.bind(this);

            this.setImage = (img: NativeImage | string) => {
                try {
                    const isUnread = typeof img === "string" && /unread|badge|mention/i.test(img);
                    origSetImage(getBurgercordTrayIcon(isUnread));
                } catch {
                    origSetImage(getBurgercordTrayIcon(false));
                }
            };

            this.setToolTip = (toolTip: string) => {
                origSetToolTip(rewriteDiscordTitle(toolTip));
            };
        }
    }

    Object.assign(BurgercordTray, OriginalTray);
    Object.defineProperty(BurgercordTray, "name", { value: "Tray", configurable: true });
    return BurgercordTray;
}
