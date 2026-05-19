/**
 * Betting / Pari calculation engine
 */

export interface PariOdds {
  optionId: string;
  label: string;
  totalBets: number;
  odds: number; // estimated payout multiplier
  percentage: number; // share of total pool
}

/**
 * Calculate current odds for all options in a pari market
 */
export function calculateOdds(
  options: { id: string; label: string }[],
  bets: { option_id: string; amount: number }[],
  creatorFeePercent: number,
  academyFeePercent: number
): PariOdds[] {
  const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);
  const feePercent = creatorFeePercent + academyFeePercent;
  const payoutPool = totalPool * (1 - feePercent / 100);

  return options.map(option => {
    const optionBets = bets.filter(b => b.option_id === option.id);
    const optionTotal = optionBets.reduce((sum, b) => sum + b.amount, 0);
    const odds = optionTotal > 0 ? payoutPool / optionTotal : 0;
    const percentage = totalPool > 0 ? (optionTotal / totalPool) * 100 : 0;

    return {
      optionId: option.id,
      label: option.label,
      totalBets: optionTotal,
      odds: Math.round(odds * 100) / 100,
      percentage: Math.round(percentage),
    };
  });
}

/**
 * Calculate payout for a winning bet
 */
export function calculatePayout(
  betAmount: number,
  winningPoolTotal: number,
  payoutPool: number
): number {
  if (winningPoolTotal === 0) return 0;
  return Math.floor((betAmount / winningPoolTotal) * payoutPool);
}

/**
 * Calculate all fees and pools
 */
export function calculatePools(
  totalPool: number,
  creatorFeePercent: number,
  academyFeePercent: number
) {
  const creatorFee = Math.floor(totalPool * creatorFeePercent / 100);
  const academyFee = Math.floor(totalPool * academyFeePercent / 100);
  const payoutPool = totalPool - creatorFee - academyFee;

  return { totalPool, creatorFee, academyFee, payoutPool };
}
