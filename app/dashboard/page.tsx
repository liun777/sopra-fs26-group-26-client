"use client"; // seite wird im browser ausgeführt, nicht auf dem server 

// S1: nach erfolgreichem login: Dashboard Screen - wird nach dem Login angezeigt
// beinhaltet overview des users und seiner daten, möglichkeit zum logout, aber auch inspektion der anderen user sowie auch password change button  (s3)

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { getStompBrokerUrl } from "@/utils/domain";
import { User } from "@/types/user";
import { Client } from "@stomp/stompjs";
import { Button, Card, Input } from "antd"; // #43 Sesssion ID lookup

// Simple 3 variant dynamic greetings on Dashboard
type GreetingSlot = "morning" | "day" | "afternoon" | "evening" | "night";

const GREETINGS_BY_TIME_SLOT: Record<GreetingSlot, string[]> = {
  morning: [
    "Online-CABO is ready to be played.",
    "Good morning! Welcome back to Online-CABO.",
    "Good morning. Ready for Online-CABO?",
  ],
  day: [
    "Good day. Welcome to Online-CABO.",
    "Good day. Enjoy Online-CABO.",
    "Good day. Great to see you in Online-CABO.",
  ],
  afternoon: [
    "Good afternoon. Welcome back to Online-CABO.",
    "Afternoon! Ready for Online-CABO?",
    "Good afternoon. Let's play Online-CABO.",
  ],
  evening: [
    "Good evening. Welcome back to Online-CABO.",
    "Evening! Time for Online-CABO.",
    "Good evening. Online-CABO is ready.",
  ],
  night: [
    "Welcome back to Online-CABO, night owl.",
    "Late session? Online-CABO is ready.",
    "Online-CABO is ready whenever you are.",
  ],
};

function getGreetingSlotByHour(localHour: number): GreetingSlot {
  if (localHour >= 5 && localHour < 11) return "morning";
  if (localHour >= 11 && localHour < 14) return "day";
  if (localHour >= 14 && localHour < 18) return "afternoon";
  if (localHour >= 18 && localHour < 23) return "evening";
  return "night";
}

function pickRandomGreeting(slot: GreetingSlot): string {
  const options = GREETINGS_BY_TIME_SLOT[slot];
  return options[Math.floor(Math.random() * options.length)] ?? "Welcome back to Online-CABO!";
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiService = useApi();

  const [user, setUser] = useState<User | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
// Add an input field on the dashboard to allow users to look up a past sessionId and view its log.
// #43
  const [historySessionId, setHistorySessionId] = useState<string>("");

  const { value: userId, clear: clearUserId } = useLocalStorage<string>("userId", "");
  const { value: token, clear: clearToken } = useLocalStorage<string>("token", "");
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  const normalizedToken = typeof token === "string" ? token.trim() : "";

  useEffect(() => {
    const kicked = searchParams.get("kicked");
    if (kicked === "1") {
      alert("You were removed from the lobby.");
      router.replace("/dashboard");
    }
  }, [router, searchParams]);

  // user vom back end holen via get request und speichern, fehlermeldung falls es nicht geht.
  useEffect(() => {
    if (!normalizedUserId || !normalizedToken) {
      clearToken();
      clearUserId();
      router.replace("/login");
      return;
    }

    let active = true;

    const fetchUser = async () => {
      try {
        const fetchedUser = await apiService.getWithAuth<User>(
          `/users/${encodeURIComponent(normalizedUserId)}`,
          normalizedToken,
        );
        if (active) {
          setUser(fetchedUser);
        }
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (active && (status === 401 || status === 403 || status === 404)) {
          clearToken();
          clearUserId();
          router.replace("/login");
          return;
        }
        if (active && error instanceof Error) {
          alert(`Something went wrong:\n${error.message}`);
        }
      }
    };

    void fetchUser();

    return () => {
      active = false;
    };
  }, [apiService, normalizedUserId, normalizedToken, router, clearToken, clearUserId]);

  useEffect(() => {
    const authToken = normalizedToken;
    if (!authToken || typeof window === "undefined") {
      setLiveConnected(false);
      return;
    }

    let stopped = false;
    let client: Client | null = null;

    const connectLiveUpdates = async () => {
      const { default: SockJS } = await import("sockjs-client");
      if (stopped) {
        return;
      }

      client = new Client({
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
    };

    void connectLiveUpdates();
    return () => {
      stopped = true;
      setLiveConnected(false);
      if (client) {
        void client.deactivate();
      }
    };
  }, [normalizedToken]);

  const greeting = useMemo(() => {
    const localHour = new Date().getHours();
    const slot = getGreetingSlotByHour(localHour);
    return pickRandomGreeting(slot);
  }, []);

  // für logout button:
  const handleLogout = (): void => {
    const authToken = normalizedToken;

    // Local-first logout to keep UX instant even if backend/network is slow.
    clearToken();
    clearUserId();

    if (authToken) {
      void apiService.postWithAuth("/auth/logout", {}, authToken).catch(() => {
        // ignore: user is already logged out locally
      });
    }

    window.location.assign("/login");
  };

  const wins = Number(user?.gamesWon ?? 0);
  const gamesPlayedRaw = (
    user as User & { gamesPlayed?: number | null; games?: number | null }
  )?.gamesPlayed ?? (
    user as User & { gamesPlayed?: number | null; games?: number | null }
  )?.games ?? 0;
  const gamesPlayed = Number.isFinite(Number(gamesPlayedRaw))
    ? Number(gamesPlayedRaw)
    : 0;
  const winRatePct = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
  const winRateText = Number(winRatePct).toFixed(1).replace(/\.0$/, "");
  const winsGamesSummary = `${wins}/${gamesPlayed} (${winRateText}%)`;
  const averageScore = user?.averageScorePerRound ?? "-";

  return (
    <div className="cabo-background">
      <div className="login-container">
        <div className="create-lobby-stack dashboard-stack">
          <Card
            className="dashboard-container"
            title={
              <div className="lobby-header-row">
                <span className="dashboard-welcome-title">
                  <span className="dashboard-welcome-greeting">{greeting}</span>
                </span>
                <span
                  className={`live-connection-symbol ${liveConnected ? "connected" : "disconnected"}`}
                  title={liveConnected ? "Connected" : "Disconnected"}
                >
                  <span className="connection-symbol-dot" aria-hidden="true">{"\u25CF"}</span>
                </span>
              </div>
            }
          >
            <div className="dashboard-welcome-player">{user?.username?.trim() || "Player"}</div>
            <div className="dashboard-metric-row">
              <span>Wins/Games</span>
              <span>{winsGamesSummary}</span>
            </div>
            <div className="dashboard-metric-row">
              <span>Average Score per Round</span>
              <span>{averageScore}</span>
            </div>
          </Card>

          {/* #43: Add an input field on the dashboard to allow users to look up a past sessionId and view its log. */}
          <Card
              className="dashboard-container"
              title={<div className="dashboard-section-title">Move History</div>}
          >
              <div className="dashboard-button-stack">
                  <Input
                      placeholder="Enter Session ID to look up moves"
                      value={historySessionId}
                      onChange={(e) => setHistorySessionId(e.target.value)}
                      style={{ marginBottom: "10px" }}
                  />
                  <Button
                      type="primary"
                      disabled={!historySessionId.trim()}
                      onClick={() => {
                          if (historySessionId.trim()) {
                              router.push(`/history/${encodeURIComponent(historySessionId.trim())}`);
                          }
                      }}
                  >
                      View Move History
                  </Button>
              </div>
          </Card>
          <Card
            className="dashboard-container"
            title={<div className="dashboard-section-title">Play</div>}
          >
            <div className="dashboard-button-stack">
              <Button type="primary" onClick={() => router.push("/lobby/join")}>
                Join a Game
              </Button>
              <Button type="default" disabled>
                Random Matchmaking
              </Button>
              <Button type="primary" onClick={() => router.push("/create_lobby")}>
                Create a New Lobby
              </Button>
            </div>
          </Card>

          <Card
            className="dashboard-container"
            title={<div className="dashboard-section-title">Users</div>}
          >
            <div className="dashboard-button-stack">
              <Button
                type="primary"
                onClick={() => router.push(`/users/${encodeURIComponent(normalizedUserId)}`)}
              >
                User Profile
              </Button>
              <Button type="primary" onClick={() => router.push("/users")}>
                Users & Leaderboard
              </Button>
            </div>
          </Card>

          <Card
            className="dashboard-container"
            title={<div className="dashboard-section-title">Settings</div>}
          >
            <div className="dashboard-button-stack">
              <Button type="primary" onClick={() => router.push("/settings")}>
                Settings
              </Button>
              <Button type="primary" className="dashboard-logout-btn" onClick={() => void handleLogout()}>
                Logout
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const Dashboard = () => {
  return (
    <Suspense fallback={<div className="cabo-background" />}>
      <DashboardContent />
    </Suspense>
  );
};

export default Dashboard;
