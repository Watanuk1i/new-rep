// Единый клиент транзакций.
// Все денежные операции проходят через apply_transfer (RPC, см. миграцию 003).
// Функция атомарно списывает у плательщика, начисляет получателю,
// и при недостатке средств у плательщика создаёт запись в debts.

import { getSupabase } from '@/lib/supabase/client';

export const TREASURY_ID = 'p-treasury';
export const TREASURY_NAME = 'Казна студсовета';

export interface TxResult {
  ok: boolean;
  /** id созданного долга, если плательщик ушёл в минус */
  debtId?: string;
  error?: string;
}

/** Универсальный перевод из A в B. Если у A не хватает — авто-долг A → B. */
export async function applyTransfer(
  from: string,
  to: string,
  amount: number,
  reason: string,
  link?: string
): Promise<TxResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'No supabase client' };
  if (amount <= 0) return { ok: true };
  if (from === to) return { ok: true };

  const { data, error } = await sb.rpc('apply_transfer', {
    p_from: from,
    p_to: to,
    p_amount: amount,
    p_reason: reason,
    p_link: link ?? null,
  });
  if (error) {
    console.error('[applyTransfer]', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, debtId: data && typeof data === 'string' && data.length > 0 ? data : undefined };
}

/** Игрок платит в Казну студсовета. При нехватке — долг Казне. */
export function chargeToTreasury(participantId: string, amount: number, reason: string, link?: string) {
  return applyTransfer(participantId, TREASURY_ID, amount, reason, link);
}

/** Казна студсовета выплачивает игроку. */
export function payoutFromTreasury(participantId: string, amount: number, reason: string, link?: string) {
  return applyTransfer(TREASURY_ID, participantId, amount, reason, link);
}

/** Прямой перевод между двумя игроками (победитель/проигравший в дуэли и т.п.). */
export function transferBetweenPlayers(from: string, to: string, amount: number, reason: string, link?: string) {
  return applyTransfer(from, to, amount, reason, link);
}

/** Голос в правиле меньшинства. */
export async function castMinorityVote(gameId: string, voterId: string, choice: 'yes' | 'no'): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc('cast_minority_vote', {
    p_game_id: gameId,
    p_voter_id: voterId,
    p_choice: choice,
  });
  if (error) { console.error('[castMinorityVote]', error); return false; }
  return data === true;
}

/** Ставка в слепом аукционе мест («Комната девяти патронов»). */
export async function placeSeatBid(
  gameId: string,
  roundIdx: number,
  bidderId: string,
  seat: number,
  amount: number
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc('place_seat_bid', {
    p_game_id: gameId,
    p_round_idx: roundIdx,
    p_bidder_id: bidderId,
    p_seat: seat,
    p_amount: amount,
  });
  if (error) { console.error('[placeSeatBid]', error); return false; }
  return data === true;
}
