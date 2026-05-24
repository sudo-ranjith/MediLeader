import { useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pos': 'Point of Sale',
  '/medicines': 'Medicines',
  '/stock': 'Stock Management',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/purchase-orders': 'Purchase Orders',
  '/reports': 'Reports & Analytics',
  '/settings': 'Settings',
};

export default function Header() {
  const { pathname } = useLocation();
  const title = titles[pathname] || 'Pharma Vault';

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors relative">
          <Bell size={20} />
        </button>
        <div className="text-sm text-slate-500">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </header>
  );
}
