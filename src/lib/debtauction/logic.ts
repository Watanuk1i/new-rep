// Чистая логика «Аукциона долгов» — без I/O, без React.

export const DEBT_AUCTION_START_RATE = 0.50;
export const DEBT_SELF_BUYOUT_RATE = 0.70;
export const MIN_BID_STEP = 50_000;

export const OVERDUE_INTEREST_RATE = 0.20;
export const MONDO_MARKUP_RATE = 0.20;
export const MONDO_COLLECTION_COMMISSION = 0.10;

export const CREDITOR_EMERGENCY_LOAN_MAX = 400_000;   // было 500k
export const CREDITOR_EMERGENCY_LOAN_RATE = 0.20;

export const CELESTIA_TREASURY_OVERBID = 100_000;

export type LotStatus =
  | 'pending'        // создан, ещё не открыт
  | 'open'           // приём ставок
  | 'closed'         // ставки закрыты, ждём решения ведущего
  | 'sold'           // продан игроку
  | 'bought_by_debtor' // самовыкуп должником
  | 'cancelled'
  | 'returned';      // никто не купил, возвращён владельцу

export interface LotPricing {
  startPrice: number;
  buyoutForDebtor: number;
}

/** Стартовая цена и цена самовыкупа по сумме долга. */
export function priceLot(debtAmount: number): LotPricing {
  return {
    startPrice: Math.floor(debtAmount * DEBT_AUCTION_START_RATE),
    buyoutForDebtor: Math.floor(debtAmount * DEBT_SELF_BUYOUT_RATE),
  };
}

/** Минимальная сумма следующей ставки. */
export function nextMinBid(currentBid: number, startPrice: number): number {
  if (currentBid <= 0) return startPrice;
  return currentBid + MIN_BID_STEP;
}

/** Может ли игрок самовыкупиться. Должник = he, проверяем что текущая ставка не выше цены самовыкупа. */
export function canSelfBuyout(currentBid: number, buyoutForDebtor: number): boolean {
  return currentBid <= buyoutForDebtor;
}

/** Применить коллекторскую надбавку Мондо к сумме долга. */
export function applyMondoMarkup(amount: number): number {
  return Math.floor(amount * (1 + MONDO_MARKUP_RATE));
}

/** Применить просрочку (+20%) к сумме долга. */
export function applyOverdueInterest(amount: number): number {
  return Math.floor(amount * (1 + OVERDUE_INTEREST_RATE));
}

/** Размер срочного займа Кредитора → к возврату. */
export function emergencyLoanRepayment(amount: number): number {
  return Math.floor(amount * (1 + CREDITOR_EMERGENCY_LOAN_RATE));
}

/** Перебивка ставки Казной = текущая + CELESTIA_TREASURY_OVERBID. */
export function celestiaOverbidAmount(currentBid: number): number {
  return Math.max(0, currentBid) + CELESTIA_TREASURY_OVERBID;
}
