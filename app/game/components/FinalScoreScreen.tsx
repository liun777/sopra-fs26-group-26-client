//A final screen that appears when the game limit is reached, displaying the ultimate winner and final rankings.
//#34

import React from "react";
import { Button } from "antd";

type FinalPlayer = {
    userId: number;
    username: string;
    totalScore: number;
    isSpecialWin?: boolean; // two 12s + two 13s
};

interface FinalScoreScreenProps {
    isOpen: boolean;
    players: FinalPlayer[];
    selfUserId: number | null;
    onContinue: () => void;
    // TODO: Backend needs to send final scores in game state
}

const FinalScoreScreen: React.FC<FinalScoreScreenProps> = ({
    isOpen,
    players,
    selfUserId,
    onContinue,
}) => {
    if (!isOpen) return null;

    const sorted = [...players].sort((a, b) => a.totalScore - b.totalScore);
    const winner = sorted[0];
    const isSelfWinner = selfUserId != null && winner?.userId === selfUserId;
    const hasSpecialWin = players.some(p => p.isSpecialWin);

    return (
        <div style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
        }}>
            <div style={{
                backgroundColor: "rgba(20,20,30,0.98)",
                border: "2px solid rgba(232, 168, 124, 0.4)",
                borderRadius: "20px",
                padding: "36px 40px",
                minWidth: "340px",
                maxWidth: "520px",
                width: "90vw",
                boxShadow: "0 12px 60px rgba(0,0,0,0.7)",
                textAlign: "center",
            }}>
                {/* Title */}
                <h1 style={{
                    color: "#e8a87c",
                    fontSize: "28px",
                    fontWeight: "bold",
                    marginBottom: "8px",
                }}>
                    🎮 Game Over!
                </h1>

                {/* Special Win Banner */}
                {hasSpecialWin && (
                    <div style={{
                        backgroundColor: "rgba(168, 184, 122, 0.2)",
                        border: "1px solid #a8b87a",
                        borderRadius: "10px",
                        padding: "8px 16px",
                        marginBottom: "16px",
                        color: "#a8b87a",
                        fontWeight: "bold",
                        fontSize: "14px",
                    }}>
                        ✨ Special Win! Two 12s + Two 13s = 0 points!
                    </div>
                )}

                {/* Winner */}
                {winner && (
                    <div style={{ marginBottom: "24px" }}>
                        <p style={{ color: "#ccc", fontSize: "14px", marginBottom: "4px" }}>
                            Winner
                        </p>
                        <p style={{
                            color: isSelfWinner ? "#e8a87c" : "#fff",
                            fontSize: "24px",
                            fontWeight: "bold",
                        }}>
                            🏆 {winner.username}{isSelfWinner ? " (You!)" : ""}
                        </p>
                        <p style={{ color: "#a8b87a", fontSize: "16px" }}>
                            {winner.totalScore} points
                        </p>
                    </div>
                )}

                {/* Final Rankings */}
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginBottom: "24px",
                }}>
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
                                    ? "rgba(232, 168, 124, 0.15)"
                                    : "rgba(255,255,255,0.05)",
                                border: isSelf
                                    ? "1px solid rgba(232, 168, 124, 0.35)"
                                    : "1px solid transparent",
                            }}>
                                <span style={{ color: "#fff" }}>
                                    {medal} {player.username}{isSelf ? " (You)" : ""}
                                    {player.isSpecialWin ? " ✨" : ""}
                                </span>
                                <span style={{
                                    color: index === 0 ? "#e8a87c" : "#ccc",
                                    fontWeight: "bold",
                                    fontSize: "16px",
                                }}>
                                    {player.totalScore} pts
                                </span>
                            </div>
                        );
                    })}
                </div>

                <Button type="primary" onClick={onContinue} style={{ width: "100%" }}>
                    Continue
                </Button>
            </div>
        </div>
    );
};

export default FinalScoreScreen;