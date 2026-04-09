import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { getStompBrokerUrl } from "@/utils/domain";
import { toPresenceKey } from "@/utils/presence";
import { Client, IMessage } from "@stomp/stompjs";
import { useEffect, useState } from "react";
import SockJS from "sockjs-client";

const ONLINE_USERS_REFRESH_MS = 2500; // CAN BE CHANGED, ITS REFRESH RATE FOR USER LIST

function isOnlineStatus(raw: unknown): boolean {
  return toPresenceKey(raw) === "online";
}

function parseOnlineUsersJson(body: string): User[] {
  const arr = JSON.parse(body) as unknown[];
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    const o = row as Record<string, unknown>;
    return {
      id: o.id != null ? String(o.id) : null,
      name: (o.name as string) ?? null,
      username: (o.username as string) ?? null,
      token: null,
      status: (o.status as string) ?? null,
      bio: (o.bio as string) ?? null,
      creationDate: o.creationDate != null ? String(o.creationDate) : null,
      gamesWon: (o.gamesWon as number) ?? null,
      averageScorePerRound: (o.averageScorePerRound as number) ?? null,
      overallRank: (o.overallRank as number) ?? null,
    };
  });
}

/**
 * First load from existing GET /users; live updates from existing /topic/users/online.
 */
export function useOnlineUsersTopic(): User[] {
  const api = useApi();
  const { value: token } = useLocalStorage<string>("token", "");
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  useEffect(() => {
    let cancelled = false;

    const refreshFromRest = async () => {
      try {
        const all = await api.get<User[]>("/users");
        if (!cancelled) {
          setOnlineUsers(all.filter((u) => isOnlineStatus(u.status)));
        }
      } catch {
        if (!cancelled) {
          setOnlineUsers([]);
        }
      }
    };

    void refreshFromRest();
    const pollId = setInterval(() => {
      void refreshFromRest();
    }, ONLINE_USERS_REFRESH_MS);
    const t = token.trim();

    // use SockJS instead of raw WebSocket
    let client: Client | null = null;
    if (t) {
      client = new Client({
        webSocketFactory: () => new SockJS(getStompBrokerUrl()),
        connectHeaders: { Authorization: t },
        reconnectDelay: 5000,
        onConnect: () => {
          client?.subscribe("/topic/users/online", (msg: IMessage) => {
            if (cancelled) return;
            try {
              if (msg.body) setOnlineUsers(parseOnlineUsersJson(msg.body));
            } catch {}
          });
        },
      });
      client.activate();
    }

    /* -> uses raw Websocket
    const client = new Client({
      brokerURL: getStompBrokerUrl(),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe("/topic/users/online", (msg: IMessage) => {
          if (cancelled) return;
          try {
            if (msg.body) {
              setOnlineUsers(parseOnlineUsersJson(msg.body));
            }
          } catch {
          }
        });
      },
    });
    client.activate();
    */

    return () => {
      cancelled = true;
      clearInterval(pollId);
      if (client) {
        void client.deactivate();
      }
    };
  }, [api, token]);

  return onlineUsers;
}
