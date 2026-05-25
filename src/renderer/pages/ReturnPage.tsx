import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, FileText, RotateCcw, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

type ReturnType = 'customer_return' | 'expired' | 'damaged' | 'other';

interface ReturnItem {
  medicine_id: number;
  medicine_name: string;
  batch_id: number;
  batch_number: string;
  expiry_date: string;
  available_qty: number;
  return_qty: number;
  unit_price: number;
  discount_pct: number;
  reason: string;
  invoice_item_id?: number;
}

export default function ReturnPage() {
  const { user } = useAuthStore();

  // List state
  const [returns, setReturns]     = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [fromDate, setFromDate]   = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate]       = useState(() => new Date().toISOString().split('T')[0]);
  const [showCreate, setShowCreate] = useState(false);
  const [viewReturn, setViewReturn] = useState<any | null>(null);

  // Create return state
  const [invoiceSearch, setInvoiceSearch]   = useState('');
  const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [returnType, setReturnType]         = useState<ReturnType>('customer_return');
  const [returnDate, setReturnDate]         = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes]                   = useState('');
  const [returnItems, setReturnItems]       = useState<ReturnItem[]>([]);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.api.returnList({ fromDate, toDate, limit: 100 });
      if (res.success) { setReturns(res.data.rows); setTotal(res.data.total); }
    } finally { setLoading(false); }
  }, [fromDate, toDate]);

  useEffect(() => { loadReturns(); }, [loadReturns]);

  // Search invoices for reference
  const searchInvoices = async (q: string) => {
    if (q.length < 2) { setInvoiceResults([]); return; }
    const res = await window.api.invoiceList({ status: 'paid', limit: 10 });
    if (res.success) {
      setInvoiceResults(res.data.rows.filter((i: any) =>
        i.invoice_number.toLowerCase().includes(q.toLowerCase()) ||
        i.customer_name.toLowerCase().includes(q.toLowerCase())
      ));
    }
  };

  const selectInvoice = async (inv: any) => {
    const res = await window.api.invoiceGet(inv.id);
    if (!res.success) return;
    const invFull = res.data;
    setSelectedInvoice(invFull);
    setInvoiceResults([]);
    setInvoiceSearch(invFull.invoice_number);

    // Pre-fill return items from invoice items
    const items: ReturnItem[] = invFull.items.map((it: any) => ({
      medicine_id:    it.medicine_id,
      medicine_name:  it.medicine_name,
      batch_id:       it.batch_id,
      batch_number:   it.batch_number,
      expiry_date:    it.expiry_date ?? '',
      available_qty:  it.quantity,
      return_qty:     0,
      unit_price:     it.unit_price,
      discount_pct:   it.discount_pct,
      reason:         '',
      invoice_item_id: it.id,
    }));
    setReturnItems(items);
  };

  const updateItem = (idx: number, field: keyof ReturnItem, value: any) => {
    setReturnItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (idx: number) => {
    setReturnItems(prev => prev.filter((_, i) => i !== idx));
  };

  const calcTotals = () => {
    let taxable = 0, total = 0;
    for (const item of returnItems) {
      if (item.return_qty <= 0) continue;
      const lineValue  = item.unit_price * item.return_qty;
      const discAmt    = (lineValue * item.discount_pct) / 100;
      const itemTaxable = lineValue - discAmt;
      taxable += itemTaxable;
      total   += itemTaxable * 1.12; // approximate for display
    }
    return { taxable: Math.round(taxable * 100) / 100, total: Math.round(total * 100) / 100 };
  };

  const submitReturn = async () => {
    const validItems = returnItems.filter(i => i.return_qty > 0);
    if (validItems.length === 0) { setError('Add at least one item with quantity > 0'); return; }

    setSaving(true);
    setError('');
    try {
      const input = {
        invoice_id:   selectedInvoice?.id,
        customer_id:  selectedInvoice?.customer_id,
        customer_name: selectedInvoice?.customer_name ?? 'Walk-in',
        return_type:  returnType,
        return_date:  returnDate,
        notes,
        created_by:   user?.id ?? 1,
        items: validItems.map(item => ({
          invoice_item_id: item.invoice_item_id,
          medicine_id:     item.medicine_id,
          batch_id:        item.batch_id,
          quantity:        item.return_qty,
          unit_price:      item.unit_price,
          discount_pct:    item.discount_pct,
          reason:          item.reason,
        })),
      };

      const res = await window.api.returnCreate(input);
      if (!res.success) { setError(res.error ?? 'Failed to create return'); return; }

      setShowCreate(false);
      resetForm();
      loadReturns();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedInvoice(null); setInvoiceSearch(''); setReturnType('customer_return');
    setReturnDate(new Date().toISOString().split('T')[0]);
    setNotes(''); setReturnItems([]); setError('');
  };

  const printCreditNote = async (returnId: number) => {
    const res = await window.api.printCreditNoteHTML(returnId);
    if (!res.success) return;
    const win = window.open('', '_blank')!;
    win.document.write(res.data);
    win.document.close();
    win.print();
  };

  const { taxable } = calcTotals();

  if (viewReturn) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setViewReturn(null)} className="text-blue-600 hover:underline">← Back</button>
          <h1 className="text-xl font-bold">Return #{viewReturn.return_number}</h1>
          <button
            onClick={() => printCreditNote(viewReturn.id)}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <FileText size={16} /> Print Credit Note
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border">
            <div className="text-sm text-gray-500">Customer</div>
            <div className="font-semibold">{viewReturn.customer_name}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="text-sm text-gray-500">Return Date</div>
            <div className="font-semibold">{viewReturn.return_date}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="text-sm text-gray-500">Type</div>
            <div className="font-semibold capitalize">{viewReturn.return_type?.replace('_', ' ')}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="text-sm text-gray-500">Against Invoice</div>
            <div className="font-semibold">{viewReturn.invoice_number ?? '—'}</div>
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Medicine</th>
                <th className="px-4 py-3 text-left">Batch</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {viewReturn.items?.map((item: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-3">{item.medicine_name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.batch_number}</td>
                  <td className="px-4 py-3 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">₹{item.unit_price?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium">₹{item.total_amount?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{item.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="bg-white rounded-lg border p-4 w-64 space-y-2 text-sm">
            <div className="flex justify-between"><span>Taxable</span><span>₹{viewReturn.taxable_amount?.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>CGST</span><span>₹{viewReturn.cgst_amount?.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>SGST</span><span>₹{viewReturn.sgst_amount?.toFixed(2)}</span></div>
            {viewReturn.igst_amount > 0 && <div className="flex justify-between"><span>IGST</span><span>₹{viewReturn.igst_amount?.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total Credit</span><span className="text-green-700">₹{viewReturn.total_amount?.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bill Returns</h1>
          <p className="text-gray-500 text-sm mt-1">Credit notes • Stock restoration • GST adjustment</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} /> New Return
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div>
          <label className="text-xs text-gray-500">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="block border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="block border rounded px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end">
          <span className="text-sm text-gray-500">{total} returns</span>
        </div>
      </div>

      {/* Returns table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Return #</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Invoice</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : returns.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No returns found</td></tr>
            ) : returns.map(ret => (
              <tr key={ret.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-700">{ret.return_number}</td>
                <td className="px-4 py-3">{ret.return_date}</td>
                <td className="px-4 py-3">{ret.customer_name}</td>
                <td className="px-4 py-3 text-gray-500">{ret.invoice_number ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 capitalize">
                    {ret.return_type?.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-green-700">
                  ₹{ret.total_amount?.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={async () => {
                    const res = await window.api.returnGet(ret.id);
                    if (res.success) setViewReturn(res.data);
                  }} className="text-blue-600 hover:underline text-xs mr-3">View</button>
                  <button onClick={() => printCreditNote(ret.id)}
                    className="text-gray-500 hover:text-gray-700 text-xs">Print</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Return Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <RotateCcw size={20} /> New Bill Return
              </h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <AlertTriangle size={16} /> {error}
                </div>
              )}

              {/* Invoice search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Invoice (optional)
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={invoiceSearch}
                    onChange={e => { setInvoiceSearch(e.target.value); searchInvoices(e.target.value); }}
                    placeholder="Invoice number or customer name..."
                    className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
                  />
                  {invoiceResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {invoiceResults.map(inv => (
                        <div key={inv.id} onClick={() => selectInvoice(inv)}
                          className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm border-b last:border-0">
                          <span className="font-mono font-medium">{inv.invoice_number}</span>
                          <span className="text-gray-500 ml-2">{inv.customer_name}</span>
                          <span className="text-gray-400 ml-2">{inv.invoice_date}</span>
                          <span className="float-right font-medium">₹{inv.total_amount?.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Type</label>
                  <select value={returnType} onChange={e => setReturnType(e.target.value as ReturnType)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="customer_return">Customer Return</option>
                    <option value="expired">Expired Medicines</option>
                    <option value="damaged">Damaged Items</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Date</label>
                  <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <input value={selectedInvoice?.customer_name ?? 'Walk-in'} readOnly
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                </div>
              </div>

              {/* Items table */}
              {returnItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Return Items</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Medicine</th>
                          <th className="px-3 py-2 text-left">Batch</th>
                          <th className="px-3 py-2 text-right">Avail</th>
                          <th className="px-3 py-2 text-right">Return Qty</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-left">Reason</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnItems.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{item.medicine_name}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono">{item.batch_number}</td>
                            <td className="px-3 py-2 text-right">{item.available_qty}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number" min={0} max={item.available_qty}
                                value={item.return_qty}
                                onChange={e => updateItem(idx, 'return_qty', Math.min(Number(e.target.value), item.available_qty))}
                                className="w-16 border rounded px-2 py-1 text-right text-xs"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">₹{item.unit_price?.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <input
                                value={item.reason}
                                onChange={e => updateItem(idx, 'reason', e.target.value)}
                                placeholder="Reason..."
                                className="w-32 border rounded px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>

              {/* Total preview */}
              {taxable > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                  <span className="text-green-700 font-medium">
                    Estimated credit: ~₹{(taxable * 1.12).toFixed(2)} (incl. GST)
                  </span>
                  <span className="text-green-600 text-xs ml-2">• Stock will be restored to batch</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={submitReturn} disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Processing...' : 'Create Return & Credit Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
