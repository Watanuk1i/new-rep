'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, uid } from '@/lib/utils';

const GAME_TYPES = [
  { type: 'collar', label: 'Игра ошейника', desc: 'Бой за свободу или ошейник', count: '2-4', rules: '2-4 игрока. Раунды на смекалку. Проигравший — Питомец.' },
  { type: 'minority_rule', label: 'Правило меньшинства', desc: 'Голосуйте за меньшинство', count: '5-10', rules: '5 раундов. Меньшинство получает очки.' },
  { type: 'rumor_pandemic', label: 'Пандемия слухов', desc: 'Кто запустит самый громкий слух', count: '5+', rules: 'Каждый день один слух. Голосование за самый правдоподобный.' },
  { type: 'musical_thrones', label: 'Музыкальные троны', desc: 'Не остаться без места', count: '4-8', rules: 'Очко тому, кто сядет на трон по сигналу.' },
  { type: 'smuggling', label: 'Контрабанда', desc: 'Пронеси и не попадись', count: '3-6', rules: 'Игроки прячут предметы. Стража ищет.' },
  { type: 'status_tower', label: 'Башня статуса', desc: 'Поднимайся по иерархии', count: '5-8', rules: 'Победитель раунда поднимается. Вершина — Элита.' },
  { type: 'mirror_lies', label: 'Зеркало лжи', desc: 'Угадай правду из лжи', count: '2-6', rules: 'Каждый говорит 3 вещи (1 ложь). Угадай.' },
  { type: 'hope_cage', label: 'Клетка надежды', desc: 'Выберись или сдайся', count: '1', rules: 'Психологическое испытание. Реальные ставки.' },
  { type: 'queen_throne', label: 'Трон Селестии', desc: 'Свержение королевы', count: '3-5', rules: 'Только с разрешения Селестии. Победитель занимает трон.' },
  { type: 'emperor', label: 'Император, гражданин, раб', desc: 'Карты решают иерархию', count: '4', rules: 'Карточная иерархия. Раб платит дань Императору.' },
];

export default function SuperGamesPage() {
  const { state, role, currentUser, dispatch } = useStore();
  const [tab, setTab] = useState<'upcoming' | 'live' | 'archive'>('upcoming');
  const [showApply, setShowApply] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const isAdmin = role === 'gm' || role === 'queen';

  const filtered = state.superGames.filter(g => {
    if (tab === 'upcoming') return g.status === 'scheduled';
    if (tab === 'live') return g.status === 'live';
    return g.status === 'finished' || g.status === 'cancelled';
  });

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl lg:max-w-none mx-auto space-y-4 animate-fade-in">
      <div className="relative glass-strong gold-border p-5 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-gold/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gold/70 mb-1">Главная сцена</div>
          <h1 className="font-heading text-2xl font-bold text-gradient-gold">Супер игры</h1>
          <p className="text-xs text-muted-foreground mt-1">События, за которыми наблюдает вся академия.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setShowApply(true)} className="btn-primary text-sm">
          📨 Подать заявку
        </button>
        {isAdmin && (
          <Link href="/admin?tab=super-games" className="btn-outline text-sm">
            ⚙️ Создать игру
          </Link>
        )}
      </div>

      <div className="scroll-x">
        {[
          { key: 'upcoming', label: 'Скоро', icon: '📅' },
          { key: 'live', label: 'В эфире', icon: '🔴' },
          { key: 'archive', label: 'Архив', icon: '📜' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn('tab-pill', tab === t.key ? 'tab-pill-active' : 'tab-pill-inactive')}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass p-8 text-center">
            <div className="text-4xl mb-2 opacity-30">🏟️</div>
            <p className="text-sm text-muted-foreground">Ничего нет в этой категории.</p>
          </div>
        ) : filtered.map(g => (
          <Link key={g.id} href={`/super-games/${g.id}`}>
            <div className="glass-strong gold-border overflow-hidden active:scale-[0.99] transition-transform duration-100">
              <div className="h-1 bg-gradient-to-r from-gold-light via-gold to-gold-dark" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-heading text-lg font-bold text-gold flex-1">{g.title}</h3>
                  <span className={cn('status-badge border shrink-0',
                    g.status === 'live' ? 'bg-red-500/15 text-red-300 border-red-500/30 animate-pulse-gold' :
                    g.status === 'scheduled' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                    'bg-gray-500/15 text-gray-400 border-gray-500/30'
                  )}>
                    {g.status === 'live' ? 'В эфире' : g.status === 'scheduled' ? 'Скоро' : 'Завершено'}
                  </span>
                </div>
                {g.description && <p className="text-xs text-muted-foreground mb-2">{g.description}</p>}
                {g.stakes && (
                  <div className="text-xs text-gold/90 bg-gold/5 border border-gold/20 rounded-lg px-2.5 py-1.5 mb-2">
                    💰 {g.stakes}
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>👥 {g.participant_ids.length} участн.</span>
                  {g.starts_at && (
                    <span>{new Date(g.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Типы игр */}
      <section>
        <div className="divider-ornate my-3">✦ Типы Больших Игр ✦</div>
        <div className="grid grid-cols-2 gap-2">
          {GAME_TYPES.map(gt => (
            <button
              key={gt.type}
              onClick={() => setSelectedType(gt.type)}
              className="glass p-3 text-left active:scale-95 transition-transform duration-100"
            >
              <div className="font-bold text-sm leading-tight">{gt.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{gt.desc}</div>
              <div className="text-[10px] text-gold mt-1">👥 {gt.count}</div>
            </button>
          ))}
        </div>
      </section>

      {selectedType && (
        <Modal onClose={() => setSelectedType(null)}>
          {(() => {
            const t = GAME_TYPES.find(g => g.type === selectedType)!;
            return (
              <>
                <h3 className="font-heading text-xl font-bold mb-1">{t.label}</h3>
                <p className="text-xs text-muted-foreground mb-3">{t.desc}</p>
                <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Правила</div>
                <p className="text-sm whitespace-pre-line mb-3">{t.rules}</p>
                <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">Участников</div>
                <p className="text-sm mb-4">{t.count}</p>
                <button onClick={() => setSelectedType(null)} className="btn-secondary w-full">Понятно</button>
              </>
            );
          })()}
        </Modal>
      )}

      {showApply && currentUser && (
        <ApplyModal
          types={GAME_TYPES}
          onClose={() => setShowApply(false)}
          onSubmit={(type, opponents, stake) => {
            dispatch({
              type: 'add_event',
              event: {
                id: uid('ev'),
                type: 'gm_alert',
                title: 'Заявка на Большую Игру',
                body: `${currentUser.display_name}: ${GAME_TYPES.find(g => g.type === type)?.label}. Соперники: ${opponents.join(', ') || '—'}. Ставка: ${stake || '—'}`,
                related_participant_id: currentUser.id,
                is_for_gm_only: true,
                created_at: Date.now(),
              },
            });
            setShowApply(false);
            alert('Заявка отправлена Ведущему и Селестии');
          }}
        />
      )}
    </div>
  );
}

function ApplyModal({
  types, onClose, onSubmit,
}: {
  types: typeof GAME_TYPES;
  onClose: () => void;
  onSubmit: (type: string, opponents: string[], stake: string) => void;
}) {
  const { state, currentUser } = useStore();
  const [type, setType] = useState(types[0].type);
  const [opponents, setOpponents] = useState<string[]>([]);
  const [stake, setStake] = useState('');
  const players = state.participants.filter(p => p.status !== 'gm' && p.id !== currentUser?.id);

  return (
    <Modal onClose={onClose} title="Заявка на Супер игру">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Тип игры</label>
          <select value={type} onChange={e => setType(e.target.value)} className="input-field">
            {types.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Желаемые соперники</label>
          <div className="max-h-40 overflow-y-auto space-y-1 glass p-2">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg active:bg-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={opponents.includes(p.display_name)}
                  onChange={e => {
                    setOpponents(e.target.checked
                      ? [...opponents, p.display_name]
                      : opponents.filter(n => n !== p.display_name));
                  }}
                  className="w-4 h-4 accent-gold"
                />
                <span className="text-sm">{p.display_name}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Ставка / условия</label>
          <input
            value={stake}
            onChange={e => setStake(e.target.value)}
            placeholder="Например: 500 000 ейнов · проигравший Питомец"
            className="input-field"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Отмена</button>
          <button onClick={() => onSubmit(type, opponents, stake)} className="btn-primary flex-1">📨 Отправить</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-md p-4 sm:p-5 max-h-[85vh] overflow-y-auto animate-slide-up">
        {title && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-lg font-bold">{title}</h3>
            <button onClick={onClose} className="btn-icon" aria-label="Закрыть">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
