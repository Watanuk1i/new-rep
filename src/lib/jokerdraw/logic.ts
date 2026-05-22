// Чистая логика «Достать Джокера» — без I/O, без React.
// 3 режима: quick / long / advanced.

export type JokerDrawMode = 'quick' | 'long' | 'advanced';
export type JokerDrawCard = 'normal' | 'joker';

export const NORMAL_CARDS_START = 10;
export const JOKERS_START = 1;

export const TREASURY_FEE_RATE = 0.05;
export const SKIP_TURN_COST = 20_000;
export const HINT_COST = 30_000;

export const MIN_STAKE = 10_000;
export const MAX_STAKE = 100_000;

/** Свежая колода: 10 обычных + 1 джокер, перемешана. */
export function freshDeck(): JokerDrawCard[] {
  const deck: JokerDrawCard[] = [];
  for (let i = 0; i < NORMAL_CARDS_START; i++) deck.push('normal');
  for (let i = 0; i < JOKERS_START; i++) deck.push('joker');
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Шанс джокера в текущей колоде (0..100). */
export function jokerChance(deck: JokerDrawCard[]): number {
  if (deck.length === 0) return 0;
  const j = deck.filter(c => c === 'joker').length;
  return (j / deck.length) * 100;
}

/** Уровень риска по проценту. */
export function riskLevel(chance: number): 'low' | 'medium' | 'high' {
  if (chance < 15) return 'low';
  if (chance <= 30) return 'medium';
  return 'high';
}

/** Тянем карту из верха колоды; возвращаем её и новую колоду. */
export function drawFromDeck(deck: JokerDrawCard[]): { card: JokerDrawCard; rest: JokerDrawCard[] } {
  if (deck.length === 0) return { card: 'normal', rest: [] };
  const next = [...deck];
  const card = next.shift()!;
  return { card, rest: next };
}

/** Следующий активный игрок по списку turn_order, обходя выбывших. */
export function nextActiveIndex(
  turnOrder: string[],
  currentIdx: number,
  eliminated: Set<string>,
): number {
  if (turnOrder.length === 0) return -1;
  let i = currentIdx;
  for (let step = 0; step < turnOrder.length; step++) {
    i = (i + 1) % turnOrder.length;
    if (!eliminated.has(turnOrder[i])) return i;
  }
  return -1;
}

/** Применить комиссию казны к банку (5% по умолчанию). */
export function applyTreasuryFee(bank: number, rate = TREASURY_FEE_RATE): { fee: number; payout: number } {
  const fee = Math.floor(bank * rate);
  return { fee, payout: bank - fee };
}

/** Поделить выплату между N победителями. Остаток округления возвращаем (уйдёт в Казну). */
export function splitPayout(amount: number, count: number): { each: number; remainder: number } {
  if (count <= 0) return { each: 0, remainder: amount };
  const each = Math.floor(amount / count);
  const remainder = amount - each * count;
  return { each, remainder };
}
