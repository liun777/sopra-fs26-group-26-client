"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { Button, Card, Spin } from "antd";
// Shows all the game moves that were made (players own and opponents)
// Logic to visually distinguish between the user's own private moves and other players' public moves in the list.
// #44
type MoveEntry = {
    moveId: string | number;
    actorUserId: number;
    actorUsername?: string;
    moveType: string;
    description?: string;
    timestamp?: string;
    isPublic: boolean;
};

function normalizeMoves(raw: unknown, selfUserId: string): MoveEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry, index) => {
        const record = entry as Record<string, unknown>;
        return {
            moveId: String(record.moveId ?? record.id ?? index),
            actorUserId: Number(record.actorUserId ?? record.userId ?? 0),
            actorUsername: String(record.actorUsername ?? record.username ?? "Unknown"),
            moveType: String(record.moveType ?? record.type ?? "move"),
            description: String(record.description ?? record.action ?? ""),
            timestamp: String(record.timestamp ?? record.createdAt ?? ""),
            isPublic: Boolean(record.isPublic ?? true),
        };
    });
}

const getMoveTypeLabel = (moveType: string): string => {
    const normalized = moveType.toUpperCase();
    if (normalized.includes("DRAW")) return "Drew a card";
    if (normalized.includes("DISCARD")) return "Discarded";
    if (normalized.includes("SWAP")) return "Swapped";
    if (normalized.includes("PEEK")) return "Peeked";
    if (normalized.includes("SPY")) return "Spied";
    if (normalized.includes("CABO")) return "Called Cabo";
    return moveType;
};

const HistoryPage: React.FC = () => {
    const router = useRouter();
    const params = useParams<{ sessionId?: string }>();
    const sessionId = String(params?.sessionId ?? "").trim();
    const apiService = useApi();
    const { value: token } = useLocalStorage<string>("token", "");
    const { value: userId } = useLocalStorage<string>("userId", "");

    const [moves, setMoves] = useState<MoveEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId || !token) return;

        const fetchMoves = async () => {
            setLoading(true);
            try {
                // TODO: #111: Backend endpoint GET /sessions/{sessionId}/log
                // returns: requester's own moves + public moves from other players
                const raw = await apiService.getWithAuth<unknown>(
                    `/sessions/${encodeURIComponent(sessionId)}/log`,
                    token
                );
                setMoves(normalizeMoves(raw, userId));
            } catch {
                setError("Could not load move history. The backend endpoint may not be implemented yet.");
            } finally {
                setLoading(false);
            }
        };

        void fetchMoves();
    }, [apiService, sessionId, token, userId]);

    const selfUserIdNum = Number(userId);

    return (
        <div className="cabo-background">
            <div className="login-container">
                <div className="create-lobby-stack dashboard-stack">
                    <Card
                        className="dashboard-container"
                        title={
                            <div className="lobby-section-title-row">
                                <span className="dashboard-section-title">
                                    Move History
                                </span>
                                <span style={{ color: "#ccc", fontSize: "13px" }}>
                                    Session: {sessionId}
                                </span>
                            </div>
                        }
                    >
                        {loading && (
                            <div style={{ textAlign: "center", padding: "20px" }}>
                                <Spin />
                            </div>
                        )}

                        {error && (
                            <p style={{ color: "#ffb1d4" }}>{error}</p>
                        )}

                        {!loading && !error && moves.length === 0 && (
                            <p style={{ color: "#ccc", fontStyle: "italic" }}>
                                No moves found for this session.
                            </p>
                        )}

                        {!loading && moves.length > 0 && (
                            <div style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                maxHeight: "500px",
                                overflowY: "auto",
                            }}>
                                {moves.map((move) => {
                                    const isSelf = move.actorUserId === selfUserIdNum;
                                    // #44: visual distinction - own moves vs opponent moves
                                    const isPrivateMove = !move.isPublic && isSelf;
                                    const isHiddenOpponentMove = !move.isPublic && !isSelf;

                                    return (
                                        <div
                                            key={String(move.moveId)}
                                            style={{
                                                padding: "10px 14px",
                                                borderRadius: "10px",
                                                // #44: own moves = orange tint, opponent public = neutral, opponent private = grey
                                                backgroundColor: isSelf
                                                    ? "rgba(232, 168, 124, 0.15)"
                                                    : isHiddenOpponentMove
                                                        ? "rgba(255,255,255,0.03)"
                                                        : "rgba(255,255,255,0.07)",
                                                border: isSelf
                                                    ? "1px solid rgba(232, 168, 124, 0.35)"
                                                    : isHiddenOpponentMove
                                                        ? "1px solid rgba(255,255,255,0.08)"
                                                        : "1px solid rgba(255,255,255,0.12)",
                                                opacity: isHiddenOpponentMove ? 0.6 : 1,
                                            }}
                                        >
                                            <div style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                            }}>
                                                <span style={{
                                                    color: isSelf ? "#e8a87c" : "#f2f2f2",
                                                    fontWeight: isSelf ? "bold" : "normal",
                                                    fontSize: "14px",
                                                }}>
                                                    {isSelf ? "You" : move.actorUsername}
                                                    {/* #44: private badge */}
                                                    {isPrivateMove && (
                                                        <span style={{
                                                            marginLeft: "8px",
                                                            fontSize: "10px",
                                                            backgroundColor: "rgba(168,184,122,0.3)",
                                                            color: "#a8b87a",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                        }}>
                                                            private
                                                        </span>
                                                    )}
                                                </span>
                                                {move.timestamp && (
                                                    <span style={{ color: "#c4827a", fontSize: "11px" }}>
                                                        {move.timestamp}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{
                                                marginTop: "4px",
                                                color: isHiddenOpponentMove ? "#c4827a" : "#f2f2f2",
                                                fontSize: "13px",
                                            }}>
                                                {isHiddenOpponentMove
                                                    ? "🔒 Private move"
                                                    : getMoveTypeLabel(move.moveType)}
                                                {move.description && !isHiddenOpponentMove && (
                                                    <span style={{ color: "#aaa", marginLeft: "6px" }}>
                                                        – {move.description}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Card className="dashboard-container">
                        <div className="dashboard-button-stack">
                            <Button type="default" onClick={() => router.push("/dashboard")}>
                                ← Back to Dashboard
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default HistoryPage;