"use client";

import React, { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Button } from "antd";
import useLocalStorage from "@/hooks/useLocalStorage";
import CardComponent from "./components/CardComponent";

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

  //# 8: Implement a global isMyTurn state that disables all buttons and click listeners on the game board when false.
  // first we get the userID out of the local storage
      const { value: userId } = useLocalStorage<string>("userId", "");

      // isMyTurn State
      const [isMyTurn, setIsMyTurn] = useState<boolean>(false);


      // then we see if it is the useres turn
      useEffect(() => {
          const fetchIsMyTurn = async () => {
              try {
                  const result = await apiService.get<boolean>(
                      `/games/${gameId}/is-my-turn/${userId}`
                  );
                  setIsMyTurn(result);
              } catch (error) {
                  console.error("Failed to fetch turn status:", error);
              }
          };

          if (userId && gameId) fetchIsMyTurn();
      }, [apiService, gameId, userId]);



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
                         <CardComponent key={i} hidden={true} size="small" />
                      ))}
                  </div>

                  {/* LEFT SIDE */}
                  <div className="left-cards">
                      {[...Array(4)].map((_, i) => (
                          <CardComponent key={i} hidden={true} size="small" />
                      ))}
                  </div>

                  {/* RIGHT SIDE */}
                  <div className="right-cards">
                      {[...Array(4)].map((_, i) => (
                          <CardComponent key={i} hidden={true} size="small" />
                      ))}
                  </div>

                  {/* CENTER */}
                  <div className="center-area">
                      {/* Draw Pile is always face down and only clickable if its the users turn currently */}
                          <div className="pile">
                              <CardComponent
                                    hidden={true}
                                    size="medium"
                                    onClick={() => console.log("draw card")}
                                    disabled={!isMyTurn}
                                />
                              <p>Draw Pile</p>
                          </div>

                      {/* Discard Pile the top card is always face-up */}
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
                              cursor: isMyTurn ? "pointer" : "not-allowed",
                              opacity: isMyTurn ? 1 : 0.6,
                          }}>
                              {/* shows value if there is a card available */}
                              {discardTopCard ? discardTopCard.value : "?"}
                          </div>
                          <p>Discard Pile</p>
                      </div>
                  </div>

                  {/* Buttons are only active if it is users turn */}
                  <div className="top-right-buttons">
                      <Button disabled={!isMyTurn}>Scores</Button>
                      <Button type="primary" disabled={!isMyTurn}>Call Cabo</Button>
                  </div>

                  {/* Bottom cards are only clickable when its users turn*/}
                  <div className="bottom-cards">
                      {[...Array(4)].map((_, i) => (
                          <CardComponent
                            key={i}
                            hidden={true}
                            size="large"
                            onClick={() => console.log(`clicked card ${i}`)}
                            disabled={!isMyTurn}
                            />
                      ))}
                  </div>

              </div>
          </div>
      );
  };

  export default Game;