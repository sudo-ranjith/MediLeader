import { useState } from 'react';
import { Download, FileText, Calculator, Table } from 'lucide-react';

type Tab = 'summary' | 'gstr1' | 'gstr3b' | 'hsn';

export default function GSTReportsPage() {
  const [tab, setTab]       = useState<Tab>('summary');
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  });
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate]   = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const gstPeriod = period.replace('-', '').slice(4) + period.replace('-', '').slice(0, 4); // MMYYYY

  const loadSummary = async () => {
    setLoading(true); setError('');
    try {
      const res = await window.api.gstSummary(fromDate, toDate);
      if (res.success) setData({ type: 'summary', ...res.data });
      else setError(res.error ?? 'Failed');
    } finally { setLoading(false); }
  };

  const loadGSTR1 = async () => {
    setLoading(true); setError('');
    try {
      const p   = period.slice(5, 7) + period.slice(0, 4); // MMYYYY
      const res = await window.api.gstGSTR1(p);
      if (res.success) setData({ type: 'gstr1', ...res.data });
      else setError(res.error ?? 'Failed');
    } finally { setLoading(false); }
  };

  const loadGSTR3B = async () => {
    setLoading(true); setError('');
    try {
      const p   = period.slice(5, 7) + period.slice(0, 4);
      const res = await window.api.gstGSTR3B(p);
      if (res.success) setData({ type: 'gstr3b', ...res.data });
      else setError(res.error ?? 'Failed');
    } finally { setLoading(false); }
  };

  const loadHSN = async () => {
    setLoading(true); setError('');
    try {
      const res = await window.api.gstHSNSummary(fromDate, toDate);
      if (res.success) setData({ type: 'hsn', rows: res.data });
      else setError(res.error ?? 'Failed');
    } finally { setLoading(false); }
  };

  const downloadJSON = (payload: any, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = (rows: any[], filename: string) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r =>
      headers.map(h => JSON.stringify(r[h] ?? '')).join(',')
    )].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'summary', label: 'GST Summary',  icon: <Calculator size={16} /> },
    { id: 'gstr1',   label: 'GSTR-1',       icon: <FileText size={16} /> },
    { id: 'gstr3b',  label: 'GSTR-3B',      icon: <FileText size={16} /> },
    { id: 'hsn',     label: 'HSN Summary',   icon: <Table size={16} /> },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">GST Reports</h1>
        <p className="text-gray-500 text-sm mt-1">GSTR-1 • GSTR-3B • HSN Summary • Compliance exports</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setData(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border p-4 mb-6 flex flex-wrap items-end gap-4">
        {(tab === 'gstr1' || tab === 'gstr3b') ? (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tax Period (Month-Year)</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
            </div>
          </>
        )}

        <button
          onClick={tab === 'summary' ? loadSummary : tab === 'gstr1' ? loadGSTR1 : tab === 'gstr3b' ? loadGSTR3B : loadHSN}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Generate'}
        </button>

        {data && (
          <>
            {(tab === 'gstr1' || tab === 'gstr3b') && (
              <button
                onClick={() => downloadJSON(data, `${tab}-${period}.json`)}
                className="flex items-center gap-2 px-4 py-2 border border-green-500 text-green-700 rounded-lg text-sm hover:bg-green-50"
              >
                <Download size={14} /> Download JSON (GST Portal)
              </button>
            )}
            {tab === 'hsn' && data.rows && (
              <button
                onClick={() => downloadCSV(data.rows, `hsn-summary-${fromDate}-${toDate}.csv`)}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                <Download size={14} /> Download CSV
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 mb-4">{error}</div>}

      {/* GST Summary */}
      {tab === 'summary' && data?.totals && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Revenue',    value: `₹${Number(data.totals.total_revenue ?? 0).toFixed(2)}`,   color: 'blue'  },
              { label: 'Total Taxable',    value: `₹${Number(data.totals.total_taxable ?? 0).toFixed(2)}`,   color: 'green' },
              { label: 'Total GST',        value: `₹${Number(data.totals.total_gst ?? 0).toFixed(2)}`,       color: 'orange'},
              { label: 'Total Invoices',   value: data.totals.total_invoices ?? 0,                            color: 'purple'},
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border p-4">
                <div className="text-sm text-gray-500">{stat.label}</div>
                <div className="text-2xl font-bold mt-1">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">GST Rate-wise Breakup</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">GST Rate</th>
                  <th className="px-4 py-3 text-right">Taxable Amount</th>
                  <th className="px-4 py-3 text-right">CGST</th>
                  <th className="px-4 py-3 text-right">SGST</th>
                  <th className="px-4 py-3 text-right">IGST</th>
                  <th className="px-4 py-3 text-right">Total GST</th>
                </tr>
              </thead>
              <tbody>
                {(data.byRate ?? []).map((row: any) => (
                  <tr key={row.gst_rate} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{row.gst_rate}%</td>
                    <td className="px-4 py-3 text-right">₹{Number(row.taxable_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{Number(row.cgst_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{Number(row.sgst_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{Number(row.igst_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      ₹{(Number(row.cgst_amount) + Number(row.sgst_amount) + Number(row.igst_amount)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GSTR-1 */}
      {tab === 'gstr1' && data?.b2b !== undefined && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'B2B Invoices',    value: data.b2b?.length ?? 0 },
              { label: 'B2C Small',       value: data.b2cs?.length ?? 0 },
              { label: 'B2C Large',       value: data.b2cl?.length ?? 0 },
              { label: 'Credit Notes',    value: (data.cdnr?.length ?? 0) + (data.cdnur?.length ?? 0) },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border p-4">
                <div className="text-sm text-gray-500">{stat.label}</div>
                <div className="text-2xl font-bold mt-1">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* B2B table */}
          {data.b2b?.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">B2B — GST Registered Buyers</div>
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Customer GSTIN</th>
                    <th className="px-4 py-3 text-right">Invoices</th>
                    <th className="px-4 py-3 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.b2b.map((b: any) => (
                    <tr key={b.ctin} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{b.ctin}</td>
                      <td className="px-4 py-3 text-right">{b.inv?.length}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        ₹{b.inv?.reduce((s: number, i: any) => s + i.val, 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* HSN summary */}
          {data.hsn?.data?.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">HSN Summary</div>
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">HSN</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Taxable</th>
                    <th className="px-4 py-3 text-right">CGST</th>
                    <th className="px-4 py-3 text-right">SGST</th>
                    <th className="px-4 py-3 text-right">IGST</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hsn.data.map((h: any) => (
                    <tr key={h.hsn_sc} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{h.hsn_sc}</td>
                      <td className="px-4 py-3 text-right">{h.qty}</td>
                      <td className="px-4 py-3 text-right">₹{h.txval?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{h.camt?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{h.samt?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{h.iamt?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
            <strong>Portal Upload:</strong> Click "Download JSON (GST Portal)" above. Upload the JSON file at
            <span className="font-mono ml-1">gst.gov.in → Returns → GSTR-1 → Upload</span>
          </div>
        </div>
      )}

      {/* GSTR-3B */}
      {tab === 'gstr3b' && data?.sup_details && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">3.1 — Details of Outward Supplies</div>
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Section</th>
                  <th className="px-4 py-3 text-right">Taxable Value</th>
                  <th className="px-4 py-3 text-right">IGST</th>
                  <th className="px-4 py-3 text-right">CGST</th>
                  <th className="px-4 py-3 text-right">SGST</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '3.1a — Outward Taxable Supplies', ...data.sup_details.osup_det },
                  { label: '3.1b — Zero Rated',               ...data.sup_details.osup_zero },
                  { label: '3.1c — Nil / Exempt',             ...data.sup_details.osup_nil_exmp },
                  { label: '3.1d — Inward (Reverse Charge)',  ...data.sup_details.isup_rev },
                  { label: '3.1e — Non GST',                  ...data.sup_details.osup_nongst },
                ].map(row => (
                  <tr key={row.label} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3 text-right">₹{(row.txval ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{(row.iamt ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{(row.camt ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{(row.samt ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">4 — Eligible ITC</div>
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">IGST</th>
                  <th className="px-4 py-3 text-right">CGST</th>
                  <th className="px-4 py-3 text-right">SGST</th>
                </tr>
              </thead>
              <tbody>
                {(data.itc_elg?.itc_avl ?? []).map((row: any) => (
                  <tr key={row.ty} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">{row.ty}</td>
                    <td className="px-4 py-3 text-right">₹{(row.iamt ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{(row.camt ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">₹{(row.samt ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t font-bold bg-gray-50">
                  <td className="px-4 py-3">Net ITC</td>
                  <td className="px-4 py-3 text-right">₹{(data.itc_elg?.itc_net?.iamt ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{(data.itc_elg?.itc_net?.camt ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{(data.itc_elg?.itc_net?.samt ?? 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
            <strong>Portal Upload:</strong> Download the JSON and upload at
            <span className="font-mono ml-1">gst.gov.in → Returns → GSTR-3B → Proceed to File</span>
          </div>
        </div>
      )}

      {/* HSN Summary */}
      {tab === 'hsn' && data?.rows && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">HSN Code</th>
                <th className="px-4 py-3 text-left">Medicine</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">GST%</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">CGST</th>
                <th className="px-4 py-3 text-right">SGST</th>
                <th className="px-4 py-3 text-right">IGST</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No HSN data for selected period</td></tr>
              ) : data.rows.map((row: any, i: number) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{row.hsn_code || '—'}</td>
                  <td className="px-4 py-3">{row.medicine_name}</td>
                  <td className="px-4 py-3 text-gray-500">{row.unit}</td>
                  <td className="px-4 py-3 text-right">{row.total_qty}</td>
                  <td className="px-4 py-3 text-right">{row.gst_rate}%</td>
                  <td className="px-4 py-3 text-right">₹{Number(row.taxable_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{Number(row.cgst_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{Number(row.sgst_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{Number(row.igst_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium">₹{Number(row.total_amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
