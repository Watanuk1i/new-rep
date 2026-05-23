// Каталог малых игр. Делится между админкой и игровой страницей /games.

export interface MiniGameMeta {
  type: string;
  label: string;
  emoji: string;
  minPlayers: number;
  maxPlayers: number;
  defaultStake: number;
  allowsDebt?: boolean;
  /** Только админ может создавать (например выкупной стол требует выбор долга). */
  adminOnly?: boolean;
}

export const MINI_GAMES: MiniGameMeta[] = [
  { type: 'mini_red_black',  label: 'Красное / Чёрное', emoji: '🎴', minPlayers: 2, maxPlayers: 2, defaultStake: 50_000 },
  { type: 'mini_blind_bid',  label: 'Слепая ставка',    emoji: '🎯', minPlayers: 2, maxPlayers: 6, defaultStake: 0 },
  { type: 'mini_liar_dice',  label: 'Лжец на кубиках',  emoji: '🎲', minPlayers: 2, maxPlayers: 6, defaultStake: 50_000 },
  { type: 'mini_despair_21', label: '21 отчаяния',      emoji: '🂡', minPlayers: 1, maxPlayers: 5, defaultStake: 50_000 },
  { type: 'mini_ransom',     label: 'Выкупной стол',    emoji: '🃟', minPlayers: 1, maxPlayers: 1, defaultStake: 0, allowsDebt: true, adminOnly: true },
  { type: 'mini_joker',      label: 'Достать Джокера',  emoji: '🎴', minPlayers: 2, maxPlayers: 6, defaultStake: 50_000 },
];
