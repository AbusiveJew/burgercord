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
    description: "Burgercord Encrypted Token Vault, Anti-Logout Session Protection, and Chunk Scraper Guard",
    authors: [Devs.Ven],
    required: true,
    startAt: StartAt.Init,

    patches: [
        {
            // stops discord from wiping tokens if devtools is opened
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
