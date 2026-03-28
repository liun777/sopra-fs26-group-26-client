"use client"; // seite wird im browser ausgeführt, nicht auf dem server 

// S1: nach erfolgreichem login: Dashboard Screen - wird nach dem Login angezeigt
// beinhaltet overview des users und seiner daten, möglichkeit zum logout, aber auch inspektion der anderen user sowie auch password change button  (s3)
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { Button, Card } from "antd";

const Dashboard= () => {
    const router = useRouter(); // navigieren zu anderen seiten
    const apiService = useApi(); // zugriff auf apiservice für backend requests
    const [user, setUser] = useState<User | null>(null); // speichert eingeloggten useranfangs leer
    const { value: userId, clear: clearUserId} = useLocalStorage<string>("userId", ""); //hollt userId aus browser und kann sie löschen
    const { clear: clearToken } = useLocalStorage<string>("token", "");  //kann token aus browser löschen

    // user vom back end holen via get request und speichern, fehlermeldung falls es nicht geht.
    useEffect(() => {
        const fetchUser = async () => { /// warten auf antwort vom backend (async)
            try {
                const fetchedUser: User = await apiService.get<User>(`/users/${userId}`);
                setUser(fetchedUser); // speichert den user damit er angezeigt werden kann
            } catch (error) {
                if (error instanceof Error) {
                    alert(`Something went wrong:\n${error.message}`);
                }
            }
        };
        if (userId) fetchUser();
    }, [apiService, userId]);

    // für logout button:
    const handleLogout = async (): Promise<void> => {
        try {
            await apiService.put(`/users/${userId}`, { status: "OFFLINE" }); // falls man auf logout click wird der status im backend auf ofline gesetzt
        } catch (error) {
            console.error("Logout error:", error);
        }
        // token und userid wieder aus dem browser löschen
        clearToken();
        clearUserId();
        router.push("/login"); // weiterleitung zum login am schluss
    };

return (
    <div className="cabo-background">
        <div className="login-container">
            <Card loading={!user} className="dashboard-container">
                {user && (
                    <>
                        <h1>Welcome to Online-CABO!</h1>
                        <div style={{ textAlign: "center", marginBottom: 24 }}>
                            <p><strong>Username:</strong> {user.username}</p>
                            <p><strong>Status:</strong> {user.status}</p>
                            <p><strong>Bio:</strong> {user.bio}</p>
                            <p><strong>Creation Date:</strong> {user.creationDate}</p>
                            <p><strong>Games Won:</strong> {user.gamesWon ?? "No games played"}</p>
                            <p><strong>Average Score:</strong> {user.averageScorePerRound ?? "No games played"}</p>
                            <p><strong>Overall Rank:</strong> {user.overallRank ?? "No games played"}</p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                            <Button type="primary" onClick={() => router.push("/users")}>
                                Spy on the other users
                            </Button>

                            <Button type="primary" onClick={() => router.push("/create_lobby")}>
                                Start a new Game!
                            </Button>



                            <Button type="default" onClick={() => router.push(`/users/${userId}/edit`)}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.color = "#b10660";
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.color = "";
                                        (e.currentTarget as HTMLElement).style.borderColor = "";
                                    }}
                            >
                                Change Password
                            </Button>
                            <Button
                                type="link"
                                onClick={handleLogout}
                                style={{ color: "#b51366", fontSize: "12px" }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.color = "#ffb1d4";
                                    (e.currentTarget as HTMLElement).style.fontWeight = "bold";
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.color = "#b51366";
                                    (e.currentTarget as HTMLElement).style.fontWeight = "normal";
                                }}
                            >
                                Logout
                            </Button>
                        </div>
                    </>
                )}
            </Card>
        </div>
    </div>
);
};
export default Dashboard;

