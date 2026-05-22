'use client';

// Страница конкретной супер-игры. Диспетчер по game.type:
//   - minority_rule  → MinorityRoom (live-комната)
//   - nine_bullets   → NineBulletsRoom (live-комната)
//   - прочие типы    → классическая «витринная» вёрстка с описанием
//                      и базовым админ-управлением (запуск/завершение)

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn, isPlayer } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase/client';
import { MinorityRoom } from '@/components/super-games/MinorityRoom';
import { NineBulletsRoom } from '@/components/super-games/NineBulletsRoom';
import { CardShipBoard } from '@/components/cardship/CardShipBoard';
import { RoyalRouletteRoom } from '@/components/super-games/RoyalRouletteRoom';
import { ContrabandRoom } from '@/components/super-games/ContrabandRoom';
import { DebtTowerRoom } from '@/components/super-games/DebtTowerRoom';
import { DebtAuctionRoom } from '@/components/super-games/DebtAuctionRoom';
import { RebellionRoom } from '@/components/super-games/RebellionRoom';
import { EliteTrialRoom } from '@/components/super-games/EliteTrialRoom';
import { ThroneRoom } from '@/components/super-games/ThroneRoom';
import { MiniGameRoom } from '@/components/super-games/MiniGameRoom';
import type { Participant } from '@/lib/store/types';

export default function SuperGameDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { state, role } = useStore();
  const game = state.superGames.find(g => g.id === id);
  const isAdmin = role === 'gm' || role === 'queen';

  if (!game) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Игра не найдена</p>
        <Link href="/super-games" className="btn-secondary mt-4 inline-flex">К списку</Link>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <GameHeader game={game} />

      {/* Принудительное закрытие — для ведущего */}
      {isAdmin && game.status !== 'finished' && game.status !== 'cancelled' && (
        <ForceCloseBlock game={game} />
      )}

      {/* Описание / правила / ставки */}
      {game.description && (
        <div className="glass p-4">
          <div className="section-title text-sm mb-2">📖 Описание</div>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{game.description}</p>
        </div>
      )}
      {game.rules && (
        <div className="glass p-4">
          <div className="section-title text-sm mb-2">📋 Правила</div>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{game.rules}</p>
        </div>
      )}
      {game.stakes && (
        <div className="glass-strong gold-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">⚠️ Ставки</div>
          <p className="text-sm">{game.stakes}</p>
        </div>
      )}

      {/* Участники */}
      <ParticipantsBlock game={game} isAdmin={isAdmin} />

      {/* Live-комната по типу игры */}
      {game.type === 'minority_rule'    && <MinorityRoom game={game} />}
      {game.type === 'nine_bullets'     && <NineBulletsRoom game={game} />}
      {game.type === 'card_ship'        && <CardShipBoard superGame={game} />}
      {game.type === 'royal_roulette'   && <RoyalRouletteRoom game={game} />}
      {game.type === 'contraband'       && <ContrabandRoom game={game} />}
      {game.type === 'debt_tower'       && <DebtTowerRoom game={game} />}
      {game.type === 'debt_auction'     && <DebtAuctionRoom game={game} />}
      {game.type === 'elite_trial'      && <EliteTrialRoom game={game} />}
      {game.type === 'rebellion'        && <RebellionRoom game={game} />}
      {game.type === 'throne_celestia'  && <ThroneRoom game={game} />}
      {game.type.startsWith('mini_')    && <MiniGameRoom game={game} />}

      {/* Базовое управление — для не-live типов */}
      {!isLiveType(game.type) && isAdmin && (
        <BasicAdminControls game={game} />
      )}
    </div>
  );
}

function isLiveType(t: string): boolean {
  return t === 'minority_rule' || t === 'nine_bullets' || t === 'card_ship'
    || t === 'royal_roulette' || t === 'contraband' || t === 'debt_tower'
    || t === 'debt_auction' || t === 'elite_trial' || t === 'rebellion'
    || t === 'throne_celestia' || t.startsWith('mini_');
}

function GameHeader({ game }: { game: any }) {
  return (
    <div className="glass-strong gold-border p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('status-badge border',
          game.status === 'live' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
          game.status === 'scheduled' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
          game.status === 'cancelled' ? 'bg-gray-500/15 text-gray-400 border-gray-500/30' :
          'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        )}>
          {game.status === 'live' ? '🔴 В эфире' :
           game.status === 'scheduled' ? '📅 Скоро' :
           game.status === 'cancelled' ? '🚫 Отменена' :
           '✓ Завершена'}
        </span>
        {isLiveType(game.type) && (
          <span className="text-[10px] uppercase tracking-widest text-amber-300/80 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
            интерактив
          </span>
        )}
      </div>
      <h1 className="font-heading text-2xl font-bold text-gradient-gold mt-2">{game.title}</h1>
    </div>
  );
}

function ParticipantsBlock({ game, isAdmin }: { game: any; isAdmin: boolean }) {
  const { state } = useStore();
  const sb = getSupabase();
  const participants = (game.participant_ids || [])
    .map((pid: string) => state.participants.find(p => p.id === pid))
    .filter(Boolean) as Participant[];
  const canEdit = isAdmin && game.status === 'scheduled';

  return (
    <div className="glass p-4">
      <div className="section-title text-sm mb-3">👥 Участники · {participants.length}</div>
      {participants.length === 0 ? (
        <p className="text-xs text-muted-foreground">Пока нет участников.</p>
      ) : (
        <div className="space-y-2">
          {participants.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl bg-card/40">
              <CharacterIcon participant={p} size="sm" />
              <span className="font-bold text-sm flex-1">{p.display_name}</span>
              {canEdit && (
                <button onClick={async () => {
                  if (!sb) return;
                  if (confirm(`Убрать ${p.display_name} из игры?`)) {
                    await sb.from('super_games').update({
                      participant_ids: game.participant_ids.filter((pid: string) => pid !== p.id),
                    }).eq('id', game.id);
                  }
                }} className="text-xs text-red-300">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <AddParticipantsButton game={game} />
      )}
    </div>
  );
}

function AddParticipantsButton({ game }: { game: any }) {
  const { state } = useStore();
  const sb = getSupabase();
  const candidates = state.participants.filter(p =>
    isPlayer(p) && !(game.participant_ids || []).includes(p.id)
  );
  if (candidates.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-gold py-1">+ Добавить участников</summary>
      <div className="grid grid-cols-2 gap-1 mt-2">
        {candidates.map(p => (
          <button key={p.id} onClick={async () => {
            if (!sb) return;
            const ids = [...(game.participant_ids || []), p.id];
            await sb.from('super_games').update({ participant_ids: ids }).eq('id', game.id);
          }} className="text-left px-2 py-2 text-xs rounded-lg bg-card/40 border border-white/8 active:bg-white/5">
            + {p.display_name}
          </button>
        ))}
      </div>
    </details>
  );
}

function BasicAdminControls({ game }: { game: any }) {
  const sb = getSupabase();
  return (
    <div className="glass-strong gold-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">⚙️ Управление</div>
      <div className="grid grid-cols-2 gap-2">
        {game.status === 'scheduled' && (
          <button onClick={async () => {
            if (!sb) return;
            await sb.from('super_games').update({ status: 'live' }).eq('id', game.id);
            await sb.from('events').insert({
              id: 'ev-' + Date.now(),
              type: 'big_game_start',
              title: `Большая игра запущена: ${game.title}`,
              link_url: `/super-games/${game.id}`,
              is_for_gm_only: false,
            });
          }} className="btn-success text-xs">▶ Запустить</button>
        )}
        {game.status === 'live' && (
          <button onClick={async () => {
            if (!sb) return;
            await sb.from('super_games').update({ status: 'finished' }).eq('id', game.id);
          }} className="btn-primary text-xs">🏁 Завершить</button>
        )}
        <button onClick={async () => {
          if (!sb) return;
          if (confirm('Удалить игру?')) {
            await sb.from('super_games').delete().eq('id', game.id);
            history.back();
          }
        }} className="btn-danger text-xs">✕ Удалить</button>
      </div>
    </div>
  );
}


function ForceCloseBlock({ game }: { game: any }) {
  const sb = getSupabase();

  const forceFinish = async () => {
    if (!sb) return;
    if (!confirm(`Принудительно ЗАВЕРШИТЬ «${game.title}»?\n\nЭто пометит игру как finished, не запуская финальный расчёт. Деньги, уже списанные/выплаченные, останутся как есть. Используйте если игра застряла.`)) return;
    const cur = (game.state ?? {}) as any;
    await sb.from('super_games').update({
      state: { ...cur, status: 'finished' },
      status: 'finished',
    }).eq('id', game.id);
    await sb.from('events').insert({
      id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      type: 'big_game_finished',
      title: `${game.title} · принудительно завершено ведущим`,
      link_url: `/super-games/${game.id}`,
      is_for_gm_only: false,
    });
  };

  const forceCancel = async () => {
    if (!sb) return;
    if (!confirm(`Принудительно ОТМЕНИТЬ «${game.title}»?\n\nЭто пометит игру как cancelled. Если в игре остались списанные ставки/банк — их придётся вернуть вручную.`)) return;
    const cur = (game.state ?? {}) as any;
    await sb.from('super_games').update({
      state: { ...cur, status: 'cancelled' },
      status: 'cancelled',
    }).eq('id', game.id);
    await sb.from('events').insert({
      id: 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      type: 'big_game_finished',
      title: `${game.title} · отменена ведущим`,
      link_url: `/super-games/${game.id}`,
      is_for_gm_only: false,
    });
  };

  const forceDelete = async () => {
    if (!sb) return;
    if (!confirm(`УДАЛИТЬ «${game.title}» полностью? Историю не восстановить.`)) return;
    await sb.from('super_games').delete().eq('id', game.id);
    history.back();
  };

  return (
    <div className="glass-strong p-3 border border-red-500/30 bg-red-500/5">
      <div className="text-[10px] uppercase tracking-widest text-red-300/80 mb-2">⚠️ Управление ведущего · принудительно</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={forceFinish} className="btn-secondary text-[11px]">🏁 Завершить</button>
        <button onClick={forceCancel} className="btn-danger text-[11px]">🛑 Отменить</button>
        <button onClick={forceDelete} className="col-span-2 btn-danger text-[11px]">✕ Удалить запись</button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        Используйте если игра «зависла» в одной из фаз. Состояние записывается, реалтайм пробрасывается всем клиентам.
      </div>
    </div>
  );
}
