import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, AlertTriangle, CreditCard, TrendingUp, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../utils/gstCalculator';

interface StatCard {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface RecentInvoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  date: string;
  total: number;
  payment_method: string;
  status: string;
}

interface DailySale {
  date: string;
  total: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [todaySales, setTodaySales] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [expiringSoon, setExpiringSoon] = useState(0);
  const [pendingCredit, setPendingCredit] = useState(0);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [weeklySales, setWeeklySales] = useState<DailySale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [salesData, invData, expiryData, creditData, recentData, weeklyData] = await Promise.all([
        window.api.dbGet(`SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE date = ? AND status = 'paid'`, [today]),
        window.api.dbGet(`SELECT COALESCE(SUM(s.quantity * m.cost), 0) as total FROM stock s JOIN medicines m ON s.medicine_id = m.id WHERE s.quantity > 0`, []),
        window.api.dbGet(`SELECT COUNT(*) as count FROM stock WHERE expiry_date <= ? AND expiry_date >= ? AND quantity > 0`, [thirtyDaysLater, today]),
        window.api.dbGet(`SELECT COALESCE(SUM(credit_used), 0) as total FROM customers`, []),
        window.api.dbSelect(`SELECT id, invoice_number, customer_name, date, total, payment_method, status FROM invoices ORDER BY id DESC LIMIT 10`, []),
        window.api.dbSelect(`
          SELECT date, COALESCE(SUM(total), 0) as total
          FROM invoices
          WHERE date >= date('now', '-6 days') AND status = 'paid'
          GROUP BY date
          ORDER BY date ASC
        `, []),
      ]);

      setTodaySales((salesData as any)?.total || 0);
      setInventoryValue((invData as any)?.total || 0);
      setExpiringSoon((expiryData as any)?.count || 0);
      setPendingCredit((creditData as any)?.total || 0);
      setRecentInvoices((recentData as RecentInvoice[]) || []);

      // Build last 7 days chart data
      const last7Days: DailySale[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        const found = (weeklyData as DailySale[]).find(w => w.date === dateStr);
        last7Days.push({
          date: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          total: found ? found.total : 0,
        });
      }
      setWeeklySales(last7Days);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const stats: StatCard[] = [
    { label: "Today's Sales", value: formatCurrency(todaySales), icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Inventory Value', value: formatCurrency(inventoryValue), icon: Package, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Expiring in 30 Days', value: String(expiringSoon) + ' items', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Pending Credit', value: formatCurrency(pendingCredit), icon: CreditCard, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  const paymentBadge = (method: string) => {
    const colors: Record<string, string> = {
      cash: 'badge-green',
      card: 'badge-blue',
      upi: 'badge-blue',
      credit: 'badge-yellow',
    };
    return colors[method] || 'badge-gray';
  };

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
              <stat.icon size={24} className={stat.color} />
            </div>
            <div>
              <div className="text-slate-500 text-sm">{stat.label}</div>
              <div className="font-bold text-xl text-slate-800 mt-0.5">
                {loading ? <div className="h-6 w-20 bg-slate-200 rounded animate-pulse" /> : stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Sales Chart */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-500" />
              Last 7 Days Sales
            </h2>
          </div>
          {loading ? (
            <div className="h-48 bg-slate-100 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklySales} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Sales']} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="font-semibold text-slate-700 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/pos')}
              className="w-full flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart size={18} className="text-blue-600" />
                <span className="font-medium text-blue-700 text-sm">New Sale</span>
              </div>
              <ArrowRight size={16} className="text-blue-500 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/stock')}
              className="w-full flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Package size={18} className="text-green-600" />
                <span className="font-medium text-green-700 text-sm">Add Stock</span>
              </div>
              <ArrowRight size={16} className="text-green-500 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/reports')}
              className="w-full flex items-center justify-between p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <TrendingUp size={18} className="text-purple-600" />
                <span className="font-medium text-purple-700 text-sm">View Reports</span>
              </div>
              <ArrowRight size={16} className="text-purple-500 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">Recent Transactions</h2>
          <button onClick={() => navigate('/reports')} className="text-blue-600 text-sm hover:underline flex items-center gap-1">
            View all <ArrowRight size={14} />
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : recentInvoices.length === 0 ? (
          <div className="text-center py-8 text-slate-400">No transactions yet. Start your first sale!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 font-semibold text-slate-500">Invoice #</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-500">Customer</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-500">Date</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-500">Payment</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-500">Total</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-blue-600">{inv.invoice_number}</td>
                    <td className="py-2.5 px-3 text-slate-600">{inv.customer_name || 'Walk-in'}</td>
                    <td className="py-2.5 px-3 text-slate-500">{inv.date}</td>
                    <td className="py-2.5 px-3">
                      <span className={paymentBadge(inv.payment_method)}>{inv.payment_method?.toUpperCase()}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(inv.total)}</td>
                    <td className="py-2.5 px-3">
                      <span className={inv.status === 'paid' ? 'badge-green' : 'badge-yellow'}>{inv.status}</span>
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
