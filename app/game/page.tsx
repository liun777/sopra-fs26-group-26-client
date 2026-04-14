"use client";

import React, { useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Button } from "antd";
import useLocalStorage from "@/hooks/useLocalStorage";
import CardComponent from "./components/CardComponent";
import PeekTimer from "./components/PeekTimer";
import type { ApplicationError } from "@/types/error";
import TurnTimer from "./components/TurnTimer";

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
  const HAND_SIZE = 4; // referencing here, keeps it consistent and less prone to errors
  const createHiddenPeekCards = () => Array(HAND_SIZE).fill(false); // hide card by default



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
      const [peekVisibleCards, setPeekVisibleCards] = useState<boolean[]>(createHiddenPeekCards); // TEMP!!! Start initial peek until backend implements game state over WebSocket
      // #17: Peek Phase Timer
      const [isPeekPhase, setIsPeekPhase] = useState<boolean>(false);
      // #15: player's own hand
      const { value: token } = useLocalStorage<string>("token", "");
      const { value: pendingInitialPeekGameId, clear: clearPendingInitialPeekGameId } =
          useLocalStorage<string>("pendingInitialPeekGameId", "");
      const [myHand, setMyHand] = useState<Card[]>([]);
      const [selectedPeekIndices, setSelectedPeekIndices] = useState<number[]>([]);
      const [isSubmittingInitialPeek, setIsSubmittingInitialPeek] = useState<boolean>(false);
      const revealedPeekCount = peekVisibleCards.filter(Boolean).length;
      //#19 Add a visual timer/progress bar that syncs with the backend to warn the player of expiring time
      const TURN_DURATION = 30;


      const resetPeekSelection = () => {
          setPeekVisibleCards(createHiddenPeekCards());
          setSelectedPeekIndices([]);
      };

      const startPeekPhase = () => {
          resetPeekSelection();
          setIsPeekPhase(true);
      };

      const submitInitialPeekSelection = async (indices: number[]) => {
          if (!gameId || !token || !userId) {
              return;
          }

          setIsSubmittingInitialPeek(true);
          try {
              await apiService.postWithAuth(
                  `/games/${gameId}/peek`,
                  {
                      peekType: "initial",
                      handUserId: Number(userId),
                      indices,
                  },
                  token
              );
          } catch (error) {
              const appError = error as ApplicationError;
              // round is already active or initial peek was already consumed
              if (appError.status === 403 || appError.status === 409) {
                  setIsPeekPhase(false);
                  resetPeekSelection();
              }
              console.error("Failed to apply initial peek selection:", error);
          } finally {
              setIsSubmittingInitialPeek(false);
          }
      };

      const handlePeekCardClick = (cardIndex: number) => {
          if (!isPeekPhase || isSubmittingInitialPeek) {
              return;
          }

          if (peekVisibleCards[cardIndex]) {
              return;
          }

          if (selectedPeekIndices.length >= 2) {
              return;
          }

          const nextVisibleCards = [...peekVisibleCards];
          nextVisibleCards[cardIndex] = true;
          setPeekVisibleCards(nextVisibleCards);

          const nextSelectedIndices = [...selectedPeekIndices, cardIndex];
          setSelectedPeekIndices(nextSelectedIndices);

          if (nextSelectedIndices.length === 2) {
              void submitInitialPeekSelection(nextSelectedIndices);
          }
      };

      useEffect(() => {
          if (!gameId || pendingInitialPeekGameId !== gameId) {
              return;
          }

          startPeekPhase();
          clearPendingInitialPeekGameId();
      }, [gameId, pendingInitialPeekGameId, clearPendingInitialPeekGameId]);

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
                  {isMyTurn && (
                      <TurnTimer duration={TURN_DURATION} isActive={isMyTurn} />
                  )}
                  {isPeekPhase && (
                      <div className="peek-phase-indicator">
                          Memorize your cards!
                      </div>
                  )}

                  {/* #17: PeekTimer overlay */}
                  {isPeekPhase && (
                      <PeekTimer
                        duration={5}
                        onComplete={() => {
                            setIsPeekPhase(false);
                            // #15: all cards shown go back to face-down when timer goes to 0
                            resetPeekSelection();
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
                      {[...Array(HAND_SIZE)].map((_, i) => (
                         <CardComponent key={i} hidden={true} size="small" />
                      ))}
                  </div>

                  {/* LEFT SIDE */}
                  <div className="left-cards">
                      {[...Array(HAND_SIZE)].map((_, i) => (
                          <CardComponent key={i} hidden={true} size="small" />
                      ))}
                  </div>

                  {/* RIGHT SIDE */}
                  <div className="right-cards">
                      {[...Array(HAND_SIZE)].map((_, i) => (
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
                                    onClick={() => {
                                        if (isMyTurn && gameId && token) {
                                            void apiService.postWithAuth(
                                                `/games/${gameId}/moves/draw`,
                                                {},
                                                token
                                            ).then(() => {
                                            // refresh drawn card after drawing
                                                return apiService.getWithAuth<Card>(
                                                    `/games/${gameId}/drawn-card`,
                                                    token
                                                );
                                            }).then(card => setDrawnCard(card))
                                            .catch(console.error);
                                        }
                                    }}
                                    disabled={!isMyTurn}
                              />
                          <p>Draw Pile</p>
                          </div>

                          {/* #20: Drawn Card Slot */}
                              {isMyTurn && (
                                  <div className="pile">
                                      {drawnCard ? (
                                          <CardComponent
                                              hidden={false}
                                              value={drawnCard.value}
                                              size="medium"
                                          />
                                      ) : (
                                          <div style={{
                                              backgroundColor: "rgba(255,255,255,0.1)",
                                              border: "2px dashed #999",
                                              borderRadius: "8px",
                                              width: "80px",
                                              height: "120px",
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              color: "#999",
                                              fontSize: "12px",
                                          }}>
                                              Draw a card
                                          </div>
                                      )}
                                      <p>Drawn Card</p>
                                  </div>
                              )}

                      {/* Discard Pile the top card is always faceup */}
                      <div className="pile">
                          <CardComponent
                                  hidden={false}
                                  value={discardTopCard?.value}
                                  size="medium"
                              />
                              <p>Discard Pile</p>
                          </div>
                      </div>

                  {/* Buttons are only active if it is users turn */}
                  <div className="top-right-buttons">
                      <Button disabled={!isMyTurn}>Scores</Button>
                      <Button type="primary" disabled={!isMyTurn}>Call Cabo</Button>
                  </div>

                  {/* Bottom cards are only clickable when its users turn*/}
                  <div className={`bottom-cards${isMyTurn ? " game-current-player-highlight" : ""}`}>
                      {[...Array(HAND_SIZE)].map((_, i) => {
                          const card = myHand[i];
                          return (
                              <CardComponent
                                key={i}
                                hidden={!peekVisibleCards[i]}  // #16 selected cards are face-up locally
                                value={card?.value}
                                size="large"
                                onClick={() => handlePeekCardClick(i)}
                                disabled={isPeekPhase
                                    ? (isSubmittingInitialPeek || (!peekVisibleCards[i] && revealedPeekCount >= 2))
                                    : !isMyTurn}
                              />
                          );
                      })}
                  </div>

              </div>
          </div>
      );
  };

  export default Game;
