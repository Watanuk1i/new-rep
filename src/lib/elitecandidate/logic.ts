// Чистая логика «Испытание кандидата в Элиту».
// Кандидат получает фонд, выдаёт 3 приказа, потом — голосование участников.

export type CandidateOrderType =
  | 'collect_contribution' | 'risky_deal' | 'loyalty_check'
  | 'punish_debtor' | 'protect_ally';

export type CandidateTrialDifficulty = 'normal' | 'harsh';

export const CANDIDATE_FUND_INITIAL = 1_000_000;
export const CANDIDATE_RETURN_GOAL_NORMAL = 1_200_000;
export const CANDIDATE_RETURN_GOAL_HARSH = 1_300_000;
export const CANDIDATE_FAIL_PENALTY_NORMAL = 300_000;
export const CANDIDATE_FAIL_PENALTY_HARSH = 400_000;
export const CANDIDATE_TOTAL_ROUNDS = 3;

export const ORDER_COLLECT_AMOUNT = 100_000;
export const ORDER_RISKY_INVEST = 200_000;
export const ORDER_RISKY_REWARD = 400_000;
export const ORDER_LOYALTY_BRIBE = 100_000;
export const ORDER_PUNISH_AMOUNT = 100_000;
export const ORDER_PROTECT_COST = 150_000;

export const ORDER_META: Record<CandidateOrderType, {
  title: string; emoji: string; short: string; rules: string;
}> = {
  collect_contribution: {
    title: 'Сбор взноса',
    emoji: '💰',
    short: '2 игрока должны заплатить 100k в фонд.',
    rules: 'Кандидат выбирает 2 игроков. Каждый платит 100 000 ¥ в фонд испытания. Игрок может отказаться (тогда репутация −10 по решению ведущего).',
  },
  risky_deal: {
    title: 'Рискованная сделка',
    emoji: '🎲',
    short: '200k из фонда → 50/50: +400k или −200k.',
    rules: 'Кандидат вкладывает 200 000 ¥ из фонда. 50/50: успех — фонд +400 000, провал — фонд −200 000. Если в фонде меньше 200 000 — приказ недоступен.',
  },
  loyalty_check: {
    title: 'Проверка верности',
    emoji: '🤝',
    short: 'Игрок берёт 100k или отказывается за +10 репутации.',
    rules: 'Кандидат предлагает игроку 100 000 ¥ из фонда. Игрок выбирает: «взять» или «отказаться». При взятии игрок получает деньги и метку «куплен». При отказе — +10 репутации по решению ведущего.',
  },
  punish_debtor: {
    title: 'Наказание должника',
    emoji: '🔨',
    short: 'Должник платит 100k → его долг −100k. Иначе долг +20%.',
    rules: 'Доступен, если среди участников есть должник. Кандидат выбирает должника и требует 100 000 ¥. Платит — фонд +100k, долг должника −100k. Не платит — долг +20% и репутация −10.',
  },
  protect_ally: {
    title: 'Защита союзника',
    emoji: '🛡',
    short: '150k из фонда защищает игрока от штрафа в раунде.',
    rules: 'Кандидат тратит 150 000 ¥ из фонда. Выбранный игрок получает метку protected_this_round. Если в раунде на него должен был лечь штраф до 150 000 — он отменяется или оплачивается фондом.',
  },
};

export function returnGoalFor(d: CandidateTrialDifficulty): number {
  return d === 'harsh' ? CANDIDATE_RETURN_GOAL_HARSH : CANDIDATE_RETURN_GOAL_NORMAL;
}

export function failPenaltyFor(d: CandidateTrialDifficulty): number {
  return d === 'harsh' ? CANDIDATE_FAIL_PENALTY_HARSH : CANDIDATE_FAIL_PENALTY_NORMAL;
}

export function rollRiskyDeal(): { success: boolean; fundDelta: number } {
  const success = Math.random() < 0.5;
  return { success, fundDelta: success ? +ORDER_RISKY_REWARD : -ORDER_RISKY_INVEST };
}
