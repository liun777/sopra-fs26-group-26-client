// A UI component (accessible via a "Score" button) that shows the cumulative totals of the current session.
//#42
//Implement a button (e.g., a "Podium" icon) that allows players to view the current total scores at any time during gameplay.
//#36

import React from "react";
import { Button } from "antd";

type PlayerScore = {
    userId: number;
    username: string;
    totalScore: number;
    roundScore?: number;
};

interface ScoresProps {
    isOpen: boolean;
    onClose: () => void;
    scores: PlayerScore[];
    selfUserId: number | null;
    // TODO: Backend needs GET /games/{gameId}/scores endpoint
}

const Scores: React.FC<ScoresProps> = ({
    isOpen,
    onClose,
    scores,
    selfUserId,
}) => {
    if (!isOpen) return null;

    const sorted = [...scores].sort((a, b) => a.totalScore - b.totalScore);

    return (
        <div style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
        }}>
            <div style={{
                backgroundColor: "rgba(30,30,40,0.97)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "16px",
                padding: "28px 32px",
                minWidth: "320px",
                maxWidth: "480px",
                width: "90vw",
                boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            }}>
                <h2 style={{
                    color: "#e8a87c",
                    fontWeight: "bold",
                    fontSize: "22px",
                    marginBottom: "20px",
                    textAlign: "center",
                }}>
                    🏆 Current Scores
                </h2>

                {scores.length === 0 ? (
                    <p style={{ color: "#ccc", textAlign: "center" }}>
                        {/* TODO: Backend needs GET /games/{gameId}/scores */}
                        No scores available yet.
                    </p>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {sorted.map((player, index) => {
                            const isSelf = selfUserId != null && player.userId === selfUserId;
                            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                            return (
                                <div key={player.userId} style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 16px",
                                    borderRadius: "10px",
                                    backgroundColor: isSelf
                                        ? "rgba(232, 168, 124, 0.18)"
                                        : "rgba(255,255,255,0.05)",
                                    border: isSelf
                                        ? "1px solid rgba(232, 168, 124, 0.4)"
                                        : "1px solid transparent",
                                }}>
                                    <span style={{ color: "#fff", fontSize: "16px" }}>
                                        {medal} {player.username}{isSelf ? " (You)" : ""}
                                    </span>
                                    <span style={{
                                        color: "#e8a87c",
                                        fontWeight: "bold",
                                        fontSize: "18px",
                                    }}>
                                        {player.totalScore} pts
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div style={{ marginTop: "20px", textAlign: "center" }}>
                    <Button type="primary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};

export default Scores;