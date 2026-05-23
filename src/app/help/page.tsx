'use client';

// /help — справка + раздел «Позвать на помощь».
// Игроки оставляют заявки, Ведущий/Селестия видят и закрывают.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore, uid } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';

interface HelpRequest {
  id: string;
  author_id: string;
  topic: string;
  text: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolution?: string | null;
  resolved_by?: string | null;
  created_at: string;
  updated_at: string;
}

const HELP_CONTENT = [
  {
    title: '🎯 Что это за игра',
    body: 'Академия — ролевое казино, где балансы, долги, статусы и Питомцы решают всё. Сайт является памятью Академии: что зафиксировано здесь — то и считается.',
  },
  {
    title: '💴 Деньги и переводы',
    body: 'Базовая валюта — йены. В разделе «Переводы» можно отправить деньги другому игроку с комментарием. Перевод не создаёт официальный долг — это просто доверие.\n\nЕсли нужна гарантия — через Кируми оформляется официальный договор/кредит, который защищён системой.',
  },
  {
    title: '💳 Кредиты Кируми',
    body: 'Игрок отправляет запрос → Кируми отвечает встречными условиями (сумма, %, срок) → игрок принимает → получает деньги, появляется долг.\n\nОбычный займ: 100k–500k @ 20%, до конца следующей Большой игры.\nСрочный займ: до 400k @ 30%, до конца текущей Большой игры.\nЗалоговый: своё условие в текстовом поле.',
  },
  {
    title: '📜 Долги и взыскание',
    body: 'Активный → срок прошёл → просрочка (+20%) → передан Мондо → коллекция → возможен Аукцион долгов или статус «Кандидат в Питомцы».\n\nПри погашении из Казны/у владельца долга Мондо берёт 10% комиссии. Если назначена Пеко — 30% комиссии Мондо уходит ей.',
  },
  {
    title: '⚔️ Игры на долг',
    body: 'Если долг горит, можно сыграть на него: Три печати (−50% / 0 / +50%), Кости взыскания (2d6 vs 2d6), Чёрная расписка (риск-уровни), Последний платёж (заплати и шанс списать остаток), Игра на отсрочку (50/50), Выкупной стол Кируми (4 закрытые карты).',
  },
  {
    title: '💰 Пари',
    body: 'Игроки и зрители делают ставки на исходы. Создатель пари устанавливает дату закрытия и комиссию 0–30%. Когда приём закрыт — Селестия/ведущий выбирает выигрышный вариант, выплаты пропорциональны вложенному.',
  },
  {
    title: '🐾 Питомцы',
    body: 'Питомец — игровой статус, привязанный к долгу или проигрышу. Не назначается автоматически. Питомец имеет хозяина и условие выкупа (по умолчанию долг × 1.3). Спорные действия с Питомцами утверждает Селестия.',
  },
  {
    title: '🌟 Претендент в Элиту',
    body: 'Игрок становится Кандидатом, если выиграл Долговую башню, выиграл крупную игру без долгов, победил Элиту в суде, имеет ¥3 000 000+ или 70+ репутации, или назначен ведущим. Проходит «Испытание кандидата» — 3 приказа + голосование участников.',
  },
  {
    title: '👁️ Слухи и репутация',
    body: 'Слух создаётся про конкретного игрока, остальные голосуют лайк/дизлайк. Репутация меняется только после закрытия слуха Селестией/админом как положительный/отрицательный/нейтральный.',
  },
  {
    title: '🏟️ Супер игры',
    body: 'Большие сюжетные игры запускает только Ведущий. Все могут смотреть в режиме «зритель» (badge 👁️ зритель). Карточная сессия в реальном времени: голоса, ходы, результаты сразу видны всем.',
  },
];

export default function HelpPage() {
  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">❔ Помощь</div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Как играть</h1>
        <p className="text-xs text-muted-foreground mt-1">Справочник Академии и связь с Ведущим.</p>
      </div>

      <SOSBlock />

      {HELP_CONTENT.map((b, i) => (
        <details key={i} className="glass p-4 group">
          <summary className="cursor-pointer flex items-center justify-between">
            <span className="section-title text-sm">{b.title}</span>
            <span className="text-[10px] text-gold/80 group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed mt-2">{b.body}</p>
        </details>
      ))}

      <div className="text-[10px] text-muted-foreground text-center">
        Полные правила Академии — в разделе <Link href="/rules" className="text-gold underline">Правила</Link>.
      </div>
    </div>
  );
}

// ================================================================
// SOS — Позвать на помощь
// ================================================================

function SOSBlock() {
  const { state, currentUser, role } = useStore();
  const sb = getSupabase();
  const isAdmin = role === 'gm' || role === 'queen';
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    const load = async () => {
      const { data } = await sb.from('help_requests').select('*')
        .order('created_at', { ascending: false }).limit(50);
      if (alive) setRequests((data ?? []) as HelpRequest[]);
    };
    load();
    const ch = sb.channel('help-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests' }, load)
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [sb]);

  const submit = async () => {
    if (!sb || !currentUser || !text.trim() || busy) return;
    setBusy(true);
    await sb.from('help_requests').insert({
      id: uid('hr'),
      author_id: currentUser.id,
      topic: topic.trim() || 'Общий вопрос',
      text: text.trim(),
      status: 'open',
    });
    // Уведомление админу/Селестии
    await sb.from('notifications').insert([
      {
        id: uid('n'), recipient_id: 'p-gm', type: 'help_request',
        title: '🆘 Запрос помощи',
        body: `${currentUser.display_name}: ${(topic || text).slice(0, 80)}`,
        link_url: '/help', is_read: false,
      },
      {
        id: uid('n'), recipient_id: 'p-queen', type: 'help_request',
        title: '🆘 Запрос помощи',
        body: `${currentUser.display_name}: ${(topic || text).slice(0, 80)}`,
        link_url: '/help', is_read: false,
      },
    ]);
    setBusy(false);
    setTopic(''); setText('');
    setCreating(false);
  };

  const updateStatus = async (id: string, status: HelpRequest['status'], resolution?: string) => {
    if (!sb) return;
    await sb.from('help_requests').update({
      status, resolution: resolution ?? null,
      resolved_by: currentUser?.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
  };

  const myOpen = currentUser
    ? requests.filter(r => r.author_id === currentUser.id && (r.status === 'open' || r.status === 'in_progress'))
    : [];
  const allOpen = requests.filter(r => r.status === 'open' || r.status === 'in_progress');
  const visibleList = isAdmin ? allOpen : myOpen;

  if (!currentUser) return null;

  return (
    <div className="glass-strong p-4 space-y-3 border border-rose-500/30 bg-rose-500/5">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🆘</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-rose-300/80">Связь с Ведущим</div>
          <div className="font-heading text-base font-bold text-rose-200">Позвать на помощь</div>
          <div className="text-[10px] text-muted-foreground">Опишите вопрос или проблему — Ведущий увидит и ответит.</div>
        </div>
      </div>

      {!creating ? (
        <button onClick={() => setCreating(true)} className="btn-primary w-full text-sm">
          ✉ Отправить заявку
        </button>
      ) : (
        <div className="space-y-2">
          <input value={topic} onChange={e => setTopic(e.target.value)}
            placeholder="Тема (необязательно)"
            className="input-field text-sm" />
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Что случилось / что нужно..."
            rows={3} className="input-field text-sm resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setCreating(false); setTopic(''); setText(''); }}
              className="btn-secondary text-xs">Отмена</button>
            <button onClick={submit} disabled={!text.trim() || busy}
              className="btn-primary text-xs">
              {busy ? '...' : '📤 Отправить'}
            </button>
          </div>
        </div>
      )}

      {visibleList.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">
            {isAdmin ? `Открытые заявки (${allOpen.length})` : 'Ваши заявки'}
          </div>
          {visibleList.map(r => {
            const author = state.participants.find(p => p.id === r.author_id);
            const resolver = r.resolved_by ? state.participants.find(p => p.id === r.resolved_by) : null;
            return (
              <div key={r.id} className="glass p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  {author && <CharacterIcon participant={author} size="xs" ringless />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs">{author?.display_name ?? r.author_id}</div>
                    <div className="text-[10px] text-muted-foreground">{r.topic}</div>
                  </div>
                  <span className={cn('status-badge text-[10px]',
                    r.status === 'open' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : r.status === 'in_progress' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30')}>
                    {r.status === 'open' ? 'открыто' : r.status === 'in_progress' ? 'в работе' : 'решено'}
                  </span>
                </div>
                <div className="text-xs whitespace-pre-line">{r.text}</div>
                {r.resolution && (
                  <div className="text-[11px] p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                    Ответ: {r.resolution}
                  </div>
                )}
                {isAdmin && r.status !== 'resolved' && r.status !== 'closed' && (
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    {r.status === 'open' && (
                      <button onClick={() => updateStatus(r.id, 'in_progress')}
                        className="btn-secondary text-[10px]">↻ Взять</button>
                    )}
                    <button onClick={() => {
                      const ans = prompt('Ответ для игрока (опционально):');
                      updateStatus(r.id, 'resolved', ans ?? undefined);
                    }} className="btn-success text-[10px]">✓ Закрыть</button>
                    <button onClick={() => updateStatus(r.id, 'closed')}
                      className="btn-danger text-[10px]">✕ Скрыть</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
