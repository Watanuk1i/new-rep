'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { CharacterIcon } from '@/components/ui/CharacterIcon';
import { cn } from '@/lib/utils';

export default function SuperGameDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { state, role, dispatch } = useStore();
  const game = state.superGames.find(g => g.id === id);
  const isAdmin = role === 'gm' || role === 'queen';

  if (!game) {
    return (
      <div className="px-4 py-12 text-center">
        <div className="text-4xl opacity-30 mb-2">?</div>
        <p className="text-sm text-muted-foreground">Игра не найдена</p>
        <Link href="/super-games" className="btn-secondary mt-4 inline-flex">К списку</Link>
      </div>
    );
  }

  const participants = game.participant_ids.map(pid => state.participants.find(p => p.id === pid)).filter(Boolean);

  return (
    <div className="px-3 sm:px-4 py-4 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="glass-strong gold-border p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('status-badge border',
            game.status === 'live' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
            game.status === 'scheduled' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
            'bg-gray-500/15 text-gray-400 border-gray-500/30'
          )}>
            {game.status === 'live' ? '🔴 В эфире' : game.status === 'scheduled' ? '📅 Скоро' : '✓ Завершено'}
          </span>
        </div>
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">{game.title}</h1>
        {game.description && <p className="text-sm text-muted-foreground mt-2">{game.description}</p>}
      </div>

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

      <div className="glass p-4">
        <div className="section-title text-sm mb-3">👥 Участники</div>
        {participants.length === 0 ? (
          <p className="text-xs text-muted-foreground">Пока нет участников.</p>
        ) : (
          <div className="space-y-2">
            {participants.map(p => (
              <div key={p!.id} className="flex items-center gap-3 p-2 rounded-xl bg-card/40">
                <CharacterIcon participant={p} size="sm" />
                <span className="font-bold text-sm flex-1">{p!.display_name}</span>
                {isAdmin && (
                  <button
                    onClick={() => {
                      if (confirm(`Удалить ${p!.display_name} из игры?`)) {
                        dispatch({
                          type: 'update_super_game',
                          id: game.id,
                          patch: { participant_ids: game.participant_ids.filter(pid => pid !== p!.id) },
                        });
                      }
                    }}
                    className="text-xs text-red-300 active:text-red-400"
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="glass-strong gold-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-2">⚙️ Управление игрой</div>
          <div className="grid grid-cols-2 gap-2">
            {game.status === 'scheduled' && (
              <button
                onClick={() => dispatch({ type: 'update_super_game', id: game.id, patch: { status: 'live' } })}
                className="btn-success text-xs"
              >▶ Запустить</button>
            )}
            {game.status === 'live' && (
              <button
                onClick={() => dispatch({ type: 'update_super_game', id: game.id, patch: { status: 'finished' } })}
                className="btn-primary text-xs"
              >🏁 Завершить</button>
            )}
            <button
              onClick={() => {
                if (confirm('Удалить игру полностью?')) {
                  dispatch({ type: 'remove_super_game', id: game.id });
                  history.back();
                }
              }}
              className="btn-danger text-xs"
            >✕ Удалить</button>
          </div>
        </div>
      )}
    </div>
  );
}
