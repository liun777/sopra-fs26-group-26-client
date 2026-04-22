"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { Button } from "antd";
import useLocalStorage from "@/hooks/useLocalStorage";
import CardComponent from "./components/CardComponent";
import PeekTimer from "./components/PeekTimer";
import type { ApplicationError } from "@/types/error";
import { getApiDomain, getStompBrokerUrl } from "@/utils/domain";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import type { User } from "@/types/user";
import { useRouter } from "next/navigation";

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
    code?: string;
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
    caboCalled?: boolean | null;
    caboForcedByTimeout?: boolean | null;
    turnSeconds?: number | string | null;
    initialPeekSeconds?: number | string | null;
    abilityRevealSeconds?: number | string | null;
    rematchDecisionSeconds?: number | string | null;
    afkTimeoutSeconds?: number | string | null;
    timedOutPlayerIds?: Array<number | string | null> | null;
    lastMoveEvent?: LastMoveEventSignal | null;
    discardPileTop?: {
        value?: number | string | null;
        code?: string | null;
    } | null;
    players?: PlayerHandSignal[] | null;
};

type GameRuntimeConfigResponse = {
    turnSeconds?: number | string | null;
    initialPeekSeconds?: number | string | null;
    abilityRevealSeconds?: number | string | null;
    afkTimeoutSeconds?: number | string | null;
    rematchDecisionSeconds?: number | string | null;
};

type MoveZoneSignal = "DRAW_PILE" | "DISCARD_PILE" | "HAND";

type MoveStepSignal = {
    sourceZone?: MoveZoneSignal | string | null;
    sourceUserId?: number | string | null;
    sourceCardIndex?: number | string | null;
    targetZone?: MoveZoneSignal | string | null;
    targetUserId?: number | string | null;
    targetCardIndex?: number | string | null;
    hidden?: boolean | null;
    value?: number | string | null;
};

type LastMoveEventSignal = {
    sequence?: number | string | null;
    actorUserId?: number | string | null;
    primary?: MoveStepSignal | null;
    secondary?: MoveStepSignal | null;
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

type PendingRemoteDrawAnimation = {
    source: "draw_pile" | "discard_pile";
    cardValue?: number;
};

type ParsedMoveStep = {
    sourceZone: MoveZoneSignal;
    sourceUserId: number | null;
    sourceCardIndex: number | null;
    targetZone: MoveZoneSignal;
    targetUserId: number | null;
    targetCardIndex: number | null;
    hidden: boolean;
    value?: number;
};

type ParsedMoveEvent = {
    sequence: number;
    actorUserId: number | null;
    primary: ParsedMoveStep;
    secondary: ParsedMoveStep | null;
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
            const parsedCode =
                typeof card?.code === "string" && card.code.trim() !== ""
                    ? card.code.trim()
                    : undefined;
            return {
                position: Number.isFinite(parsedPosition) ? parsedPosition : index,
                faceDown: card?.faceDown !== false,
                value: Number.isFinite(parsedValue) ? parsedValue : undefined,
                code: parsedCode,
            };
        })
        .sort((a, b) => a.position - b.position);
}

function getAfkWarningLeadSeconds(afkTimeoutSeconds: number): number {
    if (afkTimeoutSeconds <= 300) {
        return 60;
    }
    if (afkTimeoutSeconds <= 600) {
        return 180;
    }
    return 300;
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

function extractTouchedHandIndicesByPlayerId(value: unknown): Record<number, number[]> {
    if (!value || typeof value !== "object") {
        return {};
    }

    const record = value as Record<string, unknown>;
    const players = record.players;
    if (!Array.isArray(players)) {
        return {};
    }

    const touchedById: Record<number, number[]> = {};
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

        const cards = playerRecord.cards;
        if (!Array.isArray(cards)) {
            continue;
        }

        const touched = new Set<number>();
        cards.forEach((cardEntry, fallbackIndex) => {
            if (!cardEntry || typeof cardEntry !== "object") {
                return;
            }
            const cardRecord = cardEntry as Record<string, unknown>;
            const parsedPosition = Number(cardRecord.position);
            const slotIndex = Number.isFinite(parsedPosition) ? parsedPosition : fallbackIndex;
            if (slotIndex >= 0) {
                touched.add(slotIndex);
            }
        });

        if (touched.size > 0) {
            touchedById[parsedId] = Array.from(touched).sort((a, b) => a - b);
        }
    }

    return touchedById;
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

function extractDrawnCardPresence(value: unknown): { hasDrawnCardField: boolean; present: boolean } {
    if (!value || typeof value !== "object") {
        return { hasDrawnCardField: false, present: false };
    }

    const record = value as Record<string, unknown>;
    if ("drawnCard" in record) {
        return {
            hasDrawnCardField: true,
            present: Boolean(record.drawnCard && typeof record.drawnCard === "object"),
        };
    }

    const nestedGame = record.game;
    if (nestedGame && typeof nestedGame === "object" && "drawnCard" in (nestedGame as Record<string, unknown>)) {
        const nestedRecord = nestedGame as Record<string, unknown>;
        return {
            hasDrawnCardField: true,
            present: Boolean(nestedRecord.drawnCard && typeof nestedRecord.drawnCard === "object"),
        };
    }

    return { hasDrawnCardField: false, present: false };
}

function parseMoveZone(value: unknown): MoveZoneSignal | null {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (normalized === "DRAW_PILE" || normalized === "DISCARD_PILE" || normalized === "HAND") {
        return normalized;
    }
    return null;
}

function parseMoveStep(value: unknown): ParsedMoveStep | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    const record = value as Record<string, unknown>;
    const sourceZone = parseMoveZone(record.sourceZone);
    const targetZone = parseMoveZone(record.targetZone);
    if (!sourceZone || !targetZone) {
        return null;
    }
    const sourceUserId = Number(record.sourceUserId);
    const sourceCardIndex = Number(record.sourceCardIndex);
    const targetUserId = Number(record.targetUserId);
    const targetCardIndex = Number(record.targetCardIndex);
    const parsedValue = Number(record.value);
    return {
        sourceZone,
        sourceUserId: Number.isFinite(sourceUserId) ? sourceUserId : null,
        sourceCardIndex: Number.isFinite(sourceCardIndex) ? sourceCardIndex : null,
        targetZone,
        targetUserId: Number.isFinite(targetUserId) ? targetUserId : null,
        targetCardIndex: Number.isFinite(targetCardIndex) ? targetCardIndex : null,
        hidden: record.hidden !== false,
        value: Number.isFinite(parsedValue) ? parsedValue : undefined,
    };
}

function extractLastMoveEvent(value: unknown): ParsedMoveEvent | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    const record = value as Record<string, unknown>;
    const candidate = record.lastMoveEvent ?? (record.game && typeof record.game === "object"
        ? (record.game as Record<string, unknown>).lastMoveEvent
        : null);
    if (!candidate || typeof candidate !== "object") {
        return null;
    }
    const moveRecord = candidate as Record<string, unknown>;
    const sequence = Number(moveRecord.sequence);
    if (!Number.isFinite(sequence) || sequence <= 0) {
        return null;
    }
    const primary = parseMoveStep(moveRecord.primary);
    if (!primary) {
        return null;
    }
    const secondary = parseMoveStep(moveRecord.secondary);
    const actorUserId = Number(moveRecord.actorUserId);
    return {
        sequence,
        actorUserId: Number.isFinite(actorUserId) ? actorUserId : null,
        primary,
        secondary,
    };
}

function areSeatCardsEquivalent(previousCard?: SeatCardView, nextCard?: SeatCardView): boolean {
    if (!previousCard && !nextCard) {
        return true;
    }
    if (!previousCard || !nextCard) {
        return false;
    }
    return (
        previousCard.faceDown === nextCard.faceDown &&
        previousCard.value === nextCard.value &&
        previousCard.code === nextCard.code
    );
}

function normalizeHandSlotIndex(rawIndex: number, handSize: number): number | null {
    if (rawIndex >= 0 && rawIndex < handSize) {
        return rawIndex;
    }
    if (rawIndex >= 1 && rawIndex <= handSize) {
        return rawIndex - 1;
    }
    return null;
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
  const router = useRouter();
  const { value: activeSessionId, set: setActiveSessionId } = useLocalStorage<string>("activeSessionId", "");
  const gameId = activeSessionId.trim();
  const HAND_SIZE = 4; // referencing here, keeps it consistent and less prone to errors
  const TURN_CARD_DRAG_MIME = "application/x-cabo-turn-card";
  const DISCARD_PILE_SWAP_DRAG_MIME = "application/x-cabo-discard-pile-swap";
  const FLYING_CARD_ANIMATION_MS = 1500; // slower
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

      // 1st we get userID out of local storage
      const { value: userId } = useLocalStorage<string>("userId", "");

      // #15: track wich bottom cards are faced up during the peekphase
      const [peekVisibleCards, setPeekVisibleCards] = useState<boolean[]>(createHiddenPeekCards);
      // #17: Peek Phase Timer
      const [isPeekPhase, setIsPeekPhase] = useState<boolean>(false);
      // #15: player's own hand
      const { value: token } = useLocalStorage<string>("token", "");
      const { value: pendingInitialPeekGameId, clear: clearPendingInitialPeekGameId } =
          useLocalStorage<string>("pendingInitialPeekGameId", "");
      const [gameStatus, setGameStatus] = useState<string>("");
      const isAwaitingRematchDecision = gameStatus === "round_awaiting_rematch";
      const [myHand, setMyHand] = useState<Card[]>([]);
      const [selectedPeekIndices, setSelectedPeekIndices] = useState<number[]>([]);
      const [isSubmittingInitialPeek, setIsSubmittingInitialPeek] = useState<boolean>(false);
      const revealedPeekCount = peekVisibleCards.filter(Boolean).length;
      //#19 Add a visual timer/progress bar that syncs with the backend to warn the player of expiring time
      const DEFAULT_TURN_SECONDS = 30;
      const DEFAULT_INITIAL_PEEK_SECONDS = 10;
      const DEFAULT_ABILITY_REVEAL_SECONDS = 5;
      const [rematchDecisionDuration, setRematchDecisionDuration] = useState<number>(60);
      const [turnDurationSeconds, setTurnDurationSeconds] = useState<number>(DEFAULT_TURN_SECONDS);
      const [initialPeekDurationSeconds, setInitialPeekDurationSeconds] =
          useState<number>(DEFAULT_INITIAL_PEEK_SECONDS);
      const [abilityRevealDurationSeconds, setAbilityRevealDurationSeconds] =
          useState<number>(DEFAULT_ABILITY_REVEAL_SECONDS);
      const [isCaboCalledGlobal, setIsCaboCalledGlobal] = useState<boolean>(false);
      const [isCaboForcedByTimeoutGlobal, setIsCaboForcedByTimeoutGlobal] = useState<boolean>(false);
      const [afkTimeoutSeconds, setAfkTimeoutSeconds] = useState<number>(300);
      const [afkRemainingSeconds, setAfkRemainingSeconds] = useState<number>(300);
      const [socketSynced, setSocketSynced] = useState<boolean>(true);
      // #20
      const [drawnCard, setDrawnCard] = useState<Card | null>(null);
      const [selectedDrawSource, setSelectedDrawSource] = useState<"draw_pile" | "discard_pile" | null>(null);
      const [, setHasChosenDrawSourceThisTurn] = useState<boolean>(false);
      const [isDrawingFromPile, setIsDrawingFromPile] = useState<boolean>(false);
      const [isDrawingFromDiscardPile, setIsDrawingFromDiscardPile] = useState<boolean>(false);
      const [isSwappingDrawnCard, setIsSwappingDrawnCard] = useState<boolean>(false);
      const [isDiscardingDrawnCard, setIsDiscardingDrawnCard] = useState<boolean>(false);
      const [isSkippingAbilityChoice, setIsSkippingAbilityChoice] = useState<boolean>(false);
      const [isDraggingTurnCard, setIsDraggingTurnCard] = useState<boolean>(false);
      const [isDraggingDiscardPileSwapCard, setIsDraggingDiscardPileSwapCard] = useState<boolean>(false);
      const [dragOverOwnCardIndex, setDragOverOwnCardIndex] = useState<number | null>(null);
      const [isDragOverDiscardPile, setIsDragOverDiscardPile] = useState<boolean>(false);
      const [isDiscardPileTemporarilyHidden, setIsDiscardPileTemporarilyHidden] = useState<boolean>(false);
      const [discardTopAnimationOverride, setDiscardTopAnimationOverride] = useState<Card | null>(null);
      const [flyingCardAnimations, setFlyingCardAnimations] = useState<FlyingCardAnimation[]>([]);
      const drawRequestInFlightRef = useRef<boolean>(false);
      const drawPileCardRef = useRef<HTMLDivElement | null>(null);
      const discardPileCardRef = useRef<HTMLDivElement | null>(null);
      const ownHandCardRefs = useRef<Array<HTMLDivElement | null>>([]);
      const topSeatCardRefs = useRef<Array<HTMLDivElement | null>>([]);
      const leftSeatCardRefs = useRef<Array<HTMLDivElement | null>>([]);
      const rightSeatCardRefs = useRef<Array<HTMLDivElement | null>>([]);
      const flyingCardIdRef = useRef<number>(0);
      const flyingCardTimeoutsRef = useRef<number[]>([]);
      const discardRevealTimeoutRef = useRef<number | null>(null);
      const abilityPeekHideTimeoutRef = useRef<number | null>(null);
      const discardTopOverrideTimeoutRef = useRef<number | null>(null);
      const pendingRemoteDrawAnimationRef = useRef<PendingRemoteDrawAnimation | null>(null);
      const drawnCardPresentRef = useRef<boolean>(false);
      const playerCardsByIdRef = useRef<Record<number, SeatCardView[]>>({});
      const discardTopCardRef = useRef<Card | null>(null);
      const currentTurnUserIdRef = useRef<number | null>(null);
      const lastActivityMsRef = useRef<number>(Date.now());
      const lastProcessedMoveSequenceRef = useRef<number>(0);
      const [orderedPlayerIds, setOrderedPlayerIds] = useState<number[]>([]);
      const [playerCardsById, setPlayerCardsById] = useState<Record<number, SeatCardView[]>>({});
      const [playerNamesById, setPlayerNamesById] = useState<Record<number, string>>({});
      const [timedOutPlayerIds, setTimedOutPlayerIds] = useState<number[]>([]);
      const [currentTurnUserId, setCurrentTurnUserId] = useState<number | null>(null);
      const [turnTimeLeft, setTurnTimeLeft] = useState<number>(DEFAULT_TURN_SECONDS);
      const [isCallingCabo, setIsCallingCabo] = useState<boolean>(false);
      const [isSubmittingRematchDecision, setIsSubmittingRematchDecision] = useState<boolean>(false);
      const [rematchCountdown, setRematchCountdown] = useState<number>(0);
      const [myRematchDecision, setMyRematchDecision] = useState<string | null>(null);
      const turnDeadlineMsRef = useRef<number | null>(null);
      const rematchDeadlineMsRef = useRef<number | null>(null);

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
          const cardsBySlot = new Map<number, SeatCardView>();
          sourceCards.forEach((card) => {
              const normalizedSlot = normalizeHandSlotIndex(card.position, HAND_SIZE);
              if (normalizedSlot != null) {
                  cardsBySlot.set(normalizedSlot, card);
              }
          });
          return Array.from({ length: HAND_SIZE }, (_, index) => (
              cardsBySlot.get(index) ?? { position: index, faceDown: true, value: undefined }
          ));
      }, [seatAssignments.topOpponentId, playerCardsById, HAND_SIZE]);

      const leftSeatCards = useMemo(() => {
          if (seatAssignments.leftOpponentId == null) {
              return [];
          }
          const sourceCards = playerCardsById[seatAssignments.leftOpponentId] ?? [];
          const cardsBySlot = new Map<number, SeatCardView>();
          sourceCards.forEach((card) => {
              const normalizedSlot = normalizeHandSlotIndex(card.position, HAND_SIZE);
              if (normalizedSlot != null) {
                  cardsBySlot.set(normalizedSlot, card);
              }
          });
          return Array.from({ length: HAND_SIZE }, (_, index) => (
              cardsBySlot.get(index) ?? { position: index, faceDown: true, value: undefined }
          ));
      }, [seatAssignments.leftOpponentId, playerCardsById, HAND_SIZE]);

      const rightSeatCards = useMemo(() => {
          if (seatAssignments.rightOpponentId == null) {
              return [];
          }
          const sourceCards = playerCardsById[seatAssignments.rightOpponentId] ?? [];
          const cardsBySlot = new Map<number, SeatCardView>();
          sourceCards.forEach((card) => {
              const normalizedSlot = normalizeHandSlotIndex(card.position, HAND_SIZE);
              if (normalizedSlot != null) {
                  cardsBySlot.set(normalizedSlot, card);
              }
          });
          return Array.from({ length: HAND_SIZE }, (_, index) => (
              cardsBySlot.get(index) ?? { position: index, faceDown: true, value: undefined }
          ));
      }, [seatAssignments.rightOpponentId, playerCardsById, HAND_SIZE]);

      const topSeatDisplayCards = useMemo(
          () => [...topSeatCards].reverse(),
          [topSeatCards]
      );

      useEffect(() => {
          playerCardsByIdRef.current = playerCardsById;
      }, [playerCardsById]);

      useEffect(() => {
          discardTopCardRef.current = discardTopCard;
      }, [discardTopCard]);

      useEffect(() => {
          currentTurnUserIdRef.current = currentTurnUserId;
      }, [currentTurnUserId]);

      const getCardAnchorByPlayerId = (playerId: number, cardIndex: number): HTMLDivElement | null => {
          if (selfUserId != null && playerId === selfUserId) {
              return ownHandCardRefs.current[cardIndex] ?? null;
          }
          if (seatAssignments.topOpponentId === playerId) {
              return topSeatCardRefs.current[cardIndex] ?? null;
          }
          if (seatAssignments.leftOpponentId === playerId) {
              return leftSeatCardRefs.current[cardIndex] ?? null;
          }
          if (seatAssignments.rightOpponentId === playerId) {
              return rightSeatCardRefs.current[cardIndex] ?? null;
          }
          return null;
      };

      const resolveAnchorFromMoveStep = (step: ParsedMoveStep, endpoint: "source" | "target"): HTMLDivElement | null => {
          const zone = endpoint === "source" ? step.sourceZone : step.targetZone;
          const userId = endpoint === "source" ? step.sourceUserId : step.targetUserId;
          const cardIndex = endpoint === "source" ? step.sourceCardIndex : step.targetCardIndex;
          if (zone === "DRAW_PILE") {
              return drawPileCardRef.current;
          }
          if (zone === "DISCARD_PILE") {
              return discardPileCardRef.current;
          }
          if (zone === "HAND" && userId != null) {
              const resolvedIndex = cardIndex != null
                  ? normalizeHandSlotIndex(cardIndex, HAND_SIZE) ?? Math.floor(HAND_SIZE / 2)
                  : Math.floor(HAND_SIZE / 2);
              return getCardAnchorByPlayerId(userId, resolvedIndex);
          }
          return null;
      };

      const animateParsedMoveStep = (step: ParsedMoveStep) => {
          const sourceAnchor = resolveAnchorFromMoveStep(step, "source");
          const targetAnchor = resolveAnchorFromMoveStep(step, "target");
          if (!sourceAnchor || !targetAnchor) {
              return;
          }
          launchFlyingCardAnimation(sourceAnchor, targetAnchor, {
              hidden: step.hidden,
              value: step.value,
          });
      };

      const findChangedHandIndices = (
          previousHand: SeatCardView[] | undefined,
          nextHand: SeatCardView[] | undefined
      ): number[] => {
          const previousByPosition = new Map<number, SeatCardView>();
          const nextByPosition = new Map<number, SeatCardView>();
          previousHand?.forEach((card) => {
              previousByPosition.set(card.position, card);
          });
          nextHand?.forEach((card) => {
              nextByPosition.set(card.position, card);
          });

          const changedIndices: number[] = [];
          for (let index = 0; index < HAND_SIZE; index += 1) {
              const previousCard = previousByPosition.get(index);
              const nextCard = nextByPosition.get(index);
              if (!areSeatCardsEquivalent(previousCard, nextCard)) {
                  changedIndices.push(index);
              }
          }
          return changedIndices;
      };

      const clearDiscardTopOverrideTimer = () => {
          if (discardTopOverrideTimeoutRef.current != null) {
              window.clearTimeout(discardTopOverrideTimeoutRef.current);
              discardTopOverrideTimeoutRef.current = null;
          }
      };

      const setDiscardTopOverrideUntilClear = (card: Card | null, delayMs: number | null = null) => {
          clearDiscardTopOverrideTimer();
          setDiscardTopAnimationOverride(card);
          const resolvedDelayMs =
              delayMs != null
                  ? delayMs
                  : card
                      ? FLYING_CARD_ANIMATION_MS + 300
                      : null;
          if (resolvedDelayMs != null && resolvedDelayMs > 0) {
              discardTopOverrideTimeoutRef.current = window.setTimeout(() => {
                  setDiscardTopAnimationOverride(null);
                  discardTopOverrideTimeoutRef.current = null;
              }, resolvedDelayMs);
          }
      };

      const clearAbilityPeekHideTimer = () => {
          if (abilityPeekHideTimeoutRef.current != null) {
              window.clearTimeout(abilityPeekHideTimeoutRef.current);
              abilityPeekHideTimeoutRef.current = null;
          }
      };


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
              setSocketSynced(false);
              return;
          }

          setSocketSynced(true);
          const client = new Client({
              webSocketFactory: () => new SockJS(getStompBrokerUrl()),
              connectHeaders: { Authorization: authToken },
              reconnectDelay: 5000,
              onConnect: () => {
                  setSocketSynced(true);
                  client.subscribe("/user/queue/game-state", (message) => {
                      try {
                          const payload = JSON.parse(String(message.body ?? "{}")) as GameStateSignal;
                          const payloadGameId = extractGameId(payload);
                          if (payloadGameId && payloadGameId !== gameId) {
                              return;
                          }
                          setSocketSynced(true);

                          const nextStatus = extractGameStatus(payload);
                          if (nextStatus) {
                              setGameStatus((currentStatus) =>
                                  currentStatus === nextStatus ? currentStatus : nextStatus
                              );
                          }

                          setIsCaboCalledGlobal(payload?.caboCalled === true);
                          setIsCaboForcedByTimeoutGlobal(payload?.caboForcedByTimeout === true);
                          setTimedOutPlayerIds(
                              Array.isArray(payload?.timedOutPlayerIds)
                                  ? payload.timedOutPlayerIds
                                      .map((id) => Number(id))
                                      .filter((id) => Number.isFinite(id))
                                  : []
                          );

                          const nextTurnSeconds = Number(payload?.turnSeconds);
                          if (Number.isFinite(nextTurnSeconds) && nextTurnSeconds > 0) {
                              setTurnDurationSeconds(Math.floor(nextTurnSeconds));
                          }

                          const nextInitialPeekSeconds = Number(payload?.initialPeekSeconds);
                          if (Number.isFinite(nextInitialPeekSeconds) && nextInitialPeekSeconds > 0) {
                              setInitialPeekDurationSeconds(Math.floor(nextInitialPeekSeconds));
                          }

                          const nextRematchSeconds = Number(payload?.rematchDecisionSeconds);
                          if (Number.isFinite(nextRematchSeconds) && nextRematchSeconds > 0) {
                              setRematchDecisionDuration(Math.floor(nextRematchSeconds));
                          }
                          const nextAbilityRevealSeconds = Number(payload?.abilityRevealSeconds);
                          if (Number.isFinite(nextAbilityRevealSeconds) && nextAbilityRevealSeconds > 0) {
                              setAbilityRevealDurationSeconds(Math.floor(nextAbilityRevealSeconds));
                          }
                          const nextAfkTimeout = Number(payload?.afkTimeoutSeconds);
                          if (Number.isFinite(nextAfkTimeout) && nextAfkTimeout > 0) {
                              setAfkTimeoutSeconds(Math.floor(nextAfkTimeout));
                          }

                          const nextPlayerIds = extractPlayerIds(payload);
                          if (nextPlayerIds.length > 0) {
                              setOrderedPlayerIds((previous) =>
                                  arraysEqual(previous, nextPlayerIds) ? previous : nextPlayerIds
                              );
                          }
                          const previousPlayerCardsById = playerCardsByIdRef.current;
                          const previousDiscardTopCard = discardTopCardRef.current;
                          const previousTurnUserId = currentTurnUserIdRef.current;
                          const previousDrawnCardPresent = drawnCardPresentRef.current;

                          const parsedNextPlayerCardsById = extractPlayerCardsById(payload);
                          const effectiveNextPlayerCardsById =
                              Object.keys(parsedNextPlayerCardsById).length > 0
                                  ? parsedNextPlayerCardsById
                                  : previousPlayerCardsById;
                          const touchedHandIndicesByPlayerId = extractTouchedHandIndicesByPlayerId(payload);

                          const discardTopUpdate = extractDiscardTopUpdate(payload);
                          const effectiveNextDiscardTopCard = discardTopUpdate.hasDiscardTop
                              ? discardTopUpdate.card
                              : previousDiscardTopCard;

                          const drawnCardPresence = extractDrawnCardPresence(payload);
                          const nextDrawnCardPresent = drawnCardPresence.hasDrawnCardField
                              ? drawnCardPresence.present
                              : previousDrawnCardPresent;

                          const actingPlayerId = previousTurnUserId;
                          const canAnimateOtherPlayerMove = actingPlayerId != null && (
                              selfUserId == null || actingPlayerId !== selfUserId
                          );
                          let handledByExplicitMoveEvent = false;
                          const explicitMoveEvent = extractLastMoveEvent(payload);
                          if (
                              explicitMoveEvent &&
                              explicitMoveEvent.sequence > lastProcessedMoveSequenceRef.current &&
                              (selfUserId == null || explicitMoveEvent.actorUserId !== selfUserId)
                          ) {
                              animateParsedMoveStep(explicitMoveEvent.primary);
                              if (explicitMoveEvent.secondary) {
                                  animateParsedMoveStep(explicitMoveEvent.secondary);
                              }
                              lastProcessedMoveSequenceRef.current = explicitMoveEvent.sequence;
                              handledByExplicitMoveEvent = true;
                          }
                          const discardChanged =
                              (previousDiscardTopCard?.value ?? null) !== (effectiveNextDiscardTopCard?.value ?? null);

                          if (
                              !handledByExplicitMoveEvent &&
                              canAnimateOtherPlayerMove &&
                              !previousDrawnCardPresent &&
                              nextDrawnCardPresent
                          ) {
                              if (discardChanged && previousDiscardTopCard) {
                                  pendingRemoteDrawAnimationRef.current = {
                                      source: "discard_pile",
                                      cardValue: previousDiscardTopCard.value,
                                  };
                                  setDiscardTopOverrideUntilClear(previousDiscardTopCard);
                              } else {
                                  pendingRemoteDrawAnimationRef.current = {
                                      source: "draw_pile",
                                  };
                              }
                          }

                          if (
                              !handledByExplicitMoveEvent &&
                              canAnimateOtherPlayerMove &&
                              previousDrawnCardPresent &&
                              !nextDrawnCardPresent
                          ) {
                              const pendingAnimation = pendingRemoteDrawAnimationRef.current;
                              if (pendingAnimation) {
                                  const resolvedActingPlayerId = actingPlayerId as number;
                                  const previousActingHand = previousPlayerCardsById[resolvedActingPlayerId];
                                  const nextActingHand = effectiveNextPlayerCardsById[resolvedActingPlayerId];
                                  const changedIndices = findChangedHandIndices(previousActingHand, nextActingHand);
                                  const touchedIndices = touchedHandIndicesByPlayerId[resolvedActingPlayerId] ?? [];
                                  const normalizedTouchedIndex = touchedIndices.length === 1
                                      ? normalizeHandSlotIndex(touchedIndices[0], HAND_SIZE)
                                      : null;
                                  const resolvedTargetIndex =
                                      changedIndices.length > 0
                                          ? changedIndices[0]
                                          : normalizedTouchedIndex != null
                                              ? normalizedTouchedIndex
                                              : null;
                                  const targetAnchor = resolvedTargetIndex != null
                                      ? getCardAnchorByPlayerId(resolvedActingPlayerId, resolvedTargetIndex)
                                      : null;
                                  const discardAnchor = discardPileCardRef.current;
                                  const drawAnchor = drawPileCardRef.current;
                                  const sourceAnchor = pendingAnimation.source === "discard_pile"
                                      ? discardAnchor
                                      : drawAnchor;

                                  if (sourceAnchor && targetAnchor) {
                                      launchFlyingCardAnimation(sourceAnchor, targetAnchor, {
                                          hidden: pendingAnimation.source !== "discard_pile",
                                          value: pendingAnimation.cardValue,
                                      });
                                  }

                                  if (discardChanged && discardAnchor) {
                                      if (targetAnchor) {
                                          launchFlyingCardAnimation(targetAnchor, discardAnchor, {
                                              hidden: true,
                                          });
                                      } else if (pendingAnimation.source === "draw_pile" && drawAnchor) {
                                          // No changed/touched hand slot means this was likely an automatic
                                          // draw+discard timeout path; animate directly to discard.
                                          launchFlyingCardAnimation(drawAnchor, discardAnchor, {
                                              hidden: true,
                                          });
                                      }
                                  }

                                  if (pendingAnimation.source === "discard_pile" && pendingAnimation.cardValue != null) {
                                      setDiscardTopOverrideUntilClear(
                                          { value: pendingAnimation.cardValue, visibility: true, ability: "" },
                                          FLYING_CARD_ANIMATION_MS
                                      );
                                  } else {
                                      setDiscardTopOverrideUntilClear(null);
                                  }
                                  pendingRemoteDrawAnimationRef.current = null;
                              } else {
                                  setDiscardTopOverrideUntilClear(null);
                              }
                          }

                          if (
                              !handledByExplicitMoveEvent &&
                              canAnimateOtherPlayerMove &&
                              !previousDrawnCardPresent &&
                              !nextDrawnCardPresent &&
                              discardChanged
                          ) {
                              const resolvedActingPlayerId = actingPlayerId as number;
                              const previousActingHand = previousPlayerCardsById[resolvedActingPlayerId];
                              const nextActingHand = effectiveNextPlayerCardsById[resolvedActingPlayerId];
                              const changedIndices = findChangedHandIndices(previousActingHand, nextActingHand);
                              const touchedIndices = touchedHandIndicesByPlayerId[resolvedActingPlayerId] ?? [];
                              if (changedIndices.length === 0 && touchedIndices.length === 0) {
                                  const drawAnchor = drawPileCardRef.current;
                                  const discardAnchor = discardPileCardRef.current;
                                  if (drawAnchor && discardAnchor) {
                                      launchFlyingCardAnimation(drawAnchor, discardAnchor, {
                                          hidden: true,
                                      });
                                  }
                                  pendingRemoteDrawAnimationRef.current = null;
                                  setDiscardTopOverrideUntilClear(null);
                              }
                          }

                          if (Object.keys(parsedNextPlayerCardsById).length > 0) {
                              setPlayerCardsById(parsedNextPlayerCardsById);
                              playerCardsByIdRef.current = parsedNextPlayerCardsById;
                          }

                          if (discardTopUpdate.hasDiscardTop) {
                              setDiscardTopCard(discardTopUpdate.card);
                              discardTopCardRef.current = discardTopUpdate.card;
                          }

                          drawnCardPresentRef.current = nextDrawnCardPresent;

                          const nextTurnUserId = extractCurrentTurnUserId(payload);
                          if (nextTurnUserId != null) {
                              setCurrentTurnUserId((previous) =>
                                  previous === nextTurnUserId ? previous : nextTurnUserId
                              );
                              currentTurnUserIdRef.current = nextTurnUserId;
                          }
                      } catch {
                          /* ignore malformed payload */
                      }
                  });
              },
              onStompError: () => {
                  setSocketSynced(false);
              },
              onWebSocketClose: () => {
                  setSocketSynced(false);
              },
              onWebSocketError: () => {
                  setSocketSynced(false);
              },
          });

          client.activate();
          return () => {
              void client.deactivate();
          };
      }, [
          token,
          gameId,
          selfUserId,
          seatAssignments.topOpponentId,
          seatAssignments.leftOpponentId,
          seatAssignments.rightOpponentId,
      ]);

      useEffect(() => {
          if (!token || !gameId) {
              return;
          }

          const markActive = () => {
              lastActivityMsRef.current = Date.now();
          };
          const markActiveOnVisible = () => {
              if (document.visibilityState === "visible") {
                  markActive();
              }
          };

          markActive();
          window.addEventListener("pointerdown", markActive, { passive: true });
          window.addEventListener("keydown", markActive, { passive: true });
          window.addEventListener("focus", markActive, { passive: true });
          document.addEventListener("visibilitychange", markActiveOnVisible);

          return () => {
              window.removeEventListener("pointerdown", markActive);
              window.removeEventListener("keydown", markActive);
              window.removeEventListener("focus", markActive);
              document.removeEventListener("visibilitychange", markActiveOnVisible);
          };
      }, [token, gameId]);

      useEffect(() => {
          if (!token || !gameId) {
              return;
          }

          const tick = () => {
              const elapsedSeconds = Math.floor((Date.now() - lastActivityMsRef.current) / 1000);
              setAfkRemainingSeconds(Math.max(0, afkTimeoutSeconds - elapsedSeconds));
          };

          tick();
          const intervalId = window.setInterval(tick, 1000);
          return () => {
              window.clearInterval(intervalId);
          };
      }, [token, gameId, afkTimeoutSeconds]);

      useEffect(() => {
          if (gameStatus === "initial_peek") {
              startPeekPhase();
              return;
          }

          setIsPeekPhase(false);
          resetPeekSelection();
      }, [gameStatus]);

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

      useEffect(() => {
          if (!gameId || !token) {
              return;
          }

          let active = true;
          const loadRuntimeConfig = async () => {
              try {
                  const config = await apiService.getWithAuth<GameRuntimeConfigResponse>(
                      `/games/${gameId}/config`,
                      token
                  );
                  if (!active) {
                      return;
                  }
                  const nextTurnSeconds = Number(config?.turnSeconds);
                  if (Number.isFinite(nextTurnSeconds) && nextTurnSeconds > 0) {
                      setTurnDurationSeconds(Math.floor(nextTurnSeconds));
                  }
                  const nextInitialPeekSeconds = Number(config?.initialPeekSeconds);
                  if (Number.isFinite(nextInitialPeekSeconds) && nextInitialPeekSeconds > 0) {
                      setInitialPeekDurationSeconds(Math.floor(nextInitialPeekSeconds));
                  }
                  const nextAbilityRevealSeconds = Number(config?.abilityRevealSeconds);
                  if (Number.isFinite(nextAbilityRevealSeconds) && nextAbilityRevealSeconds > 0) {
                      setAbilityRevealDurationSeconds(Math.floor(nextAbilityRevealSeconds));
                  }
                  const nextRematchSeconds = Number(config?.rematchDecisionSeconds);
                  if (Number.isFinite(nextRematchSeconds) && nextRematchSeconds > 0) {
                      setRematchDecisionDuration(Math.floor(nextRematchSeconds));
                  }
                  const nextAfkTimeout = Number(config?.afkTimeoutSeconds);
                  if (Number.isFinite(nextAfkTimeout) && nextAfkTimeout > 0) {
                      setAfkTimeoutSeconds(Math.floor(nextAfkTimeout));
                  }
              } catch {
                  // keep defaults if config fetch fails
              }
          };
          void loadRuntimeConfig();

          return () => {
              active = false;
          };
      }, [apiService, gameId, token]);

      useEffect(() => {
          if (!isAwaitingRematchDecision || !gameId || !token) {
              setRematchCountdown(0);
              setMyRematchDecision(null);
              rematchDeadlineMsRef.current = null;
              return;
          }

          let active = true;
          const loadRematchConfig = async () => {
              try {
                  const response = await apiService.getWithAuth<{ decisionSeconds?: number }>(
                      `/games/${gameId}/rematch/config`,
                      token
                  );
                  const configuredSeconds = Number(response?.decisionSeconds);
                  if (active && Number.isFinite(configuredSeconds) && configuredSeconds > 0) {
                      setRematchDecisionDuration(Math.floor(configuredSeconds));
                  }
              } catch {
                  // fallback to last known local default
              }
          };
          void loadRematchConfig();

          rematchDeadlineMsRef.current = Date.now() + (rematchDecisionDuration * 1000);
          const tick = () => {
              const deadline = rematchDeadlineMsRef.current;
              if (deadline == null) {
                  setRematchCountdown(0);
                  return;
              }
              const remainingMs = Math.max(0, deadline - Date.now());
              setRematchCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));
          };
          tick();
          const intervalId = window.setInterval(tick, 250);

          return () => {
              active = false;
              window.clearInterval(intervalId);
          };
      }, [apiService, gameId, token, isAwaitingRematchDecision, rematchDecisionDuration]);

      useEffect(() => {
          if (gameStatus !== "round_ended" || !gameId || !token) {
              return;
          }

          let active = true;
          const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
          const navigateAfterRound = async () => {
              // Rematch lobby assignment can be slightly delayed after ROUND_ENDED.
              // Retry briefly before falling back to dashboard.
              for (let attempt = 0; attempt < 10; attempt += 1) {
                  try {
                      const response = await apiService.getWithAuth<{ sessionId?: string }>(
                          `/games/${gameId}/post-round-lobby`,
                          token
                      );
                      if (!active) {
                          return;
                      }
                      const waitingSessionId = String(response?.sessionId ?? "").trim();
                      if (waitingSessionId) {
                          setActiveSessionId(waitingSessionId);
                          router.replace(`/lobby/${encodeURIComponent(waitingSessionId)}`);
                          return;
                      }
                  } catch {
                      // continue to fallback checks below
                  }

                  try {
                      const myWaitingLobby = await apiService.getWithAuth<{ sessionId?: string }>(
                          "/lobbies/my/waiting",
                          token
                      );
                      if (!active) {
                          return;
                      }
                      const myWaitingSessionId = String(myWaitingLobby?.sessionId ?? "").trim();
                      if (myWaitingSessionId) {
                          setActiveSessionId(myWaitingSessionId);
                          router.replace(`/lobby/${encodeURIComponent(myWaitingSessionId)}`);
                          return;
                      }
                  } catch {
                      // still waiting for backend handoff
                  }

                  if (attempt < 9) {
                      await sleep(800);
                  }
              }

              if (active) {
                  router.replace("/dashboard");
              }
          };

          void navigateAfterRound();
          return () => {
              active = false;
          };
      }, [apiService, gameStatus, gameId, token, router, setActiveSessionId]);

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
      const isCurrentTurnMine = selfUserId != null && currentTurnUserId === selfUserId;
      const isMyTurnUi = isCurrentTurnMine && !isPeekPhase && !isAwaitingRematchDecision;
      const afkWarningLeadSeconds = getAfkWarningLeadSeconds(afkTimeoutSeconds);
      const showAfkWarning =
          !isAwaitingRematchDecision &&
          gameStatus !== "round_ended" &&
          afkRemainingSeconds <= afkWarningLeadSeconds;
      useEffect(() => {
          if (!showTurnCountdown) {
              setTurnTimeLeft(turnDurationSeconds);
              turnDeadlineMsRef.current = null;
              return;
          }

          turnDeadlineMsRef.current = Date.now() + (turnDurationSeconds * 1000);
          const tick = () => {
              const deadline = turnDeadlineMsRef.current;
              if (deadline == null) {
                  setTurnTimeLeft(turnDurationSeconds);
                  return;
              }
              const remainingMs = Math.max(0, deadline - Date.now());
              setTurnTimeLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
          };
          tick();
          const intervalId = window.setInterval(tick, 250);

          return () => {
              window.clearInterval(intervalId);
          };
      }, [showTurnCountdown, currentTurnUserId, turnDurationSeconds]);

      useEffect(() => {
          const fetchDrawnCard = async () => {
              if (!isCurrentTurnMine || !gameId || !token) {
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
      }, [apiService, gameId, token, isCurrentTurnMine]);

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
    !isCurrentTurnMine ||
    !isRoundActive ||
    isPeekPhase ||
    isDrawingFromPile ||
    isDrawingFromDiscardPile ||
    isSwappingDrawnCard ||
    isDiscardingDrawnCard ||
    isAbilityPending;
const canDrawFromPile = !isStandardTurnActionBlocked && !drawnCard;
const canDrawFromDiscardPile = !isStandardTurnActionBlocked && !drawnCard;
const hasDrawnTurnCardInHand = !!drawnCard && selectedDrawSource !== null;
const canSwapDrawnCardWithHand =
    !isStandardTurnActionBlocked &&
    hasDrawnTurnCardInHand;
const canDiscardDrawnCard =
    !isStandardTurnActionBlocked &&
    hasDrawnTurnCardInHand &&
    selectedDrawSource === "draw_pile";
const showDrawPileAsRevealedCard = selectedDrawSource === "draw_pile" && !!drawnCard;
const isDrawPileSelectedForTurnAction =
    hasDrawnTurnCardInHand && selectedDrawSource === "draw_pile";
const isDiscardPileSelectedForTurnAction =
    hasDrawnTurnCardInHand && selectedDrawSource === "discard_pile";
const shouldHighlightPileChoice = canDrawFromPile || canDrawFromDiscardPile;
const shouldHighlightDiscardPileAsAction = shouldHighlightPileChoice || canDiscardDrawnCard;
const shouldHighlightOwnCardsForTurnSwap = canSwapDrawnCardWithHand;
const visibleDiscardPileCard =
    isDiscardPileSelectedForTurnAction && drawnCard
        ? drawnCard
        : (discardTopAnimationOverride ?? discardTopCard);
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
const [isUseAbilitySelected, setIsUseAbilitySelected] = useState<boolean>(false);
const seenAbilityPhaseRef = useRef<string>("");
const canShowAbilityChoiceButtons =
    isAbilityPending &&
    isCurrentTurnMine &&
    (isAbilityChoicePending || isUseAbilitySelected);
const abilityPhaseLabel = gameStatus === "ability_peek_self"
    ? "PEEK"
    : gameStatus === "ability_peek_opponent"
        ? "SPY"
        : gameStatus === "ability_swap"
            ? "SWAP"
            : "Ability";
const canInteractWithAbilityTargets =
    isAbilityPending &&
    isCurrentTurnMine &&
    !isSubmittingAbility &&
    isUseAbilitySelected &&
    !isSkippingAbilityChoice;

// reset the ability selection when the phase ends
const resetAbilitySelection = () => {
    setAbilitySelectedOwnCardIndex(null);
    setAbilitySelectedOpponentId(null);
    setAbilitySelectedOpponentCardIndex(null);
    setIsSubmittingAbility(false);
};

// find specific opponent card for animation
const getOpponentCardAnchor = (opponentId: number, cardIndex: number): HTMLDivElement | null => {
    if (seatAssignments.topOpponentId === opponentId) {
        return topSeatCardRefs.current[cardIndex] ?? null;
    }
    if (seatAssignments.leftOpponentId === opponentId) {
        return leftSeatCardRefs.current[cardIndex] ?? null;
    }
    if (seatAssignments.rightOpponentId === opponentId) {
        return rightSeatCardRefs.current[cardIndex] ?? null;
    }
    return null;
};

// #28: reset ability state when phase changes and require explicit use/skip choice
useEffect(() => {
    if (!isAbilityPending) {
        seenAbilityPhaseRef.current = "";
        setIsAbilityChoicePending(false);
        setIsUseAbilitySelected(false);
        setIsSkippingAbilityChoice(false);
        resetAbilitySelection();
        return;
    }

    const abilityTurnKey = `${currentTurnUserId ?? "none"}:${gameStatus}`;
    if (isCurrentTurnMine && seenAbilityPhaseRef.current !== abilityTurnKey) {
        seenAbilityPhaseRef.current = abilityTurnKey;
        setIsAbilityChoicePending(true);
        setIsUseAbilitySelected(false);
    }
}, [isAbilityPending, isCurrentTurnMine, currentTurnUserId, gameStatus]);

useEffect(() => {
    if (isPeekPhase) {
        return;
    }
    if (isCurrentTurnMine && gameStatus === "ability_peek_self" && isUseAbilitySelected) {
        return;
    }

    clearAbilityPeekHideTimer();
    setPeekVisibleCards(createHiddenPeekCards());
}, [isPeekPhase, isCurrentTurnMine, gameStatus, currentTurnUserId, isUseAbilitySelected]);

// #28: handle own card click during ability phase
const handleAbilityOwnCardClick = (cardIndex: number) => {
    if (!canInteractWithAbilityTargets || !gameId || !token) return;

    if (gameStatus === "ability_peek_self") {
        // 7/8: peek own card -> POST immediately
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
            clearAbilityPeekHideTimer();
            setPeekVisibleCards(() => {
                const next = createHiddenPeekCards();
                next[cardIndex] = true;
                return next;
            });
            abilityPeekHideTimeoutRef.current = window.setTimeout(() => {
                setPeekVisibleCards(createHiddenPeekCards());
                abilityPeekHideTimeoutRef.current = null;
            }, Math.max(1000, abilityRevealDurationSeconds * 1000));
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
        const ownCardIndex = abilitySelectedOwnCardIndex;
        const ownCardAnchor = ownHandCardRefs.current[ownCardIndex] ?? null;
        const opponentCardAnchor = getOpponentCardAnchor(opponentId, cardIndex);

        setIsSubmittingAbility(true);
        void apiService.postWithAuth(
            `/games/${gameId}/abilities/swap`,
            {
                ownCardIndex,
                targetUserId: opponentId,
                targetCardIndex: cardIndex,
            },
            token
        ).then(() => {
            if (ownCardAnchor && opponentCardAnchor) {
                launchFlyingCardAnimation(ownCardAnchor, opponentCardAnchor, {
                    hidden: true,
                });
                launchFlyingCardAnimation(opponentCardAnchor, ownCardAnchor, {
                    hidden: true,
                });
            }
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
        // Use authoritative server state on explicit refreshes.
        clearDiscardTopOverrideTimer();
        setDiscardTopAnimationOverride(null);
    } catch (error) {
        console.error("Failed to refresh discard pile top card:", error);
    }
};

useEffect(() => {
    const authToken = token.trim();
    if (!gameId || !authToken) {
        return;
    }

    const resyncOnFocus = async () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            return;
        }

        lastActivityMsRef.current = Date.now();
        clearDiscardTopOverrideTimer();
        setDiscardTopAnimationOverride(null);

        // Keep local view aligned after tab/background throttling without waiting for a manual click.
        await Promise.allSettled([
            refreshOwnHand(gameId, authToken),
            refreshDiscardPileTop(gameId),
            apiService
                .getWithAuth<unknown>(`/games/${gameId}/drawn-card`, authToken)
                .then((rawCard) => {
                    const nextDrawnCard = toValidCardOrNull(rawCard);
                    setDrawnCard(nextDrawnCard);
                    if (!nextDrawnCard) {
                        setSelectedDrawSource(null);
                        setHasChosenDrawSourceThisTurn(false);
                    }
                })
                .catch(() => {
                    setDrawnCard(null);
                    setSelectedDrawSource(null);
                    setHasChosenDrawSourceThisTurn(false);
                }),
            fetch(`${getApiDomain()}/heartbeat`, {
                method: "POST",
                headers: { Authorization: authToken },
            }),
        ]);
    };

    const handleVisibilityChange = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
            void resyncOnFocus();
        }
    };

    void resyncOnFocus();
    window.addEventListener("focus", resyncOnFocus, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
        window.removeEventListener("focus", resyncOnFocus);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
}, [apiService, gameId, token]);

useEffect(() => {
    if (!gameId) {
        return;
    }

    const resyncDiscardPileTop = () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            return;
        }
        void refreshDiscardPileTop(gameId);
    };

    const intervalId = window.setInterval(resyncDiscardPileTop, 6000);
    window.addEventListener("focus", resyncDiscardPileTop, { passive: true });
    document.addEventListener("visibilitychange", resyncDiscardPileTop);
    return () => {
        window.clearInterval(intervalId);
        window.removeEventListener("focus", resyncDiscardPileTop);
        document.removeEventListener("visibilitychange", resyncDiscardPileTop);
    };
}, [gameId]);

const clearFlyingCardTimer = () => {
    if (flyingCardTimeoutsRef.current.length === 0) {
        return;
    }

    for (const timeoutId of flyingCardTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
    }
    flyingCardTimeoutsRef.current = [];
};

const clearDiscardRevealTimer = () => {
    if (discardRevealTimeoutRef.current != null) {
        window.clearTimeout(discardRevealTimeoutRef.current);
        discardRevealTimeoutRef.current = null;
    }
};

const triggerDiscardFlipReveal = () => {
    clearDiscardRevealTimer();
    setIsDiscardPileTemporarilyHidden(true);
    discardRevealTimeoutRef.current = window.setTimeout(() => {
        setIsDiscardPileTemporarilyHidden(false);
        discardRevealTimeoutRef.current = null;
    }, 240);
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
    }, FLYING_CARD_ANIMATION_MS);
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
            triggerDiscardFlipReveal();
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

const swapDiscardPileTopWithHand = (targetCardIndex: number) => {
    if (!canDrawFromDiscardPile || !gameId || !token) {
        return;
    }

    const sourceElement = discardPileCardRef.current;
    const targetElement = ownHandCardRefs.current[targetCardIndex] ?? null;
    const swappedOutHandCard = myHand[targetCardIndex];
    const swappedOutHandCardHidden = !peekVisibleCards[targetCardIndex];
    const swappedOutSourceElement = ownHandCardRefs.current[targetCardIndex] ?? null;
    const swappedOutTargetElement = discardPileCardRef.current;
    const discardTopValue = discardTopCard?.value;

    setIsSwappingDrawnCard(true);
    void apiService.postWithAuth(
        `/games/${gameId}/discard-pile/swap`,
        { targetCardIndex },
        token
    ).then(async () => {
        if (sourceElement && targetElement) {
            launchFlyingCardAnimation(sourceElement, targetElement, {
                hidden: false,
                value: discardTopValue,
            });
        }
        if (swappedOutHandCard && swappedOutSourceElement && swappedOutTargetElement) {
            launchFlyingCardAnimation(swappedOutSourceElement, swappedOutTargetElement, {
                hidden: swappedOutHandCardHidden,
                value: swappedOutHandCard.value,
            });
        }
        triggerDiscardFlipReveal();
        await Promise.all([
            refreshOwnHand(gameId, token),
            refreshDiscardPileTop(gameId),
        ]);
    }).catch((error) => {
        console.error("Failed to swap discard pile top card:", error);
    }).finally(() => {
        setIsSwappingDrawnCard(false);
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
const eventHasDiscardPileSwapCardDrag = (event: React.DragEvent<HTMLDivElement>) =>
    isDraggingDiscardPileSwapCard || Array.from(event.dataTransfer.types).includes(DISCARD_PILE_SWAP_DRAG_MIME);

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
    setIsDraggingDiscardPileSwapCard(false);
    setDragOverOwnCardIndex(null);
    setIsDragOverDiscardPile(false);
};

const handleDiscardPileCardDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDiscardPileSelectedForTurnAction && canDragSelectedTurnCard) {
        handleTurnCardDragStart(event);
        return;
    }

    if (!canDrawFromDiscardPile || !gameId || !token) {
        event.preventDefault();
        return;
    }

    setIsDraggingTurnCard(false);
    setIsDraggingDiscardPileSwapCard(true);
    setDragOverOwnCardIndex(null);
    setIsDragOverDiscardPile(false);
    event.dataTransfer.setData(DISCARD_PILE_SWAP_DRAG_MIME, "discard-pile-swap-card");
    event.dataTransfer.effectAllowed = "move";
};

const handleOwnCardDragOver = (event: React.DragEvent<HTMLDivElement>, ownCardIndex: number) => {
    const swappingDrawnCard = canSwapDrawnCardWithHand && eventHasTurnCardDrag(event);
    const swappingDiscardTop = canDrawFromDiscardPile && eventHasDiscardPileSwapCardDrag(event);
    if (!swappingDrawnCard && !swappingDiscardTop) {
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
    const swappingDrawnCard = canSwapDrawnCardWithHand && eventHasTurnCardDrag(event);
    const swappingDiscardTop = canDrawFromDiscardPile && eventHasDiscardPileSwapCardDrag(event);
    if (!swappingDrawnCard && !swappingDiscardTop) {
        return;
    }

    event.preventDefault();
    setIsDraggingTurnCard(false);
    setIsDraggingDiscardPileSwapCard(false);
    setDragOverOwnCardIndex(null);
    setIsDragOverDiscardPile(false);
    if (swappingDrawnCard) {
        swapDrawnCardWithHand(ownCardIndex);
        return;
    }
    swapDiscardPileTopWithHand(ownCardIndex);
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
    setIsDraggingDiscardPileSwapCard(false);
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
    setIsUseAbilitySelected(true);
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

const canCallCabo =
    isCurrentTurnMine &&
    isRoundActive &&
    !isCaboCalledGlobal &&
    !isPeekPhase &&
    !isAbilityPending &&
    !drawnCard &&
    !isDrawingFromPile &&
    !isDrawingFromDiscardPile &&
    !isSwappingDrawnCard &&
    !isDiscardingDrawnCard &&
    !isCallingCabo &&
    !isAwaitingRematchDecision;

const callCabo = () => {
    if (!canCallCabo || !gameId || !token || isCaboCalledGlobal) {
        return;
    }
    if (typeof window !== "undefined") {
        const confirmed = window.confirm(
            "Are you sure you want to call Cabo? This ends your turn immediately and starts the last round."
        );
        if (!confirmed) {
            return;
        }
    }

    setIsCallingCabo(true);
    void apiService.postWithAuth<void>(
        `/games/${gameId}/moves/cabo`,
        {},
        token
    ).catch((error) => {
        console.error("Failed to call Cabo:", error);
    }).finally(() => {
        setIsCallingCabo(false);
    });
};

const submitRematchChoice = (decision: "CONTINUE" | "FRESH" | "NONE") => {
    if (!isAwaitingRematchDecision || !gameId || !token || isSubmittingRematchDecision || myRematchDecision !== null) {
        return;
    }

    setIsSubmittingRematchDecision(true);
    void apiService.postWithAuth<void>(
        `/games/${gameId}/rematch/decision`,
        { decision },
        token
    ).then(() => {
        setMyRematchDecision(decision);
    }).catch((error) => {
        console.error("Failed to submit rematch decision:", error);
    }).finally(() => {
        setIsSubmittingRematchDecision(false);
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
        setIsDraggingDiscardPileSwapCard(false);
        setDragOverOwnCardIndex(null);
        setIsDragOverDiscardPile(false);
    }
}, [canDragSelectedTurnCard]);

useEffect(() => {
    return () => {
        clearFlyingCardTimer();
        clearDiscardRevealTimer();
        clearAbilityPeekHideTimer();
        clearDiscardTopOverrideTimer();
        pendingRemoteDrawAnimationRef.current = null;
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
            return `${abilityPhaseLabel}: ${abilityPhaseLabel} or End Turn ${suffix}`;
        }
        if (gameStatus === "ability_peek_self") {
            return `Peek ability: Choose 1 of your own cards! ${suffix}`;
        }
        if (gameStatus === "ability_peek_opponent") {
            return `Spy ability: Choose 1 opponent card! ${suffix}`;
        }
        if (gameStatus === "ability_swap") {
            if (abilitySelectedOwnCardIndex == null) {
                return `Swap ability: Choose 1 of your own cards! ${suffix}`;
            }
            return `Swap ability: Choose 1 opponent card! ${suffix}`;
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
    isUseAbilitySelected,
]);

const playerListRows = tablePlayerIds.map((id) => {
          const fallbackLabel = selfUserId != null && id === selfUserId ? "You" : `Player ${id}`;
          const label = playerNamesById[id] ?? fallbackLabel;
          const isActive = !isPeekPhase && currentTurnUserId != null && currentTurnUserId === id;
          const isTimedOut = timedOutPlayerIds.includes(id);
          return {
              id,
              label,
              isActive,
              isTimedOut,
          };
      });

      return (
          <div className="cabo-background">
              <div className="game-overlay">
                  <div className="game-player-list" aria-label="Players in game">
                      {playerListRows.map((player) => (
                          <div
                              key={player.id}
                              className={`game-player-list-item${player.isActive ? " active" : ""}${player.isTimedOut ? " timedout" : ""}`}
                          >
                              <span>{player.label}</span>
                              {player.isActive && showTurnCountdown && (
                                  <span className="game-player-list-timer">{turnTimeLeft}s</span>
                              )}
                          </div>
                      ))}
                  </div>

                  {isAwaitingRematchDecision && (
                      <div className="game-rematch-overlay" role="dialog" aria-modal="true" aria-live="polite">
                          <div className="game-rematch-card">
                              <h2 className="game-rematch-title">Round Finished</h2>
                              <p className="game-rematch-text">
                                  Rematch decision closes in{" "}
                                  <span className="game-rematch-countdown">{rematchCountdown}s</span>
                              </p>
                              <p className="game-rematch-subtext">
                                  Continue keeps the same lobby code. Fresh creates a new lobby code.
                              </p>
                              {myRematchDecision != null && (
                                  <p className="game-rematch-choice">
                                      You chose: {
                                          myRematchDecision === "CONTINUE"
                                              ? "Rematch (Continue Round Count)"
                                              : myRematchDecision === "FRESH"
                                                  ? "Rematch (Fresh Game)"
                                                  : "No Rematch"
                                      }.
                                      Waiting for other players...
                                  </p>
                              )}
                              <div className="game-rematch-actions">
                                  <Button
                                      type={myRematchDecision === "CONTINUE" ? "primary" : "default"}
                                      disabled={myRematchDecision !== null || isSubmittingRematchDecision}
                                      loading={isSubmittingRematchDecision && myRematchDecision === null}
                                      onClick={() => submitRematchChoice("CONTINUE")}
                                  >
                                      Rematch (Continue)
                                  </Button>
                                  <Button
                                      type={myRematchDecision === "FRESH" ? "primary" : "default"}
                                      disabled={myRematchDecision !== null || isSubmittingRematchDecision}
                                      onClick={() => submitRematchChoice("FRESH")}
                                  >
                                      Rematch (Fresh)
                                  </Button>
                                  <Button
                                      type={myRematchDecision === "NONE" ? "primary" : "default"}
                                      danger
                                      disabled={myRematchDecision !== null || isSubmittingRematchDecision}
                                      onClick={() => submitRematchChoice("NONE")}
                                  >
                                      No Rematch
                                  </Button>
                              </div>
                          </div>
                      </div>
                  )}

                  {!socketSynced && gameStatus !== "initial_peek" && (
                      <div className="game-rematch-overlay" role="status" aria-live="polite">
                          <div className="game-rematch-card">
                              <h2 className="game-rematch-title">Resyncing</h2>
                              <p className="game-rematch-text">
                                  Please wait until the current player&apos;s turn is finished.
                              </p>
                          </div>
                      </div>
                  )}

                  {showAfkWarning && (
                      <div className="game-rematch-overlay" role="status" aria-live="polite">
                          <div className="game-rematch-card">
                              <h2 className="game-rematch-title">AFK Warning</h2>
                              <p className="game-rematch-text">
                                  Inactivity timeout in{" "}
                                  <span className="game-rematch-countdown">{afkRemainingSeconds}s</span>
                              </p>
                              <p className="game-rematch-subtext">
                                  Move your mouse, press a key, or return focus to avoid auto timeout.
                              </p>
                          </div>
                      </div>
                  )}

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
                        duration={initialPeekDurationSeconds}
                      />
                  )}

                  {/* TOP CENTER */}
                  {seatAssignments.topOpponentId != null && (
                      <div className="top-cards opponent-seat-top">
                          <div className="game-opponent-seat-cards game-opponent-seat-cards-top">
                              {topSeatDisplayCards.map((card, displayIndex) => {
                                  const slotIndex =
                                      normalizeHandSlotIndex(card.position, HAND_SIZE) ??
                                      (HAND_SIZE - 1 - displayIndex);
                                  return (
                                      <div
                                          key={`top-${slotIndex}`}
                                          ref={(element) => {
                                              topSeatCardRefs.current[slotIndex] = element;
                                          }}
                                          className="game-opponent-card-anchor"
                                      >
                                          <CardComponent
                                              hidden={card.faceDown}
                                              value={card.value}
                                              size="small"
                                              // #28: highlight opponent cards during ability phase
                                              onClick={() => {
                                                  if (canInteractWithAbilityTargets && seatAssignments.topOpponentId != null) {
                                                      handleAbilityOpponentCardClick(seatAssignments.topOpponentId, slotIndex);
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
                                      </div>
                                  );
                              })}
                          </div>
                          <div
                              className={`game-opponent-seat-name${
                                  currentTurnUserId === seatAssignments.topOpponentId ? " active" : ""
                              }`}
                              title={playerNamesById[seatAssignments.topOpponentId] ?? `Player ${seatAssignments.topOpponentId}`}
                          >
                              {playerNamesById[seatAssignments.topOpponentId] ?? `Player ${seatAssignments.topOpponentId}`}
                          </div>
                      </div>
                  )}

                  {/* LEFT SIDE */}
                  {seatAssignments.leftOpponentId != null && (
                      <div className="left-cards opponent-seat-left">
                          <div className="game-opponent-seat-cards game-opponent-seat-cards-left">
                              {leftSeatCards.map((card, index) => {
                                  const slotIndex = normalizeHandSlotIndex(card.position, HAND_SIZE) ?? index;
                                  return (
                                      <div
                                          key={`left-${slotIndex}`}
                                          ref={(element) => {
                                              leftSeatCardRefs.current[slotIndex] = element;
                                          }}
                                          className="game-opponent-card-anchor"
                                      >
                                          <CardComponent
                                              hidden={card.faceDown}
                                              value={card.value}
                                              size="small"
                                              // #28: highlight opponent cards during ability phase
                                              onClick={() => {
                                                  if (canInteractWithAbilityTargets && seatAssignments.leftOpponentId != null) {
                                                      handleAbilityOpponentCardClick(seatAssignments.leftOpponentId, slotIndex);
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
                                      </div>
                                  );
                              })}
                          </div>
                          <div
                              className={`game-opponent-seat-name${
                                  currentTurnUserId === seatAssignments.leftOpponentId ? " active" : ""
                              }`}
                              title={playerNamesById[seatAssignments.leftOpponentId] ?? `Player ${seatAssignments.leftOpponentId}`}
                          >
                              {playerNamesById[seatAssignments.leftOpponentId] ?? `Player ${seatAssignments.leftOpponentId}`}
                          </div>
                      </div>
                  )}

                  {/* RIGHT SIDE */}
                  {seatAssignments.rightOpponentId != null && (
                      <div className="right-cards opponent-seat-right">
                          <div className="game-opponent-seat-cards game-opponent-seat-cards-right">
                              {rightSeatCards.map((card, index) => {
                                  const slotIndex = normalizeHandSlotIndex(card.position, HAND_SIZE) ?? index;
                                  return (
                                      <div
                                          key={`right-${slotIndex}`}
                                          ref={(element) => {
                                              rightSeatCardRefs.current[slotIndex] = element;
                                          }}
                                          className="game-opponent-card-anchor"
                                      >
                                          <CardComponent
                                              hidden={card.faceDown}
                                              value={card.value}
                                              size="small"
                                              // #28: highlight opponent cards during ability phase
                                              onClick={() => {
                                                  if (canInteractWithAbilityTargets && seatAssignments.rightOpponentId != null) {
                                                      handleAbilityOpponentCardClick(seatAssignments.rightOpponentId, slotIndex);
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
                                      </div>
                                  );
                              })}
                          </div>
                          <div
                              className={`game-opponent-seat-name${
                                  currentTurnUserId === seatAssignments.rightOpponentId ? " active" : ""
                              }`}
                              title={playerNamesById[seatAssignments.rightOpponentId] ?? `Player ${seatAssignments.rightOpponentId}`}
                          >
                              {playerNamesById[seatAssignments.rightOpponentId] ?? `Player ${seatAssignments.rightOpponentId}`}
                          </div>
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
                                  hidden={isDiscardPileTemporarilyHidden}
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
                                  draggable={canDrawFromDiscardPile || (isDiscardPileSelectedForTurnAction && canDragSelectedTurnCard)}
                                  onDragStart={handleDiscardPileCardDragStart}
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
                                      width: `${Math.max(0, Math.min(100, (turnTimeLeft / turnDurationSeconds) * 100))}%`,
                                  }}
                              />
                          </div>
                          <p className="game-turn-progress-label">{centerTurnActionLabel}</p>
                          {canShowAbilityChoiceButtons && (
                              <div className="game-turn-action-buttons">
                                  <Button
                                      type="default"
                                      className={`game-turn-action-btn game-turn-action-btn-use${
                                          isUseAbilitySelected ? " game-turn-action-btn-use-selected" : ""
                                      }`}
                                      disabled={isSkippingAbilityChoice || isSubmittingAbility}
                                      onClick={chooseUseAbility}
                                  >
                                      {abilityPhaseLabel === "Ability" ? "Use Ability" : abilityPhaseLabel}
                                  </Button>
                                  <Button
                                      type="default"
                                      className="game-turn-action-btn game-turn-action-btn-skip"
                                      disabled={isSkippingAbilityChoice || isSubmittingAbility || isUseAbilitySelected}
                                      loading={isSkippingAbilityChoice}
                                      onClick={skipAbilityChoice}
                                  >
                                      End Turn
                                  </Button>
                              </div>
                          )}
                      </div>
                  )}

                  {/* Buttons are only active if it is users turn */}
                  <div className="top-right-buttons">
                      <Button disabled={!isMyTurnUi}>Scores</Button>
                      <Button
                          type="primary"
                          className={isCaboCalledGlobal ? "game-cabo-called-btn" : ""}
                          disabled={!canCallCabo}
                          loading={isCallingCabo}
                          onClick={callCabo}
                      >
                          {isCaboCalledGlobal
                              ? (isCaboForcedByTimeoutGlobal
                                  ? <>Cabo Called (AFK/DC)!<br />Last Round!</>
                                  : <>Cabo Called!<br />Last Round!</>)
                              : "Call Cabo"}
                      </Button>
                  </div>

                  {/* Bottom cards are only itneractable when its users turn*/}
                  <div className={`bottom-cards${isMyTurnUi ? " game-current-player-highlight" : ""}`}>
                      {[...Array(HAND_SIZE)].map((_, i) => {
                          const card = myHand[i];
                          const isSelectedForSwap = abilitySelectedOwnCardIndex === i;
                          const isSwapChoosingOwnCard =
                              gameStatus === "ability_swap" && abilitySelectedOwnCardIndex == null;
                          // #28: highlight own cards during ability phase
                          const canClickOwnCardForAbility =
                              canInteractWithAbilityTargets && (
                                  gameStatus === "ability_peek_self" ||
                                  isSwapChoosingOwnCard
                              );
                          const isHighlightedForAbility =
                              canClickOwnCardForAbility ||
                              (canInteractWithAbilityTargets && gameStatus === "ability_swap" && isSelectedForSwap);
                          const isPeekCardSelected = isPeekPhase && peekVisibleCards[i];
                          const isPeekCardSelectable =
                            isPeekPhase &&
                            !isSubmittingInitialPeek &&
                            !isPeekCardSelected &&
                            revealedPeekCount < 2;
                          const isSwapDropTarget =
                              (isDraggingTurnCard || isDraggingDiscardPileSwapCard) &&
                              (canSwapDrawnCardWithHand || canDrawFromDiscardPile) &&
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
                              outline: (gameStatus === "ability_swap" && isSelectedForSwap)
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
                                        : !(canClickOwnCardForAbility || isHighlightedForAbility || canSwapDrawnCardWithHand)}
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
