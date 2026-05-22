// Константы и роли системы кредитования.
// «Фонд Тогами» = TREASURY (p-treasury).

export const KIRUMI_ID = 'p-15';
export const MONDO_ID  = 'p-11';
export const PEKO_ID   = 'p-peko';
export const QUEEN_ID  = 'p-queen';
export const TREASURY_ID = 'p-treasury'; // он же Фонд Тогами

// Стандартные условия кредитов Кируми
export const LOAN_NORMAL_RATE = 20;   // %
export const LOAN_NORMAL_MIN  = 100_000;
export const LOAN_NORMAL_MAX  = 500_000;

export const LOAN_URGENT_RATE = 30;
export const LOAN_URGENT_MAX  = 400_000;

// Просрочка
export const OVERDUE_RATE = 20;       // +20% к текущей сумме при начислении
export const OVERDUE_REPUTATION_PENALTY = 10; // -10 репутации

// Взыскание Мондо
export const MONDO_COMMISSION_RATE = 0.10; // 10% от выплаты идёт Мондо
export const PEKO_SHARE_OF_MONDO   = 0.30; // 30% от комиссии Мондо идёт Пеко (если она исполнитель)

// Критический порог для Питомца
export const PET_CANDIDATE_THRESHOLD = 1_000_000;
export const PET_BUYOUT_MULTIPLIER   = 1.3;

// Лимиты Питомцев
export const PET_LIMITS: Record<string, number> = {
  player: 1,
  elite:  2,
  queen:  3,
};

/** Расчёт суммы к возврату для обычного / срочного кредита. */
export function loanReturnAmount(principal: number, rate: number): number {
  return Math.round(principal * (1 + rate / 100));
}

/** Распределение комиссии: исполнитель Пеко может быть null. */
export function splitCollectionCommission(payment: number, hasPeko: boolean) {
  const totalCommission = Math.floor(payment * MONDO_COMMISSION_RATE);
  const pekoShare = hasPeko ? Math.floor(totalCommission * PEKO_SHARE_OF_MONDO) : 0;
  const mondoShare = totalCommission - pekoShare;
  const ownerReceived = payment - totalCommission;
  return { totalCommission, mondoShare, pekoShare, ownerReceived };
}

/** Является ли участник Кируми. */
export function isKirumi(id: string): boolean { return id === KIRUMI_ID; }
/** Является ли участник Мондо. */
export function isMondo(id: string): boolean { return id === MONDO_ID; }
/** Является ли участник Пеко. */
export function isPeko(id: string): boolean { return id === PEKO_ID; }
/** Является ли участник Селестией. */
export function isQueen(id: string): boolean { return id === QUEEN_ID; }
