'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/StoreProvider';
import { getSupabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const { state, login } = useStore();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [selectedCharId, setSelectedCharId] = useState('');
  const sb = getSupabase();

  const players = state.participants.filter(p => p.status === 'player' && !p.password);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const ok = await login(username, password);
    setBusy(false);
    if (ok) router.push('/');
    else setError('Неверные данные. Введите имя персонажа (или host/queen).');
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!sb) { setError('БД недоступна'); return; }
    if (!username.trim() || !password.trim() || !selectedCharId) {
      setError('Заполните все поля и выберите персонажа.');
      return;
    }
    setBusy(true);
    // Назначаем пароль на выбранного persistent участника + помечаем registered
    const { error } = await sb.from('participants')
      .update({ password, display_name: username.trim(), is_registered: true }).eq('id', selectedCharId);
    setBusy(false);
    if (error) { setError(error.message); return; }
    const ok = await login(username.trim(), password);
    if (ok) router.push('/');
    else setError('Не удалось войти после регистрации');
  };

  return (
    <div className="px-4 py-6 max-w-md mx-auto space-y-4">
      <div className="text-center">
        <Image src="/logo.ico" alt="Академия" width={64} height={64} unoptimized className="mx-auto rounded-2xl mb-3" />
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Академия</h1>
        <p className="text-xs text-muted-foreground mt-1">Безумный Азарт Отчаяния</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => { setMode('login'); setError(''); }}
          className={`flex-1 tab-pill ${mode === 'login' ? 'tab-pill-active' : 'tab-pill-inactive'}`}>Вход</button>
        <button onClick={() => { setMode('register'); setError(''); }}
          className={`flex-1 tab-pill ${mode === 'register' ? 'tab-pill-active' : 'tab-pill-inactive'}`}>Регистрация</button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="glass-strong p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Логин (имя персонажа / host / queen)
            </label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input-field" placeholder="Например: Макото Наэги" autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="••••••••" />
          </div>
          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>}
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Вход...' : 'Войти'}</button>
          <div className="text-[10px] text-muted text-center leading-relaxed pt-2 border-t border-white/5">
            Тестовые аккаунты:<br />
            <span className="text-gold">host / host_academy_2026</span> · Ведущий<br />
            <span className="text-gold">queen / queen_celestia_2026</span> · Селестия<br />
            Игроки: введите имя персонажа (любой пароль если не зарегистрирован).
          </div>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="glass-strong p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Логин (новое имя)</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input-field" placeholder="Ваш ник" autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="••••••••" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Выбор персонажа</label>
            <select value={selectedCharId} onChange={e => setSelectedCharId(e.target.value)} className="input-field">
              <option value="">— выберите —</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <p className="text-[10px] text-muted mt-1">Только незанятые персонажи. После регистрации другие не смогут выбрать вашего.</p>
          </div>
          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>}
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Регистрация...' : 'Зарегистрироваться'}</button>
        </form>
      )}

      <div className="text-center">
        <Link href="/" className="text-xs text-muted-foreground active:text-gold">← На главную</Link>
      </div>
    </div>
  );
}
