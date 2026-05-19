// Дефолтные данные при первом запуске (mock; легко заменить на запрос Supabase)
import { AppState, Participant, ParticipantStatus } from './types';

const NAMES_DR1 = [
  'Макото Наэги', 'Кёко Киригири', 'Бьякуя Тогами', 'Токо Фукава',
  'Аой Асахина', 'Ясухиро Хагакуре', 'Сакура Огами', 'Леон Кувата',
  'Саяка Майзоно', 'Чихиро Фуджисаки', 'Мондо Овада', 'Киётака Ишимару',
  'Хифуми Ямада', 'Джунко Эношима',
];

function randBalance() {
  // Баланс от 100,000 до 10,000,000 ейнов
  const min = 100_000, max = 10_000_000;
  // Логнормальное распределение для большего реализма
  const v = Math.exp(Math.random() * (Math.log(max) - Math.log(min)) + Math.log(min));
  return Math.round(v / 100) * 100;
}

export function buildInitialState(): AppState {
  // 1 ведущий (Монокума), 1 королева (Селестия), 14 игроков
  const queen: Participant = {
    id: 'p-queen',
    display_name: 'Селестия Люденберг',
    character_slug: 'celestia-ludenberg',
    sprite_sheet: 1,
    sprite_y: null,
    sprite_size: 86,
    custom_icon_url: null,
    balance: 9_500_000,
    status: 'queen',
    reputation: 95,
    wins: 0,
    losses: 0,
    is_active: true,
  };

  const gm: Participant = {
    id: 'p-gm',
    display_name: 'Монокума',
    character_slug: 'monokuma',
    sprite_sheet: null,
    sprite_y: null,
    sprite_size: 86,
    custom_icon_url: null,
    balance: 999_999_999,
    status: 'gm',
    reputation: 100,
    wins: 0,
    losses: 0,
    is_active: true,
  };

  const players: Participant[] = NAMES_DR1.map((name, i) => ({
    id: `p-${i + 1}`,
    display_name: name,
    character_slug: name.toLowerCase().replace(/[^a-zа-я]+/gi, '-'),
    sprite_sheet: ((i % 3) + 1) as 1 | 2 | 3,
    sprite_y: i * 86,
    sprite_size: 86,
    custom_icon_url: null,
    balance: randBalance(),
    status: 'player' as ParticipantStatus,
    reputation: Math.floor(40 + Math.random() * 50),
    wins: 0,
    losses: 0,
    is_active: true,
  }));

  return {
    season: 1,
    day: 1,
    participants: [gm, queen, ...players],
    pari: [
      {
        id: 'pari-1',
        creator_id: 'p-queen',
        is_anonymous: false,
        title: 'Кто победит в первой Большой Игре?',
        description: 'Угадайте победителя «Правила меньшинства»',
        options: [
          { id: 'opt-1', label: 'Бьякуя', kind: 'custom' },
          { id: 'opt-2', label: 'Кёко', kind: 'custom' },
          { id: 'opt-3', label: 'Другой участник', kind: 'custom' },
        ],
        bets: [],
        comments: [],
        commission_pct: 5,
        closes_on_day: 3,
        status: 'open',
        created_at: Date.now() - 1000 * 60 * 30,
      },
      {
        id: 'pari-2',
        creator_id: 'p-1',
        is_anonymous: false,
        title: 'Чихиро признается до конца дня?',
        options: [
          { id: 'opt-y', label: 'Да', kind: 'yes' },
          { id: 'opt-n', label: 'Нет', kind: 'no' },
        ],
        bets: [],
        comments: [],
        commission_pct: 3,
        closes_on_day: 1,
        status: 'open',
        created_at: Date.now() - 1000 * 60 * 60,
      },
    ],
    debts: [],
    superGames: [
      {
        id: 'sg-1',
        title: 'Правило меньшинства',
        type: 'minority_rule',
        description: 'Голосуйте за вариант, который выберет меньшинство.',
        rules: '5 раундов. Меньшинство получает очки. Большинство платит.',
        stakes: '500 000 ейнов с каждого. Проигравший — Питомец.',
        status: 'scheduled',
        participant_ids: ['p-1', 'p-2', 'p-3', 'p-8', 'p-9'],
        starts_at: '2026-05-25T19:00:00',
        spectator_bets_enabled: true,
      },
    ],
    events: [
      {
        id: 'ev-1',
        type: 'queen_announcement',
        title: 'Селестия объявляет открытие сезона',
        body: 'Сезон 1 открыт. Делайте ставки. Помните: долги нельзя оставлять без внимания.',
        created_at: Date.now() - 1000 * 60 * 60,
      },
      {
        id: 'ev-2',
        type: 'big_game_start',
        title: 'Большая игра «Правило меньшинства» запланирована',
        body: '5 участников · 25 мая, 19:00',
        link_url: '/super-games/sg-1',
        created_at: Date.now() - 1000 * 60 * 30,
      },
    ],
    rumors: [
      {
        id: 'r-1',
        author_id: 'p-queen',
        is_anonymous: false,
        title: 'Тайна Чихиро',
        text: 'Кто-то видел странные вещи в его комнате...',
        truth_level: 'unknown',
        created_at: Date.now() - 1000 * 60 * 90,
      },
    ],
    currentUserId: null,
  };
}

// Спецаккаунты
export const SPECIAL_ACCOUNTS = {
  gm: { username: 'host', password: 'host_academy_2026', participant_id: 'p-gm' },
  queen: { username: 'queen', password: 'queen_celestia_2026', participant_id: 'p-queen' },
};
