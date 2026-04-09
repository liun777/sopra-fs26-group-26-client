"use client"; //reworked page, too many changes to annotate

import React, { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Table } from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import type { ApplicationError } from "@/types/error";
import { getStompBrokerUrl } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

type LobbyGetDTO = {
    sessionId?: string | null;
    playerIds?: Array<number | string> | null;
    currentPlayers?: number | null;
    isPublic?: boolean | null;
    sessionHostUserId?: number | string | null;
    hostUserId?: number | string | null;
    sessionHostUsername?: string | null;
    hostUsername?: string | null;
};

type OpenLobbyRow = {
    key: string;
    hostLabel: string;
    sessionId: string;
    currentPlayers: number;
    canJoin: boolean;
    isPlaceholder?: boolean;
};

const OPEN_LOBBIES_POLL_MS = 4000; // refresh rate for lobby list, don't do too low or performance eater
const OPEN_LOBBIES_PAGE_SIZE = 10; // I wouldn't do more, or user has to scroll

const PLACEHOLDER_OPEN_LOBBIES: OpenLobbyRow[] = Array.from(
    { length: 12 },
    (_, idx) => {
        const players = (idx % 4) + 1;
        const sessionId = `DEMO-${String(idx + 1).padStart(3, "0")}`;
        return {
            key: sessionId,
            hostLabel: `Host ${idx + 1}`,
            sessionId,
            currentPlayers: players,
            canJoin: players < 4,
            isPlaceholder: true,
        };
    },
);

function toOpenLobbyRows(raw: unknown): OpenLobbyRow[] {
    const rows = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { publicLobbies?: unknown[] })?.publicLobbies)
            ? ((raw as { publicLobbies?: unknown[] }).publicLobbies ?? [])
            : [];

    return rows
        .map((item) => {
            const lobby = item as LobbyGetDTO;
            const sessionId = String(lobby?.sessionId ?? "").trim();
            const currentPlayersFromIds = Array.isArray(lobby?.playerIds)
                ? lobby.playerIds.length
                : undefined;
            const currentPlayers = Number(
                lobby?.currentPlayers ?? currentPlayersFromIds ?? 0,
            );
            const hostUserId = String(lobby?.sessionHostUserId ?? lobby?.hostUserId ?? "").trim();
            const hostUsername =
                String(lobby?.sessionHostUsername ?? lobby?.hostUsername ?? "").trim();
            return {
                sessionId,
                hostLabel: hostUsername || (hostUserId ? `User ${hostUserId}` : "Host"),
                currentPlayers: Number.isFinite(currentPlayers) ? currentPlayers : 0,
                isPublic: lobby?.isPublic !== false,
            };
        })
        .filter((lobby) => lobby.sessionId.length > 0)
        .filter((lobby) => lobby.isPublic)
        .map(({ hostLabel, sessionId, currentPlayers }) => ({
            key: sessionId,
            hostLabel,
            sessionId,
            currentPlayers,
            canJoin: currentPlayers < 4,
        }))
        .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
}

const openLobbyColumns: TableProps<OpenLobbyRow>["columns"] = [
    {
        title: "Host",
        dataIndex: "hostLabel",
        key: "hostLabel",
        width: 170,
        render: (value: string) => <span>{value}</span>,
    },
    {
        title: "Lobby Code",
        dataIndex: "sessionId",
        key: "sessionId",
        width: 180,
        render: (value: string) => <span>{value}</span>,
    },
    {
        title: "Players",
        dataIndex: "currentPlayers",
        key: "currentPlayers",
        width: 90,
        align: "right",
        render: (value: number) => `${value}/4`,
    },
    {
        title: "Status",
        key: "status",
        width: 110,
        align: "right",
        render: (_, row) => (
            <span
                className={`users-status-pill ${row.canJoin ? "users-status-online" : "users-status-offline"}`}
            >
                {row.canJoin ? "Open" : "Full"}
            </span>
        ),
    },
];

const LobbyJoin = () => {
    const router = useRouter();
    const api = useApi();
    const { value: token } = useLocalStorage<string>("token", "");

    const [code, setCode] = useState("");
    const [loadingCode, setLoadingCode] = useState(false);
    const [openLobbies, setOpenLobbies] = useState<OpenLobbyRow[]>([]);
    const [loadingOpenLobbies, setLoadingOpenLobbies] = useState(false);
    const [joiningSessionId, setJoiningSessionId] = useState<string>("");
    const [selectedOpenLobbySessionId, setSelectedOpenLobbySessionId] = useState<string>("");
    const [liveConnected, setLiveConnected] = useState(false);

    const authToken = token.trim();

    const loadOpenLobbies = useCallback(async () => {
        if (!authToken) {
            setOpenLobbies(PLACEHOLDER_OPEN_LOBBIES);
            return;
        }
        setLoadingOpenLobbies(true);
        try {
            const response = await api.getWithAuth<unknown>("/lobbies", authToken);
            const rows = toOpenLobbyRows(response);
            setOpenLobbies(rows.length > 0 ? rows : PLACEHOLDER_OPEN_LOBBIES);
        } catch {
            setOpenLobbies(PLACEHOLDER_OPEN_LOBBIES);
        } finally {
            setLoadingOpenLobbies(false);
        }
    }, [api, authToken]);

    useEffect(() => {
        void loadOpenLobbies();
        const pollId = setInterval(() => {
            void loadOpenLobbies();
        }, OPEN_LOBBIES_POLL_MS);
        return () => clearInterval(pollId);
    }, [loadOpenLobbies]);

    useEffect(() => {
        if (!authToken) {
            setLiveConnected(false);
            return;
        }

        const client = new Client({
            webSocketFactory: () => new SockJS(getStompBrokerUrl()),
            connectHeaders: { Authorization: authToken },
            reconnectDelay: 5000,
            onConnect: () => {
                setLiveConnected(true);
            },
            onStompError: () => {
                setLiveConnected(false);
            },
            onWebSocketClose: () => {
                setLiveConnected(false);
            },
            onWebSocketError: () => {
                setLiveConnected(false);
            },
        });

        client.activate();
        return () => {
            setLiveConnected(false);
            void client.deactivate();
        };
    }, [authToken]);

    const handleBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
        }
        router.push("/dashboard");
    };

    const handleJoinLobby = async (
        sessionId: string,
        loadingSetter?: (loading: boolean) => void,
    ) => {
        if (!sessionId.trim() || !authToken) return;
        loadingSetter?.(true);
        setJoiningSessionId(sessionId);
        try {
            await api.postWithAuth(
                `/lobbies/${encodeURIComponent(sessionId.trim())}/players`,
                {},
                authToken,
            );
            router.push(`/lobby/${encodeURIComponent(sessionId.trim())}`);
        } catch (error) {
            const status = (error as ApplicationError)?.status;
            if (status === 404) {
                alert("Lobby not found. No lobby exists with this code. Please check and try again.");
            } else if (status === 409) {
                alert("Lobby full. This lobby already has 4 players. Please try another lobby.");
            } else {
                alert("Could not join lobby. Something went wrong. Please try again.");
            }
        } finally {
            loadingSetter?.(false);
            setJoiningSessionId("");
            void loadOpenLobbies();
        }
    };

    const selectedOpenLobby =
        openLobbies.find((lobby) => lobby.sessionId === selectedOpenLobbySessionId) ?? null;
    const canJoinSelectedLobby =
        Boolean(selectedOpenLobby) &&
        Boolean(selectedOpenLobby?.canJoin) &&
        !Boolean(selectedOpenLobby?.isPlaceholder) &&
        !Boolean(joiningSessionId);

    const handleJoinSelectedLobby = async () => {
        if (!selectedOpenLobby || !canJoinSelectedLobby) {
            return;
        }
        await handleJoinLobby(selectedOpenLobby.sessionId);
    };

    const handleSpectateSelectedLobby = () => {
        if (!selectedOpenLobby) {
            return;
        }
        router.push(`/spectator?sessionId=${encodeURIComponent(selectedOpenLobby.sessionId)}`);
    };

    // join via code eingabe
    const handleJoinByCode = async () => {
        if (!code.trim()) return;
        await handleJoinLobby(code.trim(), setLoadingCode);
    };

    useEffect(() => {
        if (!selectedOpenLobbySessionId) {
            return;
        }
        const stillExists = openLobbies.some(
            (lobby) => lobby.sessionId === selectedOpenLobbySessionId,
        );
        if (!stillExists) {
            setSelectedOpenLobbySessionId("");
        }
    }, [openLobbies, selectedOpenLobbySessionId]);

    useEffect(() => {
        if (!selectedOpenLobbySessionId && openLobbies.length > 0) {
            setSelectedOpenLobbySessionId(openLobbies[0].sessionId);
        }
    }, [openLobbies, selectedOpenLobbySessionId]);

    return (
        <div className="cabo-background">
            <div className="login-container">
                <div className="create-lobby-stack">

                    {/* JOIN VIA CODE */}
                    <Card
                        title={
                            <div className="join-card-title-left">
                                Join a Private Game via a Lobby Code
                            </div>
                        }
                        className="dashboard-container"
                    >
                        <div className="create-lobby-actions">
                            <Input
                                placeholder="Enter game code here"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                onPressEnter={() => void handleJoinByCode()}
                                style={{ marginBottom: 12 }}
                            />
                            <div className="join-by-code-actions-row">
                                <Button
                                    type="primary"
                                    loading={loadingCode}
                                    onClick={() => void handleJoinByCode()}
                                    disabled={!code.trim()}
                                >
                                    Join as a Player
                                </Button>
                                <Button
                                    type="default"
                                    disabled={!code.trim()}
                                    onClick={() => router.push(`/spectator?sessionId=${code.trim()}`)}
                                >
                                    Join as a Spectator
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* JOIN OPEN LOBBIES */}
                    <Card
                        title={
                            <div className="lobby-section-title-row">
                                <span className="join-card-title-left">Join an Open Game Lobby</span>
                                <span
                                    className={`live-connection-symbol ${liveConnected ? "connected" : "disconnected"}`}
                                    title={liveConnected ? "Connected" : "Disconnected"}
                                >
                                    {"\u1BE4"}
                                </span>
                            </div>
                        }
                        className="dashboard-container"
                    >
                        <Table<OpenLobbyRow>
                            className="users-overview-table"
                            loading={loadingOpenLobbies}
                            columns={openLobbyColumns}
                            dataSource={openLobbies}
                            rowKey="sessionId"
                            size="small"
                            tableLayout="fixed"
                            pagination={{
                                pageSize: OPEN_LOBBIES_PAGE_SIZE,
                                showSizeChanger: false,
                                hideOnSinglePage: false,
                                position: ["bottomCenter"],
                            }}
                            rowSelection={{
                                type: "radio",
                                selectedRowKeys: selectedOpenLobbySessionId
                                    ? [selectedOpenLobbySessionId]
                                    : [],
                                onChange: (selectedKeys) => {
                                    const key = String(selectedKeys[0] ?? "");
                                    setSelectedOpenLobbySessionId(key);
                                },
                            }}
                            locale={{
                                emptyText: "No open lobbies available right now.",
                            }}
                        />
                        <div className="join-by-code-actions-row">
                            <Button
                                type="primary"
                                disabled={!canJoinSelectedLobby}
                                loading={selectedOpenLobby ? joiningSessionId === selectedOpenLobby.sessionId : false}
                                onClick={() => void handleJoinSelectedLobby()}
                            >
                                Join as Player
                            </Button>
                            <Button
                                type="default"
                                disabled={!selectedOpenLobby || Boolean(joiningSessionId)}
                                onClick={handleSpectateSelectedLobby}
                            >
                                Join as Spectator
                            </Button>
                        </div>
                    </Card>
                    
                    <Card className="dashboard-container">
                        <div className="create-lobby-actions">
                            <Button type="default" onClick={handleBack}>
                                {"\u2190"} Back
                            </Button>
                        </div>
                    </Card>
                    
                </div>
            </div>
        </div>
    );
};

export default LobbyJoin;
