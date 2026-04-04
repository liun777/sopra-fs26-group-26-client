"use client";

import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useRouter } from "next/navigation";
import { getStompBrokerUrl, isAppspotApi, LIVE_REFRESH_MS } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import { Button, Space } from "antd";
import SockJS from "sockjs-client";
import { useCallback, useEffect, useState } from "react";

type CaboInvitePending = {
  id: number;
  fromUsername: string;
};

function normalizePendingRows(raw: unknown): CaboInvitePending[] {
  if (!Array.isArray(raw)) return [];
  const out: CaboInvitePending[] = [];
  for (const row of raw) {
    const o = row as Record<string, unknown>;
    const rawId = o.id ?? o.inviteId;
    const id = typeof rawId === "number" ? rawId : Number(rawId);
    const fromUserId =
      typeof o.fromUserId === "number" ? o.fromUserId : Number(o.fromUserId);
    const fromUsername = o.fromUsername;
    if (!Number.isFinite(id) || !Number.isFinite(fromUserId)) continue;
    if (typeof fromUsername !== "string") continue;
    out.push({ id, fromUsername });
  }
  return out;
}

type InviteRespondBody = { waitingLobbySessionId?: string | null };

export default function CaboInviteNotifications() {
  const router = useRouter();
  const api = useApi();
  const { value: token } = useLocalStorage<string>("token", "");
  const { value: userId } = useLocalStorage<string>("userId", "");
  const [pending, setPending] = useState<CaboInvitePending[]>([]);
  const [responding, setResponding] = useState(false);

  const loadPending = useCallback(async () => {
    const t = token.trim();
    const uid = String(userId).trim();
    if (!t || !uid) {
      setPending([]);
      return;
    }
    try {
      const list = await api.getWithAuth<unknown>(
        `/users/${encodeURIComponent(uid)}/invites`,
        t,
      );
      setPending(normalizePendingRows(list));
    } catch {
      setPending([]);
    }
  }, [api, token, userId]);

  useEffect(() => {
    const t = token.trim();
    const uid = String(userId).trim();
    if (!t || !uid) {
      setPending([]);
      return;
    }

    void loadPending();

    if (isAppspotApi()) {
      const id = setInterval(() => void loadPending(), LIVE_REFRESH_MS);
      return () => clearInterval(id);
    }

    const client = new Client({
      webSocketFactory: () => new SockJS(getStompBrokerUrl()),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/users/${uid}/invites`, () => {
          void loadPending();
        });
        void loadPending();
      },
    });
    client.activate();
    return () => {
      void client.deactivate();
    };
  }, [token, userId, loadPending]);

  const current = pending[0];

  const onDecision = async (decision: "ACCEPT" | "DECLINE") => {
    const t = token.trim();
    const uid = String(userId).trim();
    if (!t || !current || !uid) return;
    setResponding(true);
    try {
      const body = await api.patchWithAuth<InviteRespondBody>(
        `/users/${encodeURIComponent(uid)}/invites/${current.id}`,
        { decision },
        t,
      );
      await loadPending();
      if (
        decision === "ACCEPT" &&
        body?.waitingLobbySessionId &&
        String(body.waitingLobbySessionId).length > 0
      ) {
        router.push(
          `/lobby/waiting?sessionId=${encodeURIComponent(String(body.waitingLobbySessionId))}`,
        );
      }
    } catch {
      /* keep popup until user retries or server ok */
    } finally {
      setResponding(false);
    }
  };

  if (!current) return null;

  return (
    <div className="cabo-invite-corner" role="status" aria-live="polite">
      <p className="cabo-invite-corner-text">
        Player {current.fromUsername} has invited you to play Cabo.
      </p>
      <div className="cabo-invite-corner-actions">
        <Space>
          <Button
            type="primary"
            loading={responding}
            onClick={() => void onDecision("ACCEPT")}
          >
            Accept
          </Button>
          <Button disabled={responding} onClick={() => void onDecision("DECLINE")}>
            Decline
          </Button>
        </Space>
      </div>
    </div>
  );
}
