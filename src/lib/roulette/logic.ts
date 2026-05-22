// Чистая логика «Королевской рулетки» — без I/O, без React.
// Используется и UI-компонентом, и (при желании) тестами.

export type RouletteBet = 'safe' | 'risky' | 'royal';
export type RouletteSector = 'safe' | 'risky' | 'royal' | 'tax' | 'crown';

export interface BetSpec {
  riskAmount: number;
  winAmount: number;
}

/** Параметры ставок. Менять здесь — менять везде. */
export const BET_SPECS: Record<RouletteBet, BetSpec> = {
  safe:  { riskAmount: 50_000,  winAmount: 75_000  },
  risky: { riskAmount: 100_000, winAmount: 200_000 },
  royal: { riskAmount: 250_000, winAmount: 600_000 },
};

export const ENTRY_FEE_PLAYER = 250_000;
export const ENTRY_FEE_CELESTIA = 1_000_000;
export const TOTAL_ROUNDS = 5;
export const TAX_PER_PLAYER = 50_000;
export const CROWN_PAYOUT = 150_000;

/**
 * Колесо: 12 секторов в фиксированном порядке.
 * Распределение по ТЗ: 4 safe, 3 risky, 2 royal, 2 tax, 1 crown.
 * Раскладка чередует сектора, чтобы визуально не было кучкования.
 */
export const WHEEL: RouletteSector[] = [
  'safe',
  'risky',
  'royal',
  'tax',
  'safe',
  'risky',
  'crown',
  'safe',
  'royal',
  'tax',
  'safe',
  'risky',
];

export interface SectorMeta {
  label: string;
  short: string;
  color: string;       // tailwind text/bg
  hex: string;         // for SVG fill
  emoji: string;
}

export const SECTOR_META: Record<RouletteSector, SectorMeta> = {
  safe:  { label: 'Безопасная',     short: 'Безопасная', color: 'emerald-400', hex: '#10b981', emoji: '🛡️' },
  risky: { label: 'Рискованная',    short: 'Рискованная', color: 'amber-400',   hex: '#f59e0b', emoji: '🎲' },
  royal: { label: 'Королевская',    short: 'Королевская', color: 'fuchsia-400', hex: '#c026d3', emoji: '♛'  },
  tax:   { label: 'Налог студсовета', short: 'Налог',     color: 'sky-400',     hex: '#0ea5e9', emoji: '🏛️' },
  crown: { label: 'Корона',         short: 'Корона',     color: 'gold',        hex: '#d4af37', emoji: '👑' },
};

/** Какие ставки разрешены конкретному участнику. Селестия не может выбрать safe. */
export function allowedBets(isCelestia: boolean): RouletteBet[] {
  return isCelestia ? ['risky', 'royal'] : ['safe', 'risky', 'royal'];
}

/**
 * Бросок рулетки. Возвращает индекс сектора (0..11) и результат.
 * Используем простой crypto-уровневый PRNG (math.random + clamp).
 * Раскручивает анимация в UI; результат фиксируется в state.
 */
export function spinWheel(): { index: number; sector: RouletteSector } {
  const index = Math.floor(Math.random() * WHEEL.length);
  return { index, sector: WHEEL[index] };
}

export interface RoundDeltas {
  /** Изменение баланса игрока за раунд (положительное = он получил, отрицательное = потерял). */
  perPlayer: Record<string, number>;
  /** Изменение баланса Казны за раунд. Положительное = Казна получила, отрицательное = Казна выплатила. */
  treasury: number;
}

/**
 * Расчёт раунда.
 * @param sector выпавший сектор
 * @param bets   карта participantId → его ставка (safe/risky/royal)
 * @param celestiaId id Селестии — для Tax/Crown эффектов
 *
 * Возвращает дельты баланса по каждому участнику и по Казне, без записи.
 * UI потом вызывает chargeToTreasury / payoutFromTreasury по этим дельтам.
 */
export function resolveRound(
  sector: RouletteSector,
  bets: Record<string, RouletteBet>,
  celestiaId: string,
): RoundDeltas {
  const perPlayer: Record<string, number> = {};
  let treasury = 0;

  if (sector === 'safe' || sector === 'risky' || sector === 'royal') {
    // Победный сектор: те, кто угадал тип — получают +winAmount, остальные теряют свой riskAmount.
    for (const [pid, bet] of Object.entries(bets)) {
      const spec = BET_SPECS[bet];
      if (bet === sector) {
        perPlayer[pid] = (perPlayer[pid] || 0) + spec.winAmount;
        treasury -= spec.winAmount;
      } else {
        perPlayer[pid] = (perPlayer[pid] || 0) - spec.riskAmount;
        treasury += spec.riskAmount;
      }
    }
    return { perPlayer, treasury };
  }

  if (sector === 'tax') {
    // Все ОБЫЧНЫЕ игроки платят TAX_PER_PLAYER в Казну. Селестия — ничего.
    for (const pid of Object.keys(bets)) {
      if (pid === celestiaId) continue;
      perPlayer[pid] = (perPlayer[pid] || 0) - TAX_PER_PLAYER;
      treasury += TAX_PER_PLAYER;
    }
    return { perPlayer, treasury };
  }

  if (sector === 'crown') {
    // Селестия получает CROWN_PAYOUT из Казны. Остальные — ничего.
    if (bets[celestiaId] !== undefined) {
      perPlayer[celestiaId] = (perPlayer[celestiaId] || 0) + CROWN_PAYOUT;
      treasury -= CROWN_PAYOUT;
    }
    return { perPlayer, treasury };
  }

  return { perPlayer, treasury };
}

/**
 * Победитель = максимальная чистая прибыль за 5 раундов.
 * Tie-breaker: текущий баланс (передаётся через balances).
 * При двойной ничьей возвращает null — ведущий назначит вручную.
 */
export function pickWinner(
  netProfit: Record<string, number>,
  balances: Record<string, number>,
): string | null {
  const ids = Object.keys(netProfit);
  if (ids.length === 0) return null;

  let bestProfit = -Infinity;
  for (const id of ids) {
    if (netProfit[id] > bestProfit) bestProfit = netProfit[id];
  }
  const profitTied = ids.filter(id => netProfit[id] === bestProfit);
  if (profitTied.length === 1) return profitTied[0];

  let bestBalance = -Infinity;
  for (const id of profitTied) {
    if ((balances[id] ?? 0) > bestBalance) bestBalance = balances[id] ?? 0;
  }
  const balanceTied = profitTied.filter(id => (balances[id] ?? 0) === bestBalance);
  if (balanceTied.length === 1) return balanceTied[0];

  return null; // двойная ничья — ведущий назначает
}
