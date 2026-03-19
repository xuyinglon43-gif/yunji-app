'use client';

import { useState, KeyboardEvent } from 'react';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }
    const ok = login(password.trim());
    if (!ok) {
      setError('密码错误');
      setPassword('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg)]">
      <div className="w-full max-w-[360px] px-6">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-[var(--ink)] tracking-wide">云吉合院</h1>
          <p className="text-sm text-[var(--ink3)] mt-1">运营管理系统</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            placeholder="请输入密码"
            className="w-full px-4 py-3 border border-[var(--border)] rounded-lg text-sm
                       focus:outline-none focus:border-[var(--ink3)] transition"
            autoFocus
          />
          {error && (
            <p className="text-[var(--red)] text-xs mt-2">{error}</p>
          )}
          <button
            onClick={handleLogin}
            className="w-full mt-4 py-3 bg-[var(--green)] text-white text-sm font-medium
                       rounded-lg hover:opacity-90 transition"
          >
            进入系统
          </button>
        </div>

        <p className="text-center text-[10px] text-[var(--ink3)] mt-8">
          云吉合院 · 运营管理系统 v1.0
        </p>
      </div>
    </div>
  );
}
