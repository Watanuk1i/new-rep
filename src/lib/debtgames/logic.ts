// Чистая логика «Игры на долг» — без I/O, без React.
// 6 игр: three_seals / collection_dice / black_note / last_payment /
// delay_game / kirumi_ransom_table.

import type { DebtGameType, DebtGameResult } from '@/lib/store/types';

export const PET_CANDIDATE_THRESHOLD = 1_000_000;

// ---------- Three Seals: -50% / 0 / +50% ----------
export type ThreeSealsCard = 'reduce' | 'keep' | 'increase';

export function shuffleSeals(): ThreeSealsCard[] {
  const arr: ThreeSealsCard[] = ['reduce', 'keep', 'increase'];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function applyThreeSeals(currentDebt: number, card: ThreeSealsCard): {
  newDebt: number; result: DebtGameResult; description: string;
} {
  if (card === 'reduce') {
    const newDebt = Math.round(currentDebt * 0.5);
    return { newDebt, result: 'debt_reduced',
      description: `Печать «−50%». Долг ${currentDebt.toLocaleString('ru-RU')} → ${newDebt.toLocaleString('ru-RU')}.` };
  }
  if (card === 'keep') {
    return { newDebt: currentDebt, result: 'debt_unchanged',
      description: `Печать «без изменений». Долг остался ${currentDebt.toLocaleString('ru-RU')}.` };
  }
  const newDebt = Math.round(currentDebt * 1.5);
  return { newDebt, result: 'debt_increased',
    description: `Печать «+50%». Долг ${currentDebt.toLocaleString('ru-RU')} → ${newDebt.toLocaleString('ru-RU')}.` };
}

// ---------- Collection Dice: 2d6 vs 2d6 ----------
export function rollDice2(): { d1: number; d2: number; sum: number } {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  return { d1, d2, sum: d1 + d2 };
}

export function applyCollectionDice(currentDebt: number, debtorSum: number, opponentSum: number): {
  newDebt: number; result: DebtGameResult; description: string;
} {
  if (debtorSum > opponentSum) {
    const newDebt = Math.round(currentDebt * 0.7);
    return { newDebt, result: 'debt_reduced',
      description: `Должник ${debtorSum} > взыскатель ${opponentSum}. Долг −30%: ${currentDebt.toLocaleString('ru-RU')} → ${newDebt.toLocaleString('ru-RU')}.` };
  }
  if (debtorSum < opponentSum) {
    const newDebt = Math.round(currentDebt * 1.3);
    return { newDebt, result: 'debt_increased',
      description: `Должник ${debtorSum} < взыскатель ${opponentSum}. Долг +30%: ${currentDebt.toLocaleString('ru-RU')} → ${newDebt.toLocaleString('ru-RU')}.` };
  }
  const newDebt = Math.round(currentDebt * 1.1);
  return { newDebt, result: 'due_extended',
    description: `Ничья ${debtorSum}=${opponentSum}. Срок продлён, долг +10%: ${newDebt.toLocaleString('ru-RU')}.` };
}

// ---------- Black Note: safe / risk / despair ----------
export type BlackNoteRisk = 'safe' | 'risk' | 'despair';

export function applyBlackNote(currentDebt: number, choice: BlackNoteRisk): {
  newDebt: number; result: DebtGameResult; description: string; payNow?: number;
} {
  if (choice === 'safe') {
    const payNow = Math.round(currentDebt * 0.2);
    const newDebt = currentDebt - payNow;
    return { newDebt, result: 'due_extended', payNow,
      description: `Безопасно: оплачено ${payNow.toLocaleString('ru-RU')} ¥, остаток ${newDebt.toLocaleString('ru-RU')}, срок продлён.` };
  }
  if (choice === 'risk') {
    const win = Math.random() < 0.5;
    if (win) {
      const newDebt = Math.round(currentDebt * 0.6);
      return { newDebt, result: 'debt_reduced',
        description: `Риск 50/50: успех. Долг −40%: ${newDebt.toLocaleString('ru-RU')}.` };
    } else {
      const newDebt = Math.round(currentDebt * 1.4);
      return { newDebt, result: 'debt_increased',
        description: `Риск 50/50: провал. Долг +40%: ${newDebt.toLocaleString('ru-RU')}.` };
    }
  }
  // despair: 30% wipe, 70% double
  const win = Math.random() < 0.3;
  if (win) {
    return { newDebt: 0, result: 'debt_paid',
      description: `Отчаяние: 30% удача — весь долг (${currentDebt.toLocaleString('ru-RU')}) списан.` };
  }
  const newDebt = currentDebt * 2;
  return { newDebt, result: 'debt_increased',
    description: `Отчаяние: 70% провал — долг удвоен до ${newDebt.toLocaleString('ru-RU')}.` };
}

// ---------- Last Payment: 100k/30%, 200k/50%, 300k/70% ----------
export const LAST_PAYMENT_OPTIONS: { amount: number; chance: number }[] = [
  { amount: 100_000, chance: 0.30 },
  { amount: 200_000, chance: 0.50 },
  { amount: 300_000, chance: 0.70 },
];

export function applyLastPayment(currentDebt: number, payment: number, chance: number): {
  newDebt: number; result: DebtGameResult; description: string;
} {
  const win = Math.random() < chance;
  if (win) {
    return { newDebt: 0, result: 'debt_paid',
      description: `Последний платёж ${payment.toLocaleString('ru-RU')} (${Math.round(chance * 100)}%): успех. Остаток списан.` };
  }
  // Платёж списывается с долга, остаток +20%
  const remaining = Math.max(0, currentDebt - payment);
  const newDebt = Math.round(remaining * 1.2);
  return { newDebt, result: 'debt_increased',
    description: `Последний платёж ${payment.toLocaleString('ru-RU')} (${Math.round(chance * 100)}%): провал. Платёж списан с долга, остаток ${remaining.toLocaleString('ru-RU')} +20% штрафа = ${newDebt.toLocaleString('ru-RU')}.` };
}

// ---------- Delay Game: 50/50 на продление ----------
export function applyDelayGame(currentDebt: number): {
  newDebt: number; result: DebtGameResult; description: string;
} {
  const win = Math.random() < 0.5;
  if (win) {
    return { newDebt: currentDebt, result: 'due_extended',
      description: `Игра на отсрочку: победа. Срок продлён до конца следующей Большой игры, долг не изменился.` };
  }
  const newDebt = Math.round(currentDebt * 1.2);
  return { newDebt, result: 'debt_increased',
    description: `Игра на отсрочку: провал. Долг +20%: ${currentDebt.toLocaleString('ru-RU')} → ${newDebt.toLocaleString('ru-RU')}.` };
}

// ---------- Kirumi Ransom Table: 4 закрытые карты ----------
export type KirumiRansomCard =
  | 'cancel_part'        // списать 50% долга
  | 'extend_due'         // продлить срок (долг как есть)
  | 'transfer_mondo'     // передать долг Мондо на взыскание (collection)
  | 'pet_candidate';     // пометить как pet_candidate

export function shuffleKirumiCards(): KirumiRansomCard[] {
  const arr: KirumiRansomCard[] = ['cancel_part', 'extend_due', 'transfer_mondo', 'pet_candidate'];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function applyKirumiRansom(currentDebt: number, card: KirumiRansomCard): {
  newDebt: number; result: DebtGameResult; description: string;
  newStatus?: 'collection' | 'pet_candidate' | 'restructured';
} {
  if (card === 'cancel_part') {
    const newDebt = Math.round(currentDebt * 0.5);
    return { newDebt, result: 'debt_reduced',
      description: `«Списать часть»: долг ${currentDebt.toLocaleString('ru-RU')} → ${newDebt.toLocaleString('ru-RU')}.` };
  }
  if (card === 'extend_due') {
    return { newDebt: currentDebt, result: 'due_extended', newStatus: 'restructured',
      description: `«Продлить срок»: долг остался ${currentDebt.toLocaleString('ru-RU')}, статус restructured.` };
  }
  if (card === 'transfer_mondo') {
    return { newDebt: currentDebt, result: 'transferred_to_mondo', newStatus: 'collection',
      description: `«Передать долг Мондо»: долг (${currentDebt.toLocaleString('ru-RU')}) переходит на взыскание.` };
  }
  return { newDebt: currentDebt, result: 'pet_candidate', newStatus: 'pet_candidate',
    description: `«Кандидат в Питомцы»: долг помечен как основание для статуса Питомца. Финальное решение — Селестия.` };
}

// ---------- Метаданные игр для UI ----------
export const DEBT_GAMES_META: Record<DebtGameType, {
  title: string; emoji: string; short: string; rules: string; danger: 'low' | 'medium' | 'high';
}> = {
  three_seals: {
    title: 'Три печати долга',
    emoji: '🔮',
    short: 'Одна из трёх карт меняет долг: −50%, без изменений, +50%.',
    rules: 'Кируми, Мондо, Пеко (с подтверждением Мондо) или владелец долга кладут перед должником три закрытые печати. Должник выбирает одну.\n• Печать «Список»: долг −50%.\n• Печать «Тишина»: долг без изменений.\n• Печать «Тяжесть»: долг +50%.\nЕсли итоговый долг ≥ 1 000 000 ¥, появляется предложение пометить должника как кандидата в Питомцы.',
    danger: 'medium',
  },
  collection_dice: {
    title: 'Кости взыскания',
    emoji: '🎲',
    short: 'Должник vs кредитор по 2 кубика. Победил — −30%, проиграл — +30%, ничья — +10% и срок продлён.',
    rules: 'Каждая сторона бросает по 2 кубика.\n• Должник > взыскатель: долг −30%.\n• Должник < взыскатель: долг +30%.\n• Ничья: долг +10%, срок продлевается.',
    danger: 'medium',
  },
  black_note: {
    title: 'Чёрная расписка',
    emoji: '🖋️',
    short: 'Должник выбирает уровень риска: безопасно, риск 50/50 или отчаяние 30/70.',
    rules: '• Безопасно: оплатить 20% долга сейчас, остаток остаётся, срок продлён.\n• Риск (50/50): −40% при удаче, +40% при провале.\n• Отчаяние (30/70): 30% — весь долг списан, 70% — долг удвоен. При долге ≥ 700 000 ¥ требуется подтверждение ведущего.',
    danger: 'high',
  },
  last_payment: {
    title: 'Последний платёж',
    emoji: '💴',
    short: 'Заплати сейчас 100k/200k/300k и выиграй шанс 30/50/70% списать остаток.',
    rules: 'Должник выбирает сумму платежа.\n• 100 000 ¥ — 30% шанс списать остаток.\n• 200 000 ¥ — 50% шанс.\n• 300 000 ¥ — 70% шанс.\nПри удаче: остаток долга закрывается. При провале: платёж списывается с долга, остаток +20% штрафа.',
    danger: 'medium',
  },
  delay_game: {
    title: 'Игра на отсрочку',
    emoji: '⌛',
    short: '50/50: победа — срок продлён, поражение — долг +20%.',
    rules: 'Простая игра 50/50, не списывает, а торгует временем. При победе — срок продлевается до конца следующей Большой игры. При проигрыше — долг +20%.',
    danger: 'low',
  },
  kirumi_ransom_table: {
    title: 'Выкупной стол Кируми',
    emoji: '🎴',
    short: '4 закрытые карты Кируми: списать 50%, продлить срок, передать Мондо, пометить как Питомца.',
    rules: 'Кируми кладёт 4 закрытые карты:\n• Списать 50% долга.\n• Продлить срок (долг как есть, статус restructured).\n• Передать долг Мондо на взыскание (collection).\n• Пометить должника как кандидата в Питомцы.\nИгрок выбирает одну. Если в игре участвует Мондо, он может убрать одну карту за 100 000 ¥ из своей доли (не из долга).\nЭто отчаянный шаг — играют, когда долг уже горит.',
    danger: 'high',
  },
};
