// Чистая логика «Совета бунта» — без I/O, без React.

export type RebellionAction = 'rebellion' | 'betrayal' | 'neutral' | 'elite_deal';

// Денежные константы по ТЗ (обновлено под состав 11 игроков из patch_11)
export const REBELLION_PERSONAL_COST = 100_000;
export const REBELLION_FUND_GAIN    = 150_000;

export const BETRAYAL_REWARD       = 150_000;
export const BETRAYAL_FUND_DAMAGE  = 100_000;

export const ELITE_DEAL_REWARD             = 250_000;
export const ELITE_DEAL_SUCCESS_PENALTY    = 500_000;

// Снижено с 3M → 2M из-за уменьшенного состава.
export const REBELLION_SUCCESS_GOAL = 2_000_000;
export const TREASURY_DAMAGE_ON_SUCCESS = 2_000_000;

// Награда лояльным бунтарям — снижена под меньший призовой пул.
export const LOYAL_REBEL_REWARD          = 250_000;
export const LOYAL_REBEL_MIN_CHOICES     = 3;
export const BETRAYER_PENALTY_ON_SUCCESS = 300_000;
export const BETRAYER_MIN_CHOICES_FOR_PENALTY = 2;
export const REBEL_PENALTY_ON_FAILURE    = 300_000;

export const TOTAL_ROUNDS = 5;
// Минимум снижен — могут играть от 5 человек.
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 11;

export interface RoundResolution {
  /** Как изменился баланс игрока за раунд (через Казну). */
  perPlayerDelta: Record<string, number>;
  /** На сколько изменился Фонд бунта. */
  fundDelta: number;
  /** Счётчики по действиям. */
  rebellionCount: number;
  betrayalCount: number;
  neutralCount: number;
  eliteDealCount: number;
}

/**
 * Расчёт раунда.
 * @param choices карта participantId → действие
 * @param fundBefore текущий Фонд бунта (для clamp ≥ 0)
 *
 * Возвращает дельты игроков и реальный fundDelta (с учётом ограничения «не ниже нуля»).
 */
export function resolveRound(
  choices: Record<string, RebellionAction>,
  fundBefore: number,
): RoundResolution {
  const out: RoundResolution = {
    perPlayerDelta: {},
    fundDelta: 0,
    rebellionCount: 0,
    betrayalCount: 0,
    neutralCount: 0,
    eliteDealCount: 0,
  };
  let rawFundDelta = 0;
  for (const [pid, action] of Object.entries(choices)) {
    if (action === 'rebellion') {
      out.perPlayerDelta[pid] = -REBELLION_PERSONAL_COST;
      rawFundDelta += REBELLION_FUND_GAIN;
      out.rebellionCount += 1;
    } else if (action === 'betrayal') {
      out.perPlayerDelta[pid] = +BETRAYAL_REWARD;
      rawFundDelta -= BETRAYAL_FUND_DAMAGE;
      out.betrayalCount += 1;
    } else if (action === 'neutral') {
      out.perPlayerDelta[pid] = 0;
      out.neutralCount += 1;
    } else if (action === 'elite_deal') {
      out.perPlayerDelta[pid] = +ELITE_DEAL_REWARD;
      out.eliteDealCount += 1;
    }
  }
  // Применяем клипп Фонда: не уходить ниже 0
  const clampedAfter = Math.max(0, fundBefore + rawFundDelta);
  out.fundDelta = clampedAfter - fundBefore;
  return out;
}

export interface PlayerChoiceCounts {
  rebellion: number;
  betrayal: number;
  neutral: number;
  elite_deal: number;
}

export function emptyCounts(): PlayerChoiceCounts {
  return { rebellion: 0, betrayal: 0, neutral: 0, elite_deal: 0 };
}

/**
 * Финальные награды/штрафы по итогу 5 раундов.
 * Возвращает дельты для каждого игрока (через Казну).
 */
export function resolveFinal(
  counts: Record<string, PlayerChoiceCounts>,
  rebellionFund: number,
): { perPlayer: Record<string, number>; result: 'rebellion_success' | 'rebellion_failed'; throneUnlocked: boolean } {
  const perPlayer: Record<string, number> = {};
  const success = rebellionFund >= REBELLION_SUCCESS_GOAL;
  const result = success ? 'rebellion_success' : 'rebellion_failed';

  for (const [pid, c] of Object.entries(counts)) {
    let delta = 0;
    if (success) {
      // Успех бунта
      if (c.rebellion >= LOYAL_REBEL_MIN_CHOICES) delta += LOYAL_REBEL_REWARD;
      if (c.elite_deal >= 1) delta -= ELITE_DEAL_SUCCESS_PENALTY;
      if (c.betrayal >= BETRAYER_MIN_CHOICES_FOR_PENALTY) delta -= BETRAYER_PENALTY_ON_SUCCESS;
    } else {
      // Провал бунта
      if (c.rebellion >= LOYAL_REBEL_MIN_CHOICES) delta -= REBEL_PENALTY_ON_FAILURE;
      // Предатели и сделочники сохраняют выплаты
    }
    perPlayer[pid] = delta;
  }

  return { perPlayer, result, throneUnlocked: success };
}
