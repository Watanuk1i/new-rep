// Универсальная карточная колода для мини-игр (Старшая карта, 21 очко, Найди джокера и т.п.).
// Карты унифицированы: масть + ранг + числовое value (для блэкджека и сравнения).

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface PlayingCard {
  /** Уникальный ID в колоде. */
  id: number;
  suit: Suit;
  rank: Rank;
  /** Числовое значение для сравнения. 2..10 = номинал, J=11, Q=12, K=13, A=14. Для 21 очка считаем отдельно. */
  value: number;
  /** Спецкарта-джокер. */
  joker?: boolean;
}

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 11, Q: 12, K: 13, A: 14,
};

/** 52-карточная стандартная колода. */
export function makeDeck52(): PlayingCard[] {
  const out: PlayingCard[] = [];
  let id = 0;
  for (const s of SUITS) for (const r of RANKS) {
    out.push({ id: id++, suit: s, rank: r, value: RANK_VALUE[r] });
  }
  return out;
}

/** 54-карточная колода с двумя джокерами. */
export function makeDeck54(): PlayingCard[] {
  const d = makeDeck52();
  d.push({ id: 52, suit: '♠', rank: 'A', value: 0, joker: true });
  d.push({ id: 53, suit: '♥', rank: 'A', value: 0, joker: true });
  return d;
}

/** Перемешать (Fisher–Yates). */
export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Очки карты в Блэкджеке. Тузы считаем как 11, корректировка делается отдельно. */
export function bjCardScore(card: PlayingCard): number {
  if (card.joker) return 0;
  if (card.rank === 'A') return 11;
  if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') return 10;
  return Number(card.rank);
}

/** Очки руки в Блэкджеке с учётом туз=1 при переборе. */
export function bjHandScore(cards: PlayingCard[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += bjCardScore(c);
    if (c.rank === 'A' && !c.joker) aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === '♥' || suit === '♦';
}

/** Текстовое представление карты, например «A♠». */
export function cardLabel(c: PlayingCard): string {
  if (c.joker) return '🃏';
  return `${c.rank}${c.suit}`;
}
