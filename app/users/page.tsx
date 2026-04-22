// this code is part of S2 to display a list of all registered users
// clicking on a user in this list will display /app/users/[id]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { PresenceKey, toPresenceKey, toPresenceLabel } from "@/utils/presence";
import { getStompBrokerUrl } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { Button, Card, Input, Table } from "antd";
import type { TableProps } from "antd";

type UserRow = User & {
  key: string;
  games: number;
  winRatePct: number | null;
  averageScore: number | null;
  presenceLabel: string;
  presenceKey: PresenceKey;
};

const columns: TableProps<UserRow>["columns"] = [
  {
    title: "Username",
    dataIndex: "username",
    key: "username",
    align: "left",
    className: "users-username-col",
    width: "42%",
    sorter: (a, b) =>
      String(a.username ?? a.name ?? "").localeCompare(
        String(b.username ?? b.name ?? ""),
      ),
    sortDirections: ["ascend", "descend"],
    render: (value, row) => {
      const username = String(value ?? row.name ?? "-").trim() || "-";
      return (
        <span className="users-username-cell" title={username}>
          {username}
        </span>
      );
    },
  },
  {
    title: "Win Rate",
    dataIndex: "winRatePct",
    key: "winRatePct",
    align: "center",
    sorter: (a, b) => (a.winRatePct ?? -1) - (b.winRatePct ?? -1),
    sortDirections: ["ascend", "descend", "ascend"],
    render: (value) =>
      value == null ? "-" : `${Number(value).toFixed(1).replace(/\.0$/, "")}%`,
  },
  {
    title: "Games",
    dataIndex: "games",
    key: "games",
    align: "center",
    sorter: (a, b) => a.games - b.games,
    sortDirections: ["ascend", "descend"],
  },
  {
    title: "\u2300 Score",
    dataIndex: "averageScore",
    key: "averageScore",
    align: "center",
    sorter: (a, b) => (a.averageScore ?? -1) - (b.averageScore ?? -1),
    sortDirections: ["ascend", "descend"],
    render: (value) =>
      value == null || Number.isNaN(Number(value))
        ? "-"
        : Number(value).toFixed(2).replace(/\.00$/, ""),
  },
  {
    title: "Status",
    dataIndex: "presenceLabel",
    key: "status",
    align: "right",
    className: "users-status-col",
    sorter: (a, b) => a.presenceLabel.localeCompare(b.presenceLabel),
    sortDirections: ["ascend", "descend"],
    render: (_, row) => (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <span className={`users-status-pill users-status-${row.presenceKey}`}>
          {row.presenceLabel}
        </span>
      </div>
    ),
  },
];

const UsersPage: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const { value: token } = useLocalStorage<string>("token", "");
  const { value: userId } = useLocalStorage<string>("userId", "");
  const [users, setUsers] = useState<User[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 1000);
  const [liveConnected, setLiveConnected] = useState(false);

  const fetchUsers = useCallback(async () => {
    setRefreshing(true);
    try {
      const fetchedUsers: User[] = await apiService.get<User[]>("/users");
      setUsers(fetchedUsers);
    } catch (error) {
      setUsers([]);
      if (error instanceof Error) {
        alert(`Something went wrong while fetching users:\n${error.message}`);
      } else {
        console.error("An unknown error occurred while fetching users.");
      }
    } finally {
      setRefreshing(false);
    }
  }, [apiService]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const authToken = token.trim();
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
  }, [token]);

  const rows: UserRow[] = useMemo(
    () =>
      (users ?? [])
        .filter((user) => String(user.id ?? "").trim() !== userId.trim())
        .map((user) => {
          const wins = Number(user.gamesWon ?? 0);
          const gamesPlayedRaw = (
            user as User & { gamesPlayed?: number | null; games?: number | null }
          ).gamesPlayed ?? (
            user as User & { gamesPlayed?: number | null; games?: number | null }
          ).games ?? 0;
          const gamesPlayed = Number.isFinite(Number(gamesPlayedRaw))
            ? Number(gamesPlayedRaw)
            : 0;
          const winRatePct =
            gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : null;
          const presenceKey = toPresenceKey(user.status);
          const averageScoreRaw = user.averageScorePerRound;
          const averageScore =
            averageScoreRaw == null || !Number.isFinite(Number(averageScoreRaw))
              ? null
              : Number(averageScoreRaw);
          return {
            ...user,
            key: String(user.id ?? ""),
            games: gamesPlayed,
            winRatePct,
            averageScore,
            presenceLabel: toPresenceLabel(presenceKey),
            presenceKey,
          };
        }),
    [users, userId],
  );

  const normalizedSearch = debouncedSearchTerm.trim().toLowerCase();
  const filteredUsers =
    rows?.filter((user) => {
      if (!normalizedSearch) {
        return true;
      }
      const username = String(user.username ?? "").toLowerCase();
      const name = String(user.name ?? "").toLowerCase();
      const status = String(user.presenceLabel ?? "").toLowerCase();
      return (
        username.includes(normalizedSearch) ||
        name.includes(normalizedSearch) ||
        status.includes(normalizedSearch)
      );
    }) ?? [];

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="cabo-background">
      <div className="login-container">
        <div className="create-lobby-stack dashboard-stack">
          <Card
            title={
              <div className="lobby-section-title-row">
                <span className="dashboard-section-title">All Users</span>
                <span
                  className={`live-connection-symbol ${liveConnected ? "connected" : "disconnected"}`}
                  title={liveConnected ? "Connected" : "Disconnected"}
                >
                  <span className="connection-symbol-dot" aria-hidden="true">{"\u25CF"}</span>
                </span>
              </div>
            }
            loading={!users}
            className="dashboard-container"
          >
            {users ? (
              <>
                <div className="users-overview-toolbar">
                  <Input
                    value={searchTerm}
                    allowClear
                    className="users-overview-search"
                    placeholder="Search by Username or Status"
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                  <Button
                    type="default"
                    className="users-refresh-btn"
                    loading={refreshing}
                    onClick={() => void fetchUsers()}
                  >
                    Refresh
                  </Button>
                </div>
                <Table<UserRow>
                  className="users-overview-table responsive-list-table"
                  columns={columns}
                  dataSource={filteredUsers}
                  rowKey="key"
                  size="small"
                  pagination={false}
                  rowClassName={() => "users-overview-row"}
                  onRow={(row: UserRow) => ({
                    onClick: () => router.push(`/users/${row.id}`),
                  })}
                />
              </>
            ) : null}
          </Card>

          <Card className="dashboard-container">
            <div className="dashboard-button-stack">
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

export default UsersPage;
