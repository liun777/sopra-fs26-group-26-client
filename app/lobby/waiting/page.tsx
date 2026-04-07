"use client";

import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { getStompBrokerUrl, isAppspotApi, LIVE_REFRESH_MS } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import { Card, Spin, Table, Tag, Typography } from "antd";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation"; // useParams needed for reading sessionId
import { Suspense, useCallback, useEffect, useState } from "react";
import SockJS from "sockjs-client";

type WaitingRow = { username: string; joinStatus: string };

type WaitingView = {
  sessionId?: string;
  players?: WaitingRow[];
};

function WaitingLobbyContent() {
  const params = useParams<{ sessionId?: string }>();
  const searchParams = useSearchParams();
  const sessionIdFromPath = String(params?.sessionId ?? "").trim();
  const sessionIdFromQuery = String(searchParams.get("sessionId") ?? "").trim(); //fallback through quyery
  const sessionIdParam = sessionIdFromPath || sessionIdFromQuery;
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

    void loadView();

    if (isAppspotApi()) {
      const id = setInterval(() => void loadView(), LIVE_REFRESH_MS);
      return () => clearInterval(id);
    }

    // use WebSocket SockJS
    const client = new Client({
      webSocketFactory: () => new SockJS(getStompBrokerUrl()),
      reconnectDelay: 5000,
      onConnect: () => {
      client.subscribe(`/topic/lobby/session/${sid}`, () => {
        void loadView();
      });
      void loadView();
      },
    });
    
    /* -> uses raw WebSocket
    const client = new Client({
      brokerURL: getStompBrokerUrl(),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/lobby/session/${sid}`, () => {
          void loadView();
        });
        void loadView();
      },
    });
    */
  
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
