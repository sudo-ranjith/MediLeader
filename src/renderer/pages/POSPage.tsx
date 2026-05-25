import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Minus, Trash2, Printer, ShoppingCart, Receipt, Scan, Globe, MapPin } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface MedicineResult {
  id: number;
  name: string;
  generic_name: string;
  hsn_code: string;
  gst_rate: number;
  unit: string;
  mrp: number;
  barcode: string;
  schedule: string;
  total_qty: number;
}

interface CartItem {
  medicine_id: number;
  medicine_name: string;
  unit_price: number;
  quantity: number;
  gst_rate: number;
  available_qty: number;
  discount_pct: number;
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  credit_limit: number;
  credit_used: number;
}

function computeGST(item: CartItem, interstate: boolean): { taxable: number; cgst: number; sgst: number; igst: number; total: number } {
  const taxable = item.unit_price * item.quantity * (1 - item.discount_pct / 100);
  if (interstate) {
    const igst = taxable * item.gst_rate / 100;
    return { taxable, cgst: 0, sgst: 0, igst, total: taxable + igst };
  }
  const halfRate = item.gst_rate / 2;
  const cgst = taxable * halfRate / 100;
  const sgst = taxable * halfRate / 100;
  return { taxable, cgst, sgst, igst: 0, total: taxable + cgst + sgst };
}

export default function POSPage() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm]           = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [medicines, setMedicines]             = useState<MedicineResult[]>([]);
  const [cart, setCart]                       = useState<CartItem[]>([]);
  const [customers, setCustomers]             = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod]     = useState<'cash' | 'card' | 'upi' | 'credit'>('cash');
  const [discount, setDiscount]               = useState('0');
  const [notes, setNotes]                     = useState('');
  const [saving, setSaving]                   = useState(false);
  const [success, setSuccess]                 = useState('');
  const [error, setError]                     = useState('');
  const [interstate, setInterstate]           = useState(false);
  const [barcodeInput, setBarcodeInput]       = useState('');
  const [barcodeError, setBarcodeError]       = useState('');
  const barcodeRef                            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => { loadMedicines(); }, [debouncedSearch]);

  useEffect(() => {
    window.api.customerList().then(res => {
      if (res.success) setCustomers(res.data);
    });
  }, []);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const loadMedicines = useCallback(async () => {
    const res = await window.api.medicineSearchWithStock(debouncedSearch);
    if (res.success) setMedicines(res.data);
  }, [debouncedSearch]);

  function addToCart(med: MedicineResult) {
    setCart(prev => {
      const existing = prev.find(c => c.medicine_id === med.id);
      if (existing) {
        if (existing.quantity >= med.total_qty) return prev;
        return prev.map(c => c.medicine_id === med.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        medicine_id:   med.id,
        medicine_name: med.name,
        unit_price:    med.mrp,
        quantity:      1,
        gst_rate:      med.gst_rate,
        available_qty: med.total_qty,
        discount_pct:  0,
      }];
    });
  }

  function updateQty(medicineId: number, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.medicine_id !== medicineId));
    } else {
      setCart(prev => prev.map(c =>
        c.medicine_id === medicineId
          ? { ...c, quantity: Math.min(qty, c.available_qty) }
          : c
      ));
    }
  }

  function updateDiscount(medicineId: number, pct: number) {
    setCart(prev => prev.map(c =>
      c.medicine_id === medicineId ? { ...c, discount_pct: Math.max(0, Math.min(100, pct)) } : c
    ));
  }

  function removeFromCart(medicineId: number) {
    setCart(prev => prev.filter(c => c.medicine_id !== medicineId));
  }

  // ── Invoice totals ─────────────────────────────────────────────────────────
  const itemTotals     = cart.map(item => computeGST(item, interstate));
  const subtotal       = itemTotals.reduce((s, t) => s + t.taxable, 0);
  const totalCGST      = itemTotals.reduce((s, t) => s + t.cgst, 0);
  const totalSGST      = itemTotals.reduce((s, t) => s + t.sgst, 0);
  const totalIGST      = itemTotals.reduce((s, t) => s + t.igst, 0);
  const totalTax       = totalCGST + totalSGST + totalIGST;
  const globalDiscount = parseFloat(discount) || 0;
  const grandTotal     = Math.max(0, subtotal + totalTax - globalDiscount);

  // GST rate groups for breakdown display
  const gstBreakdown: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
  cart.forEach((item, i) => {
    const t = itemTotals[i];
    if (!gstBreakdown[item.gst_rate]) gstBreakdown[item.gst_rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    gstBreakdown[item.gst_rate].taxable += t.taxable;
    gstBreakdown[item.gst_rate].cgst    += t.cgst;
    gstBreakdown[item.gst_rate].sgst    += t.sgst;
    gstBreakdown[item.gst_rate].igst    += t.igst;
  });

  // ── Barcode scanner ────────────────────────────────────────────────────────
  async function handleBarcodeSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeError('');
    const res = await window.api.medicineSearchWithStock(code);
    if (!res.success || res.data.length === 0) {
      setBarcodeError(`Barcode "${code}" not found`);
      setBarcodeInput('');
      return;
    }
    const exact = res.data.find((m: MedicineResult) => m.barcode === code) ?? res.data[0];
    if (exact.total_qty <= 0) {
      setBarcodeError(`${exact.name} is out of stock`);
    } else {
      addToCart(exact);
    }
    setBarcodeInput('');
    barcodeRef.current?.focus();
  }

  async function handleFinalize(printAfter: boolean) {
    if (cart.length === 0) return;
    setError('');
    setSaving(true);
    try {
      const customer = selectedCustomer ? customers.find(c => c.id === selectedCustomer) : null;
      const input = {
        customer_id:    selectedCustomer ?? undefined,
        customer_name:  customer?.name ?? 'Walk-in Customer',
        supply_type:    interstate ? 'interstate' : 'intrastate',
        invoice_date:   new Date().toISOString().split('T')[0],
        payment_method: paymentMethod,
        notes:          notes || undefined,
        discount_amount: globalDiscount || 0,
        paid_amount:    paymentMethod === 'credit' ? 0 : grandTotal,
        created_by:     user?.id ?? 1,
        items: cart.map(c => ({
          medicine_id:  c.medicine_id,
          quantity:     c.quantity,
          unit_price:   c.unit_price,
          gst_rate:     c.gst_rate,
          discount_pct: c.discount_pct || 0,
        })),
      };

      const res = await window.api.invoiceCreate(input);
      if (!res.success) {
        setError(res.error ?? 'Failed to create invoice');
        return;
      }

      const invoice = res.data;
      setSuccess(`Invoice ${invoice.invoice_number} created`);

      if (printAfter) {
        await window.api.printInvoiceHTML(invoice.id, 'thermal');
      }

      setCart([]);
      setSelectedCustomer(null);
      setPaymentMethod('cash');
      setDiscount('0');
      setNotes('');
      await loadMedicines();
    } catch (e: any) {
      setError(e.message ?? 'Unexpected error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-4 h-full -m-6 p-6">
      {/* Left: Medicine Search */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        {/* Barcode scanner input */}
        <div>
          <div className="relative">
            <Scan size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
            <input
              ref={barcodeRef}
              className="w-full border border-purple-200 bg-purple-50 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-purple-300"
              placeholder="Scan barcode (press Enter)…"
              value={barcodeInput}
              onChange={e => { setBarcodeInput(e.target.value); setBarcodeError(''); }}
              onKeyDown={handleBarcodeSubmit}
            />
          </div>
          {barcodeError && <div className="text-xs text-red-500 mt-1 px-1">{barcodeError}</div>}
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search medicine / barcode..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {medicines.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">No medicines in stock</div>
          ) : medicines.map(med => (
            <button
              key={med.id}
              onClick={() => addToCart(med)}
              className="w-full text-left p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
            >
              <div className="font-medium text-slate-800 text-sm group-hover:text-blue-700">{med.name}</div>
              {med.generic_name && (
                <div className="text-xs text-slate-400">{med.generic_name}</div>
              )}
              <div className="flex justify-between mt-1">
                <span className="text-xs text-slate-500">Qty: {med.total_qty} {med.unit} | GST: {med.gst_rate}%</span>
                <span className="text-xs font-semibold text-slate-700">₹{med.mrp.toFixed(2)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Center: Cart */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="bg-white rounded-xl border flex-1 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ShoppingCart size={18} className="text-blue-500" />
            <span className="font-semibold text-slate-700">Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})</span>
          </div>
          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <ShoppingCart size={40} className="mx-auto mb-2 opacity-30" />
                <div className="text-sm">Click on medicines to add</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-500">Medicine</th>
                    <th className="text-center px-3 py-2 font-semibold text-slate-500 w-28">Qty</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500 w-20">MRP</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500 w-20">Disc%</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500 w-24">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, i) => {
                    const t = itemTotals[i];
                    return (
                      <tr key={item.medicine_id} className="border-t border-slate-100">
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-800">{item.medicine_name}</div>
                          <div className="text-xs text-slate-400">
                            GST: {item.gst_rate}%
                            {interstate
                              ? ` | IGST ${item.gst_rate}%`
                              : ` | CGST ${item.gst_rate/2}% + SGST ${item.gst_rate/2}%`
                            }
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateQty(item.medicine_id, item.quantity - 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                            >
                              <Minus size={11} />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={item.available_qty}
                              value={item.quantity}
                              onChange={e => updateQty(item.medicine_id, parseInt(e.target.value) || 1)}
                              className="w-10 text-center border border-slate-200 rounded text-sm py-0.5"
                            />
                            <button
                              onClick={() => updateQty(item.medicine_id, item.quantity + 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">₹{item.unit_price.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={item.discount_pct}
                            onChange={e => updateDiscount(item.medicine_id, parseFloat(e.target.value) || 0)}
                            className="w-16 text-right border border-slate-200 rounded text-sm py-0.5 px-1"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">₹{t.total.toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => removeFromCart(item.medicine_id)}
                            className="p-1 text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right: Invoice Summary & Actions */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
            {success}
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Customer */}
        <div className="bg-white rounded-xl border p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Customer</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedCustomer || ''}
            onChange={e => setSelectedCustomer(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Walk-in Customer</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
            ))}
          </select>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-xl border p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'card', 'upi', 'credit'] as const).map(method => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  paymentMethod === method
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300'
                }`}
              >
                {method.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl border p-4 flex-1 flex flex-col">
          <div className="text-sm font-medium text-slate-700 mb-3">Invoice Summary</div>

          {/* Interstate toggle */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              {interstate ? <Globe size={12} className="text-orange-500" /> : <MapPin size={12} className="text-blue-500" />}
              <span className={interstate ? 'text-orange-600 font-medium' : 'text-blue-600 font-medium'}>
                {interstate ? 'Interstate (IGST)' : 'Intrastate (CGST+SGST)'}
              </span>
            </div>
            <button
              onClick={() => setInterstate(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${interstate ? 'bg-orange-500' : 'bg-blue-500'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${interstate ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* GST breakdown by rate */}
          {Object.entries(gstBreakdown).length > 0 && (
            <div className="mb-3 p-2 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="font-medium text-slate-600 mb-1">
                GST Breakdown ({interstate ? 'Interstate' : 'Intrastate'})
              </div>
              {Object.entries(gstBreakdown).map(([rate, g]) => (
                interstate ? (
                  <div key={rate} className="flex justify-between text-slate-500">
                    <span>@{rate}% IGST</span>
                    <span>₹{g.igst.toFixed(2)}</span>
                  </div>
                ) : (
                  <div key={rate} className="grid grid-cols-3 text-slate-500 gap-1">
                    <span>@{rate}%</span>
                    <span className="text-right">C: ₹{g.cgst.toFixed(2)}</span>
                    <span className="text-right">S: ₹{g.sgst.toFixed(2)}</span>
                  </div>
                )
              ))}
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Taxable</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {interstate ? (
              <div className="flex justify-between text-slate-600">
                <span>IGST</span>
                <span>₹{totalIGST.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST</span>
                  <span>₹{totalCGST.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST</span>
                  <span>₹{totalSGST.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-slate-600">
              <span>Discount (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-24 px-2 py-1 border border-slate-300 rounded text-right text-sm"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
              />
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-lg text-slate-800">
              <span>Grand Total</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <button
            onClick={() => handleFinalize(true)}
            disabled={cart.length === 0 || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Printer size={16} /> {saving ? 'Processing…' : 'Finalize & Print'}
          </button>
          <button
            onClick={() => handleFinalize(false)}
            disabled={cart.length === 0 || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Receipt size={16} /> Save Invoice
          </button>
          <button
            onClick={() => { setCart([]); setDiscount('0'); setNotes(''); setSelectedCustomer(null); setError(''); setSuccess(''); }}
            disabled={cart.length === 0}
            className="w-full py-2.5 bg-white hover:bg-red-50 border border-red-200 text-red-600 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
          >
            Clear Cart
          </button>
        </div>
      </div>
    </div>
  );
}
