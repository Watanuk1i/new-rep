// Чистая логика «Трона Селестии» — без I/O, без React.

export type ThroneCard = 'emperor' | 'citizen' | 'pet';
export type ThroneSide = 'celestia' | 'challenger';
export type ThronePhase = 'first_half' | 'second_half' | 'sudden_death';

// Денежные константы (ТЗ)
export const CELESTIA_FINAL_STAKE = 5_000_000;
export const CHALLENGER_FINAL_STAKE = 2_000_000;

export const PEEK_CARD_COST = 500_000;
export const CHANGE_CARD_COST = 700_000;
export const REPLAY_LOSS_COST = 1_000_000;
export const BLOCK_CELESTIA_PRIVILEGE_COST = 1_500_000;

export const TOTAL_ROUNDS = 10;
export const HALF_ROUNDS = 5;

/** Какая карта у стороны для данного раунда (фазы): первый блок или второй. */
export function initialDeckForPhase(side: ThroneSide, phase: ThronePhase): ThroneCard[] {
  if (phase === 'first_half') {
    // Селестия: 1 Император + 4 Гражданина. Претендент: 1 Питомец + 4 Гражданина.
    return side === 'celestia'
      ? ['emperor', 'citizen', 'citizen', 'citizen', 'citizen']
      : ['pet', 'citizen', 'citizen', 'citizen', 'citizen'];
  }
  if (phase === 'second_half') {
    // Стороны меняются. Претендент получает Императора, Селестия — Питомца.
    return side === 'celestia'
      ? ['pet', 'citizen', 'citizen', 'citizen', 'citizen']
      : ['emperor', 'citizen', 'citizen', 'citizen', 'citizen'];
  }
  // sudden_death: только Император и Питомец, обновляются каждый раунд.
  return ['emperor', 'pet'];
}

/**
 * Кто выиграл дуэль карт в обычном раунде (10 основных).
 * Правила:
 *  emperor бьёт citizen
 *  citizen бьёт pet
 *  pet бьёт emperor
 *  одинаковые — ничья
 */
export function resolveCardDuel(
  cel: ThroneCard,
  chal: ThroneCard,
): 'celestia' | 'challenger' | 'draw' {
  if (cel === chal) return 'draw';
  if (cel === 'emperor' && chal === 'citizen') return 'celestia';
  if (cel === 'citizen' && chal === 'pet')     return 'celestia';
  if (cel === 'pet'     && chal === 'emperor') return 'celestia';
  return 'challenger';
}

/**
 * Sudden death: только emperor vs pet. Одинаковые → переигровка (draw).
 */
export function resolveSuddenDeath(
  cel: ThroneCard, chal: ThroneCard,
): 'celestia' | 'challenger' | 'draw' {
  if (cel === chal) return 'draw';
  if (cel === 'emperor' && chal === 'pet') return 'celestia';
  if (cel === 'pet' && chal === 'emperor') return 'challenger';
  return 'draw';
}

/** Какая фаза по номеру раунда. */
export function phaseOfRound(roundNumber: number): ThronePhase {
  if (roundNumber <= HALF_ROUNDS) return 'first_half';
  if (roundNumber <= TOTAL_ROUNDS) return 'second_half';
  return 'sudden_death';
}
