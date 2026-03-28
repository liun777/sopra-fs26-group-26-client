"use client";
// your code here for S2 to display a single user profile after having clicked on it
// each user has their own slug /[id] (/1, /2, /3, ...) and is displayed using this file
// try to leverage the component library from antd by utilizing "Card" to display the individual user
// import { Card } from "antd"; // similar to /app/users/page.tsx 


// For components that need React hooks and browser APIs,
// SSR (server side rendering) has to be disabled.
// Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering


import { useRouter, useParams } from "next/navigation"; // für navigieren zwischen seiten (userouter) und um zb id aus url zu holen (useparams)
import { useApi } from "@/hooks/useApi"; // für die requeests ans backend
import useLocalStorage from "@/hooks/useLocalStorage"; // speichert daten im browser damit user eingeloggt belibt
import { User } from "@/types/user"; // definiert wie userobjekt aussieht also id status, username etc
import { Button, Card } from "antd"; // beinhaltet ui komponeneten
import React, { useEffect, useState } from "react"; // useeffect führt code aus, use react speichert daten wie zb user


// wenn profilseite geladen wird werden daten des users vom backend geholt und gespeichert, damit sie angezeigt werden können
const Profile = () => {
    const router = useRouter(); // zu anderen seiten navigieren
    const params = useParams(); // id aus url holen
    const apiService = useApi(); // zugriff zum api service für requests ans backend
    const [user, setUser] = useState<User | null>(null); // erstellt eine intial leere user variable, die später mit setuser befüllt wird
    const { value: userId } = useLocalStorage<string>("userId", ""); // holt userid aus browserspeicher, um später zu prüfen ob man sein eigenes profil sieht

    // läuft automatisch, wenn seite geladen wird
    useEffect(() => {
        const fetchUser = async () => { // async = wartet auf antwort vom backend
            try {
                const fetchedUser: User = await apiService.get<User>(`/users/${params.id}`); // schickt get request ans backend mit id aus url und backend sucht das dann
                // schickt get users ans backend und backend sucht diesen spezifischen user in der datenbank und zeigt ihn an
                setUser(fetchedUser); // speichert den geg user
            } catch (error) { // falls user nicht gefunden wird, soll es fehlermeldung geben
                if (error instanceof Error) {
                    alert(`User not found..:\n${error.message}`);
                }
            }
        };
        fetchUser();
    }, [apiService, params.id]); // wenn id in url ändert läuft funktion neu




// was auf der seite angezeigt wird
    return (
        <div className="cabo-background">
            <div className="login-container">
                <Card
                    title="Spy on this User"
                    loading={!user}
                    className="dashboard-container"
                >
                    {user && (
                        <>
                            <div style={{ textAlign: "center", marginBottom: 24 }}>
                                <p><strong>Username:</strong> {user.username}</p>
                                <p><strong>Status:</strong> {user.status}</p>
                                <p><strong>Bio:</strong> {user.bio}</p>
                                <p><strong>Creation Date:</strong> {user.creationDate}</p>
                                <p><strong>Games Won:</strong> {user.gamesWon ?? "No games played"}</p>
                                <p><strong>Average Score:</strong> {user.averageScorePerRound ?? "No games played"}</p>
                                <p><strong>Overall Rank:</strong> {user.overallRank ?? "No games played"}</p>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 32 }}>
                                <Button
                                    type="primary"
                                    onClick={() => router.push("/users")}
                                    style={{ backgroundColor: "#da5885", borderColor: "#da5885" }}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLElement).style.backgroundColor = "#b10660";
                                        (e.currentTarget as HTMLElement).style.borderColor = "#b10660";
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLElement).style.backgroundColor = "#da5885";
                                        (e.currentTarget as HTMLElement).style.borderColor = "#da5885";
                                    }}
                                >
                                    Back to User Overview
                                </Button>
                                {String(userId) === String(params.id) && (
                                    <Button
                                        type="default"
                                        onClick={() => router.push(`/users/${params.id}/edit`)}
                                        style={{ border: "none" }}
                                        onMouseEnter={(e) => {
                                            (e.currentTarget as HTMLElement).style.color = "#b10660";
                                        }}
                                        onMouseLeave={(e) => {
                                            (e.currentTarget as HTMLElement).style.color = "";
                                        }}
                                    >
                                        Change password
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
};


export default Profile;
