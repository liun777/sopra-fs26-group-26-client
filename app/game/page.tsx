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

type FlyingCardAnimation = {
    id: number;
    hidden: boolean;
    value?: number;
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    width: number;
    height: number;
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
  const gameId = activeSessionId.trim();
  const HAND_SIZE = 4; // referencing here, keeps it consistent and less prone to errors
  const TURN_CARD_DRAG_MIME = "application/x-cabo-turn-card";
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
      const [selectedDrawSource, setSelectedDrawSource] = useState<"draw_pile" | "discard_pile" | null>(null);
      const [hasChosenDrawSourceThisTurn, setHasChosenDrawSourceThisTurn] = useState<boolean>(false);
      const [isDrawingFromPile, setIsDrawingFromPile] = useState<boolean>(false);
      const [isDrawingFromDiscardPile, setIsDrawingFromDiscardPile] = useState<boolean>(false);
      const [isSwappingDrawnCard, setIsSwappingDrawnCard] = useState<boolean>(false);
      const [isDiscardingDrawnCard, setIsDiscardingDrawnCard] = useState<boolean>(false);
      const [isSkippingAbilityChoice, setIsSkippingAbilityChoice] = useState<boolean>(false);
      const [isDraggingTurnCard, setIsDraggingTurnCard] = useState<boolean>(false);
      const [dragOverOwnCardIndex, setDragOverOwnCardIndex] = useState<number | null>(null);
      const [isDragOverDiscardPile, setIsDragOverDiscardPile] = useState<boolean>(false);
      const [flyingCardAnimations, setFlyingCardAnimations] = useState<FlyingCardAnimation[]>([]);
      const drawRequestInFlightRef = useRef<boolean>(false);
      const drawPileCardRef = useRef<HTMLDivElement | null>(null);
      const discardPileCardRef = useRef<HTMLDivElement | null>(null);
      const ownHandCardRefs = useRef<Array<HTMLDivElement | null>>([]);
      const flyingCardIdRef = useRef<number>(0);
      const flyingCardTimeoutsRef = useRef<number[]>([]);
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

      const isAbilityPhaseForCountdown =
          gameStatus === "ability_peek_self" ||
          gameStatus === "ability_peek_opponent" ||
          gameStatus === "ability_swap";
      const showTurnCountdown =
          !isPeekPhase &&
          (gameStatus === "round_active" || isAbilityPhaseForCountdown) &&
          currentTurnUserId != null;
      const showCenterTurnCountdown =
          showTurnCountdown && selfUserId != null && currentTurnUserId === selfUserId;
      const isMyTurnUi = isMyTurn && !isPeekPhase;
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
                  setSelectedDrawSource(null);
                  setHasChosenDrawSourceThisTurn(false);
                  setIsDrawingFromPile(false);
                  setIsDrawingFromDiscardPile(false);
                  drawRequestInFlightRef.current = false;
                  return;
              }

              try {
                  const rawCard = await apiService.getWithAuth<unknown>(
                      `/games/${gameId}/drawn-card`,
                      token
                  );
                  // At turn entry we only trust explicit local clicks as source choice.
                  setHasChosenDrawSourceThisTurn(false);
                  const nextDrawnCard = toValidCardOrNull(rawCard);
                  setDrawnCard(nextDrawnCard);
                  if (!nextDrawnCard) {
                      setSelectedDrawSource(null);
                      setHasChosenDrawSourceThisTurn(false);
                  }
              } catch {
                  // if endpoint returns no drawn card for this player yet, keep slot empty
                  setDrawnCard(null);
                  setSelectedDrawSource(null);
                  setHasChosenDrawSourceThisTurn(false);
              } finally {
                  setIsDrawingFromPile(false);
                  setIsDrawingFromDiscardPile(false);
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


// Disable regular "Draw/Discard" buttons while an ability choice is pending.
// #26
const isAbilityPending =
    gameStatus === "ability_peek_self" ||
    gameStatus === "ability_peek_opponent" ||
    gameStatus === "ability_swap";

const isRoundActive = gameStatus === "round_active";
const isStandardTurnActionBlocked =
    !isMyTurn ||
    !isRoundActive ||
    isPeekPhase ||
    isDrawingFromPile ||
    isDrawingFromDiscardPile ||
    isSwappingDrawnCard ||
    isDiscardingDrawnCard ||
    isAbilityPending;
const canDrawFromPile = !isStandardTurnActionBlocked && !drawnCard;
const canDrawFromDiscardPile = !isStandardTurnActionBlocked && !drawnCard;
const canSwapDrawnCardWithHand =
    !isStandardTurnActionBlocked &&
    !!drawnCard &&
    selectedDrawSource !== null &&
    hasChosenDrawSourceThisTurn;
const canDiscardDrawnCard =
    !isStandardTurnActionBlocked &&
    !!drawnCard &&
    selectedDrawSource === "draw_pile" &&
    hasChosenDrawSourceThisTurn;
const showDrawPileAsRevealedCard = selectedDrawSource === "draw_pile" && !!drawnCard;
const isDrawPileSelectedForTurnAction =
    hasChosenDrawSourceThisTurn && selectedDrawSource === "draw_pile" && !!drawnCard;
const isDiscardPileSelectedForTurnAction =
    hasChosenDrawSourceThisTurn && selectedDrawSource === "discard_pile" && !!drawnCard;
const shouldHighlightPileChoice = canDrawFromPile || canDrawFromDiscardPile;
const shouldHighlightDiscardPileAsAction = shouldHighlightPileChoice || canDiscardDrawnCard;
const shouldHighlightOwnCardsForTurnSwap = canSwapDrawnCardWithHand;
const hideOpponentCardsInitialPeek = gameStatus === "initial_peek" || isPeekPhase;
const visibleDiscardPileCard =
    isDiscardPileSelectedForTurnAction && drawnCard ? drawnCard : discardTopCard;
const canDragSelectedTurnCard =
    (isDrawPileSelectedForTurnAction && (canSwapDrawnCardWithHand || canDiscardDrawnCard)) ||
    (isDiscardPileSelectedForTurnAction && canSwapDrawnCardWithHand);
const drawPileCardInteractive = canDrawFromPile || (isDrawPileSelectedForTurnAction && canDragSelectedTurnCard);
const discardPileCardInteractive =
    canDrawFromDiscardPile ||
    canDiscardDrawnCard ||
    (isDiscardPileSelectedForTurnAction && canDragSelectedTurnCard);
const selectedPileCardStyle: React.CSSProperties = {
    outline: "3px solid #ffb14a",
    outlineOffset: "2px",
    boxShadow:
        "0 0 0 2px rgba(255, 177, 74, 0.45), 0 0 16px rgba(255, 177, 74, 0.75), 0 0 30px rgba(255, 177, 74, 0.45)",
    animation: "gameSelectedPilePulse 1.25s ease-in-out infinite",
    filter: "saturate(1.08) brightness(1.04)",
    opacity: 1,
};

// Implement logic to highlight valid cards (own cards for 7-8, opponent cards for 9-12) and capture the user's click.
//  #28
const [abilitySelectedOwnCardIndex, setAbilitySelectedOwnCardIndex] = useState<number | null>(null);
const [abilitySelectedOpponentId, setAbilitySelectedOpponentId] = useState<number | null>(null);
const [abilitySelectedOpponentCardIndex, setAbilitySelectedOpponentCardIndex] = useState<number | null>(null);
const [isSubmittingAbility, setIsSubmittingAbility] = useState<boolean>(false);
const [isAbilityChoicePending, setIsAbilityChoicePending] = useState<boolean>(false);
const seenAbilityPhaseRef = useRef<string>("");
const canShowAbilityChoiceButtons = isAbilityPending && isMyTurn && isAbilityChoicePending;
const abilityPhaseLabel = gameStatus === "ability_peek_self"
    ? "PEEK"
    : gameStatus === "ability_peek_opponent"
        ? "SPY"
        : gameStatus === "ability_swap"
            ? "SWAP"
            : "Ability";
const canInteractWithAbilityTargets =
    isAbilityPending &&
    isMyTurn &&
    !isSubmittingAbility &&
    !isAbilityChoicePending &&
    !isSkippingAbilityChoice;

// reset the ability selection when the phase ends
const resetAbilitySelection = () => {
    setAbilitySelectedOwnCardIndex(null);
    setAbilitySelectedOpponentId(null);
    setAbilitySelectedOpponentCardIndex(null);
    setIsSubmittingAbility(false);
};

// #28: reset ability state when phase changes and require explicit use/skip choice
useEffect(() => {
    if (!isAbilityPending) {
        seenAbilityPhaseRef.current = "";
        setIsAbilityChoicePending(false);
        setIsSkippingAbilityChoice(false);
        resetAbilitySelection();
        return;
    }

    if (isMyTurn && seenAbilityPhaseRef.current !== gameStatus) {
        seenAbilityPhaseRef.current = gameStatus;
        setIsAbilityChoicePending(true);
    }
}, [isAbilityPending, isMyTurn, gameStatus]);

// #28: handle own card click during ability phase
const handleAbilityOwnCardClick = (cardIndex: number) => {
    if (!canInteractWithAbilityTargets || !gameId || !token) return;

    if (gameStatus === "ability_peek_self") {
        // 7/8: peek own card → POST immediately
        setIsSubmittingAbility(true);
        void apiService.postWithAuth(
            `/games/${gameId}/peek`,
            {
                peekType: "special",
                handUserId: selfUserId,
                indices: [cardIndex],
            },
            token
        ).then(() => {
            // reveal card locally for a moment
            const next = [...peekVisibleCards];
            next[cardIndex] = true;
            setPeekVisibleCards(next);
            // hide again after 3 seconds
            setTimeout(() => {
                const reset = [...peekVisibleCards];
                reset[cardIndex] = false;
                setPeekVisibleCards(reset);
            }, 3000);
        }).catch(console.error)
        .finally(() => setIsSubmittingAbility(false));

    } else if (gameStatus === "ability_swap") {
        // 11/12: first select own card
        setAbilitySelectedOwnCardIndex(cardIndex);
    }
};


// #28: handle opponent card click during ability phase
const handleAbilityOpponentCardClick = (opponentId: number, cardIndex: number) => {
    if (!canInteractWithAbilityTargets || !gameId || !token) return;

    if (gameStatus === "ability_peek_opponent") {
        // 9/10: peek opponent card, POST immediately
        setIsSubmittingAbility(true);
        void apiService.postWithAuth(
            `/games/${gameId}/peek`,
            {
                peekType: "special",
                handUserId: opponentId,
                indices: [cardIndex],
            },
            token
        ).then(() => {
            resetAbilitySelection();
        }).catch(console.error)
        .finally(() => setIsSubmittingAbility(false));

    } else if (gameStatus === "ability_swap" && abilitySelectedOwnCardIndex !== null) {
        // 11/12: own card already selected, now swap
        setIsSubmittingAbility(true);
        void apiService.postWithAuth(
            `/games/${gameId}/abilities/swap`,
            {
                ownCardIndex: abilitySelectedOwnCardIndex,
                targetUserId: opponentId,
                targetCardIndex: cardIndex,
            },
            token
        ).then(() => {
            resetAbilitySelection();
            return apiService.getWithAuth<Card[]>(
                `/games/${gameId}/my-hand`,
                token
            );
        }).then(hand => setMyHand(hand))
        .catch(console.error)
        .finally(() => setIsSubmittingAbility(false));
    }
};

const refreshOwnHand = async (activeGameId: string, authToken: string) => {
    const hand = await apiService.getWithAuth<Card[]>(
        `/games/${activeGameId}/my-hand`,
        authToken
    );
    setMyHand(hand);
};

const refreshDiscardPileTop = async (activeGameId: string) => {
    try {
        const topCard = await apiService.get<Card | null>(
            `/games/${activeGameId}/discard-pile/top`
        );
        setDiscardTopCard(topCard ?? null);
    } catch (error) {
        console.error("Failed to refresh discard pile top card:", error);
    }
};

const clearFlyingCardTimer = () => {
    if (flyingCardTimeoutsRef.current.length === 0) {
        return;
    }

    for (const timeoutId of flyingCardTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
    }
    flyingCardTimeoutsRef.current = [];
};

const launchFlyingCardAnimation = (
    fromElement: HTMLDivElement | null,
    toElement: HTMLDivElement | null,
    card: { hidden: boolean; value?: number }
) => {
    if (!fromElement || !toElement) {
        return;
    }

    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();
    if (fromRect.width <= 0 || fromRect.height <= 0 || toRect.width <= 0 || toRect.height <= 0) {
        return;
    }

    const animationId = flyingCardIdRef.current + 1;
    flyingCardIdRef.current = animationId;

    setFlyingCardAnimations((current) => [
        ...current,
        {
        id: animationId,
        hidden: card.hidden,
        value: card.value,
        startX: fromRect.left,
        startY: fromRect.top,
        deltaX: toRect.left - fromRect.left,
        deltaY: toRect.top - fromRect.top,
        width: fromRect.width,
        height: fromRect.height,
        },
    ]);

    const timeoutId = window.setTimeout(() => {
        setFlyingCardAnimations((current) =>
            current.filter((animation) => animation.id !== animationId)
        );
        flyingCardTimeoutsRef.current = flyingCardTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, 460);
    flyingCardTimeoutsRef.current.push(timeoutId);
};

const swapDrawnCardWithHand = (targetCardIndex: number) => {
    if (!canSwapDrawnCardWithHand || !gameId || !token) {
        return;
    }

    const drawnCardToMove = drawnCard;
    const sourceForDrawnCard = selectedDrawSource;
    const sourceElement =
        sourceForDrawnCard === "discard_pile" ? discardPileCardRef.current : drawPileCardRef.current;
    const targetElement = ownHandCardRefs.current[targetCardIndex] ?? null;
    const swappedOutHandCard = myHand[targetCardIndex];
    const swappedOutHandCardHidden = !peekVisibleCards[targetCardIndex];
    const swappedOutSourceElement = ownHandCardRefs.current[targetCardIndex] ?? null;
    const swappedOutTargetElement = discardPileCardRef.current;

    setIsSwappingDrawnCard(true);
    void apiService.postWithAuth(
        `/games/${gameId}/drawn-card/swap`,
        { targetCardIndex },
        token
    ).then(async () => {
        if (drawnCardToMove && sourceElement && targetElement) {
            launchFlyingCardAnimation(sourceElement, targetElement, {
                hidden: false,
                value: drawnCardToMove.value,
            });
        }
        if (swappedOutHandCard && swappedOutSourceElement && swappedOutTargetElement) {
            launchFlyingCardAnimation(swappedOutSourceElement, swappedOutTargetElement, {
                hidden: swappedOutHandCardHidden,
                value: swappedOutHandCard.value,
            });
        }
        setDrawnCard(null);
        setSelectedDrawSource(null);
        setHasChosenDrawSourceThisTurn(false);
        await Promise.all([
            refreshOwnHand(gameId, token),
            refreshDiscardPileTop(gameId),
        ]);
    }).catch((error) => {
        console.error("Failed to swap drawn card:", error);
    }).finally(() => {
        setIsSwappingDrawnCard(false);
    });
};

// temp implementation until backend is properly implemented (endpoint missing)
const tryDiscardDrawnCard = async (activeGameId: string, authToken: string) => {
    const endpoints = [
        `/games/${activeGameId}/drawn-card/discard`,
        `/games/${activeGameId}/moves/discard`,
    ];

    let unsupportedError: unknown = null;
    for (const endpoint of endpoints) {
        try {
            await apiService.postWithAuth(endpoint, {}, authToken);
            return;
        } catch (error) {
            const status = (error as Partial<ApplicationError>)?.status;
            if (status === 404 || status === 405) {
                unsupportedError = error;
                continue;
            }
            throw error;
        }
    }

    throw unsupportedError ?? new Error("No supported endpoint for discarding drawn card.");
};

const discardDrawnCard = () => {
    if (!canDiscardDrawnCard || !gameId || !token || !drawnCard) {
        return;
    }

    const drawnCardToMove = drawnCard;
    const sourceElement = drawPileCardRef.current;
    const targetElement = discardPileCardRef.current;

    setIsDiscardingDrawnCard(true);
    void tryDiscardDrawnCard(gameId, token).then(async () => {
        if (drawnCardToMove && sourceElement && targetElement) {
            launchFlyingCardAnimation(sourceElement, targetElement, {
                hidden: false,
                value: drawnCardToMove.value,
            });
        }
        setDrawnCard(null);
        setSelectedDrawSource(null);
        setHasChosenDrawSourceThisTurn(false);
        await refreshDiscardPileTop(gameId);
    }).catch((error) => {
        console.error("Failed to discard drawn card:", error);
    }).finally(() => {
        setIsDiscardingDrawnCard(false);
    });
};

const drawFromPile = () => {
    if (!canDrawFromPile || !gameId || !token || drawRequestInFlightRef.current) {
        return;
    }

    drawRequestInFlightRef.current = true;
    setIsDrawingFromPile(true);
    setSelectedDrawSource("draw_pile");
    setHasChosenDrawSourceThisTurn(true);
    void apiService.postWithAuth(
        `/games/${gameId}/moves/draw`,
        {},
        token
    ).then(() => {
        return apiService.getWithAuth<unknown>(
            `/games/${gameId}/drawn-card`,
            token
        );
    }).then((rawCard) => {
        const nextDrawnCard = toValidCardOrNull(rawCard);
        setDrawnCard(nextDrawnCard);
        if (!nextDrawnCard) {
            setSelectedDrawSource(null);
            setHasChosenDrawSourceThisTurn(false);
        }
    }).catch((error) => {
        console.error("Failed to draw from pile:", error);
        setSelectedDrawSource(null);
        setHasChosenDrawSourceThisTurn(false);
    }).finally(() => {
        setIsDrawingFromPile(false);
        drawRequestInFlightRef.current = false;
    });
};

const drawFromDiscardPile = () => {
    if (!canDrawFromDiscardPile || !gameId || !token || drawRequestInFlightRef.current) {
        return;
    }

    drawRequestInFlightRef.current = true;
    setIsDrawingFromDiscardPile(true);
    setSelectedDrawSource("discard_pile");
    setHasChosenDrawSourceThisTurn(true);
    void apiService.postWithAuth(
        `/games/${gameId}/discard-pile/draw`,
        {},
        token
    ).then(async () => {
        const [rawDrawnCard] = await Promise.all([
            apiService.getWithAuth<unknown>(
                `/games/${gameId}/drawn-card`,
                token
            ),
            refreshDiscardPileTop(gameId),
            refreshOwnHand(gameId, token),
        ]);
        const nextDrawnCard = toValidCardOrNull(rawDrawnCard);
        setDrawnCard(nextDrawnCard);
        if (!nextDrawnCard) {
            setSelectedDrawSource(null);
            setHasChosenDrawSourceThisTurn(false);
        }
    }).catch((error) => {
        console.error("Failed to draw from discard pile:", error);
        setSelectedDrawSource(null);
        setHasChosenDrawSourceThisTurn(false);
    }).finally(() => {
        setIsDrawingFromDiscardPile(false);
        drawRequestInFlightRef.current = false;
    });
};

const eventHasTurnCardDrag = (event: React.DragEvent<HTMLDivElement>) =>
    isDraggingTurnCard || Array.from(event.dataTransfer.types).includes(TURN_CARD_DRAG_MIME);

const handleTurnCardDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canDragSelectedTurnCard) {
        event.preventDefault();
        return;
    }

    setIsDraggingTurnCard(true);
    setDragOverOwnCardIndex(null);
    setIsDragOverDiscardPile(false);
    event.dataTransfer.setData(TURN_CARD_DRAG_MIME, "turn-card");
    event.dataTransfer.effectAllowed = "move";
};

const handleTurnCardDragEnd = () => {
    setIsDraggingTurnCard(false);
    setDragOverOwnCardIndex(null);
    setIsDragOverDiscardPile(false);
};

const handleOwnCardDragOver = (event: React.DragEvent<HTMLDivElement>, ownCardIndex: number) => {
    if (!canSwapDrawnCardWithHand || !eventHasTurnCardDrag(event)) {
        return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (isDragOverDiscardPile) {
        setIsDragOverDiscardPile(false);
    }
    if (dragOverOwnCardIndex !== ownCardIndex) {
        setDragOverOwnCardIndex(ownCardIndex);
    }
};

const handleOwnCardDragLeave = (ownCardIndex: number) => {
    if (dragOverOwnCardIndex === ownCardIndex) {
        setDragOverOwnCardIndex(null);
    }
};

const handleOwnCardDrop = (event: React.DragEvent<HTMLDivElement>, ownCardIndex: number) => {
    if (!canSwapDrawnCardWithHand || !eventHasTurnCardDrag(event)) {
        return;
    }

    event.preventDefault();
    setIsDraggingTurnCard(false);
    setDragOverOwnCardIndex(null);
    setIsDragOverDiscardPile(false);
    swapDrawnCardWithHand(ownCardIndex);
};

const handleDiscardPileDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canDiscardDrawnCard || !eventHasTurnCardDrag(event)) {
        return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverOwnCardIndex != null) {
        setDragOverOwnCardIndex(null);
    }
    if (!isDragOverDiscardPile) {
        setIsDragOverDiscardPile(true);
    }
};

const handleDiscardPileDragLeave = () => {
    if (isDragOverDiscardPile) {
        setIsDragOverDiscardPile(false);
    }
};

const handleDiscardPileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canDiscardDrawnCard || !eventHasTurnCardDrag(event)) {
        return;
    }

    event.preventDefault();
    setIsDraggingTurnCard(false);
    setDragOverOwnCardIndex(null);
    setIsDragOverDiscardPile(false);
    discardDrawnCard();
};

// temp until Abilities implemented
const trySkipAbility = async (activeGameId: string, authToken: string) => {
    const endpoints = [
        `/games/${activeGameId}/abilities/skip`,
        `/games/${activeGameId}/ability/skip`,
        `/games/${activeGameId}/moves/skip-ability`,
        `/games/${activeGameId}/moves/ability/skip`,
    ];

    const delay = (milliseconds: number) =>
        new Promise<void>((resolve) => {
            setTimeout(resolve, milliseconds);
        });

    const maxAttempts = 4;
    let unsupportedError: unknown = null;

    for (const endpoint of endpoints) {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            try {
                await apiService.postWithAuth(endpoint, {}, authToken);
                return;
            } catch (error) {
                const status = (error as Partial<ApplicationError>)?.status;
                if (status === 404 || status === 405) {
                    unsupportedError = error;
                    break;
                }
                if ((status === 400 || status === 409 || status === 423) && attempt < maxAttempts - 1) {
                    await delay(200);
                    continue;
                }
                throw error;
            }
        }
    }

    throw unsupportedError ?? new Error("No supported endpoint for skipping ability.");
};

const chooseUseAbility = () => {
    if (!canShowAbilityChoiceButtons) {
        return;
    }
    setIsAbilityChoicePending(false);
};

const skipAbilityChoice = () => {
    if (!canShowAbilityChoiceButtons || !gameId || !token) {
        return;
    }

    setIsSkippingAbilityChoice(true);
    void trySkipAbility(gameId, token).catch((error) => {
        console.error("Failed to skip ability:", error);
    }).finally(() => {
        setIsSkippingAbilityChoice(false);
    });
};

useEffect(() => {
    if (!drawnCard && !isDrawingFromPile && !isDrawingFromDiscardPile) {
        setSelectedDrawSource(null);
        setHasChosenDrawSourceThisTurn(false);
    }
}, [drawnCard, isDrawingFromPile, isDrawingFromDiscardPile]);

useEffect(() => {
    if (!canDragSelectedTurnCard) {
        setIsDraggingTurnCard(false);
        setDragOverOwnCardIndex(null);
        setIsDragOverDiscardPile(false);
    }
}, [canDragSelectedTurnCard]);

useEffect(() => {
    return () => {
        clearFlyingCardTimer();
    };
}, []);

const centerTurnActionLabel = useMemo(() => {
    if (!showCenterTurnCountdown) {
        return "";
    }

    const suffix = `(${turnTimeLeft}s)`;
    if (isDrawingFromPile || isDrawingFromDiscardPile) {
        return `Preparing action ${suffix}`;
    }

    if (isAbilityPending) {
        if (isAbilityChoicePending) {
            return `${abilityPhaseLabel}: Use Ability or Skip ${suffix}`;
        }
        if (gameStatus === "ability_peek_self") {
            return `PEEK: choose one own card ${suffix}`;
        }
        if (gameStatus === "ability_peek_opponent") {
            return `SPY: choose one opponent card ${suffix}`;
        }
        if (gameStatus === "ability_swap") {
            if (abilitySelectedOwnCardIndex == null) {
                return `SWAP: choose your card ${suffix}`;
            }
            return `SWAP: choose opponent card ${suffix}`;
        }
    }

    if (canSwapDrawnCardWithHand && selectedDrawSource === "draw_pile") {
        return `Swap with hand or discard ${suffix}`;
    }

    if (canSwapDrawnCardWithHand && selectedDrawSource === "discard_pile") {
        return `Swap with your hand ${suffix}`;
    }

    return `Draw from Draw Pile or Discard Pile ${suffix}`;
}, [
    showCenterTurnCountdown,
    turnTimeLeft,
    isDrawingFromPile,
    isDrawingFromDiscardPile,
    isAbilityPending,
    isAbilityChoicePending,
    abilityPhaseLabel,
    gameStatus,
    abilitySelectedOwnCardIndex,
    canSwapDrawnCardWithHand,
    selectedDrawSource,
]);

const playerListRows = tablePlayerIds.map((id) => {
          const fallbackLabel = selfUserId != null && id === selfUserId ? "You" : `Player ${id}`;
          const label = playerNamesById[id] ?? fallbackLabel;
          const isActive = !isPeekPhase && currentTurnUserId != null && currentTurnUserId === id;
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
                              Memorize 2 cards!
                          </div>
                      </div>
                  )}

                  {/* #17: PeekTimer overlay */}
                  {isPeekPhase && (
                      <PeekTimer
                        duration={10}
                      />
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
                                 // #28: highlight opponent cards during ability phase
                                 onClick={() => {
                                     if (canInteractWithAbilityTargets && seatAssignments.topOpponentId != null) {
                                         handleAbilityOpponentCardClick(seatAssignments.topOpponentId, index);
                                     }
                                 }}
                                 disabled={
                                     !(canInteractWithAbilityTargets && (
                                         gameStatus === "ability_peek_opponent" ||
                                         (gameStatus === "ability_swap" && abilitySelectedOwnCardIndex !== null)
                                     ))
                                 }
                                 style={
                                     canInteractWithAbilityTargets && (
                                         gameStatus === "ability_peek_opponent" ||
                                         (gameStatus === "ability_swap" && abilitySelectedOwnCardIndex !== null)
                                     ) ? {
                                         outline: "3px solid #c4827a",
                                         outlineOffset: "2px",
                                     } : undefined
                                 }
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
                                  // #28: highlight opponent cards during ability phase
                                  onClick={() => {
                                      if (canInteractWithAbilityTargets && seatAssignments.leftOpponentId != null) {
                                          handleAbilityOpponentCardClick(seatAssignments.leftOpponentId, index);
                                      }
                                  }}
                                  disabled={
                                      !(canInteractWithAbilityTargets && (
                                          gameStatus === "ability_peek_opponent" ||
                                          (gameStatus === "ability_swap" && abilitySelectedOwnCardIndex !== null)
                                      ))
                                  }
                                  style={
                                      canInteractWithAbilityTargets && (
                                          gameStatus === "ability_peek_opponent" ||
                                          (gameStatus === "ability_swap" && abilitySelectedOwnCardIndex !== null)
                                      ) ? {
                                          outline: "3px solid #c4827a",
                                          outlineOffset: "2px",
                                      } : undefined
                                  }
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
                                  // #28: highlight opponent cards during ability phase
                                  onClick={() => {
                                      if (canInteractWithAbilityTargets && seatAssignments.rightOpponentId != null) {
                                          handleAbilityOpponentCardClick(seatAssignments.rightOpponentId, index);
                                      }
                                  }}
                                  disabled={
                                      !(canInteractWithAbilityTargets && (
                                          gameStatus === "ability_peek_opponent" ||
                                          (gameStatus === "ability_swap" && abilitySelectedOwnCardIndex !== null)
                                      ))
                                  }
                                  style={
                                      canInteractWithAbilityTargets && (
                                          gameStatus === "ability_peek_opponent" ||
                                          (gameStatus === "ability_swap" && abilitySelectedOwnCardIndex !== null)
                                      ) ? {
                                          outline: "3px solid #c4827a",
                                          outlineOffset: "2px",
                                      } : undefined
                                  }
                              />
                          ))}
                      </div>
                  )}

                  {/* CENTER */}
                  <div className="center-area">
                      <div className="pile">
                          <div ref={drawPileCardRef} className="game-pile-card-anchor">
                              <CardComponent
                                  hidden={!showDrawPileAsRevealedCard}
                                  value={showDrawPileAsRevealedCard ? drawnCard?.value : undefined}
                                  size="medium"
                                  onClick={drawFromPile}
                                  draggable={isDrawPileSelectedForTurnAction && canDragSelectedTurnCard}
                                  onDragStart={handleTurnCardDragStart}
                                  onDragEnd={handleTurnCardDragEnd}
                                  disabled={!drawPileCardInteractive}
                                  style={isDrawPileSelectedForTurnAction ? selectedPileCardStyle : shouldHighlightPileChoice ? {
                                      outline: "3px solid #34e27a",
                                      outlineOffset: "2px",
                                      boxShadow: "0 0 0 2px rgba(52, 226, 122, 0.3)",
                                  } : undefined}
                              />
                          </div>
                          <p>Draw Pile</p>
                      </div>

                      <div className="pile">
                          <div ref={discardPileCardRef} className="game-pile-card-anchor">
                              <CardComponent
                                  hidden={false}
                                  value={visibleDiscardPileCard?.value}
                                  size="medium"
                                  onClick={() => {
                                      if (canDiscardDrawnCard) {
                                          discardDrawnCard();
                                          return;
                                      }
                                      if (canDrawFromDiscardPile) {
                                          drawFromDiscardPile();
                                      }
                                  }}
                                  draggable={isDiscardPileSelectedForTurnAction && canDragSelectedTurnCard}
                                  onDragStart={handleTurnCardDragStart}
                                  onDragEnd={handleTurnCardDragEnd}
                                  onDragOver={handleDiscardPileDragOver}
                                  onDragEnter={handleDiscardPileDragOver}
                                  onDragLeave={handleDiscardPileDragLeave}
                                  onDrop={handleDiscardPileDrop}
                                  disabled={!discardPileCardInteractive}
                                  style={isDiscardPileSelectedForTurnAction ? selectedPileCardStyle : isDragOverDiscardPile ? {
                                      outline: "3px dashed #ffb14a",
                                      outlineOffset: "2px",
                                      boxShadow: "0 0 0 2px rgba(255, 177, 74, 0.45), 0 0 18px rgba(255, 177, 74, 0.78)",
                                  } : shouldHighlightDiscardPileAsAction ? {
                                      outline: "3px solid #34e27a",
                                      outlineOffset: "2px",
                                      boxShadow: "0 0 0 2px rgba(52, 226, 122, 0.3)",
                                  } : undefined}
                              />
                          </div>
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
                          <p className="game-turn-progress-label">{centerTurnActionLabel}</p>
                      </div>
                  )}

                  {/* Buttons are only active if it is users turn */}
                  <div className="top-right-buttons">
                      <Button disabled={!isMyTurnUi}>Scores</Button>
                      <Button type="primary" disabled={!isMyTurnUi}>Call Cabo</Button>
                      {canShowAbilityChoiceButtons && (
                          <>
                              <Button
                                  type="default"
                                  disabled={isSkippingAbilityChoice || isSubmittingAbility}
                                  onClick={chooseUseAbility}
                              >
                                  {`Use ${abilityPhaseLabel}`}
                              </Button>
                              <Button
                                  type="default"
                                  disabled={isSkippingAbilityChoice || isSubmittingAbility}
                                  loading={isSkippingAbilityChoice}
                                  onClick={skipAbilityChoice}
                              >
                                  Skip Ability
                              </Button>
                          </>
                      )}
                  </div>

                  {/* Bottom cards are only itneractable when its users turn*/}
                  <div className={`bottom-cards${isMyTurnUi ? " game-current-player-highlight" : ""}`}>
                      {[...Array(HAND_SIZE)].map((_, i) => {
                          const card = myHand[i];
                          // #28: highlight own cards during ability phase
                          const isHighlightedForAbility =
                            canInteractWithAbilityTargets && (
                                gameStatus === "ability_peek_self" ||
                                gameStatus === "ability_swap"
                            );
                          const canClickOwnCardForAbility =
                            isHighlightedForAbility;
                          const isPeekCardSelected = isPeekPhase && peekVisibleCards[i];
                          const isPeekCardSelectable =
                            isPeekPhase &&
                            !isSubmittingInitialPeek &&
                            !isPeekCardSelected &&
                            revealedPeekCount < 2;
                          const isSelectedForSwap = abilitySelectedOwnCardIndex === i;
                          const isSwapDropTarget =
                              isDraggingTurnCard &&
                              canSwapDrawnCardWithHand &&
                              dragOverOwnCardIndex === i;

                          const cardStyle: React.CSSProperties | undefined = isPeekPhase
                              ? (isPeekCardSelected ? {
                                  outline: "3px solid #e8a87c",
                                  outlineOffset: "2px",
                                  boxShadow: "0 0 0 2px rgba(232, 168, 124, 0.35)",
                              } : isPeekCardSelectable ? {
                                  outline: "3px dashed rgba(52, 226, 122, 0.95)",
                                  outlineOffset: "2px",
                                  boxShadow: "0 0 0 2px rgba(52, 226, 122, 0.3)",
                              } : {
                                  outline: "2px solid rgba(255, 255, 255, 0.75)",
                                  outlineOffset: "2px",
                              })
                              : isHighlightedForAbility ? {
                              outline: isSelectedForSwap
                                  ? "3px solid #e8a87c"   // orange = selected for swap
                                  : "3px solid #a8b87a",  // green = clickable
                              outlineOffset: "2px",
                          } : shouldHighlightOwnCardsForTurnSwap ? {
                              outline: "3px solid #34e27a",
                              outlineOffset: "2px",
                              boxShadow: "0 0 0 2px rgba(52, 226, 122, 0.25)",
                          } : undefined;
                          const finalCardStyle: React.CSSProperties | undefined = isSwapDropTarget ? {
                              ...(cardStyle ?? {}),
                              outline: "3px dashed #ffb14a",
                              outlineOffset: "2px",
                              boxShadow: "0 0 0 2px rgba(255, 177, 74, 0.48), 0 0 14px rgba(255, 177, 74, 0.72)",
                          } : cardStyle;

                          return (
                              <div
                                  key={i}
                                  ref={(element) => {
                                      ownHandCardRefs.current[i] = element;
                                  }}
                                  className="game-own-card-anchor"
                              >
                                  <CardComponent
                                    hidden={!peekVisibleCards[i]}  // #16 selected cards are face-up locally
                                    value={card?.value}
                                    size="large"
                                    onClick={() => {
                                        if (isPeekPhase) {
                                            handlePeekCardClick(i);
                                            return;
                                        }

                                        if (canClickOwnCardForAbility) {
                                            handleAbilityOwnCardClick(i);
                                            return;
                                        }

                                        if (canSwapDrawnCardWithHand) {
                                            swapDrawnCardWithHand(i);
                                            return;
                                        }
                                    }}
                                    disabled={isPeekPhase
                                        ? (isSubmittingInitialPeek || isPeekCardSelected || (!isPeekCardSelected && revealedPeekCount >= 2))
                                        : !(canClickOwnCardForAbility || canSwapDrawnCardWithHand)}
                                    onDragOver={(event) => handleOwnCardDragOver(event, i)}
                                    onDragEnter={(event) => handleOwnCardDragOver(event, i)}
                                    onDragLeave={() => handleOwnCardDragLeave(i)}
                                    onDrop={(event) => handleOwnCardDrop(event, i)}
                                    style={finalCardStyle}
                                  />
                              </div>
                          );
                      })}
                  </div>

                  {flyingCardAnimations.length > 0 && (
                      <div className="game-flying-card-layer" aria-hidden="true">
                          {flyingCardAnimations.map((animation) => (
                              <div
                                  key={animation.id}
                                  className="game-flying-card"
                                  style={{
                                      left: `${animation.startX}px`,
                                      top: `${animation.startY}px`,
                                      width: `${animation.width}px`,
                                      height: `${animation.height}px`,
                                      ["--fly-delta-x" as string]: `${animation.deltaX}px`,
                                      ["--fly-delta-y" as string]: `${animation.deltaY}px`,
                                  } as React.CSSProperties}
                              >
                                  <CardComponent
                                      hidden={animation.hidden}
                                      value={animation.value}
                                      size="medium"
                                      style={{
                                          width: "100%",
                                          height: "100%",
                                          pointerEvents: "none",
                                      }}
                                  />
                              </div>
                          ))}
                      </div>
                  )}

              </div>
          </div>
      );
  };

  export default Game;
