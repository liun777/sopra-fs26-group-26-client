"use client";

import React, { useEffect, useState } from "react";
import { Button, Input, List, Card } from "antd";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import type { ApplicationError } from "@/types/error";

type Lobby = {
    sessionId: string;
    playerIds: number[];
    isPublic: boolean;
};

const LobbyJoin = () => {
    const router = useRouter();
    const api = useApi();
    const { value: token } = useLocalStorage<string>("token", "");

    const [code, setCode] = useState("");
    const [publicLobbies, setPublicLobbies] = useState<Lobby[]>([]);
    const [loadingCode, setLoadingCode] = useState(false);
    const [loadingLobbyId, setLoadingLobbyId] = useState<string | null>(null);

    // holt alle public lobbies beim laden der seite
    useEffect(() => {
        const fetchLobbies = async () => {
            try {
                const lobbies = await api.getWithAuth<Lobby[]>("/lobbies", token);
                setPublicLobbies(lobbies);
            } catch (error) {
                console.error("Failed to fetch lobbies:", error);
            }
        };
        if (token) fetchLobbies();
    }, [api, token]);

    // join via code eingabe
    const handleJoinByCode = async () => {
        if (!code.trim()) return;
        setLoadingCode(true);
        try {
            await api.postWithAuth(
                `/lobbies/${code.trim()}/players`,
                {},
                token
            );
            // erfolgreich gejoint, dann weiterleitung zur waiting lobby (updated with encodeURIComponent)
            router.push(`/lobby/${encodeURIComponent(code.trim())}`); //updated
        } catch (error) {
            const status = (error as ApplicationError)?.status;
            // Toast Notification basierend auf Error Code
            if (status === 404) {
                alert("Lobby not found. No lobby exists with this code. Please check and try again.");
            } else if (status === 409) {
                alert("Lobby full. This lobby already has 4 players. Please try another lobby.");
            } else {
                alert("Could not join lobby. Something went wrong. Please try again.");
            }
        } finally {
            setLoadingCode(false);
        }
    };

    // join via list (similar priniciple as join by code)
    const handleJoinFromList = async (sessionId: string) => {
        setLoadingLobbyId(sessionId);
        try {
            await api.postWithAuth(
                `/lobbies/${sessionId}/players`,
                {},
                token
            );
            router.push(`/lobby/${encodeURIComponent(sessionId)}`); //updated
        } catch (error) {
            const status = (error as ApplicationError)?.status;
            if (status === 404) {
                alert("Lobby not found. This lobby no longer exists.");
            } else if (status === 409) {
                alert("Lobby full. This lobby just filled up. Please try another one.");
            } else {
                alert("Could not join lobby. Something went wrong. Please try again.");
            }
        } finally {
            setLoadingLobbyId(null);
        }
    };

    return (
        <div className="cabo-background">
            <div className="login-container">
                <div className="create-lobby-stack">

                    {/* JOIN VIA CODE */}
                    <Card
                        title={
                            <div className="create-lobby-card-head-inner">
                                Join a game with your friends via code
                            </div>
                        }
                        className="dashboard-container"
                    >
                        <div className="create-lobby-actions">
                            <Input
                                placeholder="Enter game code here"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                onPressEnter={handleJoinByCode}
                                style={{ marginBottom: 12 }}
                            />
                            <Button
                                type="primary"
                                loading={loadingCode}
                                onClick={handleJoinByCode}
                                disabled={!code.trim()}
                            >
                                Join Game as Player
                            </Button>
                            <Button
                                type="default"
                                style={{ marginTop: 8 }}
                                disabled={!code.trim()}
                                onClick={() => router.push(`/spectator?sessionId=${code.trim()}`)}
                            >
                                Join as Spectator
                            </Button>
                        </div>
                    </Card>

                    {/* BACK BUTTON */}
                    <Card className="dashboard-container">
                        <div className="create-lobby-actions">
                            <Button onClick={() => router.push("/dashboard")}>
                                ← Back to Dashboard
                            </Button>
                        </div>
                    </Card>

                </div>
            </div>
        </div>
    );
};

export default LobbyJoin;