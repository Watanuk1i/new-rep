'use client';

import { cn } from '@/lib/utils';
import type { BigGameTemplate } from '@/lib/superGames/catalog';

/**
 * Расширенная информационная карточка для Большой игры:
 * куратор, лимит автодолга, что можно/нельзя, когда возникает долг.
 * Используется на /super-games (модал) и /super-games/[id].
 */
export function BigGameInfo({ game, compact }: { game: BigGameTemplate; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <InfoCell label="Куратор" value={game.curatorName} />
        <InfoCell label="Участников" value={game.maxPlayers ? `${game.minPlayers}–${game.maxPlayers}` : `${game.minPlayers}+`} />
        {game.defaultEntryFee > 0 && <InfoCell label="Вход" value={`${game.defaultEntryFee.toLocaleString('ru-RU')} ¥`} />}
        {game.autoDebtLimit > 0 ? (
          <InfoCell label="Лимит автодолга" value={`${game.autoDebtLimit.toLocaleString('ru-RU')} ¥`} highlight />
        ) : (
          <InfoCell label="Долг" value="не создаётся" />
        )}
      </div>

      {!compact && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/70 mb-1">📋 Как играть</div>
          <p className="text-sm whitespace-pre-line">{game.rules}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        <div className="glass p-2.5 border border-emerald-500/20">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1">✅ Что можно</div>
          <ul className="text-[11px] space-y-0.5">
            {game.allowed.map((s, i) => <li key={i}>· {s}</li>)}
          </ul>
        </div>
        <div className="glass p-2.5 border border-red-500/20">
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-300 mb-1">❌ Что нельзя</div>
          <ul className="text-[11px] space-y-0.5">
            {game.forbidden.map((s, i) => <li key={i}>· {s}</li>)}
          </ul>
        </div>
        <div className="glass p-2.5 border border-amber-500/20">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1">📜 Когда появляется долг</div>
          <p className="text-[11px]">{game.debtRule}</p>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('glass p-2', highlight && 'gold-border')}>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-xs font-bold mt-0.5">{value}</div>
    </div>
  );
}
