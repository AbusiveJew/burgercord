/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export const enum IpcEvents {
    INIT_FILE_WATCHERS = "VencordInitFileWatchers",

    OPEN_QUICKCSS = "VencordOpenQuickCss",
    GET_QUICK_CSS = "VencordGetQuickCss",
    SET_QUICK_CSS = "VencordSetQuickCss",
    QUICK_CSS_UPDATE = "VencordQuickCssUpdate",

    GET_SETTINGS = "VencordGetSettings",
    SET_SETTINGS = "VencordSetSettings",

    GET_THEMES_LIST = "VencordGetThemesList",
    GET_THEME_DATA = "VencordGetThemeData",
    GET_THEME_SYSTEM_VALUES = "VencordGetThemeSystemValues",
    THEME_UPDATE = "VencordThemeUpdate",

    OPEN_EXTERNAL = "VencordOpenExternal",
    OPEN_THEMES_FOLDER = "VencordOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "VencordOpenSettingsFolder",

    GET_UPDATES = "VencordGetUpdates",
    GET_REPO = "VencordGetRepo",
    UPDATE = "VencordUpdate",
    BUILD = "VencordBuild",

    OPEN_MONACO_EDITOR = "VencordOpenMonacoEditor",
    GET_MONACO_THEME = "VencordGetMonacoTheme",

    GET_PLUGIN_IPC_METHOD_MAP = "VencordGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "VencordCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "VencordCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "VencordCspRequestAddOverride",

    GET_RENDERER_CSS = "VencordGetRendererCss",
    RENDERER_CSS_UPDATE = "VencordRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "VencordPreloadGetRendererJs",

    SUPPORTS_WINDOWS_MATERIAL = "VencordSupportsWindowsMaterial",

    // Burgercord Security & Token Vault Events
    SECURITY_GET_SESSION_NONCE = "BurgercordSecurityGetSessionNonce",
    SECURITY_VAULT_STORE_TOKEN = "BurgercordSecurityVaultStoreToken",
    SECURITY_VAULT_GET_TOKEN = "BurgercordSecurityVaultGetToken",
    SECURITY_GET_STATUS = "BurgercordSecurityGetStatus",
    SECURITY_LOG_BLOCKED_ACCESS = "BurgercordSecurityLogBlockedAccess",
    SECURITY_RUN_SELF_TEST = "BurgercordSecurityRunSelfTest",
    SECURITY_VERIFY_INTEGRITY = "BurgercordSecurityVerifyIntegrity",

    // Burgercord Call Performance & QoS Events
    SET_CALL_QOS_MODE = "BurgercordSetCallQosMode",
    GET_CALL_QOS_STATUS = "BurgercordGetCallQosStatus",

    // Burgercord AOT Webpack Patch Cache Events
    GET_PATCH_CACHE = "BurgercordGetPatchCache",
    SAVE_PATCH_CACHE = "BurgercordSavePatchCache",
    CLEAR_PATCH_CACHE = "BurgercordClearPatchCache",

    // Burgercord Boot Auto-Updater Events
    CHECK_BOOT_UPDATES = "BurgercordCheckBootUpdates",
    GET_AUTO_UPDATE_STATUS = "BurgercordGetAutoUpdateStatus",
}
