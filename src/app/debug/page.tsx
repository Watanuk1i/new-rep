'use client';

// Страница диагностики Supabase. Открой /debug чтобы проверить подключение.
import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
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

  const run = async () => {
    setRunning(true);
    const results: CheckResult[] = [];

    // 1. ENV
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    results.push({
      name: 'ENV: NEXT_PUBLIC_SUPABASE_URL',
      ok: !!url,
      detail: url ? `${url.slice(0, 35)}...` : '❌ не задана',
    });
    results.push({
      name: 'ENV: NEXT_PUBLIC_SUPABASE_ANON_KEY',
      ok: !!key,
      detail: key ? `${key.slice(0, 12)}... (${key.length} символов)` : '❌ не задана',
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

    // 3. Подключение — делаем простой select
    try {
      const { data, error } = await sb.from('room_state').select('id, season, day').limit(1);
      results.push({
        name: 'Запрос к room_state',
        ok: !error,
        detail: error ? `❌ ${error.message}` : `✅ ${JSON.stringify(data)}`,
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
        results.push({
          name: `Таблица ${t}`,
          ok: !error,
          detail: error ? `❌ ${error.message}` : `✅ строк: ${count ?? 0}`,
        });
      } catch (e: any) {
        results.push({
          name: `Таблица ${t}`,
          ok: false,
          detail: `❌ ${e.message}`,
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
      // отписываемся через 3 сек
      setTimeout(() => sb.removeChannel(channel), 3000);
    } catch (e: any) {
      setRealtimeStatus(`❌ ${e.message}`);
    }

    setChecks(results);
    setRunning(false);
  };

  useEffect(() => {
    run();
  }, []);

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

      <div className="space-y-2">
        {checks.map((c, i) => (
          <div key={i} className="glass p-3 flex items-start gap-3">
            <span className="text-xl">{c.ok ? '✅' : '❌'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{c.name}</div>
              <div className="text-xs text-muted-foreground break-all mt-0.5">{c.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass p-3">
        <div className="text-xs font-bold uppercase tracking-widest text-gold/70 mb-1">Realtime статус</div>
        <div className="text-sm font-mono">{realtimeStatus}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          Должно быть: SUBSCRIBED. Если CLOSED или CHANNEL_ERROR — Realtime не включён в Supabase.
        </div>
      </div>

      <div className="glass p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-widest text-gold/70">Что делать если ошибки?</div>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
          <li>В Vercel Settings → Environment Variables проверь:
            <code className="block mt-1 p-1 bg-black/30 rounded text-[10px] break-all">NEXT_PUBLIC_SUPABASE_URL</code>
            <code className="block mt-1 p-1 bg-black/30 rounded text-[10px] break-all">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            После добавления — Redeploy.
          </li>
          <li>Если таблиц нет — открой Supabase → SQL Editor → выполни <code className="bg-black/30 px-1 rounded">supabase/migrations/002_full_schema.sql</code></li>
          <li>Если Realtime CLOSED — в Supabase → Database → Replication включи Realtime для всех таблиц.</li>
        </ol>
      </div>
    </div>
  );
}
