// Чистая логика «Суда над Элитой» — карты, эффекты, подсчёт очков.

export type CardSide = 'prosecution' | 'defense' | 'neutral' | 'dangerous';
export type CardEffectType =
  | 'add_points'
  | 'subtract_points'
  | 'block_card'
  | 'random_bonus_or_penalty'
  | 'switch_side'
  | 'no_effect';
export type CardStatus = 'hidden' | 'revealed' | 'owned' | 'played' | 'blocked';
export type TrialSide = 'prosecution' | 'defense';

export interface CardTemplate {
  title: string;
  side: CardSide;
  points: number;
  effect_type: CardEffectType;
  description: string;
}

// Денежные константы (ТЗ §19)
export const REVEAL_RANDOM_CARD_COST = 50_000;
export const BUY_REVEALED_CARD_COST  = 100_000;
export const BLOCK_CARD_COST         = 200_000;
export const ELITE_GUILTY_FINE       = 1_000_000;
export const ELITE_ACQUITTED_COMPENSATION = 500_000;

export const MAX_CARDS_PER_SIDE = 5;

// Базовый набор карт. Обвинение (10) + Защита (10) + Опасные (7).
export const PROSECUTION_CARDS: CardTemplate[] = [
  { title: 'Свидетель должника',           side: 'prosecution', points: 2, effect_type: 'add_points', description: 'Должник готов дать показания о давлении.' },
  { title: 'Просроченный долг',            side: 'prosecution', points: 2, effect_type: 'add_points', description: 'Долг не был возвращён в срок и обернулся манипуляцией.' },
  { title: 'Скрытый процент',              side: 'prosecution', points: 3, effect_type: 'add_points', description: 'Условия займа содержали неуказанные проценты.' },
  { title: 'Ошибка в договоре',            side: 'prosecution', points: 4, effect_type: 'add_points', description: 'В договоре найден пункт, нарушающий правила академии.' },
  { title: 'Давление Мондо',               side: 'prosecution', points: 3, effect_type: 'add_points', description: 'Свидетели указывают на коллекторское давление.' },
  { title: 'Подозрительный перевод',       side: 'prosecution', points: 2, effect_type: 'add_points', description: 'Перевод йен между сторонами без видимой причины.' },
  { title: 'Запись сайта',                 side: 'prosecution', points: 3, effect_type: 'add_points', description: 'Журнал зафиксировал неположенное действие.' },
  { title: 'Нарушение срока выкупа',       side: 'prosecution', points: 4, effect_type: 'add_points', description: 'Окно выкупа было нарушено в свою пользу.' },
  { title: 'Продажа долга без уведомления', side: 'prosecution', points: 3, effect_type: 'add_points', description: 'Должник не был оповещён о смене владельца.' },
  { title: 'Использование служебного права', side: 'prosecution', points: 3, effect_type: 'add_points', description: 'Статус Элиты применён вне регламента.' },
];

export const DEFENSE_CARDS: CardTemplate[] = [
  { title: 'Добровольная ставка',          side: 'defense', points: 3, effect_type: 'add_points', description: 'Игрок согласился на условия, понимая риск.' },
  { title: 'Пункт правил',                 side: 'defense', points: 3, effect_type: 'add_points', description: 'Действие прямо разрешено правилами академии.' },
  { title: 'Подпись игрока',               side: 'defense', points: 4, effect_type: 'add_points', description: 'Игрок поставил подпись под условиями.' },
  { title: 'Решение ведущего',             side: 'defense', points: 4, effect_type: 'add_points', description: 'Ведущий ранее одобрил действие.' },
  { title: 'Королевская поправка',         side: 'defense', points: 3, effect_type: 'add_points', description: 'Селестия санкционировала исключение из правил.' },
  { title: 'Срок был указан',              side: 'defense', points: 2, effect_type: 'add_points', description: 'Срок чётко обозначен и доведён до сторон.' },
  { title: 'Игрок получил выгоду',         side: 'defense', points: 2, effect_type: 'add_points', description: 'Истец сам в моменте сделки получил прибыль.' },
  { title: 'Долг куплен честно',           side: 'defense', points: 3, effect_type: 'add_points', description: 'Передача долга прошла через открытый рынок.' },
  { title: 'Сайт подтвердил результат',    side: 'defense', points: 3, effect_type: 'add_points', description: 'Платформа зафиксировала результат как валидный.' },
  { title: 'Обвинение знало условия',      side: 'defense', points: 3, effect_type: 'add_points', description: 'Истец заранее ознакомлен с правилами игры.' },
];

export const DANGEROUS_CARDS: CardTemplate[] = [
  { title: 'Фальшивое доказательство',   side: 'dangerous', points: -3, effect_type: 'subtract_points',         description: 'Если сыграно — сторона теряет 3 очка.' },
  { title: 'Ненадёжный свидетель',       side: 'dangerous', points: 3,  effect_type: 'random_bonus_or_penalty', description: '50/50: +3 очка или −2 очка стороне.' },
  { title: 'Подкуп',                     side: 'dangerous', points: 2,  effect_type: 'add_points',              description: '+2 очка, но если раскроют — −4 (для MVP даёт +2).' },
  { title: 'Двойной агент',              side: 'dangerous', points: 3,  effect_type: 'switch_side',             description: 'Очки уходят противоположной стороне.' },
  { title: 'Испорченная запись',         side: 'dangerous', points: 0,  effect_type: 'no_effect',               description: 'Карта не даёт очков.' },
  { title: 'Ложное обвинение',           side: 'dangerous', points: -3, effect_type: 'subtract_points',         description: 'Сторона Обвинения теряет 3 очка.' },
  { title: 'Дырка в контракте',          side: 'dangerous', points: -3, effect_type: 'subtract_points',         description: 'Сторона Защиты теряет 3 очка.' },
];

/** Сгенерировать колоду дела. По умолчанию: все 27 карт перемешаны. */
export function generateDeck(): CardTemplate[] {
  const all: CardTemplate[] = [...PROSECUTION_CARDS, ...DEFENSE_CARDS, ...DANGEROUS_CARDS];
  // shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/**
 * Применить эффект сыгранной карты.
 * @param played    карта (с её side и points)
 * @param playerSide сторона, которая её играет
 * @param prosecution текущие очки Обвинения
 * @param defense     текущие очки Защиты
 *
 * Возвращает новые очки.
 */
export function applyCardPlay(
  played: { side: CardSide; points: number; effect_type: CardEffectType; title: string },
  playerSide: TrialSide,
  prosecution: number,
  defense: number,
): { prosecution: number; defense: number; note: string } {
  let p = prosecution;
  let d = defense;
  let note = '';

  // Тематические штрафы из ТЗ для опасных карт по названию
  if (played.title === 'Ложное обвинение') {
    p = Math.max(0, p - 3);
    note = 'Обвинение −3';
    return { prosecution: p, defense: d, note };
  }
  if (played.title === 'Дырка в контракте') {
    d = Math.max(0, d - 3);
    note = 'Защита −3';
    return { prosecution: p, defense: d, note };
  }
  if (played.title === 'Двойной агент') {
    // Очки уходят противоположной стороне
    if (playerSide === 'prosecution') d += played.points;
    else p += played.points;
    note = `Двойной агент: +${played.points} ${playerSide === 'prosecution' ? 'Защите' : 'Обвинению'}`;
    return { prosecution: p, defense: d, note };
  }
  if (played.title === 'Ненадёжный свидетель') {
    const success = Math.random() < 0.5;
    const delta = success ? 3 : -2;
    if (playerSide === 'prosecution') p = Math.max(0, p + delta); else d = Math.max(0, d + delta);
    note = success ? 'Ненадёжный свидетель: +3' : 'Ненадёжный свидетель: −2';
    return { prosecution: p, defense: d, note };
  }
  if (played.title === 'Фальшивое доказательство') {
    if (playerSide === 'prosecution') p = Math.max(0, p - 3); else d = Math.max(0, d - 3);
    note = `Фальшивка: ${playerSide === 'prosecution' ? 'Обвинение' : 'Защита'} −3`;
    return { prosecution: p, defense: d, note };
  }
  if (played.title === 'Испорченная запись' || played.effect_type === 'no_effect') {
    note = 'Без эффекта';
    return { prosecution: p, defense: d, note };
  }

  // Стандартный случай
  const points = Math.max(0, played.points);
  if (played.side === 'prosecution' || (played.side === 'dangerous' && playerSide === 'prosecution')) {
    p += points;
    note = `Обвинение +${points}`;
  } else if (played.side === 'defense' || (played.side === 'dangerous' && playerSide === 'defense')) {
    d += points;
    note = `Защита +${points}`;
  } else {
    // нейтральная карта добавляется стороне игрока
    if (playerSide === 'prosecution') p += points;
    else d += points;
    note = `${playerSide === 'prosecution' ? 'Обвинение' : 'Защита'} +${points}`;
  }
  return { prosecution: p, defense: d, note };
}

/** Защита побеждает при равенстве. */
export function pickVerdict(prosecution: number, defense: number): 'elite_guilty' | 'elite_acquitted' {
  return prosecution > defense ? 'elite_guilty' : 'elite_acquitted';
}
