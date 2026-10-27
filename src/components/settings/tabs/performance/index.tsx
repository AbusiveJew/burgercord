/*
 * Burgercord, a high-performance & token-hardened Discord client mod
 * Copyright (c) 2026 Burgercord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import type { CallQosStatus } from "@main/callBooster";
import CallPerformancePlugin from "@plugins/_core/callPerformance";
import PerformanceBoosterPlugin, { getPerformanceBoosterStats } from "@plugins/_core/performanceBooster";
import { BURGERCORD_ICON_DATA_URI } from "@utils/burgerIcon";
import { Margins } from "@utils/margins";
import { Forms, React, useEffect, useState } from "@webpack/common";
import { getPatchCacheMetrics, PatchCacheMetrics } from "@webpack/patchCache";

function MetricBox({ title, value, subtitle }: { title: string; value: string | number; subtitle: string; }) {
    return (
        <Card variant="normal" style={{ flex: "1 1 180px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                {title}
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--header-primary)", margin: "6px 0" }}>
                {value}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {subtitle}
            </div>
        </Card>
    );
}

function PerformanceAndCallsTab() {
    const [callStatus, setCallStatus] = useState<CallQosStatus | null>(null);
    const [cacheMetrics, setCacheMetrics] = useState<PatchCacheMetrics>(getPatchCacheMetrics());
    const [boosterStats, setBoosterStats] = useState(getPerformanceBoosterStats());

    const callSettings = CallPerformancePlugin.settings.use([
        "enableCallQos",
        "throttleUnfocusedSpeakingRings",
        "preventIdleCallDisconnect"
    ]);
    const perfSettings = PerformanceBoosterPlugin.settings.use([
        "coalesceBackgroundFlux",
        "enableCssContainment"
    ]);

    const refresh = async () => {
        setCacheMetrics(getPatchCacheMetrics());
        setBoosterStats(getPerformanceBoosterStats());
        try {
            const qos = await VencordNative.performance.getCallQosStatus();
            setCallStatus(qos);
        } catch { }
    };

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleTestCallQos = async () => {
        const nextState = !callStatus?.active;
        const updated = await VencordNative.performance.setCallQosMode(nextState, "Manual Call QoS Boost");
        setCallStatus(updated);
        showNotification({
            title: "Burgercord Call QoS Engine",
            body: nextState
                ? "Call QoS Boost Engaged (Background Throttling Disabled + Priority Elevated)"
                : "Call QoS Boost Returned to Normal Standby",
            icon: BURGERCORD_ICON_DATA_URI
        });
    };

    const handleClearPatchCache = async () => {
        await VencordNative.performance.clearPatchCache();
        showNotification({
            title: "Burgercord AOT Patch Cache",
            body: "Cleared AOT Webpack Patch Cache — will rebuild on next launch.",
            icon: BURGERCORD_ICON_DATA_URI
        });
    };

    return (
        <SettingsTab>
            <Card variant="normal" className={Margins.bottom20} style={{ display: "flex", alignItems: "center", gap: "16px", background: "linear-gradient(135deg, rgba(67, 181, 129, 0.18), rgba(88, 101, 242, 0.14))", border: "1px solid rgba(67, 181, 129, 0.35)" }}>
                <img src={BURGERCORD_ICON_DATA_URI} alt="Burgercord" width={56} height={56} style={{ borderRadius: "14px" }} />
                <div style={{ flex: 1 }}>
                    <HeadingSecondary>Burgercord Call & Client Performance Engine</HeadingSecondary>
                    <Paragraph>
                        Accelerates voice/video calls and client response times via build-indexed AOT Webpack patch caching,
                        dynamic WebRTC/GPU Call QoS prioritization, unfocused speaking-ring throttling, and CSS layout containment.
                    </Paragraph>
                </div>
            </Card>

            <Forms.FormTitle tag="h5">Live Performance Telemetry</Forms.FormTitle>
            <Flex gap="12px" className={Margins.top8 + " " + Margins.bottom20} style={{ flexWrap: "wrap" }}>
                <MetricBox
                    title="Call QoS Mode"
                    value={callStatus?.active ? "BOOSTING" : "STANDBY"}
                    subtitle={`Priority: ${callStatus?.processPriority ?? "NORMAL"} | Calls Boosted: ${callStatus?.totalCallsBoosted ?? 0}`}
                />
                <MetricBox
                    title="AOT Fast-Skipped Modules"
                    value={cacheMetrics.noopBypassedCount + cacheMetrics.compiledFromCacheCount}
                    subtitle={`Saved ~${cacheMetrics.estimatedMsSaved} ms of main-thread regex work`}
                />
                <MetricBox
                    title="Background Flux Coalesced"
                    value={boosterStats.coalescedEventsCount}
                    subtitle="Redundant hidden-window UI dispatches skipped"
                />
            </Flex>

            <Flex gap="12px" className={Margins.bottom20} style={{ flexWrap: "wrap" }}>
                <Button onClick={handleTestCallQos}>
                    {callStatus?.active ? "Disable Manual Call QoS Boost" : "Engage Call QoS Boost Now"}
                </Button>
                <Button variant="secondary" onClick={handleClearPatchCache}>
                    Reset AOT Webpack Patch Cache
                </Button>
            </Flex>

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Voice & Video Call Optimizations</Forms.FormTitle>
            <div className="vc-settings-switches">
                <FormSwitch
                    title="Dynamic Call QoS Priority & Anti-Jitter (Recommended)"
                    description="Automatically disables Chromium background renderer throttling and elevates OS process priority during active voice/screen-share calls so calls never lag while gaming."
                    value={callSettings.enableCallQos}
                    onChange={v => (CallPerformancePlugin.settings.store.enableCallQos = v)}
                    hideBorder
                />
                <FormSwitch
                    title="Throttle Unfocused Voice Speaking-Ring Repaints"
                    description="Reduces high-frequency voice avatar speaking-ring CSS/DOM layout recalculations when the Burgercord window is unfocused or minimized during a call."
                    value={callSettings.throttleUnfocusedSpeakingRings}
                    onChange={v => (CallPerformancePlugin.settings.store.throttleUnfocusedSpeakingRings = v)}
                    hideBorder
                />
                <FormSwitch
                    title="Prevent Solo Call Idle Disconnect"
                    description="Prevents Discord from disconnecting you after 3 minutes alone in a voice call."
                    value={callSettings.preventIdleCallDisconnect}
                    onChange={v => (CallPerformancePlugin.settings.store.preventIdleCallDisconnect = v)}
                    hideBorder
                />
            </div>

            <Divider className={Margins.top16 + " " + Margins.bottom16} />

            <Forms.FormTitle tag="h5">Client Response Time & Rendering Optimizations</Forms.FormTitle>
            <div className="vc-settings-switches">
                <FormSwitch
                    title="Coalesce Background Flux Dispatches When Minimized"
                    description="Drops redundant TYPING_START and non-active guild presence animations while Burgercord is minimized or hidden."
                    value={perfSettings.coalesceBackgroundFlux}
                    onChange={v => (PerformanceBoosterPlugin.settings.store.coalesceBackgroundFlux = v)}
                    hideBorder
                />
                <FormSwitch
                    title="Enable CSS Content-Visibility Containment"
                    description="Applies content-visibility: auto to off-screen chat messages and member list rows for faster channel switching and smooth scrolling."
                    value={perfSettings.enableCssContainment}
                    onChange={v => (PerformanceBoosterPlugin.settings.store.enableCssContainment = v)}
                    hideBorder
                />
            </div>
        </SettingsTab>
    );
}

export default wrapTab(PerformanceAndCallsTab, "Burgercord Performance & Calls");
