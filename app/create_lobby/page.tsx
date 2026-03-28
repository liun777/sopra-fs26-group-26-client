"use client";

import React, { useState } from "react";
import { Button, Card, Input, List, Spin } from "antd";
import { useRouter } from "next/navigation";

type Player = {
  id: number;
  name: string;
  invited: boolean;
  loading: boolean;
  isSelf?: boolean;
};

const CreateLobby = () => {
  const router = useRouter();

  // TODO Backend: dummy players (replace later with backend users)
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, name: "You", invited: true, loading: false, isSelf: true },
    { id: 2, name: "player_2", invited: false, loading: false },
    { id: 3, name: "player_58", invited: false, loading: false },
    { id: 4, name: "player_3", invited: false, loading: false }
  ]);

  const [code, setCode] = useState<string>("");

  const handleInvite = (id: number) => {
    setPlayers(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, invited: true, loading: true }
          : p
      )
    );

    // simulate waiting for accept
    setTimeout(() => {
      setPlayers(prev =>
        prev.map(p =>
          p.id === id
            ? { ...p, loading: false }
            : p
        )
      );
    }, 2000);
  };

  const generateCode = () => {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCode(randomCode);

    // TODO backend: call POST /lobbies and store returned sessionId instead of random code
  };

  const startGame = () => {
    // TODO backend: check if 4 players accepted + set lobby status to IN_GAME
    router.push("/game");
  };

  return (
    <div className="cabo-background">
      <div className="login-container">
        <Card
          title={
              <div style={{ textAlign: "center", whiteSpace: "normal", lineHeight: "1.4" }}>
                You can invite up to three other registered users<br />
                to play Cabo!
              </div>
            }
            className="dashboard-container"
        >
          {/* Player List */}
          <List
            dataSource={players}
            renderItem={(player) => (
              <List.Item
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 150px 50px",
                  alignItems: "center"
                }}
              >
                {/* Col 1: Name od the player */}
                <div>{player.name}</div>

                {/* Col2: invite button */}
                <div>
                  {!player.isSelf && (
                    <Button
                      type={player.invited ? "default" : "primary"}
                      disabled={player.invited}
                      onClick={() => handleInvite(player.id)}
                    >
                      {player.invited ? "Invited" : "Invite"}
                    </Button>
                  )}
                </div>

                {/* Col 3: Loadingsymbol TODO backend: make sure its loading as long as the player hasnt clicked accept or deny and in case he denies that this says denied.*/}
                <div>
                  {player.loading && (
                    <Spin
                      size="small"
                      style={{ color: "white" }}
                    />
                  )}
                </div>
              </List.Item>
            )}
          />

          {/* Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
            <Button
              type="primary"
              onClick={generateCode}
              style={{ backgroundColor: "#da5885", borderColor: "#da5885" }}
            >
              Generate Code
            </Button>

            {/* Code display */}
            {code && (
              <Input
                value={code}
                readOnly
                style={{ textAlign: "center", fontWeight: "bold" }}
              />
            )}

            <Button
              type="primary"
              onClick={startGame}
              style={{ backgroundColor: "#da5885", borderColor: "#da5885" }}
            >
              Start Game
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default CreateLobby;