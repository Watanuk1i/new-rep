'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/StoreProvider';

export default function LoginPage() {
  const { login, state, loginAsParticipant } = useStore();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [selectedCharId, setSelectedCharId] = useState('');

  const players = state.participants.filter(p => p.status === 'player');

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = login(username, password);
    if (ok) router.push('/');
    else setError('Неверный логин или пароль. Имя должно совпадать с именем персонажа.');
  };

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || !selectedCharId) {
      setError('Заполните все поля и выберите персонажа.');
      return;
    }
    // Простая mock-регистрация: привязываем выбранного персонажа.
    // DB: здесь должен быть Supabase Auth signup + linking.
    loginAsParticipant(selectedCharId);
    router.push('/');
  };

  return (
    <div className="px-4 py-6 max-w-md mx-auto space-y-4">
      <div className="text-center">
        <Image src="/logo.ico" alt="Академия" width={64} height={64} unoptimized className="mx-auto rounded-2xl mb-3" />
        <h1 className="font-heading text-2xl font-bold text-gradient-gold">Академия</h1>
        <p className="text-xs text-muted-foreground mt-1">Безумный Азарт Отчаяния</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { setMode('login'); setError(''); }}
          className={`flex-1 tab-pill ${mode === 'login' ? 'tab-pill-active' : 'tab-pill-inactive'}`}
        >
          Вход
        </button>
        <button
          onClick={() => { setMode('register'); setError(''); }}
          className={`flex-1 tab-pill ${mode === 'register' ? 'tab-pill-active' : 'tab-pill-inactive'}`}
        >
          Регистрация
        </button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="glass-strong p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Логин (имя персонажа / host / queen)
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="input-field"
              placeholder="Например: Макото Наэги"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
            />
          </div>
          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>}
          <button type="submit" className="btn-primary w-full">Войти</button>
          <div className="text-[10px] text-muted text-center leading-relaxed pt-2 border-t border-white/5">
            Тестовые аккаунты:<br/>
            <span className="text-gold">host / host_academy_2026</span> · Ведущий<br/>
            <span className="text-gold">queen / queen_celestia_2026</span> · Селестия<br/>
            Игроки: введите имя персонажа (любой пароль).
          </div>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="glass-strong p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gold mb-1 block">Логин</label>
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
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>
          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>}
          <button type="submit" className="btn-primary w-full">Зарегистрироваться</button>
        </form>
      )}

      <div className="text-center">
        <Link href="/" className="text-xs text-muted-foreground active:text-gold">
          ← На главную
        </Link>
      </div>
    </div>
  );
}
