import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const ITEMS = [
  { to: '/',            label: 'Drive',       icon: '🎮' },
  { to: '/telemetry',   label: 'Telemetry',   icon: '📡' },
  { to: '/diagnostics', label: 'Logs',        icon: '🛠' },
  { to: '/settings',    label: 'Settings',    icon: '⚙️' },
  { to: '/about',       label: 'About',       icon: 'ℹ️' },
];

export function BottomNav() {
  return (
    <nav className="pb-safe pl-safe pr-safe bg-surface/90 backdrop-blur border-t border-border">
      <ul className="grid grid-cols-5 px-1">
        {ITEMS.map((item) => (
          <li key={item.to} className="flex">
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center flex-1 py-2 text-[11px] ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="text-lg leading-none" aria-hidden>{item.icon}</span>
                  <span className="mt-0.5">{item.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="bottom-nav-active"
                      className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-accent rounded-b-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
export default BottomNav;
