// Чистая логика «Контрабанды капитала» — без I/O, без React.

export type Team = 'north' | 'south';
export type InspectorAction = 'pass' | 'inspect';
export type RoundResult = 'passed' | 'caught' | 'underestimated' | 'empty_case_trap';

// Денежные константы (обновлено под состав 11 игроков из patch_11)
export const MAX_SMUGGLE_AMOUNT = 400_000;          // было 500k
export const INSPECTOR_MISTAKE_PENALTY = 100_000;
export const EMPTY_CASE_REWARD = 100_000;
export const PERSONAL_COMMISSION_RATE = 0.10;
export const WINNING_TEAM_REWARD = 150_000;          // было 200k
export const LOSING_TEAM_PENALTY = 75_000;           // было 100k
export const TOTAL_ROUNDS = 4;                       // было 7
export const TEAM_SIZE = 4;                          // было 7
export const INITIAL_TEAM_SAFE = 2_000_000;          // было 3M

export const TEAM_LABELS: Record<Team, string> = {
  north: 'Северный банк',
  south: 'Южный банк',
};

export const TEAM_COLORS: Record<Team, { hex: string; tw: string }> = {
  north: { hex: '#3b82f6', tw: 'sky' },     // голубой
  south: { hex: '#f59e0b', tw: 'amber' },   // золотой
};

export interface RoundDeltas {
  /** изменение командного счёта (только для отслеживания победителя) */
  northScoreDelta: number;
  southScoreDelta: number;
  /** изменение реального баланса Контрабандиста (через Казну) */
  smugglerPersonalDelta: number;
  /** изменение реального баланса Таможенника (через Казну) */
  inspectorPersonalDelta: number;
  /** результат раунда */
  result: RoundResult;
}

export interface RoundInput {
  smugglerTeam: Team;
  inspectorTeam: Team;
  smuggledAmount: number;
  inspectorAction: InspectorAction;
  suspectedAmount?: number;
}

/** Расчёт результатов раунда. Никаких побочных эффектов — UI потом применяет дельты. */
export function resolveRound(input: RoundInput): RoundDeltas {
  const { smugglerTeam, inspectorTeam, smuggledAmount, inspectorAction, suspectedAmount } = input;
  const out: RoundDeltas = {
    northScoreDelta: 0,
    southScoreDelta: 0,
    smugglerPersonalDelta: 0,
    inspectorPersonalDelta: 0,
    result: 'passed',
  };

  // Сценарий 4: пустой кейс + проверка → ловушка
  if (inspectorAction === 'inspect' && smuggledAmount === 0) {
    out.result = 'empty_case_trap';
    out.smugglerPersonalDelta = EMPTY_CASE_REWARD;
    out.inspectorPersonalDelta = -INSPECTOR_MISTAKE_PENALTY;
    return out;
  }

  // Сценарий 1: пропустил
  if (inspectorAction === 'pass') {
    out.result = 'passed';
    addToTeam(out, smugglerTeam, smuggledAmount);
    out.smugglerPersonalDelta = Math.floor(smuggledAmount * PERSONAL_COMMISSION_RATE);
    return out;
  }

  // Сценарий 2: проверил и угадал (suspected >= smuggled)
  const suspected = suspectedAmount ?? 0;
  if (inspectorAction === 'inspect' && suspected >= smuggledAmount && smuggledAmount > 0) {
    out.result = 'caught';
    addToTeam(out, inspectorTeam, smuggledAmount);
    out.inspectorPersonalDelta = Math.floor(smuggledAmount * PERSONAL_COMMISSION_RATE);
    return out;
  }

  // Сценарий 3: проверил, но недооценил (suspected < smuggled)
  if (inspectorAction === 'inspect' && suspected < smuggledAmount) {
    out.result = 'underestimated';
    addToTeam(out, smugglerTeam, smuggledAmount);
    out.smugglerPersonalDelta = Math.floor(smuggledAmount * PERSONAL_COMMISSION_RATE);
    out.inspectorPersonalDelta = -INSPECTOR_MISTAKE_PENALTY;
    return out;
  }

  return out;
}

function addToTeam(out: RoundDeltas, team: Team, amount: number) {
  if (team === 'north') out.northScoreDelta += amount;
  else out.southScoreDelta += amount;
}

/** Кто победил по итогам 7 раундов. */
export function pickWinner(northScore: number, southScore: number): Team | 'draw' {
  if (northScore > southScore) return 'north';
  if (southScore > northScore) return 'south';
  return 'draw';
}

/**
 * Случайное распределение игроков по 2 командам.
 * Возвращает [север, юг]. Размер команды можно перекрыть параметром.
 */
export function randomSplit(playerIds: string[], teamSize: number = TEAM_SIZE): [string[], string[]] {
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const north = shuffled.slice(0, teamSize);
  const south = shuffled.slice(teamSize, teamSize * 2);
  return [north, south];
}

/** Может ли игрок ещё быть Контрабандистом в этой команде (используется UI-фильтром). */
export function canBeSmuggler(playerId: string, smugglerHistoryByTeam: Record<Team, string[]>, team: Team, teamPlayers: string[]): boolean {
  const used = smugglerHistoryByTeam[team] ?? [];
  // Если все игроки команды уже были — разрешаем повторно (страховка от длинных игр)
  if (used.length >= teamPlayers.length) return true;
  return !used.includes(playerId);
}
