import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Pill, Package, ShoppingCart, Users, Truck,
  ClipboardList, BarChart3, Settings, LogOut, Activity, GitMerge
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import clsx from 'clsx';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pos', icon: ShoppingCart, label: 'POS / Billing' },
  { to: '/medicines', icon: Pill, label: 'Medicines' },
  { to: '/stock', icon: Package, label: 'Stock' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/suppliers', icon: Truck, label: 'Suppliers' },
  { to: '/purchase-orders', icon: ClipboardList, label: 'Purchase Orders' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/conflicts', icon: GitMerge, label: 'Sync Conflicts' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { logout, user } = useAuthStore();

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-full">
      <div className="p-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <Activity size={20} />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">Pharma Vault</div>
            <div className="text-slate-400 text-xs">Pharmacy Manager</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-700">
        <div className="px-3 py-2 text-slate-400 text-xs mb-1">
          <div className="font-medium text-slate-300">{user?.email}</div>
          <div className="capitalize">{user?.role}</div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
