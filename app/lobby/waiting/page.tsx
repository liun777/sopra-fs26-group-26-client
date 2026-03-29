"use client";

import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { getSockJsStompUrl } from "@/utils/domain";
import { Client, IMessage } from "@stomp/stompjs";
import { Card, Spin, Table, Tag, Typography } from "antd";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import SockJS from "sockjs-client";

type WaitingRow = { username: string; joinStatus: string };

type WaitingView = {
  sessionId?: string;
  players?: WaitingRow[];
};

function WaitingLobbyContent() {
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("sessionId");
  const api = useApi();
  const { value: token } = useLocalStorage<string>("token", "");
  const [view, setView] = useState<WaitingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadView = useCallback(async () => {
    const t = token.trim();
    const sid = sessionIdParam?.trim();
    if (!t || !sid) {
      setView(null);
      setError(!sid ? "Missing session" : "Not logged in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const v = await api.getWithAuth<WaitingView>(
        `/lobbies/waiting/${encodeURIComponent(sid)}`,
        t,
      );
      setView(v);
    } catch {
      setError("Could not load waiting lobby.");
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [api, token, sessionIdParam]);

  useEffect(() => {
    void loadView();
  }, [loadView]);

  useEffect(() => {
    const t = token.trim();
    const sid = sessionIdParam?.trim();
    if (!t || !sid) return;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS(getSockJsStompUrl()) as unknown as WebSocket,
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/lobby/session/${sid}`, (_msg: IMessage) => {
          void loadView();
        });
        void loadView();
      },
    });
    client.activate();

    return () => {
      void client.deactivate();
    };
  }, [token, sessionIdParam, loadView]);

  if (!sessionIdParam?.trim()) {
    return (
      <div className="cabo-background">
        <div className="login-container">
          <Card className="dashboard-container">
            <Typography.Paragraph>Missing lobby session.</Typography.Paragraph>
            <Link href="/dashboard">Back to dashboard</Link>
          </Card>
        </div>
      </div>
    );
  }

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

  const rows = (view?.players ?? []).map((p, i) => ({
    key: `${p.username}-${i}`,
    username: p.username,
    joinStatus: p.joinStatus,
  }));

  return (
    <div className="cabo-background">
      <div className="login-container">
        <Card
          title={
            <div className="create-lobby-card-head-inner">
              Waiting lobby
              {view?.sessionId ? (
                <>
                  <br />
                  <span className="waiting-lobby-session">Code: {view.sessionId}</span>
                </>
              ) : null}
            </div>
          }
          className="dashboard-container"
        >
          <Table
            className="waiting-lobby-table"
            pagination={false}
            dataSource={rows}
            columns={[
              { title: "Username", dataIndex: "username", key: "username" },
              {
                title: "Join status",
                dataIndex: "joinStatus",
                key: "joinStatus",
                render: (v: string) =>
                  v === "you" ? (
                    <span>{v}</span>
                  ) : (
                    <Tag color="success">{v}</Tag>
                  ),
              },
            ]}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            Game starts from here once your group is ready (coming next).
          </Typography.Paragraph>
          <Link href="/dashboard">Back to dashboard</Link>
        </Card>
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
