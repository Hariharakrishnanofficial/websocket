import { Outlet } from 'react-router-dom';
import { TopStatusBar } from './TopStatusBar.jsx';
import { BottomNav }    from './BottomNav.jsx';

export function AppShell() {
  return (
    <div className="min-h-dvh flex flex-col bg-bg text-text">
      <TopStatusBar />
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
export default AppShell;
