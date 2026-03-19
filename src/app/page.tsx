'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import LoginScreen from '@/components/LoginScreen';
import Navigation from '@/components/Navigation';
import Schedule from '@/components/Schedule';
import OrdersPage from '@/components/OrdersPage';
import MembersPage from '@/components/MembersPage';
import FinancePage from '@/components/FinancePage';
import BusinessPage from '@/components/BusinessPage';
import HomePage from '@/components/HomePage';
import DashboardPage from '@/components/DashboardPage';

export default function Home() {
  const { role, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState('');

  useEffect(() => {
    if (role) {
      setCurrentPage(role === 'approve' ? 'dashboard' : 'schedule');
    }
  }, [role]);

  if (!role) return <LoginScreen />;

  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <HomePage />;
      case 'schedule': return <Schedule />;
      case 'orders': return <OrdersPage />;
      case 'finance': return <FinancePage />;
      case 'members': return <MembersPage />;
      case 'business': return <BusinessPage />;
      case 'dashboard': return <DashboardPage />;
      default: return <Schedule />;
    }
  };

  return (
    <div className="h-screen flex flex-col md:flex-row bg-[var(--bg)]">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />

      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[var(--border)]">
        <div>
          <h1 className="text-base font-bold">云吉合院</h1>
          <p className="text-[10px] text-[var(--ink3)]">运营管理系统</p>
        </div>
        <button onClick={logout}
          className="text-[11px] px-3 py-1 rounded-full bg-[var(--bg)] text-[var(--ink3)] hover:text-[var(--red)]">
          退出
        </button>
      </header>

      <main className="flex-1 overflow-hidden pb-14 md:pb-0">
        {renderPage()}
      </main>
    </div>
  );
}
