"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Button } from "antd";
import useLocalStorage from "@/hooks/useLocalStorage";
import CardComponent from "./components/CardComponent";
import PeekTimer from "./components/PeekTimer";
import type { ApplicationError } from "@/types/error";
import { getStompBrokerUrl } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import type { User } from "@/types/user";

interface Card {
    value: number;
    visibility: boolean;
    ability: string;
}

type PlayerHandSignal = {
    userId?: number | string | null;
    id?: number | string | null;
    cards?: CardViewSignal[] | null;
};

type CardViewSignal = {
    position?: number | string | null;
    faceDown?: boolean | null;
    value?: number | string | null;
    code?: string | null;
};

type SeatCardView = {
    position: number;
    faceDown: boolean;
    value?: number;
};

type UnknownRecord = Record<string, unknown>;

type GameStateSignal = {
    gameId?: string | null;
    id?: string | null;
    status?: string | null;
    gameStatus?: string | null;
    phase?: string | null;
    currentTurnUserId?: number | string | null;
    currentPlayerId?: number | string | null;
    currentTurnPlayerId?: number | string | null;
    discardPileTop?: {
        value?: number | string | null;
        code?: string | null;
    } | null;
    players?: PlayerHandSignal[] | null;
};

function normalizeValue(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

function extractGameId(value: unknown): string {
    if (!value || typeof value !== "object") {
        return "";
    }

    const record = value as Record<string, unknown>;
    const directId = String(record.gameId ?? record.id ?? "").trim();
    if (directId) {
        return directId;
    }

    const nestedGame = record.game;
    if (!nestedGame || typeof nestedGame !== "object") {
        return "";
    }

    const nestedRecord = nestedGame as Record<string, unknown>;
    return String(nestedRecord.gameId ?? nestedRecord.id ?? "").trim();
}

function extractGameStatus(value: unknown): string {
    if (!value || typeof value !== "object") {
        return "";
    }

    const record = value as Record<string, unknown>;
    const directStatus = normalizeValue(record.status ?? record.gameStatus ?? record.phase);
    if (directStatus) {
        return directStatus;
    }

    const nestedGame = record.game;
    if (!nestedGame || typeof nestedGame !== "object") {
        return "";
    }

    const nestedRecord = nestedGame as Record<string, unknown>;
    return normalizeValue(nestedRecord.status ?? nestedRecord.gameStatus ?? nestedRecord.phase);
}

function extractCurrentTurnUserId(value: unknown): number | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const record = value as Record<string, unknown>;
    const candidate =
        record.currentTurnUserId ??
        record.currentPlayerId ??
        record.currentTurnPlayerId;

    if (candidate == null || candidate === "") {
        return null;
    }

    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
}

function extractPlayerIds(value: unknown): number[] {
    if (!value || typeof value !== "object") {
        return [];
    }

    const record = value as Record<string, unknown>;
    const candidates = record.players;
    if (!Array.isArray(candidates)) {
        return [];
    }

    const ids: number[] = [];
    for (const entry of candidates) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const playerRecord = entry as Record<string, unknown>;
        const rawId = playerRecord.userId ?? playerRecord.id;
        if (rawId == null || rawId === "") {
            continue;
        }

        const parsedId = Number(rawId);
        if (Number.isFinite(parsedId)) {
            ids.push(parsedId);
        }
    }

    return ids;
}

function normalizeSeatCards(cards: CardViewSignal[] | null | undefined): SeatCardView[] {
    if (!Array.isArray(cards)) {
        return [];
    }

    return cards
        .map((card, index) => {
            const parsedPosition = Number(card?.position);
            const parsedValue = Number(card?.value);
            return {
                position: Number.isFinite(parsedPosition) ? parsedPosition : index,
                faceDown: card?.faceDown !== false,
                value: Number.isFinite(parsedValue) ? parsedValue : undefined,
            };
        })
        .sort((a, b) => a.position - b.position);
}

function extractPlayerCardsById(value: unknown): Record<number, SeatCardView[]> {
    if (!value || typeof value !== "object") {
        return {};
    }

    const record = value as Record<string, unknown>;
    const players = record.players;
    if (!Array.isArray(players)) {
        return {};
    }

    const byId: Record<number, SeatCardView[]> = {};
    for (const entry of players) {
        if (!entry || typeof entry !== "object") {
            continue;
        }

        const playerRecord = entry as Record<string, unknown>;
        const rawId = playerRecord.userId ?? playerRecord.id;
        const parsedId = Number(rawId);
        if (!Number.isFinite(parsedId)) {
            continue;
        }

        byId[parsedId] = normalizeSeatCards(playerRecord.cards as CardViewSignal[] | null | undefined);
    }

    return byId;
}

function extractDiscardTopUpdate(value: unknown): { hasDiscardTop: boolean; card: Card | null } {
    if (!value || typeof value !== "object") {
        return { hasDiscardTop: false, card: null };
    }

    const record = value as Record<string, unknown>;
    let discardCandidate: unknown;
    if ("discardPileTop" in record) {
        discardCandidate = record.discardPileTop;
    } else {
        const nestedGame = record.game;
        if (nestedGame && typeof nestedGame === "object" && "discardPileTop" in (nestedGame as Record<string, unknown>)) {
            discardCandidate = (nestedGame as Record<string, unknown>).discardPileTop;
        } else {
            return { hasDiscardTop: false, card: null };
        }
    }

    if (!discardCandidate || typeof discardCandidate !== "object") {
        return { hasDiscardTop: true, card: null };
    }

    const parsedValue = Number((discardCandidate as Record<string, unknown>).value);
    if (!Number.isFinite(parsedValue)) {
        return { hasDiscardTop: true, card: null };
    }

    return {
        hasDiscardTop: true,
        card: {
            value: parsedValue,
            visibility: true,
            ability: "",
        },
    };
}

function arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function toValidCardOrNull(candidate: unknown): Card | null {
    if (!candidate || typeof candidate !== "object") {
        return null;
    }

    const record = candidate as UnknownRecord;
    const parsedValue = Number(record.value);
    if (!Number.isFinite(parsedValue)) {
        return null;
    }

    return {
        value: parsedValue,
        visibility: Boolean(record.visibility),
        ability: typeof record.ability === "string" ? record.ability : "",
    };
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
      const [peekVisibleCards, setPeekVisibleCards] = useState<boolean[]>(createHiddenPeekCards);
      // #17: Peek Phase Timer
      const [isPeekPhase, setIsPeekPhase] = useState<boolean>(false);
      // #15: player's own hand
      const { value: token } = useLocalStorage<string>("token", "");
      const { value: pendingInitialPeekGameId, clear: clearPendingInitialPeekGameId } =
          useLocalStorage<string>("pendingInitialPeekGameId", "");
      const [gameStatus, setGameStatus] = useState<string>("");
      const [myHand, setMyHand] = useState<Card[]>([]);
      const [selectedPeekIndices, setSelectedPeekIndices] = useState<number[]>([]);
      const [isSubmittingInitialPeek, setIsSubmittingInitialPeek] = useState<boolean>(false);
      const revealedPeekCount = peekVisibleCards.filter(Boolean).length;
      //#19 Add a visual timer/progress bar that syncs with the backend to warn the player of expiring time
      const TURN_DURATION = 30;
      // #20
      const [drawnCard, setDrawnCard] = useState<Card | null>(null);
      const [isDrawingFromPile, setIsDrawingFromPile] = useState<boolean>(false);
      const [isSwappingDrawnCard, setIsSwappingDrawnCard] = useState<boolean>(false);
      const drawRequestInFlightRef = useRef<boolean>(false);
      const [orderedPlayerIds, setOrderedPlayerIds] = useState<number[]>([]);
      const [playerCardsById, setPlayerCardsById] = useState<Record<number, SeatCardView[]>>({});
      const [playerNamesById, setPlayerNamesById] = useState<Record<number, string>>({});
      const [currentTurnUserId, setCurrentTurnUserId] = useState<number | null>(null);
      const [turnTimeLeft, setTurnTimeLeft] = useState<number>(TURN_DURATION);

      const parsedSelfUserId = Number(userId);
      const selfUserId = userId.trim() !== "" && Number.isFinite(parsedSelfUserId)
          ? parsedSelfUserId
          : null;

      const tablePlayerIds = useMemo(() => {
          const unique = Array.from(new Set(orderedPlayerIds));
          if (selfUserId != null && !unique.includes(selfUserId)) {
              unique.push(selfUserId);
          }
          return unique;
      }, [orderedPlayerIds, selfUserId]);

      const seatAssignments = useMemo(() => {
          if (selfUserId == null || tablePlayerIds.length === 0) {
              return {
                  topOpponentId: null as number | null,
                  leftOpponentId: null as number | null,
                  rightOpponentId: null as number | null,
              };
          }

          const selfIndex = tablePlayerIds.indexOf(selfUserId);
          if (selfIndex < 0) {
              const fallbackOpponents = tablePlayerIds.filter((id) => id !== selfUserId);
              return {
                  topOpponentId: fallbackOpponents[0] ?? null,
                  leftOpponentId: fallbackOpponents[1] ?? null,
                  rightOpponentId: fallbackOpponents[2] ?? null,
              };
          }

          const clockwiseOpponents: number[] = [];
          for (let offset = 1; offset < tablePlayerIds.length; offset += 1) {
              clockwiseOpponents.push(
                  tablePlayerIds[(selfIndex + offset) % tablePlayerIds.length]
              );
          }

          if (clockwiseOpponents.length === 1) {
              // 2 players: opponent sits opposite
              return {
                  topOpponentId: clockwiseOpponents[0],
                  leftOpponentId: null,
                  rightOpponentId: null,
              };
          }

          if (clockwiseOpponents.length === 2) {
              // 3 players: left + top (right seat empty for now)
              return {
                  leftOpponentId: clockwiseOpponents[0],
                  topOpponentId: clockwiseOpponents[1],
                  rightOpponentId: null,
              };
          }

          // 4 players: left, top, right relative to viewer (bottom)
          return {
              leftOpponentId: clockwiseOpponents[0] ?? null,
              topOpponentId: clockwiseOpponents[1] ?? null,
              rightOpponentId: clockwiseOpponents[2] ?? null,
          };
      }, [selfUserId, tablePlayerIds]);

      const topSeatCards = useMemo(() => {
          if (seatAssignments.topOpponentId == null) {
              return [];
          }
          const sourceCards = playerCardsById[seatAssignments.topOpponentId] ?? [];
          return Array.from({ length: HAND_SIZE }, (_, index) => (
              sourceCards[index] ?? { position: index, faceDown: true, value: undefined }
          ));
      }, [seatAssignments.topOpponentId, playerCardsById, HAND_SIZE]);

      const leftSeatCards = useMemo(() => {
          if (seatAssignments.leftOpponentId == null) {
              return [];
          }
          const sourceCards = playerCardsById[seatAssignments.leftOpponentId] ?? [];
          return Array.from({ length: HAND_SIZE }, (_, index) => (
              sourceCards[index] ?? { position: index, faceDown: true, value: undefined }
          ));
      }, [seatAssignments.leftOpponentId, playerCardsById, HAND_SIZE]);

      const rightSeatCards = useMemo(() => {
          if (seatAssignments.rightOpponentId == null) {
              return [];
          }
          const sourceCards = playerCardsById[seatAssignments.rightOpponentId] ?? [];
          return Array.from({ length: HAND_SIZE }, (_, index) => (
              sourceCards[index] ?? { position: index, faceDown: true, value: undefined }
          ));
      }, [seatAssignments.rightOpponentId, playerCardsById, HAND_SIZE]);


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

          setGameStatus("initial_peek");
          clearPendingInitialPeekGameId();
      }, [gameId, pendingInitialPeekGameId, clearPendingInitialPeekGameId]);

      useEffect(() => {
          const authToken = token.trim();
          if (!authToken || !gameId) {
              return;
          }

          const client = new Client({
              webSocketFactory: () => new SockJS(getStompBrokerUrl()),
              connectHeaders: { Authorization: authToken },
              reconnectDelay: 5000,
              onConnect: () => {
                  client.subscribe("/user/queue/game-state", (message) => {
                      try {
                          const payload = JSON.parse(String(message.body ?? "{}")) as GameStateSignal;
                          const payloadGameId = extractGameId(payload);
                          if (payloadGameId && payloadGameId !== gameId) {
                              return;
                          }

                          const nextStatus = extractGameStatus(payload);
                          if (nextStatus) {
                              setGameStatus((currentStatus) =>
                                  currentStatus === nextStatus ? currentStatus : nextStatus
                              );
                          }

                          const nextPlayerIds = extractPlayerIds(payload);
                          if (nextPlayerIds.length > 0) {
                              setOrderedPlayerIds((previous) =>
                                  arraysEqual(previous, nextPlayerIds) ? previous : nextPlayerIds
                              );
                          }
                          const nextPlayerCardsById = extractPlayerCardsById(payload);
                          if (Object.keys(nextPlayerCardsById).length > 0) {
                              setPlayerCardsById(nextPlayerCardsById);
                          }

                          const discardTopUpdate = extractDiscardTopUpdate(payload);
                          if (discardTopUpdate.hasDiscardTop) {
                              setDiscardTopCard(discardTopUpdate.card);
                          }

                          const nextTurnUserId = extractCurrentTurnUserId(payload);
                          if (nextTurnUserId != null) {
                              setCurrentTurnUserId((previous) =>
                                  previous === nextTurnUserId ? previous : nextTurnUserId
                              );
                              if (selfUserId != null) {
                                  setIsMyTurn(nextTurnUserId === selfUserId);
                              }
                          }
                      } catch {
                          /* ignore malformed payload */
                      }
                  });
              },
          });

          client.activate();
          return () => {
              void client.deactivate();
          };
      }, [token, gameId, selfUserId]);

      useEffect(() => {
          if (gameStatus === "initial_peek") {
              startPeekPhase();
              return;
          }

          setIsPeekPhase(false);
          resetPeekSelection();
      }, [gameStatus]);

      // then we see if it is useres turn
      useEffect(() => {
          const fetchIsMyTurn = async () => {
              try {
                  if (!userId || !gameId) {
                      setIsMyTurn(false);
                      return;
                  }
                  const result = await apiService.get<boolean>(
                      `/games/${gameId}/is-my-turn/${userId}`
                  );
                  setIsMyTurn(result);
              } catch (error) {
                  console.error("Failed to fetch turn status:", error);
              }
          };

          void fetchIsMyTurn();
          const intervalId = setInterval(() => {
              void fetchIsMyTurn();
          }, 3000);

          return () => {
              clearInterval(intervalId);
          };
      }, [apiService, gameId, userId]);

      useEffect(() => {
          const missingIds = tablePlayerIds.filter((id) => !playerNamesById[id]);
          if (missingIds.length === 0) {
              return;
          }

          let active = true;
          void Promise.all(
              missingIds.map(async (id) => {
                  try {
                      const fetchedUser = await apiService.get<User>(`/users/${encodeURIComponent(String(id))}`);
                      const displayName = String(
                          fetchedUser?.username ?? fetchedUser?.name ?? ""
                      ).trim();
                      return [id, displayName || `Player ${id}`] as const;
                  } catch {
                      return [id, `Player ${id}`] as const;
                  }
              })
          ).then((entries) => {
              if (!active) {
                  return;
              }
              setPlayerNamesById((previous) => {
                  const next = { ...previous };
                  for (const [id, label] of entries) {
                      next[id] = label;
                  }
                  return next;
              });
          });

          return () => {
              active = false;
          };
      }, [apiService, tablePlayerIds, playerNamesById]);

      const showTurnCountdown = !isPeekPhase && gameStatus === "round_active" && currentTurnUserId != null;
      const showCenterTurnCountdown =
          showTurnCountdown && selfUserId != null && currentTurnUserId === selfUserId;
      useEffect(() => {
          if (!showTurnCountdown) {
              setTurnTimeLeft(TURN_DURATION);
              return;
          }

          setTurnTimeLeft(TURN_DURATION);
          const intervalId = setInterval(() => {
              setTurnTimeLeft((previous) => (previous <= 1 ? 0 : previous - 1));
          }, 1000);

          return () => {
              clearInterval(intervalId);
          };
      }, [showTurnCountdown, currentTurnUserId]);

      useEffect(() => {
          const fetchDrawnCard = async () => {
              if (!isMyTurn || !gameId || !token) {
                  setDrawnCard(null);
                  setIsDrawingFromPile(false);
                  drawRequestInFlightRef.current = false;
                  return;
              }

              try {
                  const rawCard = await apiService.getWithAuth<unknown>(
                      `/games/${gameId}/drawn-card`,
                      token
                  );
                  setDrawnCard(toValidCardOrNull(rawCard));
              } catch {
                  // if endpoint returns no drawn card for this player yet, keep slot empty
                  setDrawnCard(null);
              } finally {
                  setIsDrawingFromPile(false);
                  drawRequestInFlightRef.current = false;
              }
          };

          void fetchDrawnCard();
      }, [apiService, gameId, token, isMyTurn]);

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



      const canDrawFromPile = isMyTurn && !isPeekPhase && !drawnCard && !isDrawingFromPile && !isSwappingDrawnCard;
      const canSwapDrawnCardWithHand = isMyTurn && !isPeekPhase && !!drawnCard && !isSwappingDrawnCard;
      const hideOpponentCardsInitialPeek = gameStatus === "initial_peek" || isPeekPhase;
      const playerListRows = tablePlayerIds.map((id) => {
          const fallbackLabel = selfUserId != null && id === selfUserId ? "You" : `Player ${id}`;
          const label = playerNamesById[id] ?? fallbackLabel;
          const isActive = currentTurnUserId != null && currentTurnUserId === id;
          return {
              id,
              label,
              isActive,
          };
      });

      return (
          <div className="cabo-background">
              <div className="game-overlay">
                  <div className="game-player-list" aria-label="Players in game">
                      {playerListRows.map((player) => (
                          <div
                              key={player.id}
                              className={`game-player-list-item${player.isActive ? " active" : ""}`}
                          >
                              <span>{player.label}</span>
                              {player.isActive && showTurnCountdown && (
                                  <span className="game-player-list-timer">{turnTimeLeft}s</span>
                              )}
                          </div>
                      ))}
                  </div>

                  {isPeekPhase && (
                      <div className="peek-phase-overlay" aria-hidden="true">
                          <div className="peek-phase-indicator">
                              Memorize your cards!
                          </div>
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
                  {seatAssignments.topOpponentId != null && (
                      <div className="top-cards opponent-seat-top">
                          {topSeatCards.map((card, index) => (
                             <CardComponent
                                 key={`top-${index}`}
                                 hidden={hideOpponentCardsInitialPeek ? true : card.faceDown}
                                 value={card.value}
                                 size="small"
                             />
                          ))}
                      </div>
                  )}

                  {/* LEFT SIDE */}
                  {seatAssignments.leftOpponentId != null && (
                      <div className="left-cards opponent-seat-left">
                          {leftSeatCards.map((card, index) => (
                              <CardComponent
                                  key={`left-${index}`}
                                  hidden={hideOpponentCardsInitialPeek ? true : card.faceDown}
                                  value={card.value}
                                  size="small"
                              />
                          ))}
                      </div>
                  )}

                  {/* RIGHT SIDE */}
                  {seatAssignments.rightOpponentId != null && (
                      <div className="right-cards opponent-seat-right">
                          {rightSeatCards.map((card, index) => (
                              <CardComponent
                                  key={`right-${index}`}
                                  hidden={hideOpponentCardsInitialPeek ? true : card.faceDown}
                                  value={card.value}
                                  size="small"
                              />
                          ))}
                      </div>
                  )}

                  {/* CENTER */}
                  <div className="center-area">
                      {/* Draw Pile is always face down and only clickable if its the users turn currently */}
                          <div className="pile">
                              <CardComponent
                                    hidden={true}
                                    size="medium"
                                    onClick={() => {
                                        if (!canDrawFromPile || !gameId || !token || drawRequestInFlightRef.current) {
                                            return;
                                        }

                                        drawRequestInFlightRef.current = true;
                                        setIsDrawingFromPile(true);

                                        void apiService.postWithAuth(
                                            `/games/${gameId}/moves/draw`,
                                            {},
                                            token
                                        ).then(() => {
                                            // refresh drawn card after drawing
                                            return apiService.getWithAuth<unknown>(
                                                `/games/${gameId}/drawn-card`,
                                                token
                                            );
                                        }).then(rawCard => {
                                            setDrawnCard(toValidCardOrNull(rawCard));
                                        }).catch(console.error)
                                        .finally(() => {
                                            setIsDrawingFromPile(false);
                                            drawRequestInFlightRef.current = false;
                                        });
                                    }}
                                    disabled={!canDrawFromPile}
                              />
                          <p>Draw Pile</p>
                          </div>

                          {/* #20: Drawn Card Slot */}
                              {isMyTurn && (
                                  <div className="pile">
                                      {drawnCard ? (
                                          <CardComponent
                                              hidden={drawnCard.value == null}
                                              value={drawnCard.value ?? undefined}
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
                  {showCenterTurnCountdown && (
                      <div className="game-center-turn-timer">
                          <div className="game-turn-progress-track">
                              <div
                                  className="game-turn-progress-fill"
                                  style={{
                                      width: `${Math.max(0, Math.min(100, (turnTimeLeft / TURN_DURATION) * 100))}%`,
                                  }}
                              />
                          </div>
                          <p className="game-turn-progress-label">{turnTimeLeft}s</p>
                      </div>
                  )}

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
                                onClick={() => {
                                    if (isPeekPhase) {
                                        handlePeekCardClick(i);
                                        return;
                                    }

                                    if (!canSwapDrawnCardWithHand || !gameId || !token) {
                                        return;
                                    }

                                    setIsSwappingDrawnCard(true);
                                    void apiService.postWithAuth(
                                        `/games/${gameId}/drawn-card/swap`,
                                        { targetCardIndex: i },
                                        token
                                    ).then(() => {
                                        setDrawnCard(null);
                                        return apiService.getWithAuth<Card[]>(
                                            `/games/${gameId}/my-hand`,
                                            token
                                        );
                                    }).then((hand) => {
                                        setMyHand(hand);
                                    }).catch((error) => {
                                        console.error("Failed to swap drawn card:", error);
                                    }).finally(() => {
                                        setIsSwappingDrawnCard(false);
                                    });
                                }}
                                disabled={isPeekPhase
                                    ? (isSubmittingInitialPeek || (!peekVisibleCards[i] && revealedPeekCount >= 2))
                                    : !canSwapDrawnCardWithHand}
                              />
                          );
                      })}
                  </div>

              </div>
          </div>
      );
  };

  export default Game;
