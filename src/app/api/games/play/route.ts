import { NextRequest, NextResponse } from 'next/server';
import { playDice, playHighCard, playRoulette, playSlots, initBlackjack, blackjackHit, blackjackStand } from '@/lib/game-engine';
import type { RouletteBetType } from '@/lib/game-engine';

/**
 * POST /api/games/play
 * Server-side game result generation
 * Ensures fair play - clients cannot manipulate outcomes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { game_type, action, session_id, bet_type, bet_value, game_state } = body;

    switch (game_type) {
      case 'dice': {
        const result = playDice();
        return NextResponse.json({ success: true, result });
      }

      case 'high_card': {
        const result = playHighCard();
        return NextResponse.json({ success: true, result });
      }

      case 'roulette': {
        if (!bet_type) {
          return NextResponse.json({ error: 'bet_type required for roulette' }, { status: 400 });
        }
        const result = playRoulette(bet_type as RouletteBetType, bet_value);
        return NextResponse.json({ success: true, result });
      }

      case 'slots': {
        const result = playSlots();
        return NextResponse.json({ success: true, result });
      }

      case 'blackjack': {
        if (action === 'init') {
          const state = initBlackjack();
          return NextResponse.json({ success: true, state });
        }
        if (action === 'hit' && game_state) {
          const state = blackjackHit(game_state);
          return NextResponse.json({ success: true, state });
        }
        if (action === 'stand' && game_state) {
          const state = blackjackStand(game_state);
          return NextResponse.json({ success: true, state });
        }
        return NextResponse.json({ error: 'Invalid blackjack action' }, { status: 400 });
      }

      default:
        return NextResponse.json({ error: 'Unknown game type' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
