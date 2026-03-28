"use client"; // sagt next js dass die seite im browser udn nicht auf server ausgeführt wird, (standard ist auf server)
// wegen den react hooks geht es nur im browser 

// S3: neuer Screen der erlaubt dem eingeloggten user sein Passwort zu ändern
// nach änderung soll user ausgeloggt werden und geht zurück zum Login

import React from "react";
import { useRouter, useParams } from "next/navigation";
import { useApi } from "@/hooks/useApi"; // für putequest ans backend
import useLocalStorage from "@/hooks/useLocalStorage"; // um token und userId zu löschen bei ausloggen
import { Button, Form, Input } from "antd"; // ui komponenten

interface FormFieldProps {
    password: string; // nur neues passwort wird gebraucht
}

const EditPassword: React.FC = () => {
    const router = useRouter(); // für Navigation zu anderen Seiten
    const params = useParams(); // holt id aus der URL
    const apiService = useApi(); // zugriff auf apiservice für Requests ans Backend
    const [form] = Form.useForm();
    const { clear: clearToken } = useLocalStorage<string>("token", ""); // um token zu löschen bei ausloggen
    const { clear: clearUserId } = useLocalStorage<string>("userId", ""); // um userId zu löschen beiausloggen

    const handleSubmit = async (): Promise<void> => {
        const password = form.getFieldValue("password");
        if (!password) {
            alert("Please enter a new password!");
            return;
        }
        try {
            // schickt putrequest zum backend mit neuem Passwort
            await apiService.put(`/users/${params.id}`, { status: "OFFLINE", password: password });

            // nach änderung werden token und userid gelöscht
            clearToken();
            clearUserId();

            // weiterleiten zum Login Screen
            router.push("/login");
        } catch (error) {
            // Fehlermeldung anzeigen falls es nicht geht
            if (error instanceof Error) {
                alert(`Something went wrong:\n${error.message}`);
            }
        }
    };

    // was user sieht formular mit neuem passwort Feld
    return (
        <div className="login-container"> {/* Hintergrund mit Bild */}
            <div className="form-card">
                <h1>Password Editor</h1>
                <Form
                    form={form}
                    name="editPassword"
                    size="large"
                    variant="outlined"
                    onFinish={handleSubmit} // ruft handleSubmit auf wenn user auf save klikt
                    layout="vertical"
                >
                    <Form.Item
                        name="password"
                        label="Enter your new password"
                    >
                        <Input type="password" placeholder="Enter new password"
                               onChange={(e) => form.setFieldValue("password", e.target.value)}
                        />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" onClick={handleSubmit} className="login-button">
                            Save new password {/* submit Button */}
                        </Button>
                    </Form.Item>
                    <Form.Item>
                        {/* zurück zum Profil ohne zu speichern */}
                        <Button
                            type="link"
                            onClick={() => router.push(`/users/${params.id}`)}
                            style={{ color: "#b10660", fontSize: "12px", display: "block", margin: "0 auto" }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.color = "#ffb1d4";
                                (e.currentTarget as HTMLElement).style.fontWeight = "bold";
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.color = "#b10660";
                                (e.currentTarget as HTMLElement).style.fontWeight = "normal";
                            }}
                        >
                            Nope, changed my mind
                        </Button>
                    </Form.Item>
                </Form>
            </div>
        </div>
    );
};

export default EditPassword; // macht die komponente verfügbar für nextjs

