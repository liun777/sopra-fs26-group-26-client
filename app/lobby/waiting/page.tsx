"use client";

import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useOnlineUsersTopic } from "@/hooks/useOnlineUsersTopic";
import {
  useOutgoingInviteStatuses,
  type CaboSentInviteEntry,
} from "@/hooks/useOutgoingInviteStatuses";
import type { ApplicationError } from "@/types/error";
import type { User } from "@/types/user";
import { getStompBrokerUrl, LIVE_REFRESH_MS } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import { Button, Card, Collapse, Input, List, Popconfirm, Spin, Switch, Typography } from "antd";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import SockJS from "sockjs-client";

type WaitingRow = {
  username: string;
  joinStatus: string;
};

type WaitingView = {
  sessionId?: string;
  isPublic?: boolean;
  players?: WaitingRow[];
};

type LobbySession = {
  sessionId?: string;
};

type Player = {
  id: number;
  name: string;
  invited: boolean;
  loading: boolean;
  joined?: boolean;
  isSelf?: boolean;
};

type LobbySlot = {
  key: string;
  label: string;
  status: string;
  isViewer: boolean;
  isHost: boolean;
  occupied: boolean;
  isOpenSlot: boolean;
  readyKey: string;
  ready: boolean;
};

const MAX_ACTIVE_INVITES = 3; // revisit
const MAX_LOBBY_PLAYERS = 4;
const HOST_CROWN = "\uD83D\uDC51\uFE0E";
const KICK_ICON = "\u2716";

function normalizeValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function countActiveInvites(sentEntries: Record<string, CaboSentInviteEntry>) {
  return Object.values(sentEntries).filter(
    (entry) => entry.status === "PENDING" || entry.status === "ACCEPTED",
  ).length;
}

function toLobbySlotStatus(
  joinStatus: string,
  isHostSlot: boolean,
  occupied: boolean,
): string {
  if (isHostSlot) {
    return "Host";
  }
  if (!occupied) {
    return "Open";
  }

  const normalized = normalizeValue(joinStatus);
  if (
    normalized === "joined" ||
    normalized === "you" ||
    normalized === "accepted"
  ) {
    return "Joined";
  }
  if (normalized === "pending" || normalized === "invited") {
    return "Invited";
  }
  if (!normalized) {
    return "Joined";
  }
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function buildPublicLobbyPlayers(
  onlineUsers: User[],
  selfId: string,
  sentEntries: Record<string, CaboSentInviteEntry>,
  inviteLoadingById: Record<string, boolean>,
  joinedByUsername: Record<string, true>,
  selfIsHost: boolean,
): Player[] {
  const selfTrim = selfId.trim();
  const selfNumeric = selfTrim ? Number(selfTrim) : 0;
  const selfUser = onlineUsers.find(
    (user) => user.id != null && String(user.id) === selfTrim,
  );
  const selfLabel = selfUser?.username?.trim() || selfUser?.name?.trim() || "Player";

  const selfRow: Player = {
    id: selfNumeric,
    name: selfIsHost ? `${selfLabel} ${HOST_CROWN}` : selfLabel,
    invited: true,
    loading: false,
    isSelf: true,
  };

  if (!selfTrim) {
    return [selfRow];
  }

  const onlineById = new Map<number, User>();
  for (const user of onlineUsers) {
    if (user.id == null || String(user.id) === selfTrim) {
      continue;
    }
    const id = Number(user.id);
    if (Number.isFinite(id)) {
      onlineById.set(id, user);
    }
  }

  const activeInviteIds = Object.entries(sentEntries)
    .filter(([, entry]) => entry.status === "PENDING" || entry.status === "ACCEPTED")
    .map(([id]) => Number(id))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const seen = new Set<number>();
  const invitedRows: Player[] = [];
  for (const id of activeInviteIds) {
    seen.add(id);

    const key = String(id);
    const user = onlineById.get(id);
    const inviteStatus = sentEntries[key]?.status;
    const serverInvited = inviteStatus === "PENDING" || inviteStatus === "ACCEPTED";
    const inviteRequestPending = inviteLoadingById[key] ?? false;

    const acceptedInvite = inviteStatus === "ACCEPTED";
    const usernameKey = normalizeValue(sentEntries[key]?.toUsername ?? user?.username);
    const joined = acceptedInvite && Boolean(usernameKey && joinedByUsername[usernameKey]);
    const loading = acceptedInvite && !joined;

    const name =
      sentEntries[key]?.toUsername?.trim() ||
      user?.username ||
      user?.name ||
      `User ${id}`;

    invitedRows.push({
      id,
      name,
      invited: serverInvited || inviteRequestPending || loading,
      loading,
      joined,
    });
  }

  const otherOnlineRows: Player[] = [];
  for (const [id, user] of onlineById) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const key = String(id);
    const inviteStatus = sentEntries[key]?.status;
    const serverInvited = inviteStatus === "PENDING" || inviteStatus === "ACCEPTED";
    const inviteRequestPending = inviteLoadingById[key] ?? false;

    const acceptedInvite = inviteStatus === "ACCEPTED";
    const usernameKey = normalizeValue(sentEntries[key]?.toUsername ?? user?.username);
    const joined = acceptedInvite && Boolean(usernameKey && joinedByUsername[usernameKey]);
    const loading = acceptedInvite && !joined;

    otherOnlineRows.push({
      id,
      name: user.username ?? user.name ?? "User",
      invited: serverInvited || inviteRequestPending || loading,
      loading,
      joined,
    });
  }
  otherOnlineRows.sort((a, b) => a.id - b.id);

  return [selfRow, ...invitedRows, ...otherOnlineRows];
}

function WaitingLobbyContent() {
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const searchParams = useSearchParams();

  const sessionIdFromPath = String(params?.sessionId ?? "").trim();
  const sessionIdFromQuery = String(searchParams.get("sessionId") ?? "").trim();
  const sessionIdParam = sessionIdFromPath || sessionIdFromQuery;

  const api = useApi();
  const { value: token } = useLocalStorage<string>("token", "");
  const { value: userId } = useLocalStorage<string>("userId", "");

  const onlineUsers = useOnlineUsersTopic();
  const { sentEntries, loadSent, markPending } = useOutgoingInviteStatuses(
    userId,
    token,
  );

  const [view, setView] = useState<WaitingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lobbyWsConnected, setLobbyWsConnected] = useState(false);
  const [userIsHost, setUserIsHost] = useState(false);
  const [isPublicLobby, setIsPublicLobby] = useState(false);
  const [inviteLoadingById, setInviteLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [inviteSearch, setInviteSearch] = useState("");
  const [readyByUsername, setReadyByUsername] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const sessionId = sessionIdParam.trim();
    if (sessionId) {
      return;
    }

    const authToken = token.trim();
    if (!authToken) {
      setView(null);
      setError("Not logged in");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const bootstrapLobby = async () => {
      try {
        const existing = await api.getWithAuth<LobbySession>(
          "/lobbies/my/waiting",
          authToken,
        );
        const existingSessionId = String(existing.sessionId ?? "").trim();
        if (existingSessionId) {
          if (active) {
            router.replace(`/lobby/${encodeURIComponent(existingSessionId)}`);
          }
          return;
        }
      } catch {
        /* no waiting lobby yet */
      }

      try {
        const created = await api.postWithAuth<LobbySession>(
          "/lobbies",
          { isPublic: false },
          authToken,
        );
        const createdSessionId = String(created.sessionId ?? "").trim();
        if (!createdSessionId) {
          throw new Error("Missing sessionId");
        }
        if (active) {
          router.replace(`/lobby/${encodeURIComponent(createdSessionId)}`);
        }
      } catch {
        if (active) {
          setView(null);
          setError("Could not open lobby.");
          setLoading(false);
        }
      }
    };

    void bootstrapLobby();

    return () => {
      active = false;
    };
  }, [api, router, sessionIdParam, token]);

  const loadView = useCallback(async () => {
    const authToken = token.trim();
    const sessionId = sessionIdParam.trim();

    if (!authToken || !sessionId) {
      setView(null);
      setError(!sessionId ? "Missing session" : "Not logged in");
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const waitingView = await api.getWithAuth<WaitingView>(
        `/lobbies/waiting/${encodeURIComponent(sessionId)}`,
        authToken,
      );
      setView(waitingView);
      setIsPublicLobby(waitingView?.isPublic !== false);
    } catch {
      setView(null);
      setError("Could not load waiting lobby.");
    } finally {
      setLoading(false);
    }
  }, [api, token, sessionIdParam]);

  useEffect(() => {
    if (!sessionIdParam.trim()) {
      return;
    }
    void loadView();
  }, [loadView, sessionIdParam]);

  useEffect(() => {
    const authToken = token.trim();
    const sessionId = sessionIdParam.trim();

    if (!authToken || !sessionId) {
      setUserIsHost(false);
      return;
    }

    let active = true;

    const loadHostRole = async () => {
      try {
        const mine = await api.getWithAuth<LobbySession>(
          "/lobbies/my/waiting",
          authToken,
        );

        if (active) {
          setUserIsHost(String(mine.sessionId ?? "").trim() === sessionId);
        }
      } catch {
        if (active) {
          setUserIsHost(false);
        }
      }
    };

    void loadHostRole();

    return () => {
      active = false;
    };
  }, [api, token, sessionIdParam]);

  useEffect(() => {
    const authToken = token.trim();
    const sessionId = sessionIdParam.trim();

    if (!authToken || !sessionId) {
      setLobbyWsConnected(false);
      return;
    }

    setLobbyWsConnected(false);
    void loadView();

    const client = new Client({
      webSocketFactory: () => new SockJS(getStompBrokerUrl()),
      connectHeaders: { Authorization: authToken },
      reconnectDelay: 5000,
      onConnect: () => {
        setLobbyWsConnected(true);
        client.subscribe(`/topic/lobby/session/${sessionId}`, () => {
          void loadView();
        });
        void loadView();
      },
      onStompError: () => {
        setLobbyWsConnected(false);
      },
      onWebSocketClose: () => {
        setLobbyWsConnected(false);
      },
      onWebSocketError: () => {
        setLobbyWsConnected(false);
      },
    });

    client.activate();
    return () => {
      setLobbyWsConnected(false);
      void client.deactivate();
    };
  }, [token, sessionIdParam, loadView]);

  useEffect(() => {
    const authToken = token.trim();
    const sessionId = sessionIdParam.trim();
    if (!authToken || !sessionId) {
      return;
    }

    const pollId = setInterval(() => {
      void loadView();
      void loadSent();
    }, LIVE_REFRESH_MS);

    return () => {
      clearInterval(pollId);
    };
  }, [token, sessionIdParam, loadView, loadSent]);

  const waitingPlayers = useMemo(
    () =>
      (view?.players ?? [])
        .filter((player) => String(player.username ?? "").trim().length > 0)
        .slice(0, MAX_LOBBY_PLAYERS),
    [view],
  );

  useEffect(() => {
    const presentUsernames = new Set(
      waitingPlayers
        .map((player) => normalizeValue(player.username))
        .filter((name) => name.length > 0),
    );

    setReadyByUsername((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (presentUsernames.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [waitingPlayers]);

  const joinedByUsername = useMemo(() => {
    const joinedUsers: Record<string, true> = {};

    for (const player of waitingPlayers) {
      const usernameKey = normalizeValue(player.username);
      const status = normalizeValue(player.joinStatus);
      if (!usernameKey) {
        continue;
      }
      if (status === "joined" || status === "you") {
        joinedUsers[usernameKey] = true;
      }
    }

    return joinedUsers;
  }, [waitingPlayers]);

  const usernamesAlreadyInLobby = useMemo(() => {
    const usernames = new Set<string>();
    for (const player of waitingPlayers) {
      const usernameKey = normalizeValue(player.username);
      if (usernameKey) {
        usernames.add(usernameKey);
      }
    }
    return usernames;
  }, [waitingPlayers]);

  const inviteRows = useMemo(
    () =>
      buildPublicLobbyPlayers(
        onlineUsers,
        userId,
        sentEntries,
        inviteLoadingById,
        joinedByUsername,
        userIsHost,
      ),
    [
      onlineUsers,
      userId,
      sentEntries,
      inviteLoadingById,
      joinedByUsername,
      userIsHost,
    ],
  );

  const filteredInviteRows = useMemo(() => {
    const query = normalizeValue(inviteSearch);
    return inviteRows
      .filter((player) => !player.isSelf)
      .filter((player) => !usernamesAlreadyInLobby.has(normalizeValue(player.name)))
      .filter((player) => !player.joined)
      .filter((player) => {
        if (!query) {
          return true;
        }
        return normalizeValue(player.name).includes(query);
      });
  }, [inviteRows, inviteSearch, usernamesAlreadyInLobby]);

  const activeInviteCount = countActiveInvites(sentEntries);

  const { lobbySlots, presentCount } = useMemo(() => {
    const explicitViewerIndex = waitingPlayers.findIndex(
      (player) => normalizeValue(player.joinStatus) === "you",
    );
    const viewerIndex =
      explicitViewerIndex >= 0
        ? explicitViewerIndex
        : userIsHost && waitingPlayers.length > 0
          ? 0
          : -1;

    const slots: LobbySlot[] = [];
    for (let index = 0; index < MAX_LOBBY_PLAYERS; index += 1) {
      const player = waitingPlayers[index];
      const isHost = index === 0;
      const occupied = Boolean(player);
      const fallbackLabel = isHost ? "Host" : "Open Slot";
      const label = player?.username?.trim() || fallbackLabel;
      const isOpenSlot = !occupied && !isHost;
      const readyKey = occupied ? normalizeValue(player?.username) : "";
      const ready = occupied ? Boolean(readyKey && readyByUsername[readyKey]) : false;

      slots.push({
        key: `slot-${index + 1}`,
        label,
        status: toLobbySlotStatus(String(player?.joinStatus ?? ""), isHost, occupied),
        isViewer: index === viewerIndex,
        isHost,
        occupied,
        isOpenSlot,
        readyKey,
        ready,
      });
    }

    return {
      lobbySlots: slots,
      presentCount: waitingPlayers.length,
    };
  }, [waitingPlayers, userIsHost, readyByUsername]);

  const viewerLobbySlot = useMemo(
    () => lobbySlots.find((slot) => slot.isViewer && slot.occupied),
    [lobbySlots],
  );

  const viewerReadyKey = viewerLobbySlot?.readyKey ?? "";
  const viewerIsReady = Boolean(viewerLobbySlot?.ready);

  const sessionId = String(view?.sessionId ?? sessionIdParam ?? "").trim();
  const lobbyConnectionIsGreen = lobbyWsConnected;

  const handleInvite = (id: number) => {
    if (!userIsHost) {
      return;
    }

    const authToken = token.trim();
    const uid = userId.trim();

    if (!authToken || !uid || !sessionId) {
      return;
    }

    const rowId = String(id);
    const label = inviteRows.find((player) => !player.isSelf && player.id === id)?.name;

    setInviteLoadingById((prev) => ({ ...prev, [rowId]: true }));

    void api
      .postWithAuth(
        `/users/${encodeURIComponent(uid)}/invites`,
        { toUserId: id },
        authToken,
      )
      .then(() => {
        markPending(id, label);
        setInviteLoadingById((prev) => ({ ...prev, [rowId]: false }));
        void loadSent();
      })
      .catch((error: unknown) => {
        const status = (error as ApplicationError)?.status;
        const message = error instanceof Error ? error.message : "";

        setInviteLoadingById((prev) => ({ ...prev, [rowId]: false }));

        if (status === 409 && message.includes("Pending invite already exists")) {
          markPending(id, label);
        }
        void loadSent();
      });
  };

  const handlePrivacyToggle = (makePrivate: boolean) => {
    if (!userIsHost) {
      return;
    }

    const authToken = token.trim();
    if (!authToken || !sessionId) {
      return;
    }

    const nextIsPublic = !makePrivate;
    const previousIsPublic = isPublicLobby;

    setIsPublicLobby(nextIsPublic);

    void api
      .patchWithAuth(
        `/lobbies/${encodeURIComponent(sessionId)}/settings`,
        { isPublic: nextIsPublic },
        authToken,
      )
      .catch(() => {
        setIsPublicLobby(previousIsPublic);
      });
  };

  const handleViewerReadyToggle = () => {
    if (!viewerReadyKey) {
      return;
    }
    setReadyByUsername((prev) => ({
      ...prev,
      [viewerReadyKey]: !prev[viewerReadyKey],
    }));
  };

  if (loading && !view) {
    return (
      <div className="cabo-background">
        <div className="login-container waiting-lobby-loading">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  if (error && !view) {
    return (
      <div className="cabo-background">
        <div className="login-container">
          <Card className="dashboard-container">
            <Typography.Paragraph>{error}</Typography.Paragraph>
            <Link href="/dashboard">Back to dashboard</Link>
          </Card>
        </div>
      </div>
    );
  }

  // fun times below
  return (
    <div className="cabo-background">
      <div className="login-container">
        <div className="create-lobby-stack">
          <Card
            title={
              <div className="lobby-header-row">
                <span className="lobby-header-title-wrap">
                  <span
                    className={`lobby-header-mode ${isPublicLobby ? "lobby-header-mode-open" : "lobby-header-mode-private"}`}
                  >
                    {isPublicLobby ? "Open" : "Private"}
                  </span>
                  <span className="lobby-header-title">Lobby</span>
                </span>
                <span
                  className={`lobby-connection-symbol ${lobbyConnectionIsGreen ? "connected" : "disconnected"}`}
                  title={lobbyConnectionIsGreen ? "Connected" : "Disconnected"}
                >
                  {"\u1BE4"}
                </span>
              </div>
            }
            className="dashboard-container lobby-title-card"
          >
            <div className="lobby-intro-copy">
              <span>Welcome to Lobby {sessionId || "----"}.</span>
              {userIsHost ? <span>As the host you can invite up to 3 players.</span> : null}
            </div>
          </Card>

          <Card
            title={
              <div className="lobby-section-title-row">
                <span className="lobby-section-title">Players</span>
                <span className="lobby-section-meta">{presentCount}/4</span>
              </div>
            }
            className="dashboard-container lobby-players-card"
          >
            <List
              className="lobby-players-list"
              dataSource={lobbySlots}
              rowKey={(slot) => slot.key}
              renderItem={(slot) => (
                <List.Item
                  className={`lobby-slot-row lobby-slot-highlight-row${slot.isViewer ? " lobby-slot-highlight-row-active" : ""}${slot.isOpenSlot ? " lobby-slot-row-open" : ""}`}
                >
                  <div className="lobby-slot-label">
                    <span
                      className={`lobby-ready-bar${slot.occupied ? (slot.ready ? " lobby-ready-bar-ready" : " lobby-ready-bar-not-ready") : " lobby-ready-bar-empty"}`}
                    />
                    <span className={slot.isOpenSlot ? "lobby-open-slot-text" : ""}>
                      {slot.label}
                    </span>
                  </div>
                  <Button
                    className={`create-lobby-player-action lobby-slot-status-btn${slot.status === "Host" ? " lobby-slot-status-host" : ""}${slot.status === "Joined" ? " lobby-slot-status-joined" : ""}${slot.status === "Open" ? " lobby-slot-status-open" : ""}`}
                    type="default"
                    disabled
                  >
                    {slot.status === "Host" ? `Host ${HOST_CROWN}` : slot.status}
                  </Button>
                  <div className="lobby-slot-actions">
                    {userIsHost && slot.occupied && !slot.isHost ? (
                      <Popconfirm
                        title={`Do you really want to kick ${slot.label}?`}
                        okText="YES, KICK HIM"
                        cancelText="NO"
                        arrow={false}
                        overlayStyle={{ background: "transparent" }}
                        overlayInnerStyle={{
                          background: "rgba(58, 58, 58, 0.96)",
                          border: "1px solid rgba(0, 0, 0, 0.5)",
                          boxShadow: "0 10px 24px rgba(0, 0, 0, 0.45)",
                          padding: "14px 16px",
                        }}
                        okButtonProps={{ danger: true, type: "primary" }}
                        cancelButtonProps={{ type: "default" }}
                        overlayClassName="lobby-kick-confirm"
                        onConfirm={() => undefined}
                      >
                        <Button
                          className="lobby-kick-btn lobby-kick-btn-host"
                          title={`Kick ${slot.label}`}
                        >
                          <span className="lobby-kick-icon">{KICK_ICON}</span>
                        </Button>
                      </Popconfirm>
                    ) : null}
                  </div>
                </List.Item>
              )}
            />
          </Card>

          <Card
            title={
              <div className="lobby-section-title-row">
                <span className="lobby-section-title">Invite</span>
              </div>
            }
            className={`dashboard-container${!userIsHost ? " lobby-controls-disabled" : ""}`}
          >
            <Collapse
              className={`lobby-invite-collapse${!userIsHost ? " lobby-invite-collapse-disabled" : ""}`}
              items={[
                {
                  key: "invite-online-players",
                  label: "Invite Online Players",
                  children: (
                    <List
                      header={
                        <Input
                          className="lobby-invite-search"
                          placeholder="Search online players"
                          value={inviteSearch}
                          allowClear
                          disabled={!userIsHost}
                          onChange={(event) => setInviteSearch(event.target.value)}
                        />
                      }
                      dataSource={filteredInviteRows}
                      locale={{
                        emptyText: inviteSearch.trim()
                          ? "No players match your search"
                          : "No players available",
                      }}
                      rowKey={(player) => String(player.id)}
                      renderItem={(player) => (
                        <List.Item className="create-lobby-player-row">
                          <div className="lobby-slot-label">
                            <span>{player.name}</span>
                            {player.loading ? (
                              <Spin size="small" className="create-lobby-spin" />
                            ) : null}
                          </div>
                          <div>
                            <Button
                              className={`create-lobby-player-action${player.joined ? " lobby-invite-joined-btn" : ""}`}
                              type={player.invited || player.joined ? "default" : "primary"}
                              disabled={
                                !userIsHost ||
                                player.invited ||
                                !token.trim() ||
                                !sessionId ||
                                (!player.invited &&
                                  activeInviteCount >= MAX_ACTIVE_INVITES)
                              }
                              onClick={() => handleInvite(player.id)}
                            >
                              {player.joined
                                ? "Joined"
                                : player.invited
                                  ? "Invited"
                                  : "Invite"}
                            </Button>
                          </div>
                          <div />
                        </List.Item>
                      )}
                    />
                  ),
                },
              ]}
            />
          </Card>

          <Card
            title={
              <div className="lobby-section-title-row">
                <span className="lobby-section-title">Settings</span>
              </div>
            }
            className={`dashboard-container${!userIsHost ? " lobby-controls-disabled" : ""}`}
          >
            <div className="create-lobby-actions">
              <div className="create-lobby-privacy-toggle">
                <span>Invite only</span>
                <Switch
                  className="lobby-private-switch"
                  checked={!isPublicLobby}
                  onChange={handlePrivacyToggle}
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                  disabled={!userIsHost}
                />
              </div>
            </div>
          </Card>

          <Card className="dashboard-container">
            <div className="create-lobby-actions">
              {userIsHost ? (
                <Button
                  type="primary"
                  className="create-lobby-start-game-btn"
                  onClick={() => router.push("/game")}
                >
                  Start Game
                </Button>
              ) : (
                <Button
                  type="default"
                  className={`create-lobby-start-game-btn lobby-viewer-ready-main-btn${!viewerReadyKey ? " lobby-viewer-ready-main-btn-not-ready" : viewerIsReady ? " lobby-viewer-ready-main-btn-no-longer-ready" : " lobby-viewer-ready-main-btn-ready-up"}`}
                  disabled={!viewerReadyKey}
                  onClick={handleViewerReadyToggle}
                >
                  {!viewerReadyKey
                    ? "Not Ready"
                    : viewerIsReady
                      ? "No Longer Ready"
                      : "Ready Up"}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function WaitingLobbyPage() {
  return (
    <Suspense
      fallback={
        <div className="cabo-background">
          <div className="login-container waiting-lobby-loading">
            <Spin size="large" />
          </div>
        </div>
      }
    >
      <WaitingLobbyContent />
    </Suspense>
  );
}
