"use client";

import { useEffect } from "react";
import useLocalStorage from "@/hooks/useLocalStorage";
import { getApiDomain } from "@/utils/domain";

const HEARTBEAT_MIN_INTERVAL_MS = 10000;

export default function DisconnectHandler() {
    const { value: token } = useLocalStorage<string>("token", "");

    useEffect(() => {
        const t = token.trim();
        if (!t) return;

        const isActiveTab = () => document.visibilityState === "visible" && document.hasFocus();
        let lastHeartbeatMs = 0;

        const sendHeartbeat = async (force: boolean = false) => {
            if (!force && !isActiveTab()) {
                return;
            }

            const now = Date.now();
            if (!force && now - lastHeartbeatMs < HEARTBEAT_MIN_INTERVAL_MS) {
                return;
            }

            try {
                await fetch(`${getApiDomain()}/heartbeat`, {
                    method: "POST",
                    headers: { Authorization: t },
                });
                lastHeartbeatMs = now;
            } catch {
                // ignore errors; server might be temporarily unreachable
            }
        };

        const onActivity = () => {
            void sendHeartbeat();
        };
        const onTabActive = () => {
            if (isActiveTab()) {
                void sendHeartbeat(true);
            }
        };

        if (isActiveTab()) {
            void sendHeartbeat(true);
        }

        window.addEventListener("pointerdown", onActivity, { passive: true });
        window.addEventListener("pointermove", onActivity, { passive: true });
        window.addEventListener("keydown", onActivity, { passive: true });
        window.addEventListener("wheel", onActivity, { passive: true });
        window.addEventListener("touchstart", onActivity, { passive: true });
        window.addEventListener("focus", onTabActive, { passive: true });
        document.addEventListener("visibilitychange", onTabActive);

        return () => {
            window.removeEventListener("pointerdown", onActivity);
            window.removeEventListener("pointermove", onActivity);
            window.removeEventListener("keydown", onActivity);
            window.removeEventListener("wheel", onActivity);
            window.removeEventListener("touchstart", onActivity);
            window.removeEventListener("focus", onTabActive);
            document.removeEventListener("visibilitychange", onTabActive);
        };
    }, [token]);

    return null;
}
