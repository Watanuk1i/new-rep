/**
 * Game Engine - Server-side game logic
 * All random results generated server-side to prevent cheating
 */

import { GameType } from '@/types/database';

// ============================================================
// DICE GAME
// ============================================================
export interface DiceResult {
  playerA: { die1: number; die2: number; total: number };
  playerB: { die1: number; die2: number; total: number };
  winner: 'a' | 'b' | 'tie';
}

export function playDice(): DiceResult {
  const rollDie = () => Math.floor(Math.random() * 6) + 1;
  
  let result: DiceResult;
  do {
    const a1 = rollDie(), a2 = rollDie();
    const b1 = rollDie(), b2 = rollDie();
    const totalA = a1 + a2;
    const totalB = b1 + b2;
    
    result = {
      playerA: { die1: a1, die2: a2, total: totalA },
      playerB: { die1: b1, die2: b2, total: totalB },
      winner: totalA > totalB ? 'a' : totalB > totalA ? 'b' : 'tie',
    };
  } while (result.winner === 'tie'); // Re-roll on tie
  
  return result;
}

// ============================================================
// HIGH CARD
// ============================================================
export interface Card {
  suit: string;
  rank: string;
  value: number;
}

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      deck.push({ suit, rank: RANKS[i], value: i + 2 });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export interface HighCardResult {
  playerA: Card;
  playerB: Card;
  winner: 'a' | 'b';
}

export function playHighCard(): HighCardResult {
  let result: HighCardResult;
  do {
    const deck = shuffleDeck(createDeck());
    const cardA = deck[0];
    const cardB = deck[1];
    result = {
      playerA: cardA,
      playerB: cardB,
      winner: cardA.value > cardB.value ? 'a' : cardB.value > cardA.value ? 'b' : 'a', // tie goes to A then re-deal
    };
  } while (result.playerA.value === result.playerB.value);
  
  return result;
}

// ============================================================
// ROULETTE
// ============================================================
export type RouletteBetType = 'red' | 'black' | 'even' | 'odd' | 'number' | 'range_1_12' | 'range_13_24' | 'range_25_36';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export interface RouletteResult {
  number: number;
  color: 'red' | 'black' | 'green';
  isEven: boolean;
  playerBet: { type: RouletteBetType; value?: number };
  won: boolean;
  multiplier: number;
}

export function playRoulette(betType: RouletteBetType, betValue?: number): RouletteResult {
  const number = Math.floor(Math.random() * 37); // 0-36
  const color: 'red' | 'black' | 'green' = number === 0 ? 'green' : RED_NUMBERS.includes(number) ? 'red' : 'black';
  const isEven = number !== 0 && number % 2 === 0;
  
  let won = false;
  let multiplier = 0;
  
  switch (betType) {
    case 'red':
      won = color === 'red';
      multiplier = won ? 2 : 0;
      break;
    case 'black':
      won = color === 'black';
      multiplier = won ? 2 : 0;
      break;
    case 'even':
      won = isEven;
      multiplier = won ? 2 : 0;
      break;
    case 'odd':
      won = number !== 0 && !isEven;
      multiplier = won ? 2 : 0;
      break;
    case 'number':
      won = number === betValue;
      multiplier = won ? 36 : 0;
      break;
    case 'range_1_12':
      won = number >= 1 && number <= 12;
      multiplier = won ? 3 : 0;
      break;
    case 'range_13_24':
      won = number >= 13 && number <= 24;
      multiplier = won ? 3 : 0;
      break;
    case 'range_25_36':
      won = number >= 25 && number <= 36;
      multiplier = won ? 3 : 0;
      break;
  }
  
  return {
    number,
    color,
    isEven,
    playerBet: { type: betType, value: betValue },
    won,
    multiplier,
  };
}

// ============================================================
// SLOTS
// ============================================================
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔', '⭐'];

export interface SlotsResult {
  reels: [string, string, string];
  multiplier: number;
  won: boolean;
}

export function playSlots(): SlotsResult {
  const spin = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
  const reels: [string, string, string] = [spin(), spin(), spin()];
  
  let multiplier = 0;
  
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    // Triple match
    if (reels[0] === '7️⃣') multiplier = 10;
    else if (reels[0] === '💎') multiplier = 7;
    else if (reels[0] === '⭐') multiplier = 5;
    else multiplier = 3;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    // Double match
    multiplier = 1.5;
  }
  
  return {
    reels,
    multiplier,
    won: multiplier > 0,
  };
}

// ============================================================
// BLACKJACK (21)
// ============================================================
export interface BlackjackState {
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  playerTotal: number;
  dealerTotal: number;
  status: 'playing' | 'dealer_turn' | 'player_bust' | 'dealer_bust' | 'player_win' | 'dealer_win' | 'push';
}

function calculateHandTotal(hand: Card[]): number {
  let total = 0;
  let aces = 0;
  
  for (const card of hand) {
    if (card.rank === 'A') {
      aces++;
      total += 11;
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      total += 10;
    } else {
      total += parseInt(card.rank);
    }
  }
  
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  
  return total;
}

export function initBlackjack(): BlackjackState {
  const deck = shuffleDeck(createDeck());
  const playerHand = [deck[0], deck[2]];
  const dealerHand = [deck[1], deck[3]];
  const remainingDeck = deck.slice(4);
  
  return {
    deck: remainingDeck,
    playerHand,
    dealerHand,
    playerTotal: calculateHandTotal(playerHand),
    dealerTotal: calculateHandTotal(dealerHand),
    status: 'playing',
  };
}

export function blackjackHit(state: BlackjackState): BlackjackState {
  const newCard = state.deck[0];
  const newDeck = state.deck.slice(1);
  const newHand = [...state.playerHand, newCard];
  const newTotal = calculateHandTotal(newHand);
  
  return {
    ...state,
    deck: newDeck,
    playerHand: newHand,
    playerTotal: newTotal,
    status: newTotal > 21 ? 'player_bust' : 'playing',
  };
}

export function blackjackStand(state: BlackjackState): BlackjackState {
  let { deck, dealerHand, dealerTotal } = state;
  
  // Dealer draws until 17+
  while (dealerTotal < 17) {
    dealerHand = [...dealerHand, deck[0]];
    deck = deck.slice(1);
    dealerTotal = calculateHandTotal(dealerHand);
  }
  
  let status: BlackjackState['status'];
  if (dealerTotal > 21) {
    status = 'dealer_bust';
  } else if (dealerTotal > state.playerTotal) {
    status = 'dealer_win';
  } else if (state.playerTotal > dealerTotal) {
    status = 'player_win';
  } else {
    status = 'push';
  }
  
  return {
    ...state,
    deck,
    dealerHand,
    dealerTotal,
    status,
  };
}

// ============================================================
// BLUFF DUEL - managed by players + GM
// ============================================================
export interface BluffDuelState {
  statement: string;
  creatorId: string;
  responderId: string | null;
  response: 'believe' | 'disbelieve' | null;
  truthVerified: boolean | null; // GM decides
  winner: string | null;
}

// ============================================================
// Game Type Metadata
// ============================================================
export const GAME_TYPES: Record<GameType, { label: string; icon: string; description: string; players: number; automated: boolean }> = {
  dice: { label: 'Кости', icon: '🎲', description: 'Бросьте 2 кости. У кого сумма больше — тот победил.', players: 2, automated: true },
  high_card: { label: 'Старшая карта', icon: '🃏', description: 'Каждому игроку — карта. Старшая побеждает.', players: 2, automated: true },
  roulette: { label: 'Рулетка', icon: '🎰', description: 'Выберите ставку: цвет, чёт/нечёт, число или диапазон.', players: 1, automated: true },
  slots: { label: 'Слоты', icon: '🍒', description: 'Крутите барабаны. Совпадения множат ставку.', players: 1, automated: true },
  blackjack: { label: '21 очко', icon: '🂡', description: 'Наберите ближе к 21, не перебрав. Кнопки: взять / остановиться.', players: 2, automated: true },
  bluff_duel: { label: 'Блеф-дуэль', icon: '🎭', description: 'Один утверждает, другой решает: верить или нет. Итог решает ведущий.', players: 2, automated: false },
  truth_or_bet: { label: 'Правда или ставка', icon: '❓', description: 'Вопрос — ответ или повышение ставки. Отказ = проигрыш.', players: 2, automated: false },
};
