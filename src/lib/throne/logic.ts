// Чистая логика «Трона Селестии» — без I/O, без React.
// Финальная версия: 10 раундов, 10 карт у каждой стороны (2 Императора + 6 Граждан + 2 Питомца).

export type ThroneCard = 'emperor' | 'citizen' | 'pet';
export type ThroneSide = 'celestia' | 'challenger';
export type ThronePhase = 'main' | 'last_throne';

// Денежные константы
export const THRONE_FUND_INITIAL = 5_000_000;       // Фонд трона Селестии
export const CHALLENGER_MIN_STAKE = 1_500_000;      // минимальный личный взнос Претендента

// Привилегии Селестии (платит из Фонда трона)
export const ROYAL_REGULATION_COST = 700_000;       // забрать ничью себе
export const PROTOCOL_SWAP_COST = 1_000_000;        // подменить выбранную карту
export const REBELLION_TAX_COST = 500_000;          // налог на бунт

// Контрмеры Претендента (платит из Фонда Претендента)
export const REBELLION_RIGHT_COST = 700_000;        // отменить Королевский регламент
export const BREAK_PROTOCOL_COST = 1_000_000;       // блокировать Подмену протокола
export const FUND_PROTECTION_COST = 500_000;        // отменить Налог на бунт

// Общая способность
export const THRONE_BET_COST = 500_000;             // ставка на трон: победитель раунда +2 очка

// Налог на бунт: доплата Претендента
export const REBELLION_TAX_PAYMENT = 300_000;

// Структура колоды у каждой стороны
export const STARTING_DECK: Record<ThroneCard, number> = {
  emperor: 2,
  citizen: 6,
  pet: 2,
};

export const TOTAL_ROUNDS = 10;

// Поддержка
export const SUPPORT_MIN = 50_000;
export const SUPPORT_PAYOUT_CHALLENGER_WINNER = 1.5;
export const SUPPORT_PAYOUT_CELESTIA_WINNER = 1.3;

// === Старые константы для совместимости с админкой/UI ===
export const CELESTIA_FINAL_STAKE = THRONE_FUND_INITIAL;
export const CHALLENGER_FINAL_STAKE = CHALLENGER_MIN_STAKE;
export const PEEK_CARD_COST = 400_000;        // оставлены для совместимости
export const CHANGE_CARD_COST = 600_000;
export const REPLAY_LOSS_COST = 800_000;
export const BLOCK_CELESTIA_PRIVILEGE_COST = 1_200_000;
export const HALF_ROUNDS = 5;

/** Создать стартовую руку: { emperor: 2, citizen: 6, pet: 2 } */
export function freshHand(): Record<ThroneCard, number> {
  return { ...STARTING_DECK };
}

/** Получить плоский список карт из руки. */
export function handToArray(hand: Record<ThroneCard, number>): ThroneCard[] {
  const arr: ThroneCard[] = [];
  for (const [card, n] of Object.entries(hand) as [ThroneCard, number][]) {
    for (let i = 0; i < n; i++) arr.push(card);
  }
  return arr;
}

/**
 * Кто выиграл дуэль карт.
 *  emperor бьёт citizen
 *  citizen бьёт pet
 *  pet бьёт emperor
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

/** Последний трон: те же правила; при повторной ничье побеждает Селестия. */
export function resolveLastThrone(
  cel: ThroneCard, chal: ThroneCard,
): 'celestia' | 'challenger' {
  const d = resolveCardDuel(cel, chal);
  if (d === 'draw') return 'celestia'; // право трона
  return d;
}

/**
 * Применить вычитание карты из руки.
 */
export function consumeCard(
  hand: Record<ThroneCard, number>,
  card: ThroneCard,
): Record<ThroneCard, number> {
  return { ...hand, [card]: Math.max(0, (hand[card] ?? 0) - 1) };
}

/**
 * Подсчёт очков за раунд.
 * winner — победитель карточной дуэли.
 * throneBetSide — кто активировал «Ставку на трон» в этом раунде (если кто-то).
 *
 * Если ставка активирована: победитель получает 2 очка вместо 1.
 * Если ставка активирована и ничья: 0 очков, ставка считается использованной.
 */
export function pointsForRound(
  winner: 'celestia' | 'challenger' | 'draw',
  throneBetSide: ThroneSide | null,
): { celestia: number; challenger: number } {
  if (winner === 'draw') return { celestia: 0, challenger: 0 };
  const base = throneBetSide ? 2 : 1;
  if (winner === 'celestia') return { celestia: base, challenger: 0 };
  return { celestia: 0, challenger: base };
}


// ===========================================================================
// Совместимость со старым UI (ThroneRoom.tsx)
// Старый интерфейс делал deck первого блока (1 Император + 4 Гражданина)
// и второго (1 Питомец + 4 Гражданина). Теперь у обеих сторон одна общая
// колода 2 Imp + 6 Cit + 2 Pet, она сохраняется в state и режется по мере
// розыгрыша.
// ===========================================================================

export function initialDeckForPhase(side: ThroneSide, phase: 'first_half' | 'second_half' | 'sudden_death' | ThronePhase): ThroneCard[] {
  if (phase === 'sudden_death' || phase === 'last_throne') return ['emperor', 'pet'];
  // Для main / first_half / second_half — выдаём полную колоду 2/6/2,
  // если она ещё не была инициализирована. UI сам срезает использованные карты.
  return handToArray(freshHand());
}

export function resolveSuddenDeath(cel: ThroneCard, chal: ThroneCard): 'celestia' | 'challenger' | 'draw' {
  // Старый UI ждал 'draw' для повторной попытки. Новый Last Throne решается одной игрой.
  // Для совместимости отдаём draw → caller сам обработает.
  if (cel === chal) return 'draw';
  return resolveCardDuel(cel, chal);
}

export function phaseOfRound(roundNumber: number): 'first_half' | 'second_half' | 'sudden_death' {
  if (roundNumber <= TOTAL_ROUNDS) return roundNumber <= 5 ? 'first_half' : 'second_half';
  return 'sudden_death';
}
