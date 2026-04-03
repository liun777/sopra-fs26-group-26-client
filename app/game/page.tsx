"use client";

import React, { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Button } from "antd";

interface Card {
    value: number;
    visibility: boolean;
    ability: string;
}


const Game = () => {
  const apiService = useApi();
  const isSpectator = true; // TODO: replace with real logic
  const gameId = "TODO_REPLACE_WITH_REAL_GAME_ID";



  // Backlog #9: Implement logic to always render the DiscardPile top card with its face-up value
      const [discardTopCard, setDiscardTopCard] = useState<Card | null>(null);

      //get the top card from the backend
      useEffect(() => {
          const fetchDiscardTopCard = async () => {
              try {
                  const card = await apiService.get<Card>(
                      `/games/${gameId}/discard-pile/top`
                  );
                  setDiscardTopCard(card);
              } catch (error) {
                  console.error("Failed to fetch discard pile top card:", error);
              }
          };

          fetchDiscardTopCard();
      }, [apiService, gameId]);

      return (
          <div className="cabo-background">
              <div className="game-overlay">

                  {/* EXIT BUTTON */}
                  {isSpectator && (
                      <Button className="exit-button">Exit</Button>
                  )}

                  {/* TOP CENTER */}
                  <div className="top-cards">
                      {[...Array(4)].map((_, i) => (
                          <div key={i} className="card small" />
                      ))}
                  </div>

                  {/* TOP RIGHT BUTTONS */}
                  <div className="top-right-buttons">
                      <Button>Scores</Button>
                      <Button type="primary">Call Cabo</Button>
                  </div>

                  {/* LEFT SIDE */}
                  <div className="left-cards">
                      {[...Array(4)].map((_, i) => (
                          <div key={i} className="card small" />
                      ))}
                  </div>

                  {/* RIGHT SIDE */}
                  <div className="right-cards">
                      {[...Array(4)].map((_, i) => (
                          <div key={i} className="card small" />
                      ))}
                  </div>

                  {/* CENTER */}
                  <div className="center-area">
                      {/* Draw Pile - immer face-down */}
                      <div className="pile">
                          <div className="card medium" />
                          <p>Draw Pile</p>
                      </div>

                      {/* Discard Pile - top card face-up */}
                      <div className="pile">
                          <div className="card medium" style={{
                              backgroundColor: discardTopCard ? "#fff" : "#ccc",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "24px",
                              fontWeight: "bold",
                              color: "#333",
                              border: "2px solid #999",
                              borderRadius: "8px",
                              width: "80px",
                              height: "120px",
                          }}>
                              {/* zeigt Wert wenn Karte vorhanden */}
                              {discardTopCard ? discardTopCard.value : "?"}
                          </div>
                          <p>Discard Pile</p>
                      </div>
                  </div>

                  {/* BOTTOM (You) */}
                  <div className="bottom-cards">
                      {[...Array(4)].map((_, i) => (
                          <div key={i} className="card large" />
                      ))}
                  </div>

              </div>
          </div>
      );
  };

  export default Game;