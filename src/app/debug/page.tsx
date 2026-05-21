'use client';

// Страница диагностики Supabase. Открой /debug чтобы проверить подключение.
import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

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

export default function DebugPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('—');
  const [hasSchemaCacheError, setHasSchemaCacheError] = useState(false);

  const run = async () => {
    setRunning(true);
    setHasSchemaCacheError(false);
    const results: CheckResult[] = [];
    let schemaCacheSeen = false;

    // 1. ENV
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    results.push({
      name: 'ENV: NEXT_PUBLIC_SUPABASE_URL',
      ok: !!url,
      detail: url ? `${url.slice(0, 50)}` : '❌ не задана',
      hint: !url ? 'Добавь в Vercel → Settings → Environment Variables и сделай Redeploy.' : undefined,
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
          ? 'PostgREST кэш не перечитал схему после CREATE TABLE. Запусти в SQL Editor: NOTIFY pgrst, \'reload schema\'; — или Supabase → Settings → API → Restart.'
          : undefined,
      });
    } catch (e: any) {
      results.push({
        name: 'Запрос к room_state',
        ok: false,
        detail: `❌ ${e.message}`,
      });
    }

    // 4. Проверяем все таблицы
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

    // 4.5. Проверка целостности seed-а — есть ли p-gm и p-queen
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
          ? 'В Supabase SQL Editor выполни supabase/fix_accounts.sql — он пересоздаст 16 участников с правильными id и паролями.'
          : undefined,
      });
    } catch (e: any) {
      results.push({
        name: 'Seed: p-gm и p-queen',
        ok: false,
        detail: `❌ ${e.message}`,
      });
    }

    // 5. Realtime
    try {
      const channel = sb.channel('debug-test');
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {})
        .subscribe((status) => {
          setRealtimeStatus(status);
        });
      // отписываемся через 3 сек
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
    try { navigator.clipboard.writeText(text); } catch {}
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
            Это самая частая ошибка после запуска миграции. Таблицы созданы, но PostgREST
            ещё не перечитал схему. Запусти в Supabase → SQL Editor:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 block p-2 bg-black/40 rounded-md text-[11px] text-gold font-mono select-all">
              NOTIFY pgrst, 'reload schema';
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

      <div className="glass p-3">
        <div className="text-xs font-bold uppercase tracking-widest text-gold/70 mb-1">Realtime статус</div>
        <div className="text-sm font-mono">{realtimeStatus}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          Должно быть: SUBSCRIBED. Если CLOSED или CHANNEL_ERROR — Realtime не включён в Supabase
          (Database → Replication → publication <code>supabase_realtime</code>).
        </div>
      </div>

      <div className="glass p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-widest text-gold/70">Если что-то не работает</div>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
          <li>В Vercel Settings → Environment Variables проверь:
            <code className="block mt-1 p-1 bg-black/30 rounded text-[10px] break-all">NEXT_PUBLIC_SUPABASE_URL</code>
            <code className="block mt-1 p-1 bg-black/30 rounded text-[10px] break-all">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            После добавления — Redeploy.
          </li>
          <li>Если таблиц нет — открой Supabase → SQL Editor → выполни <code className="bg-black/30 px-1 rounded">supabase/migrations/002_full_schema.sql</code></li>
          <li>Если логин host/queen не пускает — выполни <code className="bg-black/30 px-1 rounded">supabase/fix_accounts.sql</code></li>
          <li>Если Realtime CLOSED — Supabase → Database → Replication, добавь все таблицы в publication <code>supabase_realtime</code>.</li>
          <li>Если ошибка "schema cache" — выполни <code className="bg-black/30 px-1 rounded">NOTIFY pgrst, 'reload schema';</code> или Restart в Settings → API.</li>
        </ol>
      </div>
    </div>
  );
}
