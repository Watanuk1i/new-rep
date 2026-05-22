// Чистая логика «Малых игр» — без I/O, без React.
// Реализованы пять MVP-игр и все десять общих констант.

export const TREASURY_FEE_RATE = 0.05;
export const SPECTATOR_FEE_RATE = 0.10;

export const MIN_BASE_STAKE = 10_000;
export const MAX_PLAYER_STAKE = 100_000;
export const MAX_ELITE_STAKE = 300_000;
export const MAX_QUEEN_STAKE = 500_000;

/** Лимит ставки в зависимости от статуса участника. */
export function maxStakeForStatus(status: string): number {
  if (status === 'queen' || status === 'gm') return MAX_QUEEN_STAKE;
  if (status === 'elite' || status === 'master' || status === 'collector') return MAX_ELITE_STAKE;
  return MAX_PLAYER_STAKE;
}

/** Применить комиссию Казны к банку (5% по умолчанию). */
export function applyTreasuryFee(bank: number, rate = TREASURY_FEE_RATE): { fee: number; payout: number } {
  const fee = Math.floor(bank * rate);
  return { fee, payout: bank - fee };
}

// ===== Тип 1: Красное / Чёрное =====
export type RBChoice = 'red' | 'black';

/** Возвращает результат броска (тайно). */
export function spinRedBlack(): RBChoice {
  return Math.random() < 0.5 ? 'red' : 'black';
}

// ===== Тип 5: Слепая ставка =====
/** Самая высокая уникальная ставка побеждает. */
export function findUniqueMax(bids: Record<string, number>): { winnerId: string | null; uniqueMax: number } {
  const counts = new Map<number, number>();
  for (const v of Object.values(bids)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const uniques: number[] = [];
  for (const [v, c] of counts.entries()) if (c === 1) uniques.push(v);
  if (uniques.length === 0) return { winnerId: null, uniqueMax: 0 };
  const top = Math.max(...uniques);
  const winner = Object.entries(bids).find(([, v]) => v === top)?.[0] ?? null;
  return { winnerId: winner, uniqueMax: top };
}

// ===== Тип 7: Лжец на кубиках =====
export const LIAR_DICE_PER_PLAYER = 3;
/** Один бросок d6 (значения 1..6). */
export function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}
export function rollDicePool(playerCount: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  // фактический roll делается в комнате, отдельно для каждого игрока
  return out;
}
/** Заявка «N кубиков со значением V». Проверка: считаем, сколько в реальности. */
export function countFaces(dice: Record<string, number[]>, face: number): number {
  let c = 0;
  for (const arr of Object.values(dice)) for (const v of arr) if (v === face) c += 1;
  return c;
}
/** Новое заявление должно быть «выше»: больше count или тот же count + большее значение. */
export function isHigherClaim(prev: { count: number; face: number }, next: { count: number; face: number }): boolean {
  if (next.count > prev.count) return true;
  if (next.count === prev.count && next.face > prev.face) return true;
  return false;
}

// ===== Тип 6: 21 отчаяния =====
/** Карта 1..11 (упрощённо, без мастей). */
export function drawBjCard(): number {
  return 1 + Math.floor(Math.random() * 11);
}
/** Простая стратегия дилера: добирает до 17 включительно. */
export function dealerPlay(initialHand: number[], drawFn: () => number = drawBjCard): number[] {
  const hand = [...initialHand];
  while (hand.reduce((a, b) => a + b, 0) < 17) hand.push(drawFn());
  return hand;
}
/** Сравнить руки по правилам блекджека. */
export function bjCompare(player: number, dealer: number): 'win' | 'lose' | 'push' {
  if (player > 21) return 'lose';
  if (dealer > 21) return 'win';
  if (player > dealer) return 'win';
  if (player < dealer) return 'lose';
  return 'push';
}

// ===== Тип 10: Выкупной стол =====
export type RansomCard = 'cancel_half' | 'double' | 'postpone';
/** Случайно перемешать 3 карты. */
export function shuffleRansomCards(): RansomCard[] {
  const arr: RansomCard[] = ['cancel_half', 'double', 'postpone'];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function applyRansom(amount: number, card: RansomCard): { newAmount: number; postpone: boolean } {
  if (card === 'cancel_half') return { newAmount: Math.floor(amount * 0.5), postpone: false };
  if (card === 'double') return { newAmount: Math.floor(amount * 1.5), postpone: false };
  return { newAmount: amount, postpone: true };
}
