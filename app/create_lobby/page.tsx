"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, List, Spin, Switch, notification } from "antd"; // notification is unused atm
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
    const isInviteRequestPendingInvited = inviteLoadingById[key] ?? false;
    const loading = isInviteRequestPendingInvited || st === "PENDING"; // invite but not joined shows PENDING
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
    const isInviteRequestPendingOthers = inviteLoadingById[key] ?? false;
    const loading = isInviteRequestPendingOthers || st === "PENDING"; // invite but not joined shows PENDING
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
  const [waitingLobbySessionId, setWaitingLobbySessionId] = useState<string>(""); // save current state so frontend knows which lobby to update backend

  const activeInviteCount = countActiveInvites(sentEntries);


  const ensureWaitingLobby = useCallback(async () => {
    const t = token.trim();

    if (!t) {
      setHasWaitingLobby(false);
      setWaitingLobbySessionId("");
      return;
    }

    try {
      // if existing waiting lobby: keep using
      const existing = await api.getWithAuth<LobbySession>("/lobbies/my/waiting", t);
      setHasWaitingLobby(true);
      setWaitingLobbySessionId(String(existing.sessionId ?? "").trim());
      return;
    } catch {
      setWaitingLobbySessionId("");

      // if prviate => don't auto-create a public lobby
      if (!isPublicLobby) {
        setHasWaitingLobby(false);
        return;
      }
    }

    try {
      // Public mode: auto-create waiting lobby so invite works right away
      const created = await api.postWithAuth<LobbySession>(
        "/lobbies",
        { isPublic: true },
        t,
      );
      setHasWaitingLobby(true);
      setWaitingLobbySessionId(String(created.sessionId ?? "").trim());
      await loadSent();
      return;
    } catch (e: unknown) {
      const status = (e as ApplicationError)?.status;

      if (status === 409) { // already exists, we fetch it again
        try {
          const existing = await api.getWithAuth<LobbySession>("/lobbies/my/waiting", t);
          setHasWaitingLobby(true);
          setWaitingLobbySessionId(String(existing.sessionId ?? "").trim());
          await loadSent();
        } catch {
          setHasWaitingLobby(false);
          setWaitingLobbySessionId("");
        }
      } else {
        setHasWaitingLobby(false);
        setWaitingLobbySessionId("");
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

const handlePrivacyToggle = (makePrivate: boolean) => {
  const nextIsPublic = !makePrivate;
  const previousIsPublic = isPublicLobby;

  setIsPublicLobby(nextIsPublic); // instant UI feedback

  const t = token.trim();
  const sid = waitingLobbySessionId.trim();

  if (makePrivate && sid) {
    setCode(sid); // show existing code right away in private mode
  }

  if (!t || !sid) return;

  void api
    .patchWithAuth(
      `/lobbies/${encodeURIComponent(sid)}/settings`,
      { isPublic: nextIsPublic },
      t,
    )
    .catch(() => {
      setIsPublicLobby(previousIsPublic); // revert toggle if backend update fails
      alert("Could not update lobby privacy. Please try again.");
    });
};

const generateCode = async () => {
  const t = token.trim();
  if (!t) return;

  const existingSid = waitingLobbySessionId.trim();
  if (existingSid) {
    setCode(existingSid); // reuse existing lobby code
    return;
  }

  try {
    // create a new private lobby only if we don't already have one
    const lobby = await api.postWithAuth<{ sessionId: string }>(
      "/lobbies",
      { isPublic: false },
      t,
    );
    setCode(lobby.sessionId);
    setWaitingLobbySessionId(String(lobby.sessionId ?? "").trim());
  } catch {
    alert("Could not create lobby. Something went wrong. Please try again.");
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
              <span>Make Private</span>
              <Switch
                checked={!isPublicLobby}
                onChange={handlePrivacyToggle} // uses new func
                checkedChildren="Yes"
                unCheckedChildren="No"
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
                renderItem={(player) => ( // color hooks for active player in lobby
                  <List.Item className={`create-lobby-player-row${player.isSelf ? " create-lobby-player-row-active" : ""}`}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span>{player.name}</span>
                      {player.loading && (
                        <Spin // spinner next to name when loading
                          size="small"
                          className="create-lobby-spin"
                        />
                      )}
                    </div>
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
                          {player.loading ? ( // I wanted the dots to animate :P
                            <span className="invite-pending-label">
                              Invited<span className="invite-pending-dots" />
                            </span>
                          ) : player.invited ? "Invited" : "Invite"}
                        </Button>
                      )}
                    </div>
                    <div />
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
                            onClick={() => router.push(`/lobby/${encodeURIComponent(code)}`)} // sends user to lobby code
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
