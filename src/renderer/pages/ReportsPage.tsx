import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, TrendingUp, Package, AlertTriangle, CreditCard } from 'lucide-react';

type Tab = 'daily-sales' | 'medicine-sales' | 'expiry' | 'credit' | 'inventory';

const fmt = (n: number) => `₹${(n ?? 0).toFixed(2)}`;
const PIE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];

function exportCSV(data: any[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [headers.join(','), ...data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename + '.csv';
  a.click();
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('daily-sales');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading]   = useState(false);

  const [dailySales, setDailySales]       = useState<any[]>([]);
  const [medicineSales, setMedicineSales] = useState<any[]>([]);
  const [expiryData, setExpiryData]       = useState<any[]>([]);
  const [creditData, setCreditData]       = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);

  useEffect(() => { loadTabData(); }, [activeTab, startDate, endDate]);

  async function loadTabData() {
    setLoading(true);
    try {
      if (activeTab === 'daily-sales') {
        const res = await window.api.reportDailySales(startDate, endDate);
        if (res.success) setDailySales(res.data);
      } else if (activeTab === 'medicine-sales') {
        const res = await window.api.reportMedicineSales(startDate, endDate);
        if (res.success) setMedicineSales(res.data);
      } else if (activeTab === 'expiry') {
        const res = await window.api.reportExpiry();
        if (res.success) setExpiryData(res.data);
      } else if (activeTab === 'credit') {
        const res = await window.api.reportCredit();
        if (res.success) setCreditData(res.data);
      } else if (activeTab === 'inventory') {
        const res = await window.api.reportInventoryValuation();
        if (res.success) setInventoryData(res.data);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const dailyTotals = {
    revenue:      dailySales.reduce((s, r) => s + (r.total_revenue ?? 0), 0),
    gst:          dailySales.reduce((s, r) => s + (r.total_gst ?? 0), 0),
    transactions: dailySales.reduce((s, r) => s + (r.invoice_count ?? 0), 0),
  };

  const inventoryTotal = inventoryData.reduce((s, r) => s + (r.stock_value_cost ?? 0), 0);

  const expiryStatus = {
    expired:  expiryData.filter(r => r.days_to_expiry < 0).length,
    within30: expiryData.filter(r => r.days_to_expiry >= 0 && r.days_to_expiry <= 30).length,
    within60: expiryData.filter(r => r.days_to_expiry > 30 && r.days_to_expiry <= 60).length,
    within90: expiryData.filter(r => r.days_to_expiry > 60 && r.days_to_expiry <= 90).length,
  };

  const pieData = [
    { name: 'Normal',          value: expiryData.filter(r => r.days_to_expiry > 90).length },
    { name: 'Expiring (90d)',  value: expiryStatus.within90 },
    { name: 'Expiring (30d)',  value: expiryStatus.within30 },
    { name: 'Expired',         value: expiryStatus.expired },
  ].filter(d => d.value > 0);

  const tabs = [
    { id: 'daily-sales'    as Tab, label: 'Daily Sales',      icon: TrendingUp },
    { id: 'medicine-sales' as Tab, label: 'Medicine Sales',   icon: Package },
    { id: 'expiry'         as Tab, label: 'Expiry Tracking',  icon: AlertTriangle },
    { id: 'credit'         as Tab, label: 'Credit Report',    icon: CreditCard },
    { id: 'inventory'      as Tab, label: 'Inventory Value',  icon: Package },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      {(activeTab === 'daily-sales' || activeTab === 'medicine-sales') && (
        <div className="card">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600">From:</label>
              <input type="date" className="input w-40" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600">To:</label>
              <input type="date" className="input w-40" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <button onClick={loadTabData} className="btn-primary">Apply</button>
            <button onClick={() => exportCSV(activeTab === 'daily-sales' ? dailySales : medicineSales, activeTab)} className="btn-secondary ml-auto">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* ── Daily Sales ──────────────────────────────────────────────────── */}
          {activeTab === 'daily-sales' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Revenue',    value: fmt(dailyTotals.revenue),      cls: 'text-slate-800' },
                  { label: 'GST Collected',    value: fmt(dailyTotals.gst),          cls: 'text-blue-700' },
                  { label: 'Transactions',     value: String(dailyTotals.transactions), cls: 'text-green-700' },
                ].map(c => (
                  <div key={c.label} className="card text-center">
                    <div className="text-slate-500 text-sm">{c.label}</div>
                    <div className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.value}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <h3 className="font-semibold text-slate-700 mb-4">Daily Revenue</h3>
                {!dailySales.length ? <div className="text-center py-8 text-slate-400">No data</div> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={[...dailySales].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                      <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} />
                      <Line type="monotone" dataKey="total_revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              {dailySales.length > 0 && (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Date', 'Invoices', 'Revenue', 'GST', 'Cash', 'Card/UPI', 'Credit'].map(h => (
                          <th key={h} className={`px-4 py-3 font-semibold text-slate-500 ${h === 'Date' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dailySales.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{r.date}</td>
                          <td className="px-4 py-3 text-right">{r.invoice_count}</td>
                          <td className="px-4 py-3 text-right font-medium">{fmt(r.total_revenue)}</td>
                          <td className="px-4 py-3 text-right text-blue-700">{fmt(r.total_gst)}</td>
                          <td className="px-4 py-3 text-right">{fmt(r.cash_total)}</td>
                          <td className="px-4 py-3 text-right">{fmt((r.card_total ?? 0) + (r.upi_total ?? 0))}</td>
                          <td className="px-4 py-3 text-right text-amber-600">{fmt(r.credit_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Medicine Sales ───────────────────────────────────────────────── */}
          {activeTab === 'medicine-sales' && (
            <div className="space-y-4">
              {medicineSales.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-slate-700 mb-4">Top 10 Medicines by Revenue</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={medicineSales.slice(0, 10)} layout="vertical" margin={{ left: 140, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                      <YAxis type="category" dataKey="medicine_name" tick={{ fontSize: 11 }} width={140} />
                      <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} />
                      <Bar dataKey="total_revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Medicine</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Qty Sold</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Revenue</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Gross Profit</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!medicineSales.length ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400">No sales data</td></tr>
                    ) : medicineSales.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{r.medicine_name}</td>
                        <td className="px-4 py-3 text-right">{r.total_qty}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(r.total_revenue)}</td>
                        <td className="px-4 py-3 text-right text-green-600 font-medium">{fmt(r.gross_profit ?? 0)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{(r.profit_margin_pct ?? 0).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Expiry Tracking ──────────────────────────────────────────────── */}
          {activeTab === 'expiry' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Expired',           count: expiryStatus.expired,  cls: 'bg-red-50 border-red-200 text-red-700' },
                  { label: 'Expiring ≤ 30 days', count: expiryStatus.within30, cls: 'bg-orange-50 border-orange-200 text-orange-700' },
                  { label: 'Expiring ≤ 60 days', count: expiryStatus.within60, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                  { label: 'Expiring ≤ 90 days', count: expiryStatus.within90, cls: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
                ].map(c => (
                  <div key={c.label} className={`border rounded-lg p-3 ${c.cls}`}>
                    <div className="font-bold text-xl">{c.count}</div>
                    <div className="text-xs mt-1">{c.label}</div>
                  </div>
                ))}
              </div>
              {pieData.length > 0 && (
                <div className="card flex items-center gap-6">
                  <PieChart width={180} height={180}>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                  <div className="space-y-2">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-slate-600">{d.name}:</span>
                        <span className="font-semibold">{d.value} batches</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Medicine</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Batch</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Qty</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Expiry</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Stock Value</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!expiryData.length ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-400">No expiry data</td></tr>
                    ) : expiryData.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{r.medicine_name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{r.batch_number}</td>
                        <td className="px-4 py-3 text-right">{r.quantity}</td>
                        <td className="px-4 py-3">{r.expiry_date}</td>
                        <td className="px-4 py-3 text-right">{fmt(r.stock_value ?? 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.status === 'expired'  ? 'bg-red-100 text-red-700' :
                            r.status === 'critical' ? 'bg-orange-100 text-orange-700' :
                            r.status === 'warning'  ? 'bg-amber-100 text-amber-700' :
                                                      'bg-green-100 text-green-700'
                          }`}>
                            {r.status === 'expired' ? `Expired` : `${r.days_to_expiry}d`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Credit Report ────────────────────────────────────────────────── */}
          {activeTab === 'credit' && (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500">Customer</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500">Phone</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Credit Limit</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Used</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Available</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {!creditData.length ? (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">No outstanding credit</td></tr>
                  ) : creditData.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-slate-500">{r.phone || '—'}</td>
                      <td className="px-4 py-3 text-right">{fmt(r.credit_limit)}</td>
                      <td className="px-4 py-3 text-right text-amber-600 font-medium">{fmt(r.credit_used)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{fmt(r.available_credit)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, r.utilization_pct ?? 0)}%` }} />
                          </div>
                          <span className="text-xs">{(r.utilization_pct ?? 0).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Inventory Valuation ──────────────────────────────────────────── */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <div className="text-slate-500 text-sm">Total Inventory Value (Cost)</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">{fmt(inventoryTotal)}</div>
                </div>
                <div className="card text-center">
                  <div className="text-slate-500 text-sm">Total SKUs</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">{inventoryData.length}</div>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => exportCSV(inventoryData, 'inventory-valuation')} className="btn-secondary">
                  <Download size={14} /> Export CSV
                </button>
              </div>
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Medicine</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500">Unit</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Qty</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Cost/Unit</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">MRP/Unit</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500">Stock Value (Cost)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!inventoryData.length ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-400">No inventory data</td></tr>
                    ) : inventoryData.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="px-4 py-3 text-slate-500 capitalize">{r.unit}</td>
                        <td className="px-4 py-3 text-right font-semibold">{r.total_qty}</td>
                        <td className="px-4 py-3 text-right">{fmt(r.cost)}</td>
                        <td className="px-4 py-3 text-right">{fmt(r.mrp)}</td>
                        <td className="px-4 py-3 text-right font-medium text-blue-700">{fmt(r.stock_value_cost)}</td>
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
