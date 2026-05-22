// Чистые помощники для механики «Карточного корабля».
// Без обращений к БД — только логика.

import type { CardType, CardShipState } from '@/lib/store/types';

export const CARD_LABELS: Record<CardType, string> = {
  rock: 'Камень',
  scissors: 'Ножницы',
  paper: 'Бумага',
};

export const CARD_EMOJI: Record<CardType, string> = {
  rock: '🪨',
  scissors: '✂️',
  paper: '📄',
};

// Стандартный набор: 3+3+3 карт и 3 звезды.
export const STARTING_ROCKS = 3;
export const STARTING_SCISSORS = 3;
export const STARTING_PAPERS = 3;
export const STARTING_STARS = 3;
export const STARTING_TOTAL_CARDS =
  STARTING_ROCKS + STARTING_SCISSORS + STARTING_PAPERS;

// Условие выживания: 0 карт в руке + минимум 3 звезды.
export const WIN_STARS_REQUIRED = 3;

// Лимиты цен на рынке (по умолчанию).
export const PRICE_LIMITS = {
  card: { min: 10_000, max: 200_000 },
  star: { min: 50_000, max: 500_000 },
};

// Таймеры дуэли.
export const ACCEPT_TIMEOUT_MS = 3 * 60 * 1000; // 3 минуты на принятие
export const PICK_TIMEOUT_MS = 2 * 60 * 1000;   // 2 минуты на выбор карты

/**
 * Какая карта побеждает: rock > scissors > paper > rock.
 * @returns 'a' | 'b' | 'tie'
 */
export function compareCards(a: CardType, b: CardType): 'a' | 'b' | 'tie' {
  if (a === b) return 'tie';
  if (a === 'rock' && b === 'scissors') return 'a';
  if (a === 'scissors' && b === 'paper') return 'a';
  if (a === 'paper' && b === 'rock') return 'a';
  return 'b';
}

/** Сумма карт в руке игрока (без учёта проданного). */
export function totalCards(s: Pick<CardShipState, 'rocks' | 'scissors' | 'papers'>): number {
  return s.rocks + s.scissors + s.papers;
}

/** Получить количество данного типа карт в руке. */
export function getCardCount(s: CardShipState, card: CardType): number {
  if (card === 'rock') return s.rocks;
  if (card === 'scissors') return s.scissors;
  return s.papers;
}

/** Имя поля колонки по типу карты. */
export function cardField(card: CardType): 'rocks' | 'scissors' | 'papers' {
  if (card === 'rock') return 'rocks';
  if (card === 'scissors') return 'scissors';
  return 'papers';
}

/** Случайная карта из доступных в руке. */
export function pickRandomAvailable(s: CardShipState): CardType | null {
  const pool: CardType[] = [];
  for (let i = 0; i < s.rocks; i++) pool.push('rock');
  for (let i = 0; i < s.scissors; i++) pool.push('scissors');
  for (let i = 0; i < s.papers; i++) pool.push('paper');
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Игрок выжил, если в руке 0 карт и минимум WIN_STARS_REQUIRED звёзд. */
export function isSurvived(s: Pick<CardShipState, 'rocks' | 'scissors' | 'papers' | 'stars'>): boolean {
  return totalCards(s) === 0 && s.stars >= WIN_STARS_REQUIRED;
}
