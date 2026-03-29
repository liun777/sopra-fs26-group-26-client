import { useApi } from "@/hooks/useApi";
import { User } from "@/types/user";
import { getSockJsStompUrl } from "@/utils/domain";
import { Client, IMessage } from "@stomp/stompjs";
import { useEffect, useState } from "react";
import SockJS from "sockjs-client";

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
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  useEffect(() => {
    let cancelled = false;

    void api.get<User[]>("/users").then((all) => {
      if (!cancelled) {
        setOnlineUsers(all.filter((u) => u.status === "ONLINE"));
      }
    });

    const client = new Client({
      webSocketFactory: () => new SockJS(getSockJsStompUrl()) as unknown as WebSocket,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe("/topic/users/online", (msg: IMessage) => {
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

    return () => {
      cancelled = true;
      void client.deactivate();
    };
  }, [api]);

  return onlineUsers;
}
