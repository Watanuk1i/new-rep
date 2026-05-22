# Контекст проекта «Академия — Безумный Азарт»

> **Файл для следующей сессии.** Прочитай его до того как что-то делать.

## Кто я
Senior full-stack разработчик, помогаю **Watanuk1i** с ролевым игровым сайтом в стилистике **Danganronpa**.

## Репозиторий
- **GitHub**: `Watanuk1i/new-rep` → ветка `main` (работаем только в ней, никаких фича-веток!)
- Старый репозиторий `Watanuk1i/het-get-hp` — **не используется**
- Деплой: **Vercel** (auto-deploy на push в `main`)
- Пользователь часто правит файлы прямо в GitHub UI (`.env.local`, etc.) пока я работаю → push отвергается → нужен `git rebase origin/main` → потом push снова. Использовать `mcp_sandbox_github_pull_repository` (raw `git fetch/pull` в sandbox не работает — нет auth).

## Стек
- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Supabase** (PostgreSQL + Realtime) — единая БД для всех игроков
- **`@supabase/supabase-js` ^2.49.0**
- Шрифт: **Montserrat**, тёмная тема: золото `#d4af37`, бордо `#8b1a1a`
- Mobile-first

## Архитектура
- Глобальный стор: `src/lib/store/StoreProvider.tsx` — все коллекции из БД + Realtime подписки
- **localStorage-кэш** (CACHE_KEY=`academy-cache-v1`, TTL 24ч) — мгновенный первый рендер. Если меняешь форму `State` — увеличивай `CACHE_VERSION`
- localStorage хранит `academy-auth-v4` (id текущего юзера) и кэш стора. Никакой Supabase auth — простой mock-логин по `display_name`/`password`

## Текущее состояние Supabase

| Параметр | Значение |
|---|---|
| Project ref | `ceueyrpynjvvpvmogfzc` |
| URL | `https://ceueyrpynjvvpvmogfzc.supabase.co` |
| Region | `eu-west-1` (Ireland) |
| API key | **legacy JWT** (anon, начинается с `eyJ...`), НЕ `sb_publishable_*`. С новыми ключами PostgREST возвращал HTTP 200 + `[]` несмотря на правильные GRANT-ы и Exposed Schemas |
| Realtime publication | `supabase_realtime` подключена ко всем таблицам |

## Структура файлов

```
supabase/
└── setup.sql                   # ЕДИНСТВЕННЫЙ актуальный SQL (никаких migrations/, fix_accounts.sql, seed.sql — все удалены)

решение-бз/
├── README.md
├── fix_database.sql            # Та же функциональность что setup.sql, но с акцентом на починку 0 игроков
└── PROJECT_CONTEXT.md          # ← ты читаешь этот файл

src/
├── app/
│   ├── page.tsx                # Главная (рейтинг + события)
│   ├── layout.tsx              # StoreProvider + TopBar + SideNav + BottomNav
│   ├── login/page.tsx          # mock auth по display_name + password
│   ├── debug/page.tsx          # Диагностика, есть «Сырой ответ API» с raw fetch
│   ├── admin/page.tsx          # Админка GM/Queen — есть вкладка 🔑 «Аккаунты»
│   ├── games/
│   │   ├── page.tsx                  # Список вызовов, валидация баланса при accept
│   │   ├── create/page.tsx           # Создание вызова, 9 типов игр
│   │   └── play/[type]/page.tsx      # ⭐ Пошаговые игры через challenge.result_data
│   └── pari/, debts/, rumors/, super-games/, profile/[id]/, ...
├── components/
│   ├── layout/...
│   ├── cards/ParticipantCard.tsx
│   └── ui/{CharacterIcon,Yen,ToastHost}.tsx
└── lib/
    ├── store/{StoreProvider.tsx,types.ts}
    ├── supabase/client.ts
    └── utils.ts
```

## Spec-аккаунты (после `решение-бз/fix_database.sql`)
- **GM** (Монокума): логин `host`, пароль `host_academy_2026`, id=`p-gm`
- **Queen** (Селестия): логин `queen`, пароль `queen_celestia_2026`, id=`p-queen`
- Игроки `p-1`..`p-14` — login = display_name (целиком, например `Макото Наэги`), password = `NULL` → войти можно с **любым** паролем

## Как устроены малые игры (`/games/play/[type]`)
9 типов: `dice`, `high_card`, `roulette`, `slots`, `blackjack`, `bluff_duel`, `truth_or_bet`, `find_pair`, `find_joker`.

**Архитектура** (всё через `challenges.result_data` JSONB + Realtime):
1. Pending → Accepted (соперник принял, проверка баланса)
2. **Ready phase** — оба должны нажать «Я готов»
3. **Playing phase** — пошагово, каждое действие пишется через `patchResult()` (read-modify-write для избежания гонок)
4. **Finished** — `finishMatch()` начисляет банк, обновляет wins/losses, history, шлёт уведомления обоим

**Полноценно пошаговые**: `dice` (каждый кидает свои 2d6), `blackjack` (hit/stand по очереди, bust на >21), `find_pair` (мемори 8 карт), `find_joker` (5 карт, 1 джокер).

**Простые** (`high_card`, `roulette`, `slots`, `bluff_duel`, `truth_or_bet`) — после ready creator жмёт одну кнопку «Сыграть!», RNG решает.

## TODO для следующей сессии — «Правило меньшинства»

Пользователь хочет **упрощённую версию** Большой игры:

**Поток:**
1. GM в админке создаёт «Правило меньшинства», добавляет игроков (или «всех активных»)
2. На странице игры (`/super-games/[id]`) — описание + правила игры + список участников
3. GM жмёт «Запустить игру» → у каждого списывается **100 000 ейн**, формируется банк
4. GM жмёт «Выбрать вопросника» → сайт случайно выбирает игрока, показывает его всем
5. Игрок задаёт вопрос «Да/Нет» в реальной жизни голосом, **не на сайте**
6. GM жмёт «Запустить раунд» → таймер 10 мин (GM может менять длительность)
7. У игроков появляются кнопки **Да** / **Нет**, голосуют тайно
8. По таймеру или вручную GM закрывает раунд → раскрытие
9. Показывается: каждый игрок и за что он голосовал, статистика, кто в большинстве, кто в меньшинстве
10. Большинство выбывает, меньшинство → следующий раунд
11. При ничьей — раунд переигрывается
12. Когда осталось 1-2 игрока — GM **вручную выбирает победителя**
13. Победителю начисляется весь банк, статус → finished, запись в history

**Что нужно:**
- Добавить в БД колонку `super_games.state JSONB DEFAULT '{}'::jsonb` (через ALTER TABLE если БД уже развёрнута, плюс добавить в `setup.sql`)
- Тип `MinorityRuleState` в `src/lib/store/types.ts`
- Компонент в `src/app/super-games/[id]/page.tsx` (определять по `super_games.type === 'minority_rule'`)
- В админке `src/app/admin/page.tsx` в `SuperGamesAdmin` добавить шаблон + кнопку «Добавить всех активных»

**Структура `state`:**
```typescript
type MinorityRuleState = {
  type: 'minority_rule';
  bank: number;
  stakePerPlayer: number; // 100000
  round: number;
  activePlayerIds: string[];
  eliminatedPlayerIds: string[];
  questionerId?: string;
  votingDurationSec: number; // GM меняет, дефолт 600
  votingEndsAt?: string;
  votingOpen: boolean;
  votes: Record<string, 'yes'|'no'>; // не показывать до reveal
  revealed: boolean;
  history: Array<{
    round: number; questionerId: string;
    yesVoters: string[]; noVoters: string[];
    yesCount: number; noCount: number;
    eliminatedIds: string[]; survivedIds: string[];
    wasTie: boolean;
  }>;
  winnerId?: string;
  banked: boolean;
};
```

## Грабли — НЕ ПОВТОРЯТЬ

1. **`.env.local` коммитится в репо** — пользователь так делает руками через GitHub UI. Не пытайся это исправить, просто работай с этим.
2. **Push отвергается часто** — пользователь правит `.env.local` на GitHub пока я работаю. Решение: `mcp_sandbox_github_pull_repository` → `git rebase origin/main` через `execute_bash` → push снова.
3. **`fs_write` принимает `path` и `text`**, не `file`/`modifiedContent`. Не путать.
4. **`execute_bash` нужен `cwd: '/projects/sandbox/new-rep'`** для git-команд. Без него — «not a git repository».
5. **`mcp_sandbox_github_push_to_remote`** требует `owner`, `repository_name`, `path`, `remote_branch_name`. Без них падает с validation error.
6. **`git fetch/pull` напрямую через `execute_bash`** не работает — sandbox без auth. Использовать MCP-инструменты `github_pull_repository` / `github_push_to_remote`.
7. **`sb_publishable_*` ключи ломают anon-доступ** даже при правильных GRANT-ах и Exposed Schemas → переключиться на legacy JWT в Vercel ENV.
8. **PostgREST schema cache залипает** после `CREATE TABLE` → в конце SQL всегда `NOTIFY pgrst, 'reload schema';`. После DROP+CREATE и `GRANT ALL` нужен Pause/Resume проекта.
9. **`seed.sql` НЕ нужен** — он удалён из репо. Был артефактом старой схемы со своей таблицей `characters`. Сейчас весь сид лежит в `supabase/setup.sql` и `решение-бз/fix_database.sql`.

## Mantras (как с пользователем)
- Делай всё в `main`, без отдельных веток (он сам сказал: «не делай новых репозиторий, делай все в одном»)
- Не учи безопасности когда явно сказал «делай а не учи»
- Шаги должны быть **очень конкретными**, со ссылками и точным текстом для копирования
- Если не понимает UI Supabase — давай SQL вместо UI-инструкций
- Если жалуется на «то же самое» — проси скрин блока «Сырой ответ API» с `/debug` (HTTP-статус + тело)

## Спецаккаунты
- **GM** (Монокума): `host` / `host_academy_2026` → `p-gm`
- **Queen** (Селестия): `queen` / `queen_celestia_2026` → `p-queen`
- Игроки `p-1`..`p-14` — login = display_name, любой пароль

## Терминология проекта
- Валюта — **«ейн»**
- Статусы: Игрок, Питомец, Хозяин, Элита, Королева, Ведущий, Коллектор
- Большие игры = **Супер игры**

---

**Файл актуален на 21.05.2026.** Перед стартом новой сессии **обязательно прочитать целиком**.
