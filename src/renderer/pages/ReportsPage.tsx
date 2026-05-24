import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, TrendingUp, Package, AlertTriangle, CreditCard } from 'lucide-react';
import { formatCurrency } from '../utils/gstCalculator';
import { differenceInDays, parseISO } from 'date-fns';

type Tab = 'daily-sales' | 'medicine-sales' | 'expiry' | 'credit' | 'inventory';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('daily-sales');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Daily Sales State
  const [dailySalesData, setDailySalesData] = useState<any[]>([]);
  const [salesMetrics, setSalesMetrics] = useState({ revenue: 0, gst: 0, transactions: 0 });

  // Medicine Sales State
  const [medicineSales, setMedicineSales] = useState<any[]>([]);

  // Expiry State
  const [expiryData, setExpiryData] = useState<any[]>([]);

  // Credit State
  const [creditData, setCreditData] = useState<any[]>([]);

  // Inventory State
  const [inventoryData, setInventoryData] = useState<{ totalValue: number; totalItems: number; rows: any[] }>({ totalValue: 0, totalItems: 0, rows: [] });

  useEffect(() => { loadTabData(); }, [activeTab, startDate, endDate]);

  async function loadTabData() {
    setLoading(true);
    try {
      if (activeTab === 'daily-sales') await loadDailySales();
      else if (activeTab === 'medicine-sales') await loadMedicineSales();
      else if (activeTab === 'expiry') await loadExpiry();
      else if (activeTab === 'credit') await loadCredit();
      else if (activeTab === 'inventory') await loadInventory();
    } finally {
      setLoading(false);
    }
  }

  async function loadDailySales() {
    const rows = await window.api.dbSelect(
      `SELECT date, COALESCE(SUM(total),0) as revenue, COALESCE(SUM(gst_amount),0) as gst, COUNT(*) as transactions
       FROM invoices WHERE date BETWEEN ? AND ? AND status = 'paid'
       GROUP BY date ORDER BY date ASC`,
      [startDate, endDate]
    );
    setDailySalesData(rows);
    const rev = rows.reduce((s: number, r: any) => s + r.revenue, 0);
    const gst = rows.reduce((s: number, r: any) => s + r.gst, 0);
    const txn = rows.reduce((s: number, r: any) => s + r.transactions, 0);
    setSalesMetrics({ revenue: rev, gst, transactions: txn });
  }

  async function loadMedicineSales() {
    const rows = await window.api.dbSelect(
      `SELECT ii.medicine_name, SUM(ii.quantity) as qty_sold, SUM(ii.item_total) as revenue,
              SUM(ii.item_total - (m.cost * ii.quantity)) as profit
       FROM invoice_items ii
       JOIN invoices inv ON ii.invoice_id = inv.id
       JOIN medicines m ON ii.medicine_id = m.id
       WHERE inv.date BETWEEN ? AND ? AND inv.status = 'paid'
       GROUP BY ii.medicine_id, ii.medicine_name
       ORDER BY revenue DESC`,
      [startDate, endDate]
    );
    setMedicineSales(rows);
  }

  async function loadExpiry() {
    const rows = await window.api.dbSelect(
      `SELECT s.batch_number, s.expiry_date, s.quantity, m.name as medicine_name
       FROM stock s JOIN medicines m ON s.medicine_id = m.id
       WHERE s.quantity > 0
       ORDER BY s.expiry_date ASC`,
      []
    );
    setExpiryData(rows);
  }

  async function loadCredit() {
    const rows = await window.api.dbSelect(
      `SELECT name, phone, credit_limit, credit_used,
              CASE WHEN credit_limit > 0 THEN ROUND((credit_used * 100.0 / credit_limit), 1) ELSE 0 END as utilization
       FROM customers WHERE credit_used > 0 ORDER BY credit_used DESC`,
      []
    );
    setCreditData(rows);
  }

  async function loadInventory() {
    const rows = await window.api.dbSelect(
      `SELECT m.name, SUM(s.quantity) as total_qty, m.cost, SUM(s.quantity * m.cost) as total_value
       FROM stock s JOIN medicines m ON s.medicine_id = m.id
       WHERE s.quantity > 0
       GROUP BY m.id, m.name, m.cost
       ORDER BY total_value DESC`,
      []
    );
    const totalValue = rows.reduce((s: number, r: any) => s + r.total_value, 0);
    const totalItems = rows.reduce((s: number, r: any) => s + r.total_qty, 0);
    setInventoryData({ totalValue, totalItems, rows });
  }

  function exportCSV(data: any[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename + '.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function getExpiryBadge(expiryDate: string) {
    const days = differenceInDays(parseISO(expiryDate), new Date());
    if (days < 0) return { label: 'Expired', cls: 'badge-red' };
    if (days <= 30) return { label: `${days}d`, cls: 'badge-red' };
    if (days <= 60) return { label: `${days}d`, cls: 'badge-yellow' };
    if (days <= 90) return { label: `${days}d`, cls: 'badge-yellow' };
    return { label: `${days}d`, cls: 'badge-green' };
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'daily-sales', label: 'Daily Sales', icon: TrendingUp },
    { id: 'medicine-sales', label: 'Medicine Sales', icon: Package },
    { id: 'expiry', label: 'Expiry Tracking', icon: AlertTriangle },
    { id: 'credit', label: 'Credit Report', icon: CreditCard },
    { id: 'inventory', label: 'Inventory Value', icon: Package },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Range (for relevant tabs) */}
      {(activeTab === 'daily-sales' || activeTab === 'medicine-sales') && (
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600">From:</label>
              <input type="date" className="input w-40" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600">To:</label>
              <input type="date" className="input w-40" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <button onClick={loadTabData} className="btn-primary">Apply</button>
            <button onClick={() => exportCSV(activeTab === 'daily-sales' ? dailySalesData : medicineSales, activeTab)}
              className="btn-secondary ml-auto"><Download size={14} /> Export CSV</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Daily Sales Tab */}
          {activeTab === 'daily-sales' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="card text-center">
                  <div className="text-slate-500 text-sm">Total Revenue</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(salesMetrics.revenue)}</div>
                </div>
                <div className="card text-center">
                  <div className="text-slate-500 text-sm">GST Collected</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(salesMetrics.gst)}</div>
                </div>
                <div className="card text-center">
                  <div className="text-slate-500 text-sm">Transactions</div>
                  <div className="text-2xl font-bold text-green-700 mt-1">{salesMetrics.transactions}</div>
                </div>
              </div>
              <div className="card">
                <h3 className="font-semibold text-slate-700 mb-4">Daily Revenue</h3>
                {dailySalesData.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">No data for selected period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={dailySalesData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                      <Tooltip formatter={(v: number) => [`₹${v.toFixed(2)}`, 'Revenue']} />
                      <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Medicine Sales Tab */}
          {activeTab === 'medicine-sales' && (
            <div className="card p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500">Medicine</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Qty Sold</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Revenue</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {medicineSales.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">No sales data found</td></tr>
                  ) : medicineSales.map((row: any, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{row.medicine_name}</td>
                      <td className="px-4 py-3 text-right">{row.qty_sold}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">{formatCurrency(row.profit || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expiry Tracking Tab */}
          {activeTab === 'expiry' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4 text-sm">
                {[
                  { label: 'Expired', filter: (d: number) => d < 0, cls: 'bg-red-50 border-red-200 text-red-700' },
                  { label: 'Expiring in 30 days', filter: (d: number) => d >= 0 && d <= 30, cls: 'bg-orange-50 border-orange-200 text-orange-700' },
                  { label: 'Expiring in 60 days', filter: (d: number) => d > 30 && d <= 60, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                  { label: 'Expiring in 90 days', filter: (d: number) => d > 60 && d <= 90, cls: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
                ].map(({ label, filter, cls }) => {
                  const count = expiryData.filter((r: any) => filter(differenceInDays(parseISO(r.expiry_date), new Date()))).length;
                  return (
                    <div key={label} className={`border rounded-lg p-3 ${cls}`}>
                      <div className="font-bold text-xl">{count}</div>
                      <div className="text-xs mt-1">{label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="card p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Medicine</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Batch</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Expiry Date</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-500">Days</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiryData.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400">No expiry data</td></tr>
                    ) : expiryData.map((row: any, i) => {
                      const badge = getExpiryBadge(row.expiry_date);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium">{row.medicine_name}</td>
                          <td className="px-4 py-3 text-slate-500">{row.batch_number}</td>
                          <td className="px-4 py-3">{row.expiry_date}</td>
                          <td className="px-4 py-3 text-center"><span className={badge.cls}>{badge.label}</span></td>
                          <td className="px-4 py-3 text-right font-medium">{row.quantity}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Credit Report Tab */}
          {activeTab === 'credit' && (
            <div className="card p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500">Customer</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500">Phone</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Credit Limit</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Credit Used</th>
                    <th className="text-center px-4 py-3 font-semibold text-slate-500">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {creditData.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400">No outstanding credit</td></tr>
                  ) : creditData.map((row: any, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-slate-500">{row.phone || '-'}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.credit_limit)}</td>
                      <td className="px-4 py-3 text-right text-amber-600 font-medium">{formatCurrency(row.credit_used)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${row.utilization >= 90 ? 'bg-red-500' : row.utilization >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(row.utilization, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600 w-10 text-right">{row.utilization}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Inventory Valuation Tab */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <div className="text-slate-500 text-sm">Total Inventory Value</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(inventoryData.totalValue)}</div>
                </div>
                <div className="card text-center">
                  <div className="text-slate-500 text-sm">Total Stock Items</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">{inventoryData.totalItems}</div>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => exportCSV(inventoryData.rows, 'inventory-valuation')} className="btn-secondary">
                  <Download size={14} /> Export CSV
                </button>
              </div>
              <div className="card p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Medicine</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Total Qty</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Cost/Unit</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryData.rows.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-slate-400">No inventory data</td></tr>
                    ) : inventoryData.rows.map((row: any, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3 text-right">{row.total_qty}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(row.cost)}</td>
                        <td className="px-4 py-3 text-right font-medium text-blue-700">{formatCurrency(row.total_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
