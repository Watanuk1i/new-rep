'use client';

// Страница диагностики Supabase. Открой /debug чтобы проверить подключение.
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

const REQUIRED_TABLES = [
  'room_state', 'participants', 'challenges', 'pari',
  'debts', 'super_games', 'events', 'notifications',
  'rumors', 'content_blocks', 'history',
];

interface RawDump {
  url: string;
  httpStatus: number | null;
  httpStatusText: string;
  body: string;
  error: string | null;
}

export default function DebugPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('—');
  const [hasSchemaCacheError, setHasSchemaCacheError] = useState(false);
  const [rawDump, setRawDump] = useState<RawDump | null>(null);

  const run = async () => {
    setRunning(true);
    setHasSchemaCacheError(false);
    setRawDump(null);
    const results: CheckResult[] = [];
    let schemaCacheSeen = false;

    // 1. ENV
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const projectRef = url ? (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? '?') : '';
    results.push({
      name: 'ENV: NEXT_PUBLIC_SUPABASE_URL',
      ok: !!url,
      detail: url ? `${url}  (project: ${projectRef})` : '❌ не задана',
      hint: !url
        ? 'Добавь в Vercel → Settings → Environment Variables и сделай Redeploy.'
        : 'Запоминай этот project ref! SQL надо запускать именно в этом проекте Supabase.',
    });
    const keyKind = key
      ? (key.startsWith('sb_publishable_') ? 'publishable (новый формат)'
        : key.startsWith('eyJ') ? 'JWT anon (legacy)'
        : 'неизвестный формат')
      : '';
    results.push({
      name: 'ENV: NEXT_PUBLIC_SUPABASE_ANON_KEY',
      ok: !!key,
      detail: key ? `${key.slice(0, 16)}... · ${key.length} симв · ${keyKind}` : '❌ не задана',
      hint: key && key.startsWith('sb_publishable_')
        ? 'Новый формат публикабельного ключа поддерживается в @supabase/supabase-js 2.49+. Если в проекте старее — обнови или используй legacy JWT (anon public).'
        : undefined,
    });

    // 2. Клиент
    const sb = getSupabase();
    results.push({
      name: 'Supabase client',
      ok: !!sb,
      detail: sb ? '✅ создан' : '❌ не создан (см. ENV выше)',
    });

    if (!sb) {
      setChecks(results);
      setRunning(false);
      return;
    }

    // 3. Подключение — простой select
    try {
      const { data, error } = await sb.from('room_state').select('id, season, day').limit(1);
      const errMsg = error?.message || '';
      const isSchemaCache = /schema cache/i.test(errMsg);
      if (isSchemaCache) schemaCacheSeen = true;
      results.push({
        name: 'Запрос к room_state',
        ok: !error,
        detail: error ? `❌ ${errMsg}` : `✅ ${JSON.stringify(data)}`,
        hint: isSchemaCache
          ? "PostgREST кэш не перечитал схему после CREATE TABLE. Запусти в SQL Editor: NOTIFY pgrst, 'reload schema';  — или Supabase → Settings → API → Restart."
          : undefined,
      });
    } catch (e: any) {
      results.push({
        name: 'Запрос к room_state',
        ok: false,
        detail: `❌ ${e.message}`,
      });
    }

    // 4. Все таблицы
    for (const t of REQUIRED_TABLES) {
      try {
        const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
        const errMsg = error?.message || '';
        if (/schema cache/i.test(errMsg)) schemaCacheSeen = true;
        results.push({
          name: `Таблица ${t}`,
          ok: !error,
          detail: error ? `❌ ${errMsg}` : `✅ строк: ${count ?? 0}`,
        });
      } catch (e: any) {
        results.push({
          name: `Таблица ${t}`,
          ok: false,
          detail: `❌ ${e.message}`,
        });
      }
    }

    // 4.5. Сид: p-gm и p-queen
    try {
      const { data, error } = await sb.from('participants')
        .select('id, display_name, password, is_registered')
        .in('id', ['p-gm', 'p-queen']);
      const has = (id: string) => (data || []).some((p: any) => p.id === id);
      const ok = !error && has('p-gm') && has('p-queen');
      results.push({
        name: 'Seed: p-gm и p-queen',
        ok,
        detail: error
          ? `❌ ${error.message}`
          : ok
            ? `✅ оба на месте (логины host / queen)`
            : `❌ найдено ${(data || []).length}/2 — id-шки в БД не совпадают с ожидаемыми`,
        hint: !ok && !error
          ? 'В Supabase SQL Editor выполни supabase/setup.sql — он пересоздаст всю БД с 16 участниками за один прогон.'
          : undefined,
      });
    } catch (e: any) {
      results.push({
        name: 'Seed: p-gm и p-queen',
        ok: false,
        detail: `❌ ${e.message}`,
      });
    }

    // 4.6. RAW HTTP-вызов прямо к PostgREST — минуя supabase-js
    if (url && key) {
      try {
        const rawUrl = `${url}/rest/v1/participants?select=id,display_name,status&limit=5`;
        const resp = await fetch(rawUrl, {
          method: 'GET',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
          },
        });
        const text = await resp.text();
        setRawDump({
          url: rawUrl,
          httpStatus: resp.status,
          httpStatusText: resp.statusText,
          body: text,
          error: null,
        });
      } catch (e: any) {
        setRawDump({
          url: '',
          httpStatus: null,
          httpStatusText: '',
          body: '',
          error: e?.message || String(e),
        });
      }
    }

    // 5. Realtime
    try {
      const channel = sb.channel('debug-test');
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {})
        .subscribe((status) => {
          setRealtimeStatus(status);
        });
      setTimeout(() => sb.removeChannel(channel), 3000);
    } catch (e: any) {
      setRealtimeStatus(`❌ ${e.message}`);
    }

    setChecks(results);
    setHasSchemaCacheError(schemaCacheSeen);
    setRunning(false);
  };

  useEffect(() => {
    run();
  }, []);

  const copy = (text: string) => {
    try { navigator.clipboard.writeText(text); } catch { /* noop */ }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <div className="glass-strong gold-border p-4">
        <h1 className="font-heading text-xl font-bold text-gradient-gold">🔧 Диагностика Supabase</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Проверка подключения к базе данных. Если все галочки зелёные — БД работает.
        </p>
      </div>

      <button onClick={run} disabled={running} className="btn-primary w-full">
        {running ? 'Проверяю...' : '🔄 Запустить проверку заново'}
      </button>

      {hasSchemaCacheError && (
        <div className="glass-strong gold-border p-4 space-y-2">
          <div className="font-bold text-sm text-gold">⚠️ Обнаружена ошибка кэша схемы PostgREST</div>
          <p className="text-xs text-muted-foreground">
            Таблицы созданы, но PostgREST ещё не перечитал схему. Запусти в Supabase → SQL Editor:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 block p-2 bg-black/40 rounded-md text-[11px] text-gold font-mono select-all">
              NOTIFY pgrst, &apos;reload schema&apos;;
            </code>
            <button onClick={() => copy("NOTIFY pgrst, 'reload schema';")}
              className="px-3 py-2 rounded-md bg-card/60 border border-white/8 active:bg-white/5 text-xs">⧉</button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Альтернатива: Supabase Dashboard → Settings → API → кнопка <b>Restart</b>.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {checks.map((c, i) => (
          <div key={i} className="glass p-3 flex items-start gap-3">
            <span className="text-xl">{c.ok ? '✅' : '❌'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{c.name}</div>
              <div className="text-xs text-muted-foreground break-all mt-0.5">{c.detail}</div>
              {c.hint && (
                <div className="text-[11px] text-amber-300/90 mt-1 bg-amber-500/5 border border-amber-500/20 rounded-md p-2">
                  💡 {c.hint}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="glass p-3 space-y-2">
        <div className="text-xs font-bold uppercase tracking-widest text-gold/70">
          🔬 Сырой ответ API (минуя supabase-js)
        </div>
        {!rawDump ? (
          <div className="text-xs text-muted-foreground">— ещё не выполнен</div>
        ) : rawDump.error ? (
          <div className="text-xs text-red-300">❌ Сетевая ошибка: {rawDump.error}</div>
        ) : (
          <>
            <div className="text-[10px] text-muted">URL запроса:</div>
            <code className="block text-[10px] text-gold/90 break-all bg-black/30 p-2 rounded">
              {rawDump.url}
            </code>
            <div className="text-[10px] text-muted">HTTP статус:</div>
            <code className={
              'block text-xs font-mono p-2 rounded ' +
              (rawDump.httpStatus && rawDump.httpStatus >= 200 && rawDump.httpStatus < 300
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-red-500/10 text-red-300')
            }>
              {rawDump.httpStatus} {rawDump.httpStatusText}
            </code>
            <div className="text-[10px] text-muted">Тело ответа (первые 500 символов):</div>
            <code className="block text-[10px] font-mono break-all bg-black/30 p-2 rounded max-h-48 overflow-auto whitespace-pre-wrap">
              {rawDump.body.slice(0, 500) || '(пусто)'}
            </code>
            <div className="text-[10px] text-muted-foreground leading-relaxed">
              <b>Что должно быть:</b> HTTP <b>200</b>, тело — JSON-массив с 5 объектами вида{' '}
              <code className="bg-black/30 px-1 rounded">{'{"id":"p-gm",...}'}</code>.<br />
              <b>HTTP 200, но тело <code className="bg-black/30 px-1 rounded">[]</code></b> —
              у роли anon нет прав. Запусти ещё раз setup.sql (там есть GRANT-ы).<br />
              <b>HTTP 401/403</b> — неверный API-ключ. Проверь Vercel ENV и Redeploy.<br />
              <b>HTTP 404 / table not found</b> — таблиц нет, setup.sql не применён.<br />
              <b>HTTP 406 / schema cache</b> — выполни{' '}
              <code className="bg-black/30 px-1 rounded">NOTIFY pgrst, &apos;reload schema&apos;;</code>
            </div>
          </>
        )}
      </div>

      <div className="glass p-3">
        <div className="text-xs font-bold uppercase tracking-widest text-gold/70 mb-1">Realtime статус</div>
        <div className="text-sm font-mono">{realtimeStatus}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          Если в течение нескольких секунд после загрузки увидел <b>SUBSCRIBED</b> — Realtime работает.
          Тестовый канал автоматически отключается через ~3 сек, поэтому в итоге статус становится
          <b> CLOSED</b> — это норма. Плохо если статус <b>CHANNEL_ERROR</b> или сразу <b>CLOSED</b> —
          тогда Realtime не настроен (Supabase → Database → Replication → publication{' '}
          <code className="px-1 bg-black/30 rounded">supabase_realtime</code>).
        </div>
      </div>

      <div className="glass p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-widest text-gold/70">Если что-то не работает</div>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
          <li>В Vercel Settings → Environment Variables проверь:
            <code className="block mt-1 p-1 bg-black/30 rounded text-[10px] break-all">NEXT_PUBLIC_SUPABASE_URL</code>
            <code className="block mt-1 p-1 bg-black/30 rounded text-[10px] break-all">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            После добавления — Redeploy.
          </li>
          <li><b>Главный путь починки</b> — открой Supabase → SQL Editor → скопируй и выполни целиком файл{' '}
            <code className="bg-black/30 px-1 rounded">supabase/setup.sql</code>.
            Это <u>сбросит и заново создаст</u> всю БД с правильными 16 участниками за один прогон.
            После этого все галочки выше должны позеленеть.
          </li>
          <li>Если ошибка <b>&quot;schema cache&quot;</b> — выполни{' '}
            <code className="bg-black/30 px-1 rounded">NOTIFY pgrst, &apos;reload schema&apos;;</code>{' '}
            или Settings → API → Restart.
          </li>
          <li>Если Realtime <b>CHANNEL_ERROR</b> — Supabase → Database → Replication, добавь все таблицы в publication <code>supabase_realtime</code>.</li>
        </ol>
      </div>
    </div>
  );
}
