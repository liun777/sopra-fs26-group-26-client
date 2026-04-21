"use client";

import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import type { ApplicationError } from "@/types/error";
import type { User } from "@/types/user";
import { usePathname, useRouter } from "next/navigation";
import { getStompBrokerUrl } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import { Button, Space } from "antd";
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
  const pathname = usePathname();
  const api = useApi();
  const { value: token } = useLocalStorage<string>("token", "");
  const { value: userId } = useLocalStorage<string>("userId", "");
  const [pending, setPending] = useState<CaboInvitePending[]>([]);
  const [responding, setResponding] = useState(false);
  const isAuthRoute =
    pathname === "/" || pathname === "/login" || pathname === "/register";

  const loadPending = useCallback(async () => {
    const t = token.trim();
    const uid = String(userId).trim();
    if (isAuthRoute || !t || !uid) {
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
  }, [api, token, userId, isAuthRoute]);

  useEffect(() => {
    const t = token.trim();
    const uid = String(userId).trim();
    if (isAuthRoute || !t || !uid || typeof window === "undefined") {
      setPending([]);
      return;
    }

    let stopped = false;
    let client: Client | null = null;

    void loadPending();

    const connectInvites = async () => {
      const { default: SockJS } = await import("sockjs-client");
      if (stopped) {
        return;
      }

      client = new Client({
        webSocketFactory: () => new SockJS(getStompBrokerUrl()),
        connectHeaders: { Authorization: t },
        reconnectDelay: 5000,
        onConnect: () => {
          client?.subscribe(`/topic/users/${uid}/invites`, () => {
            void loadPending();
          });
          void loadPending();
        },
      });
      client.activate();
    };

    void connectInvites();
    return () => {
      stopped = true;
      if (client) {
        void client.deactivate();
      }
    };
  }, [token, userId, loadPending, isAuthRoute]);

  const current = pending[0];

  const confirmLobbySwitchIfNeeded = useCallback(async (): Promise<boolean> => {
    const t = token.trim();
    const uid = String(userId).trim();
    if (!t || !uid || typeof window === "undefined") {
      return true;
    }

    try {
      const me = await api.getWithAuth<User>(`/users/${encodeURIComponent(uid)}`, t);
      const status = String(me?.status ?? "").trim().toUpperCase();
      if (status !== "LOBBY") {
        return true;
      }
      return window.confirm(
        "You are already in a lobby. Accepting this invite will leave your current lobby. Continue?",
      );
    } catch {
      return true;
    }
  }, [api, token, userId]);

  const onDecision = async (decision: "ACCEPT" | "DECLINE") => {
    const t = token.trim();
    const uid = String(userId).trim();
    if (!t || !current || !uid) return;
    if (decision === "ACCEPT") {
      const confirmed = await confirmLobbySwitchIfNeeded();
      if (!confirmed) {
        return;
      }
    }
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
          `/lobby/${encodeURIComponent(String(body.waitingLobbySessionId))}`, //updated to use encodeURIComponents
        );
      }
    } catch (error: unknown) {
      const status = (error as ApplicationError)?.status;
      if (decision === "ACCEPT" && status === 409) {
        alert("Lobby full. This lobby already has 4 players."); // added error msg for full lobbies // maybe add later question if want to join as spectator
      } else if (decision === "ACCEPT" && status === 404) {
        alert("Lobby not found anymore.");
      }
      /* keep popup until user retries or server ok */
    } finally {
      setResponding(false);
    }
  };

  if (isAuthRoute || !current) return null;

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
