/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import { showNotification } from "@api/Notifications";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { HeadingSecondary } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import type { AutoUpdateStatus } from "@main/updater/autoUpdater";
import { BURGERCORD_ICON_DATA_URI } from "@utils/burgerIcon";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { useAwaiter } from "@utils/react";
import { getRepo, isNewer, UpdateLogger } from "@utils/updater";
import { Forms, React, useEffect, useState } from "@webpack/common";

import gitHash from "~git-hash";

import { CommonProps, HashLink, Newer, Updatable } from "./Components";

function VesktopSection() {
    if (!IS_VESKTOP) return null;

    const [isVesktopOutdated] = useAwaiter<boolean>(VesktopNative.app.isOutdated, { fallbackValue: false });

    return (
        <Flex className={Margins.bottom20} flexDirection="column" gap="1em">
            <Card variant="info">
                <HeadingSecondary>Vesktop & Vencord</HeadingSecondary>
                <Paragraph>Vesktop and Vencord are two separate things. This updater is for Vencord.</Paragraph>
                <Paragraph className={Margins.top8}>
                    You receive separate popups for Vesktop updates. You can also manually update by installing the <Link href="https://vesktop.dev/install">latest version</Link>.
                </Paragraph>
            </Card>

            {isVesktopOutdated && (
                <Card variant="warning">
                    <HeadingSecondary>Vesktop Outdated</HeadingSecondary>
                    <Flex flexDirection="column" gap="0.5em">
                        <Paragraph>Your version of Vesktop is outdated!</Paragraph>
                        <Button variant="link" onClick={() => VesktopNative.app.openUpdater()}>Open Vesktop Updater</Button>
                    </Flex>
                </Card>
            )}
        </Flex>
    );
}

function Updater() {
    const settings = useSettings(["autoUpdate", "autoUpdateNotification"]);
    const [bootStatus, setBootStatus] = useState<AutoUpdateStatus | null>(null);
    const [checkingBoot, setCheckingBoot] = useState(false);

    useEffect(() => {
        VencordNative?.updater?.getAutoUpdateStatus?.().then(setBootStatus).catch(() => { });
    }, []);

    const handleCheckBootUpdate = async () => {
        setCheckingBoot(true);
        try {
            const res = await VencordNative.updater.checkBootUpdates();
            setBootStatus(res);
            showNotification({
                title: "Burgercord Auto-Updater",
                body: res.updateAppliedOnBoot
                    ? `Updated to Burgercord ${res.currentVersion}!`
                    : "Burgercord is up to date!",
                icon: BURGERCORD_ICON_DATA_URI
            });
        } finally {
            setCheckingBoot(false);
        }
    };

    const [repo, err, repoPending] = useAwaiter(getRepo, {
        fallbackValue: "Loading...",
        onError: e => UpdateLogger.error("Failed to retrieve repo", err)
    });

    const commonProps: CommonProps = {
        repo,
        repoPending
    };

    return (
        <SettingsTab>
            <VesktopSection />

            <Card variant="info" className={Margins.bottom20}>
                <Flex justifyContent="space-between" alignItems="center">
                    <div>
                        <HeadingSecondary>Burgercord Zero-Touch Boot Auto-Updater</HeadingSecondary>
                        <Paragraph>
                            Checks for remote updates on every boot and verifies SHA-256 bundle integrity before applying.
                            {bootStatus?.lastCheckedAt
                                ? ` Last checked: ${new Date(bootStatus.lastCheckedAt).toLocaleTimeString()}`
                                : ""}
                        </Paragraph>
                    </div>
                    <Button onClick={handleCheckBootUpdate} disabled={checkingBoot}>
                        {checkingBoot ? "Checking..." : "Check Now"}
                    </Button>
                </Flex>
            </Card>

            <div className="vc-settings-switches">
                <FormSwitch
                    title="Automatically update on boot & in background"
                    description="Automatically download and apply verified Burgercord updates without reinstalling"
                    value={settings.autoUpdate}
                    onChange={(v: boolean) => settings.autoUpdate = v}
                    hideBorder
                />
                <FormSwitch
                    title="Get notified when an automatic update completes"
                    description="Show a notification when Burgercord automatically updates"
                    value={settings.autoUpdateNotification}
                    onChange={(v: boolean) => settings.autoUpdateNotification = v}
                    disabled={!settings.autoUpdate}
                    hideBorder
                />
            </div>

            <Forms.FormTitle tag="h5" className={Margins.top20}>Repo</Forms.FormTitle>

            <Forms.FormText>
                {repoPending
                    ? repo
                    : err
                        ? "Failed to retrieve - check console"
                        : (
                            <Link href={repo}>
                                {repo.split("/").slice(-2).join("/")}
                            </Link>
                        )
                }
                {" "}
                (<HashLink hash={gitHash} repo={repo} disabled={repoPending} />)
            </Forms.FormText>

            <Divider className={classes(Margins.top16, Margins.bottom16)} />

            <Forms.FormTitle tag="h5">Updates</Forms.FormTitle>

            {isNewer
                ? <Newer {...commonProps} />
                : <Updatable {...commonProps} />
            }
        </SettingsTab>
    );
}

export default IS_UPDATER_DISABLED
    ? null
    : wrapTab(Updater, "Updater");
