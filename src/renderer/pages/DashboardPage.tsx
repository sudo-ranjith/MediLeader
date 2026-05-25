import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, AlertTriangle, CreditCard, TrendingUp, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmt = (n: number) => `₹${n.toFixed(2)}`;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.reportDashboard().then(res => {
      if (res.success) setStats(res.data);
    }).finally(() => setLoading(false));
  }, []);

  const salesTrend = (() => {
    const last7: { date: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const found = stats?.sales_trend?.find((s: any) => s.date === dateStr);
      last7.push({
        date: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        total: found?.revenue ?? 0,
      });
    }
    return last7;
  })();

  const cards = [
    { label: "Today's Sales",    value: fmt(stats?.today_sales   ?? 0), icon: ShoppingCart, color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Inventory Value',  value: fmt(stats?.inventory_value ?? 0), icon: Package,     color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Expiring (30d)',   value: `${stats?.expiring_30_days ?? 0} batches`, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Pending Credit',   value: fmt(stats?.pending_credit ?? 0), icon: CreditCard,  color: 'text-red-600',    bg: 'bg-red-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
              <c.icon size={24} className={c.color} />
            </div>
            <div>
              <div className="text-slate-500 text-sm">{c.label}</div>
              <div className="font-bold text-xl text-slate-800 mt-0.5">
                {loading ? <div className="h-6 w-20 bg-slate-200 rounded animate-pulse" /> : c.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-blue-500" />
            <h2 className="font-semibold text-slate-700">Last 7 Days Sales</h2>
          </div>
          {loading ? (
            <div className="h-48 bg-slate-100 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={salesTrend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={v => `₹${v}`} />
                <Tooltip formatter={(v: number) => [`₹${v.toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-slate-700 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {[
              { label: 'New Sale', icon: ShoppingCart, path: '/pos', colors: 'bg-blue-50 hover:bg-blue-100 text-blue-700' },
              { label: 'Add Stock', icon: Package, path: '/stock', colors: 'bg-green-50 hover:bg-green-100 text-green-700' },
              { label: 'View Reports', icon: TrendingUp, path: '/reports', colors: 'bg-purple-50 hover:bg-purple-100 text-purple-700' },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors group ${a.colors}`}
              >
                <div className="flex items-center gap-3">
                  <a.icon size={18} />
                  <span className="font-medium text-sm">{a.label}</span>
                </div>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">Recent Transactions</h2>
          <button onClick={() => navigate('/reports')} className="text-blue-600 text-sm hover:underline flex items-center gap-1">
            View all <ArrowRight size={14} />
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : !stats?.recent_invoices?.length ? (
          <div className="text-center py-8 text-slate-400">No transactions yet. Start your first sale!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Invoice #', 'Customer', 'Date', 'Payment', 'Total', 'Status'].map(h => (
                    <th key={h} className={`py-2 px-3 font-semibold text-slate-500 ${h === 'Total' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recent_invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-blue-600">{inv.invoice_number}</td>
                    <td className="py-2.5 px-3 text-slate-600">{inv.customer_name || 'Walk-in'}</td>
                    <td className="py-2.5 px-3 text-slate-500">{inv.invoice_date}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs font-medium uppercase">{inv.payment_method}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">{fmt(inv.total_amount ?? 0)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
