import { memo } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileDock } from './MobileDock';
import { NeuralEnergy } from '@/components/brand/NeuralEnergy';
import { ElectoralOperationsDock } from '@/components/electoral/ElectoralOperationsDock';

export const Layout = memo(function Layout() {
  return (
    <div className="neural-shell relative flex h-dvh min-h-screen overflow-hidden bg-background">
      <NeuralEnergy variant="ambient" className="fixed inset-0 z-0" />
      <div className="relative z-20 hidden h-full shrink-0 md:block">
        <Sidebar />
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <ElectoralOperationsDock />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
      <MobileDock />
    </div>
  );
});
