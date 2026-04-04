"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, List, Spin, Switch } from "antd";
import { useRouter } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useApi } from "@/hooks/useApi";
import { useOnlineUsersTopic } from "@/hooks/useOnlineUsersTopic";
import {
  useOutgoingInviteStatuses,
  type CaboSentInviteEntry,
} from "@/hooks/useOutgoingInviteStatuses";
import type { ApplicationError } from "@/types/error";
import type { User } from "@/types/user";

type Player = {
  id: number;
  name: string;
  invited: boolean;
  loading: boolean;
  isSelf?: boolean;
};

const MAX_ACTIVE_INVITES = 3;

function countActiveInvites(sentEntries: Record<string, CaboSentInviteEntry>) {
  return Object.values(sentEntries).filter(
    (e) => e.status === "PENDING" || e.status === "ACCEPTED",
  ).length;
}

function buildPublicLobbyPlayers(
  onlineUsers: User[],
  selfId: string,
  sentEntries: Record<string, CaboSentInviteEntry>,
  inviteLoadingById: Record<string, boolean>,
): Player[] {
  const selfTrim = selfId.trim();
  const selfNumeric = selfTrim ? Number(selfTrim) : 0;
  const you: Player = {
    id: selfNumeric,
    name: "You",
    invited: true,
    loading: false,
    isSelf: true,
  };
  if (!selfTrim) {
    return [you];
  }

  const onlineById = new Map<number, User>();
  for (const u of onlineUsers) {
    if (u.id == null || String(u.id) === selfTrim) continue;
    const id = Number(u.id);
    if (Number.isFinite(id)) onlineById.set(id, u);
  }

  const activeIds = Object.entries(sentEntries)
    .filter(
      ([, e]) => e.status === "PENDING" || e.status === "ACCEPTED",
    )
    .map(([id]) => Number(id))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const seen = new Set<number>();
  const invitedRows: Player[] = [];
  for (const id of activeIds) {
    seen.add(id);
    const key = String(id);
    const u = onlineById.get(id);
    const st = sentEntries[key]?.status;
    const serverInvited = st === "PENDING" || st === "ACCEPTED";
    const loading = inviteLoadingById[key] ?? false;
    const name =
      sentEntries[key]?.toUsername?.trim() ||
      u?.username ||
      u?.name ||
      `User ${id}`;
    invitedRows.push({
      id,
      name,
      invited: serverInvited || loading,
      loading,
    });
  }

  const otherOnlineRows: Player[] = [];
  for (const [id, u] of onlineById) {
    if (seen.has(id)) continue;
    seen.add(id);
    const key = String(id);
    const st = sentEntries[key]?.status;
    const serverInvited = st === "PENDING" || st === "ACCEPTED";
    const loading = inviteLoadingById[key] ?? false;
    otherOnlineRows.push({
      id,
      name: u.username ?? u.name ?? "User",
      invited: serverInvited || loading,
      loading,
    });
  }
  otherOnlineRows.sort((a, b) => a.id - b.id);

  return [you, ...invitedRows, ...otherOnlineRows];
}

type LobbySession = { sessionId?: string };

const CreateLobby = () => {
  const router = useRouter();
  const api = useApi();
  const { value: userId } = useLocalStorage<string>("userId", "");
  const { value: token } = useLocalStorage<string>("token", "");
  const onlineUsers = useOnlineUsersTopic();
  const { sentEntries, loadSent, markPending } = useOutgoingInviteStatuses(
    userId,
    token,
  );

  const [inviteLoadingById, setInviteLoadingById] = useState<
    Record<string, boolean>
  >({});

  const [code, setCode] = useState<string>("");
  const [isPublicLobby, setIsPublicLobby] = useState(true);
  const [hasWaitingLobby, setHasWaitingLobby] = useState(false);

  const activeInviteCount = countActiveInvites(sentEntries);

  const ensureWaitingLobby = useCallback(async () => {
    const t = token.trim();
    if (!t || !isPublicLobby) {
      setHasWaitingLobby(false);
      return;
    }
    try {
      await api.getWithAuth<LobbySession>("/lobbies/my/waiting", t);
      setHasWaitingLobby(true);
      return;
    } catch {
      /* no waiting lobby yet */
    }
    try {
      await api.postWithAuth<LobbySession>(
        "/lobbies",
        { isPublic: isPublicLobby },
        t,
      );
      setHasWaitingLobby(true);
      await loadSent();
      return;
    } catch (e: unknown) {
      const status = (e as ApplicationError)?.status;
      if (status === 409) {
        try {
          await api.getWithAuth<LobbySession>("/lobbies/my/waiting", t);
          setHasWaitingLobby(true);
          await loadSent();
        } catch {
          setHasWaitingLobby(false);
        }
      } else {
        setHasWaitingLobby(false);
      }
    }
  }, [api, token, isPublicLobby, loadSent]);

  useEffect(() => {
    void ensureWaitingLobby();
  }, [ensureWaitingLobby]);

  const players = useMemo(
    () =>
      buildPublicLobbyPlayers(
        onlineUsers,
        userId,
        sentEntries,
        inviteLoadingById,
      ),
    [onlineUsers, userId, sentEntries, inviteLoadingById],
  );

  const handleInvite = (id: number) => {
    const t = token.trim();
    const uid = userId.trim();
    if (!t || !uid) return;
    const sid = String(id);
    const label = players.find((p) => !p.isSelf && p.id === id)?.name;
    setInviteLoadingById((prev) => ({ ...prev, [sid]: true }));
    void api
      .postWithAuth(
        `/users/${encodeURIComponent(uid)}/invites`,
        { toUserId: id },
        t,
      )
      .then(() => {
        markPending(id, label);
        setInviteLoadingById((prev) => ({ ...prev, [sid]: false }));
        void loadSent();
      })
      .catch((e: unknown) => {
        const status = (e as ApplicationError)?.status;
        const msg = e instanceof Error ? e.message : "";
        setInviteLoadingById((prev) => ({ ...prev, [sid]: false }));
        if (status === 409 && msg.includes("Pending invite already exists")) {
          markPending(id, label);
        }
        void loadSent();
      });
  };
// TODO: Backend logic or the lobby and seeisonID
 const generateCode = async () => {
     const t = token.trim();
     if (!t) return;
     try {
         // Backend created the lobby and gives back a sessionID
         const lobby = await api.postWithAuth<{ sessionId: string }>(
             "/lobbies",
             { isPublic: false },
             t
         );
         setCode(lobby.sessionId);
     } catch (error) {
         notification.error({
             message: "Could not create lobby",
             description: "Something went wrong. Please try again.",
             placement: "topRight",
             duration: 4,
         });
     }
 };

  return (
    <div className="cabo-background">
      <div className="login-container">
        <div className="create-lobby-stack">
          <Card
            title={
              <div className="create-lobby-card-head-inner">
                You can invite up to three other registered users<br />
                to play Cabo!
              </div>
            }
            className="dashboard-container create-lobby-title-only-card"
          />

          <Card className="dashboard-container">
            <div className="create-lobby-privacy-toggle">
              <span>Lobby privacy</span>
              <Switch
                checked={isPublicLobby}
                onChange={setIsPublicLobby}
                checkedChildren="Public"
                unCheckedChildren="Private"
              />
            </div>
          </Card>

          {isPublicLobby && (
            <Card
              title={
                <div className="create-lobby-card-head-inner">
                  Invite online players (max 3 active invites).
                </div>
              }
              className="dashboard-container"
            >
              <List
                dataSource={players}
                rowKey={(p) => (p.isSelf ? "self" : String(p.id))}
                renderItem={(player) => (
                  <List.Item className="create-lobby-player-row">
                    <div>{player.name}</div>
                    <div>
                      {!player.isSelf && (
                        <Button
                          type={player.invited ? "default" : "primary"}
                          disabled={
                            player.invited ||
                            !token.trim() ||
                            !hasWaitingLobby ||
                            (!player.invited &&
                              activeInviteCount >= MAX_ACTIVE_INVITES)
                          }
                          onClick={() => handleInvite(player.id)}
                        >
                          {player.invited ? "Invited" : "Invite"}
                        </Button>
                      )}
                    </div>
                    <div>
                      {player.loading && (
                        <Spin
                          size="small"
                          className="create-lobby-spin"
                        />
                      )}
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          )}

          {!isPublicLobby && (
            <Card
              title={
                <div className="create-lobby-card-head-inner">
                  Create a private lobby by generating a code
                </div>
              }
              className="dashboard-container"
            >
              <div className="create-lobby-actions">
                <Button type="primary" onClick={generateCode}>
                  Generate Code
                </Button>
                {code && (
                    <>
                        <Input
                            value={code}
                            readOnly
                            className="create-lobby-code-field"
                        />
                        <Button
                            type="primary"
                            style={{ marginTop: 8 }}
                            onClick={() => router.push(`/lobby/waiting?sessionId=${code}`)}
                        >
                            Create Game with code {code}
                        </Button>
                    </>
                )}
              </div>
            </Card>
          )}

          <Card className="dashboard-container">
            <div className="create-lobby-actions">
              <Button
                type="primary"
                className="create-lobby-start-game-btn"
                onClick={() => router.push("/game")}
              >
                Start Game
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateLobby;
