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
    // Уведомление админу/Селестии — срочный сигнал «Вас вызывают»
    await sb.from('notifications').insert([
      {
        id: uid('n'), recipient_id: 'p-gm', type: 'help_request_urgent',
        title: '🚨 Вас вызывают!',
        body: `${currentUser.display_name}: ${(topic || text).slice(0, 80)}`,
        link_url: '/help', is_read: false,
      },
      {
        id: uid('n'), recipient_id: 'p-queen', type: 'help_request_urgent',
        title: '🚨 Вас вызывают!',
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
    const r = requests.find(x => x.id === id);
    await sb.from('help_requests').update({
      status, resolution: resolution ?? null,
      resolved_by: currentUser?.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    // Если закрываем с ответом — пишем уведомление автору
    if (r && (status === 'resolved' || status === 'closed') && r.author_id) {
      await sb.from('notifications').insert({
        id: uid('n'),
        recipient_id: r.author_id,
        type: 'help_request',
        title: status === 'resolved' ? '✅ Ответ Ведущего' : '🔒 Заявка закрыта',
        body: resolution
          ? `${(currentUser?.display_name ?? 'Ведущий')}: ${resolution.slice(0, 100)}`
          : 'Ваша заявка обработана.',
        link_url: '/help',
        is_read: false,
      });
    }
    // Если admin взял заявку «в работу» — уведомление автору
    if (r && status === 'in_progress' && r.author_id) {
      await sb.from('notifications').insert({
        id: uid('n'),
        recipient_id: r.author_id,
        type: 'help_request',
        title: '⌛ Ведущий взялся за вашу заявку',
        body: r.topic,
        link_url: '/help',
        is_read: false,
      });
    }
  };

  const myOpen = currentUser
    ? requests.filter(r => r.author_id === currentUser.id && (r.status === 'open' || r.status === 'in_progress'))
    : [];
  const myHistory = currentUser
    ? requests.filter(r => r.author_id === currentUser.id && (r.status === 'resolved' || r.status === 'closed')).slice(0, 5)
    : [];
  const allOpen = requests.filter(r => r.status === 'open' || r.status === 'in_progress');
  const allHistory = requests.filter(r => r.status === 'resolved' || r.status === 'closed').slice(0, 10);
  const visibleList = isAdmin ? allOpen : myOpen;
  const historyList = isAdmin ? allHistory : myHistory;

  if (!currentUser) return null;

  return (
    <div className="glass-strong p-4 space-y-3 border border-rose-500/30 bg-rose-500/5">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🆘</div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-rose-300/80">Связь с Ведущим</div>
          <div className="font-heading text-base font-bold text-rose-200">Позвать на помощь</div>
          <div className="text-[10px] text-muted-foreground">Опишите вопрос или проблему — Ведущий получит вызов и ответит.</div>
        </div>
      </div>

      {!creating ? (
        <button onClick={() => setCreating(true)} className="btn-primary w-full text-sm">
          🚨 Уведомить Ведущего о помощи
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
              {busy ? '...' : '🚨 Вызвать Ведущего'}
            </button>
          </div>
        </div>
      )}

      {visibleList.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gold/70">
            {isAdmin ? `Открытые заявки (${allOpen.length})` : 'Ваши открытые заявки'}
          </div>
          {visibleList.map(r => (
            <RequestCard key={r.id} r={r} state={state} isAdmin={isAdmin}
              onUpdate={updateStatus} />
          ))}
        </div>
      )}

      {historyList.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground py-1">
            📜 История {isAdmin ? 'всех заявок' : 'ваших заявок'} ({historyList.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {historyList.map(r => {
              const author = state.participants.find(p => p.id === r.author_id);
              return (
                <div key={r.id} className="glass p-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {author && <CharacterIcon participant={author} size="xs" ringless />}
                    <span className="font-bold truncate flex-1">{author?.display_name ?? r.author_id}</span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded',
                      r.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-500/15 text-gray-300')}>
                      {r.status === 'resolved' ? '✓ решено' : 'закрыто'}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 italic">{r.topic}</div>
                  <div>{r.text}</div>
                  {r.resolution && (
                    <div className="mt-1 p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-200">
                      Ответ: {r.resolution}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function RequestCard({
  r, state, isAdmin, onUpdate,
}: {
  r: HelpRequest;
  state: any;
  isAdmin: boolean;
  onUpdate: (id: string, status: HelpRequest['status'], resolution?: string) => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const author = state.participants.find((p: any) => p.id === r.author_id);

  return (
    <div className="glass p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        {author && <CharacterIcon participant={author} size="xs" ringless />}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-xs">{author?.display_name ?? r.author_id}</div>
          <div className="text-[10px] text-muted-foreground">{r.topic}</div>
        </div>
        <span className={cn('status-badge text-[10px]',
          r.status === 'open' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            : 'bg-amber-500/15 text-amber-300 border-amber-500/30')}>
          {r.status === 'open' ? 'открыто' : 'в работе'}
        </span>
      </div>
      <div className="text-xs whitespace-pre-line">{r.text}</div>

      {isAdmin && (
        <>
          {!showAnswer ? (
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {r.status === 'open' && (
                <button onClick={() => onUpdate(r.id, 'in_progress')}
                  className="btn-secondary text-[10px]">↻ Взять</button>
              )}
              <button onClick={() => setShowAnswer(true)}
                className={cn('btn-success text-[10px]', r.status !== 'open' && 'col-span-2')}>
                ✉ Дать ответ
              </button>
              <button onClick={() => onUpdate(r.id, 'closed')}
                className="btn-danger text-[10px]">✕ Закрыть</button>
            </div>
          ) : (
            <div className="space-y-1.5 mt-1">
              <textarea value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder="Ответ Ведущего..."
                rows={2} className="input-field text-xs resize-none" />
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => { setShowAnswer(false); setAnswer(''); }}
                  className="btn-secondary text-[10px]">Отмена</button>
                <button onClick={() => onUpdate(r.id, 'resolved', answer.trim() || undefined)}
                  className="btn-primary text-[10px]">📤 Отправить и закрыть</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
