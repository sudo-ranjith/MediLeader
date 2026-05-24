import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Minus, Trash2, Printer, ShoppingCart } from 'lucide-react';
import { calculateGST, formatCurrency, CartItem } from '../utils/gstCalculator';
import { generateInvoicePDF } from '../utils/invoicePrint';
import { dbRun, dbSelect, dbGet } from '../hooks/useDatabase';

interface MedicineStock {
  stock_id: number;
  medicine_id: number;
  name: string;
  batch_number: string;
  expiry_date: string;
  available_qty: number;
  price: number;
  gst_rate: number;
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  credit_limit: number;
  credit_used: number;
}

export default function POSPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [medicines, setMedicines] = useState<MedicineStock[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'credit'>('cash');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    loadMedicines();
  }, [debouncedSearch]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadMedicines = useCallback(async () => {
    const sql = debouncedSearch
      ? `SELECT s.id as stock_id, s.medicine_id, m.name, s.batch_number, s.expiry_date, s.quantity as available_qty, m.price, m.gst_rate
         FROM stock s JOIN medicines m ON s.medicine_id = m.id
         WHERE m.name LIKE ? AND s.quantity > 0 AND s.expiry_date >= date('now')
         ORDER BY m.name ASC`
      : `SELECT s.id as stock_id, s.medicine_id, m.name, s.batch_number, s.expiry_date, s.quantity as available_qty, m.price, m.gst_rate
         FROM stock s JOIN medicines m ON s.medicine_id = m.id
         WHERE s.quantity > 0 AND s.expiry_date >= date('now')
         ORDER BY m.name ASC`;
    const params = debouncedSearch ? [`%${debouncedSearch}%`] : [];
    const result = await window.api.dbSelect(sql, params);
    setMedicines(result as MedicineStock[]);
  }, [debouncedSearch]);

  async function loadCustomers() {
    const result = await window.api.dbSelect('SELECT id, name, phone, credit_limit, credit_used FROM customers ORDER BY name ASC', []);
    setCustomers(result as Customer[]);
  }

  function addToCart(med: MedicineStock) {
    setCart(prev => {
      const existing = prev.find(c => c.stock_id === med.stock_id);
      if (existing) {
        if (existing.quantity >= med.available_qty) return prev;
        return prev.map(c => c.stock_id === med.stock_id ? {...c, quantity: c.quantity + 1} : c);
      }
      return [...prev, {
        medicine_id: med.medicine_id,
        medicine_name: med.name,
        unit_price: med.price,
        quantity: 1,
        gst_rate: med.gst_rate || 0,
        stock_id: med.stock_id,
        batch_number: med.batch_number,
      }];
    });
  }

  function updateQty(stockId: number, qty: number) {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.stock_id !== stockId));
    } else {
      const med = medicines.find(m => m.stock_id === stockId);
      const maxQty = med?.available_qty || 999;
      setCart(prev => prev.map(c => c.stock_id === stockId ? {...c, quantity: Math.min(qty, maxQty)} : c));
    }
  }

  function removeFromCart(stockId: number) {
    setCart(prev => prev.filter(c => c.stock_id !== stockId));
  }

  const gstResult = calculateGST(cart);
  const discountAmount = parseFloat(discount) || 0;
  const finalTotal = Math.max(0, gstResult.total - discountAmount);

  async function handleFinalize(status: 'draft' | 'paid') {
    if (cart.length === 0) return;
    setSaving(true);
    setSuccess('');
    try {
      const invoiceNumber = await window.api.generateInvoiceNumber();
      const today = new Date().toISOString().split('T')[0];
      const customer = selectedCustomer ? customers.find(c => c.id === selectedCustomer) : null;

      // Create invoice
      const invResult = await dbRun(
        `INSERT INTO invoices (invoice_number, customer_id, customer_name, date, subtotal, gst_amount, discount, total, payment_method, status, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [invoiceNumber, selectedCustomer || null, customer?.name || null, today,
         gstResult.subtotal, gstResult.totalGST, discountAmount, finalTotal, paymentMethod, status, notes || null]
      );
      const invoiceId = invResult.lastID;

      // Create invoice items + deduct stock
      const ops = [];
      for (const item of cart) {
        ops.push({
          sql: `INSERT INTO invoice_items (invoice_id, medicine_id, medicine_name, stock_id, batch_number, quantity, unit_price, gst_rate, gst_amount, item_total) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          params: [invoiceId, item.medicine_id, item.medicine_name, item.stock_id || null, item.batch_number || null,
                   item.quantity, item.unit_price, item.gst_rate, (item.unit_price * item.quantity * item.gst_rate / 100), item.unit_price * item.quantity],
        });
        if (item.stock_id) {
          ops.push({
            sql: `UPDATE stock SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            params: [item.quantity, item.stock_id],
          });
        }
      }
      await window.api.dbTransaction(ops);

      // Update customer credit if credit payment
      if (paymentMethod === 'credit' && selectedCustomer) {
        await dbRun(`UPDATE customers SET credit_used = credit_used + ? WHERE id = ?`, [finalTotal, selectedCustomer]);
      }

      if (status === 'paid') {
        // Get pharmacy info for printing
        const settings = await dbSelect<{key: string, value: string}>('SELECT key, value FROM settings', []);
        const pharmacyInfo: Record<string, string> = {};
        settings.forEach(s => { pharmacyInfo[s.key] = s.value; });
        const items = await dbSelect(`SELECT * FROM invoice_items WHERE invoice_id = ?`, [invoiceId]);
        generateInvoicePDF({ invoice_number: invoiceNumber, date: today, subtotal: gstResult.subtotal, gst_amount: gstResult.totalGST, discount: discountAmount, total: finalTotal, payment_method: paymentMethod, customer_name: customer?.name }, items, pharmacyInfo);
      }

      setSuccess(status === 'paid' ? `Invoice ${invoiceNumber} finalized!` : `Draft saved as ${invoiceNumber}`);
      setCart([]);
      setSelectedCustomer(null);
      setPaymentMethod('cash');
      setDiscount('0');
      setNotes('');
      loadMedicines();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-4 h-full -m-6 p-6">
      {/* Left: Medicine Search */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search medicines..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {medicines.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">No medicines found in stock</div>
          ) : medicines.map(med => (
            <button
              key={med.stock_id}
              onClick={() => addToCart(med)}
              className="w-full text-left p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
            >
              <div className="font-medium text-slate-800 text-sm group-hover:text-blue-700">{med.name}</div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-slate-500">Batch: {med.batch_number} | Qty: {med.available_qty}</span>
                <span className="text-xs font-semibold text-slate-700">₹{med.price.toFixed(2)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Center: Cart */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="card p-0 flex-1 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <ShoppingCart size={18} className="text-blue-500" />
            <span className="font-semibold text-slate-700">Cart ({cart.length} items)</span>
          </div>
          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <ShoppingCart size={40} className="mx-auto mb-2 opacity-30" />
                <div className="text-sm">Click on medicines to add to cart</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-500">Medicine</th>
                    <th className="text-center px-4 py-2 font-semibold text-slate-500">Qty</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-500">Unit Price</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-500">Total</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.stock_id} className="border-b border-slate-100">
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-800">{item.medicine_name}</div>
                        <div className="text-xs text-slate-400">Batch: {item.batch_number} | GST: {item.gst_rate}%</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => updateQty(item.stock_id!, item.quantity - 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                            <Minus size={12} />
                          </button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <button onClick={() => updateQty(item.stock_id!, item.quantity + 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">₹{item.unit_price.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">₹{(item.unit_price * item.quantity).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => removeFromCart(item.stock_id!)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right: Invoice Summary */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">{success}</div>
        )}

        {/* Customer */}
        <div className="card">
          <label className="block text-sm font-medium text-slate-700 mb-2">Customer</label>
          <select className="select text-sm" value={selectedCustomer || ''} onChange={e => setSelectedCustomer(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Walk-in Customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
          </select>
        </div>

        {/* Payment Method */}
        <div className="card">
          <label className="block text-sm font-medium text-slate-700 mb-2">Payment Method</label>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'card', 'upi', 'credit'] as const).map(method => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors capitalize ${
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

        {/* GST Breakdown */}
        <div className="card flex-1">
          <div className="text-sm font-medium text-slate-700 mb-3">Invoice Summary</div>
          
          {/* GST Breakdown */}
          {Object.entries(gstResult.breakdown).length > 0 && (
            <div className="mb-3 p-2 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="font-medium text-slate-600 mb-1">GST Breakdown</div>
              {Object.entries(gstResult.breakdown).map(([rate, data]) => (
                <div key={rate} className="flex justify-between text-slate-500">
                  <span>GST @{rate}%</span>
                  <span>₹{data.gst.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span><span>{formatCurrency(gstResult.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST</span><span>{formatCurrency(gstResult.totalGST)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Discount</span>
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
              <span>Total</span><span>{formatCurrency(finalTotal)}</span>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea className="input text-xs resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={() => handleFinalize('paid')}
            disabled={cart.length === 0 || saving}
            className="btn-success w-full"
          >
            <Printer size={16} /> Finalize & Print
          </button>
          <button
            onClick={() => handleFinalize('draft')}
            disabled={cart.length === 0 || saving}
            className="btn-secondary w-full"
          >
            Save Draft
          </button>
          <button
            onClick={() => { setCart([]); setDiscount('0'); setNotes(''); setSelectedCustomer(null); }}
            disabled={cart.length === 0}
            className="btn-danger w-full"
          >
            Clear Cart
          </button>
        </div>
      </div>
    </div>
  );
}
