"use client";

import React, { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Button } from "antd";
import useLocalStorage from "@/hooks/useLocalStorage";
import CardComponent from "./components/CardComponent";
import PeekTimer from "./components/PeekTimer";

interface Card {
    value: number;
    visibility: boolean;
    ability: string;
}


const Game = () => {
  const apiService = useApi();
  const { value: activeSessionId } = useLocalStorage<string>("activeSessionId", "");
  const isSpectator = false;
  const gameId = activeSessionId.trim();



  // Backlog #9: Implement logic to always render the DiscardPile top card with its face-up value
      const [discardTopCard, setDiscardTopCard] = useState<Card | null>(null);

      //get the top card from the backend
      useEffect(() => {
          if (!gameId) {
              setDiscardTopCard(null);
              return;
          }

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
      // 1st we get userID out of local storage
      const { value: userId } = useLocalStorage<string>("userId", "");

      // #8 isMyTurn State
      const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
      // #15: track wich bottom cards are faced up during the peekphase
      const [peekVisibleCards, setPeekVisibleCards] = useState<boolean[]>([false, false, false, false]);
      // #17: Peek Phase Timer
      const [isPeekPhase, setIsPeekPhase] = useState<boolean>(false);
      // #15: player's own hand
      const { value: token } = useLocalStorage<string>("token", "");
      const [myHand, setMyHand] = useState<Card[]>([]);

      // then we see if it is useres turn
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

      // #15: fetch player's hand
      useEffect(() => {
        const fetchMyHand = async () => {
            if (!gameId || !token) return;
            try {
                const hand = await apiService.getWithAuth<Card[]>(
                    `/games/${gameId}/my-hand`,
                     token
                );
                setMyHand(hand);
            } catch (error) {
                console.error("Failed to fetch hand:", error);
            }
        };
        fetchMyHand();
      }, [apiService, gameId, token]);



      return (
          <div className="cabo-background">
              <div className="game-overlay">
                  {/* #17: PeekTimer overlay */}
                  {isPeekPhase && (
                      <PeekTimer
                        duration={5}
                        onComplete={() => {
                            setIsPeekPhase(false);
                            {/* #15: all cards shown goback to face-down when timer goes to 0*/}
                            setPeekVisibleCards([false, false, false, false]);
                            // refresh hand - all cards should be face-down again
                                if (gameId && token) {
                                    void apiService.getWithAuth<Card[]>(
                                        `/games/${gameId}/my-hand`,
                                         token
                                    ).then(hand => setMyHand(hand)).catch(console.error);
                                }
                        }}
                      />
                  )}

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
                                    onClick={() => undefined}
                                    disabled={!isMyTurn}
                                />
                              <p>Draw Pile</p>
                          </div>

                      {/* Discard Pile the top card is always faceup */}
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
                        {/* temporary this is juzst a test remove later*/}
                      <Button onClick={() => setIsPeekPhase(true)}>Test Peek</Button>

                  </div>

                  {/* Bottom cards are only clickable when its users turn*/}
                  <div className={`bottom-cards${isMyTurn ? " game-current-player-highlight" : ""}`}>
                      {[...Array(4)].map((_, i) => {
                          const card = myHand[i];
                          // during peek phase show card if visibility=true
                          const showFront = isPeekPhase && card?.visibility === true;
                          return (
                              <CardComponent
                                key={i}
                                hidden={!peekVisibleCards[i]}  // #15 faceup values during the peakpahse
                                value={0}                       // TODO: implement witht he real card in the backend
                                size="large"
                                 onClick={() => {
                                    if (isPeekPhase) { // POST to backend to select this card for peek
                                        void apiService.postWithAuth(
                                            `/games/${gameId}/peek`,
                                            {
                                                peekType: "initial",
                                                handUserId: Number(userId),
                                                indices: [i]
                                            },
                                            token
                                        ).then(() => {
                                        // refresh hand after peek selection
                                            void apiService.getWithAuth<Card[]>(
                                                `/games/${gameId}/my-hand`,
                                                token
                                            ).then(hand => setMyHand(hand));
                                        }).catch(console.error);
                                    }
                                }}
                                disabled={!isMyTurn}
                              />
                          );
                      })}
                  </div>

              </div>
          </div>
      );
  };

  export default Game;
