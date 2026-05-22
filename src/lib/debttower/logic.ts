// Чистая логика «Долговой башни Мондо» — без I/O, без React.

export type DoorChoice = 'payment' | 'risk' | 'debt';
export type RiskResult = 'success' | 'fail';

// Денежные константы по ТЗ
export const ENTRY_FEE = 150_000;
export const PAYMENT_COST = 50_000;
export const RISK_SUCCESS_REWARD = 150_000;
export const RISK_FAIL_PENALTY = 150_000;
export const TOTAL_FLOORS = 5;

/** Размер долга по счёту повторных выборов «Долг» одним игроком: 1→100k, 2→200k, …, 5→500k. */
export const DEBT_AMOUNTS_BY_COUNT: Record<number, number> = {
  1: 100_000,
  2: 200_000,
  3: 300_000,
  4: 400_000,
  5: 500_000,
};

export const DEBT_OVERDUE_INTEREST = 0.20;
export const MONDO_COLLECTION_COMMISSION = 0.10;

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;  // было 8 — снижено под 11 человек

export interface FloorChoiceOutcome {
  /** Денежная дельта на этаже (только для риска и оплаты). */
  moneyDelta: number;
  /** Сумма созданного долга на этаже (только для choice='debt'). */
  debtCreated: number;
  /** Если выбор был 'risk' — результат броска. */
  riskResult?: RiskResult;
}

/**
 * Расчёт результата выбора одной двери.
 * @param choice    выбор игрока
 * @param prevDebtCount сколько раз ДО этого этажа игрок выбирал «Долг» (0..4)
 *                       (нужен, чтобы посчитать какой долг создаётся сейчас: prev+1 → DEBT_AMOUNTS_BY_COUNT)
 */
export function resolveChoice(choice: DoorChoice, prevDebtCount: number): FloorChoiceOutcome {
  if (choice === 'payment') {
    return { moneyDelta: -PAYMENT_COST, debtCreated: 0 };
  }
  if (choice === 'risk') {
    const success = Math.random() < 0.5;
    return {
      moneyDelta: success ? RISK_SUCCESS_REWARD : -RISK_FAIL_PENALTY,
      debtCreated: 0,
      riskResult: success ? 'success' : 'fail',
    };
  }
  // choice === 'debt'
  const nextCount = prevDebtCount + 1;
  const amount = DEBT_AMOUNTS_BY_COUNT[nextCount] ?? 0;
  return { moneyDelta: 0, debtCreated: amount };
}

export interface PlayerScore {
  totalProfit: number;
  totalLoss: number;
  totalDebt: number;
  debtChoiceCount: number;
  /** Сколько денег игрок суммарно потерял через долги (для tie-break). */
  cleanResult: number;
}

/** Применить дельту к скору игрока. */
export function applyOutcomeToScore(score: PlayerScore, out: FloorChoiceOutcome): PlayerScore {
  const next: PlayerScore = { ...score };
  if (out.moneyDelta > 0) next.totalProfit += out.moneyDelta;
  if (out.moneyDelta < 0) next.totalLoss += -out.moneyDelta;
  if (out.debtCreated > 0) {
    next.totalDebt += out.debtCreated;
    next.debtChoiceCount += 1;
  }
  next.cleanResult = next.totalProfit - next.totalLoss - next.totalDebt;
  return next;
}

export function emptyScore(): PlayerScore {
  return { totalProfit: 0, totalLoss: 0, totalDebt: 0, debtChoiceCount: 0, cleanResult: 0 };
}

/**
 * Победитель = max cleanResult.
 * Tie-break:
 *   1) меньше созданных долгов (totalDebt);
 *   2) больше текущий баланс из переданной карты;
 *   3) если всё ещё ничья — null (ведущий выбирает вручную).
 */
export function pickWinner(
  scores: Record<string, PlayerScore>,
  balances: Record<string, number>,
): string | null {
  const ids = Object.keys(scores);
  if (ids.length === 0) return null;

  let bestClean = -Infinity;
  for (const id of ids) {
    if (scores[id].cleanResult > bestClean) bestClean = scores[id].cleanResult;
  }
  let pool = ids.filter(id => scores[id].cleanResult === bestClean);
  if (pool.length === 1) return pool[0];

  let leastDebt = Infinity;
  for (const id of pool) {
    if (scores[id].totalDebt < leastDebt) leastDebt = scores[id].totalDebt;
  }
  pool = pool.filter(id => scores[id].totalDebt === leastDebt);
  if (pool.length === 1) return pool[0];

  let highestBalance = -Infinity;
  for (const id of pool) {
    if ((balances[id] ?? 0) > highestBalance) highestBalance = balances[id] ?? 0;
  }
  pool = pool.filter(id => (balances[id] ?? 0) === highestBalance);
  if (pool.length === 1) return pool[0];

  return null;
}
