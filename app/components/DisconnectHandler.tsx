"use client";

import { useEffect } from "react";
import useLocalStorage from "@/hooks/useLocalStorage";
import { getApiDomain } from "@/utils/domain";

export default function DisconnectHandler() {
    const { value: token } = useLocalStorage<string>("token", "");

    useEffect(() => {
        const t = token.trim();
        if (!t) return;

        const sendHeartbeat = async () => {
            try {
                await fetch(`${getApiDomain()}/heartbeat`, {
                    method: "POST",
                    headers: { Authorization: t },
                });
            } catch {
                // ignore errors — server might be temporarily unreachable
            }
        };

        // send immediately on mount
        void sendHeartbeat();

        // then every 30 seconds
        const id = setInterval(() => void sendHeartbeat(), 30000);
        return () => clearInterval(id);
    }, [token]);

    return null;
}