// Логика игры «Бар лжецов» (Liar's Bar). Правила см. в claude_opus_liars_bar_near_original.txt.

export type LiarsTableCard = 'A' | 'K' | 'Q'; // Туз / Король / Дама
export type LiarsCardKind = 'A' | 'K' | 'Q' | 'J'; // J — Джокер

export interface LiarsBarState {
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  /** Активные участники (включая выбывших с флагом). */
  players: LiarsPlayer[];
  /** Карта стола текущего раунда. */
  table_card: LiarsTableCard;
  /** Колода (закрытая, оставшиеся карты). */
  deck: LiarsCardKind[];
  /** Сброс. */
  discard: LiarsCardKind[];
  /** Текущий ход (player.id). */
  turn_player_id: string | null;
  /** Текущая заявка после хода. */
  pending_play?: {
    player_id: string;
    cards: LiarsCardKind[];        // ЗАКРЫТЫЕ карты, которые игрок сыграл
    declared_count: number;         // сколько он заявил «карт стола»
  } | null;
  /** Револьверная проверка идёт. */
  pending_roulette?: {
    target_id: string;
    /** Кто кого назвал лжецом — для истории. */
    challenger_id?: string;
    reason: 'caught_lying' | 'wrong_accusation';
  } | null;
  /** Лимит ходов (для 1v1). */
  turn_limit?: number;
  turn_count: number;
  /** Карта стола может меняться при перераздаче. */
  round_index: number;
  bank: number;
  /** Победитель. */
  winner_id?: string | null;
  log: LiarsBarLog[];
}

export interface LiarsPlayer {
  id: string;
  name: string;
  hand: LiarsCardKind[];
  alive: boolean;
  stake_paid: number;
  /** Сколько раз прошёл револьверную проверку (для personal_chambers). */
  roulette_checks: number;
}

export interface LiarsBarLog {
  ts: number;
  text: string;
  /** Если true — публичное событие, иначе техническое. */
  pub: boolean;
}

export const ROULETTE_MODE: 'classic_random' | 'personal_chambers' = 'personal_chambers';

/** Шанс выбыть на N-й проверке (personal_chambers): 1/(7-N). */
export function eliminationChance(checkIndex: number): number {
  // 1-я проверка: 1/6, 2-я: 1/5 ... 6-я: 1/1
  const denominator = Math.max(1, 7 - checkIndex);
  return 1 / denominator;
}

/** Симуляция выстрела (true = выбыл). */
export function rouletteShot(checkIndex: number): boolean {
  const chance = eliminationChance(checkIndex);
  return Math.random() < chance;
}

/** Проверить заявление: все ли сыгранные карты соответствуют карте стола (или джокеры). */
export function isStatementTrue(cards: LiarsCardKind[], tableCard: LiarsTableCard): boolean {
  if (cards.length === 0) return false;
  return cards.every(c => c === tableCard || c === 'J');
}

/** Сделать колоду: 6 A, 6 K, 6 Q, 2 J = 20 карт. */
export function makeLiarsDeck(): LiarsCardKind[] {
  const out: LiarsCardKind[] = [];
  for (let i = 0; i < 6; i++) out.push('A', 'K', 'Q');
  out.push('J', 'J');
  // Перемешаем
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickTableCard(): LiarsTableCard {
  const arr: LiarsTableCard[] = ['A', 'K', 'Q'];
  return arr[Math.floor(Math.random() * arr.length)];
}

export function tableCardLabel(t: LiarsTableCard): string {
  return t === 'A' ? 'Туз' : t === 'K' ? 'Король' : 'Дама';
}

export function cardKindLabel(c: LiarsCardKind): string {
  return c === 'A' ? 'A' : c === 'K' ? 'K' : c === 'Q' ? 'Q' : '🃏';
}

/** Раздать карты игрокам по N штук. */
export function dealHands(deck: LiarsCardKind[], players: LiarsPlayer[], cardsPerPlayer: number): { deck: LiarsCardKind[]; players: LiarsPlayer[] } {
  const newDeck = [...deck];
  const newPlayers = players.map(p => {
    if (!p.alive) return p;
    const hand: LiarsCardKind[] = [];
    for (let i = 0; i < cardsPerPlayer && newDeck.length > 0; i++) {
      hand.push(newDeck.shift()!);
    }
    return { ...p, hand };
  });
  return { deck: newDeck, players: newPlayers };
}

/** Найти id следующего живого игрока после fromId. */
export function nextAliveId(players: LiarsPlayer[], fromId: string): string | null {
  const alive = players.filter(p => p.alive);
  if (alive.length === 0) return null;
  const idx = alive.findIndex(p => p.id === fromId);
  const next = alive[(idx + 1) % alive.length];
  return next?.id ?? null;
}

export const ENTRY_FEE_MIN = 50_000;
export const ENTRY_FEE_DEFAULT = 100_000;
export const ENTRY_FEE_MAX = 300_000;
export const CARDS_PER_PLAYER = 5;
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
