import { useState, useEffect } from 'react';
import { Download, TrendingUp, Package, AlertTriangle, CreditCard, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { dbSelect, dbGet } from '../hooks/useDatabase';
import { formatCurrency } from '../utils/gstCalculator';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

type Tab = 'sales' | 'medicines' | 'expiry' | 'credit' | 'valuation';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [salesSummary, setSalesSummary] = useState<any>(null);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [medicineSales, setMedicineSales] = useState<any[]>([]);
  const [expiryItems, setExpiryItems] = useState<any[]>([]);
  const [creditReport, setCreditReport] = useState<any[]>([]);
  const [inventoryVal, setInventoryVal] = useState<any>(null);
  const [inventoryByMed, setInventoryByMed] = useState<any[]>([]);

  useEffect(() => { loadReport(); }, [activeTab, dateFrom, dateTo]);

  async function loadReport() {
    setLoading(true);
    try {
      if (activeTab === 'sales') await loadSales();
      else if (activeTab === 'medicines') await loadMedicineSales();
      else if (activeTab === 'expiry') await loadExpiry();
      else if (activeTab === 'credit') await loadCredit();
      else await loadValuation();
    } finally { setLoading(false); }
  }

  async function loadSales() {
    const [summary, daily] = await Promise.all([
      dbGet(`SELECT COUNT(*) as transactions, COALESCE(SUM(total),0) as revenue, COALESCE(SUM(gst_amount),0) as gst_collected, COALESCE(AVG(total),0) as avg_transaction
             FROM invoices WHERE date BETWEEN ? AND ? AND status='paid'`, [dateFrom, dateTo]),
      dbSelect(`SELECT date, COALESCE(SUM(total),0) as total FROM invoices WHERE date BETWEEN ? AND ? AND status='paid' GROUP BY date ORDER BY date`, [dateFrom, dateTo]),
    ]);
    setSalesSummary(summary);
    setDailySales(daily as any[]);
  }

  async function loadMedicineSales() {
    const data = await dbSelect(
      `SELECT m.name, SUM(ii.quantity) as qty_sold, SUM(ii.item_total) as revenue,
              SUM(ii.quantity * (m.price - m.cost)) as profit
       FROM invoice_items ii JOIN medicines m ON m.id=ii.medicine_id
       JOIN invoices i ON i.id=ii.invoice_id
       WHERE i.date BETWEEN ? AND ? AND i.status='paid'
       GROUP BY m.id ORDER BY revenue DESC`,
      [dateFrom, dateTo]
    );
    setMedicineSales(data as any[]);
  }

  async function loadExpiry() {
    const data = await dbSelect(
      `SELECT m.name, s.batch_number, s.expiry_date, s.quantity,
              CAST((julianday(s.expiry_date) - julianday('now')) AS INTEGER) as days_left
       FROM stock s JOIN medicines m ON m.id=s.medicine_id
       WHERE s.quantity > 0 ORDER BY days_left ASC`,
      []
    );
    setExpiryItems(data as any[]);
  }

  async function loadCredit() {
    const data = await dbSelect(
      `SELECT name, credit_limit, credit_used, ROUND(CASE WHEN credit_limit>0 THEN (credit_used*100.0/credit_limit) ELSE 0 END,1) as pct
       FROM customers WHERE credit_limit > 0 ORDER BY credit_used DESC`,
      []
    );
    setCreditReport(data as any[]);
  }

  async function loadValuation() {
    const [total, byMed] = await Promise.all([
      dbGet(`SELECT COUNT(DISTINCT m.id) as medicines, SUM(s.quantity) as total_units, COALESCE(SUM(s.quantity * m.cost),0) as cost_value, COALESCE(SUM(s.quantity * m.price),0) as mrp_value FROM stock s JOIN medicines m ON m.id=s.medicine_id WHERE s.quantity > 0`, []),
      dbSelect(`SELECT m.name, SUM(s.quantity) as total_qty, COALESCE(SUM(s.quantity * m.cost),0) as value FROM stock s JOIN medicines m ON m.id=s.medicine_id WHERE s.quantity > 0 GROUP BY m.id ORDER BY value DESC LIMIT 10`, []),
    ]);
    setInventoryVal(total);
    setInventoryByMed(byMed as any[]);
  }

  function exportCSV(data: any[], filename: string) {
    if (!data.length) return;
    const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'sales', label: 'Daily Sales', icon: TrendingUp },
    { id: 'medicines', label: 'Medicine Sales', icon: BarChart2 },
    { id: 'expiry', label: 'Expiry Tracking', icon: AlertTriangle },
    { id: 'credit', label: 'Credit Report', icon: CreditCard },
    { id: 'valuation', label: 'Inventory Value', icon: Package },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h2 className="page-title">Reports & Analytics</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === t.id ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-800'}`}>
            <t.icon size={16} />{t.label}
          </button>
        ))}
      </div>

      {/* Date Filter (not for expiry, credit, valuation) */}
      {['sales', 'medicines'].includes(activeTab) && (
        <div className="card p-4 flex items-center gap-4">
          <label className="text-sm font-medium text-slate-600">Date Range:</label>
          <input type="date" className="input w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-slate-400">to</span>
          <input type="date" className="input w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <>
          {activeTab === 'sales' && salesSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Total Revenue', value: formatCurrency(salesSummary.revenue) },
                  { label: 'GST Collected', value: formatCurrency(salesSummary.gst_collected) },
                  { label: 'Transactions', value: salesSummary.transactions },
                  { label: 'Avg. Transaction', value: formatCurrency(salesSummary.avg_transaction) },
                ].map(m => (
                  <div key={m.label} className="card text-center">
                    <div className="text-slate-500 text-sm">{m.label}</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{m.value}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-700">Daily Revenue</h3>
                  <button onClick={() => exportCSV(dailySales, 'daily-sales.csv')} className="btn-secondary text-xs py-1"><Download size={12} />Export</button>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                    <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === 'medicines' && (
            <div className="card p-0">
              <div className="p-4 flex items-center justify-between border-b border-slate-200">
                <h3 className="font-semibold text-slate-700">Medicine-wise Sales</h3>
                <button onClick={() => exportCSV(medicineSales, 'medicine-sales.csv')} className="btn-secondary text-xs py-1"><Download size={12} />Export CSV</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Medicine', 'Qty Sold', 'Revenue', 'Profit'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {medicineSales.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">No sales data for selected period</td></tr>
                  ) : medicineSales.map((r: any, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3">{r.qty_sold}</td>
                      <td className="px-4 py-3">{formatCurrency(r.revenue)}</td>
                      <td className={`px-4 py-3 font-medium ${r.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(r.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'expiry' && (
            <div className="card p-0">
              <div className="p-4 flex items-center justify-between border-b border-slate-200">
                <h3 className="font-semibold text-slate-700">Expiry Tracking</h3>
                <button onClick={() => exportCSV(expiryItems, 'expiry-report.csv')} className="btn-secondary text-xs py-1"><Download size={12} />Export</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Medicine', 'Batch', 'Expiry Date', 'Days Left', 'Qty', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expiryItems.map((r: any, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-slate-500">{r.batch_number}</td>
                      <td className="px-4 py-3">{r.expiry_date}</td>
                      <td className="px-4 py-3">
                        <span className={r.days_left < 0 ? 'text-red-600 font-semibold' : r.days_left <= 30 ? 'text-amber-600 font-semibold' : 'text-slate-600'}>
                          {r.days_left < 0 ? `Expired ${Math.abs(r.days_left)}d ago` : `${r.days_left}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3">{r.quantity}</td>
                      <td className="px-4 py-3">
                        {r.days_left < 0 ? <span className="badge-red">Expired</span>
                          : r.days_left <= 30 ? <span className="badge-yellow">Expiring Soon</span>
                          : <span className="badge-green">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'credit' && (
            <div className="card p-0">
              <div className="p-4 flex items-center justify-between border-b border-slate-200">
                <h3 className="font-semibold text-slate-700">Customer Credit Report</h3>
                <button onClick={() => exportCSV(creditReport, 'credit-report.csv')} className="btn-secondary text-xs py-1"><Download size={12} />Export</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Customer', 'Credit Limit', 'Credit Used', 'Available', '% Utilized'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {creditReport.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400">No customers with credit limits</td></tr>
                  ) : creditReport.map((r: any, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3">{formatCurrency(r.credit_limit)}</td>
                      <td className="px-4 py-3 text-amber-600">{formatCurrency(r.credit_used)}</td>
                      <td className={`px-4 py-3 font-medium ${r.credit_limit - r.credit_used <= 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(r.credit_limit - r.credit_used)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                          </div>
                          <span className="text-xs">{r.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'valuation' && inventoryVal && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Total Medicines', value: inventoryVal.medicines },
                  { label: 'Total Units', value: inventoryVal.total_units },
                  { label: 'Cost Value', value: formatCurrency(inventoryVal.cost_value) },
                  { label: 'MRP Value', value: formatCurrency(inventoryVal.mrp_value) },
                ].map(m => (
                  <div key={m.label} className="card text-center">
                    <div className="text-slate-500 text-sm">{m.label}</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{m.value}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <h3 className="font-semibold text-slate-700 mb-4">Top 10 Medicines by Value</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={inventoryByMed} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                    <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Value']} />
                    <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
