/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { installWebpackChunkGuard } from "@security/chunkGuard";
import { initTokenGuard, wrapTokenStoreModule } from "@security/tokenGuard";
import { Devs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";
import { waitFor } from "@webpack";

export default definePlugin({
    name: "SecurityCenter",
    description: "Burgercord Two-File Encrypted Token Vault (token.vault.enc + master.key.enc), Anti-Logout Session Persistence, Call-Stack Guard, and Chunk Guard",
    authors: [Devs.Ven],
    required: true,
    startAt: StartAt.Init,

    patches: [
        {
            // Prevents Discord from deleting your token from storage when DevTools is enabled,
            // which otherwise causes random logouts on restart.
            find: "setDevtoolsCallbacks",
            replacement: {
                match: /if\(null==\i\|\|"0\.0\.0"!==\i\.app\.getVersion\(\)\)/,
                replace: "if(false)"
            }
        }
    ],

    start() {
        initTokenGuard();
        installWebpackChunkGuard();

        waitFor(["getToken", "getId"], tokenModule => {
            wrapTokenStoreModule(tokenModule);
            installWebpackChunkGuard();
        });
    }
});
