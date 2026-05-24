import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, ChevronDown, ChevronRight, CheckCircle, Send, Eye } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { dbRun, dbSelect } from '../hooks/useDatabase';
import { formatCurrency } from '../utils/gstCalculator';

interface PO {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  date: string;
  expected_delivery: string;
  total_amount: number;
  status: 'draft' | 'sent' | 'received';
}

interface POItem {
  id: number;
  medicine_id: number;
  medicine_name: string;
  quantity: number;
  unit_price: number;
  received_quantity: number;
  batch_number: string;
  expiry_date: string;
  amount: number;
}

interface Supplier { id: number; name: string; }
interface Medicine { id: number; name: string; price: number; cost: number; }

export default function PurchaseOrderPage() {
  const [pos, setPOs] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [viewingPO, setViewingPO] = useState<PO | null>(null);
  const [poItems, setPOItems] = useState<POItem[]>([]);
  const [receiveItems, setReceiveItems] = useState<Array<POItem & { batch_number_input: string; expiry_date_input: string; received_qty_input: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [poForm, setPOForm] = useState({ supplier_id: '', date: new Date().toISOString().split('T')[0], expected_delivery: '', notes: '' });
  const [lineItems, setLineItems] = useState<Array<{ medicine_id: string; medicine_name: string; quantity: string; unit_price: string }>>([
    { medicine_id: '', medicine_name: '', quantity: '', unit_price: '' }
  ]);

  const loadPOs = useCallback(async () => {
    setLoading(true);
    try {
      const sql = search
        ? `SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id WHERE po.po_number LIKE ? OR s.name LIKE ? ORDER BY po.id DESC`
        : `SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id ORDER BY po.id DESC`;
      const params = search ? [`%${search}%`, `%${search}%`] : [];
      setPOs(await window.api.dbSelect(sql, params) as PO[]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { const t = setTimeout(loadPOs, 300); return () => clearTimeout(t); }, [loadPOs]);

  useEffect(() => {
    window.api.dbSelect('SELECT id, name FROM suppliers ORDER BY name ASC', []).then(r => setSuppliers(r as Supplier[]));
    window.api.dbSelect('SELECT id, name, price, cost FROM medicines ORDER BY name ASC', []).then(r => setMedicines(r as Medicine[]));
  }, []);

  function addLine() {
    setLineItems(prev => [...prev, { medicine_id: '', medicine_name: '', quantity: '', unit_price: '' }]);
  }

  function updateLine(idx: number, field: string, value: string) {
    setLineItems(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'medicine_id') {
        const med = medicines.find(m => m.id === Number(value));
        return { ...l, medicine_id: value, medicine_name: med?.name || '', unit_price: med ? String(med.cost) : l.unit_price };
      }
      return { ...l, [field]: value };
    }));
  }

  function removeLine(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleCreatePO(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const validItems = lineItems.filter(l => l.medicine_id && Number(l.quantity) > 0 && Number(l.unit_price) > 0);
    if (validItems.length === 0) { setError('Add at least one valid item'); return; }
    setSaving(true);
    try {
      const poNumber = await window.api.generatePONumber();
      const supplier = suppliers.find(s => s.id === Number(poForm.supplier_id));
      const totalAmount = validItems.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0);
      const poResult = await dbRun(
        `INSERT INTO purchase_orders (po_number, supplier_id, supplier_name, date, expected_delivery, total_amount, notes) VALUES (?,?,?,?,?,?,?)`,
        [poNumber, Number(poForm.supplier_id), supplier?.name || '', poForm.date, poForm.expected_delivery || null, totalAmount, poForm.notes || null]
      );
      const poId = poResult.lastID;
      const ops = validItems.map(l => ({
        sql: `INSERT INTO po_items (po_id, medicine_id, medicine_name, quantity, unit_price, amount) VALUES (?,?,?,?,?,?)`,
        params: [poId, Number(l.medicine_id), l.medicine_name, Number(l.quantity), Number(l.unit_price), Number(l.quantity) * Number(l.unit_price)],
      }));
      await window.api.dbTransaction(ops);
      setShowCreateModal(false);
      setLineItems([{ medicine_id: '', medicine_name: '', quantity: '', unit_price: '' }]);
      setPOForm({ supplier_id: '', date: new Date().toISOString().split('T')[0], expected_delivery: '', notes: '' });
      loadPOs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openView(po: PO) {
    setViewingPO(po);
    const items = await dbSelect<POItem>(`SELECT * FROM po_items WHERE po_id = ?`, [po.id]);
    setPOItems(items);
    setShowViewModal(true);
  }

  async function updateStatus(po: PO, status: 'sent' | 'received') {
    if (status === 'received') {
      const items = await dbSelect<POItem>(`SELECT * FROM po_items WHERE po_id = ?`, [po.id]);
      setReceiveItems(items.map(i => ({ ...i, batch_number_input: i.batch_number || '', expiry_date_input: i.expiry_date || '', received_qty_input: String(i.quantity) })));
      setViewingPO(po);
      setShowReceiveModal(true);
    } else {
      await dbRun(`UPDATE purchase_orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [status, po.id]);
      loadPOs();
    }
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!viewingPO) return;
    setSaving(true);
    try {
      const ops: Array<{sql: string; params: any[]}> = [];
      for (const item of receiveItems) {
        const qty = parseInt(item.received_qty_input);
        if (qty > 0 && item.batch_number_input && item.expiry_date_input) {
          ops.push({
            sql: `INSERT INTO stock (medicine_id, batch_number, expiry_date, quantity, reorder_level)
                  VALUES (?,?,?,?,10)
                  ON CONFLICT(medicine_id, batch_number) DO UPDATE SET quantity = quantity + excluded.quantity`,
            params: [item.medicine_id, item.batch_number_input, item.expiry_date_input, qty],
          });
          ops.push({
            sql: `UPDATE po_items SET received_quantity=?, batch_number=?, expiry_date=? WHERE id=?`,
            params: [qty, item.batch_number_input, item.expiry_date_input, item.id],
          });
        }
      }
      ops.push({ sql: `UPDATE purchase_orders SET status='received', updated_at=CURRENT_TIMESTAMP WHERE id=?`, params: [viewingPO.id] });
      await window.api.dbTransaction(ops);
      setShowReceiveModal(false);
      loadPOs();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const statusBadge = (status: string) => ({
    draft: 'badge-gray', sent: 'badge-yellow', received: 'badge-green'
  }[status] || 'badge-gray');

  const columns: Column<PO>[] = [
    { key: 'po_number', header: 'PO Number', render: r => <span className="font-medium text-blue-600">{r.po_number}</span> },
    { key: 'supplier_name', header: 'Supplier' },
    { key: 'date', header: 'Date' },
    { key: 'expected_delivery', header: 'Expected Delivery', render: r => r.expected_delivery || '-' },
    { key: 'total_amount', header: 'Total', render: r => formatCurrency(r.total_amount) },
    { key: 'status', header: 'Status', render: r => <span className={statusBadge(r.status)}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span> },
    { key: 'actions', header: 'Actions', render: r => (
      <div className="flex gap-2">
        <button onClick={() => openView(r)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"><Eye size={14} /></button>
        {r.status === 'draft' && (
          <button onClick={() => updateStatus(r, 'sent')} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors" title="Mark as Sent"><Send size={14} /></button>
        )}
        {r.status === 'sent' && (
          <button onClick={() => updateStatus(r, 'received')} className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors" title="Mark as Received"><CheckCircle size={14} /></button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search POs..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => { setError(''); setShowCreateModal(true); }} className="btn-primary"><Plus size={16} /> Create PO</button>
      </div>

      <div className="card p-0">
        <DataTable columns={columns} data={pos} loading={loading} emptyMessage="No purchase orders found." />
      </div>

      {/* Create PO Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Purchase Order" size="xl">
        <form onSubmit={handleCreatePO} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
              <select className="select" value={poForm.supplier_id} onChange={e => setPOForm(f => ({...f, supplier_id: e.target.value}))} required>
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Order Date</label>
              <input type="date" className="input" value={poForm.date} onChange={e => setPOForm(f => ({...f, date: e.target.value}))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expected Delivery</label>
              <input type="date" className="input" value={poForm.expected_delivery} onChange={e => setPOForm(f => ({...f, expected_delivery: e.target.value}))} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm text-slate-700">Order Items</div>
              <button type="button" onClick={addLine} className="btn-secondary text-xs py-1 px-2"><Plus size={12} /> Add Item</button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Medicine</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 w-24">Qty</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 w-28">Unit Price</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 w-24">Amount</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <select className="select text-xs" value={line.medicine_id} onChange={e => updateLine(idx, 'medicine_id', e.target.value)}>
                          <option value="">Select...</option>
                          {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" className="input text-xs" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} placeholder="0" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0.01" step="0.01" className="input text-xs" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} placeholder="0.00" />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {line.quantity && line.unit_price ? formatCurrency(Number(line.quantity) * Number(line.unit_price)) : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-600">Total:</td>
                    <td className="px-3 py-2 font-bold text-slate-800">
                      {formatCurrency(lineItems.reduce((s, l) => s + (Number(l.quantity) * Number(l.unit_price) || 0), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea className="input resize-none" rows={2} value={poForm.notes} onChange={e => setPOForm(f => ({...f, notes: e.target.value}))} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Creating...' : 'Create Purchase Order'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* View PO Modal */}
      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title={`PO: ${viewingPO?.po_number}`} size="xl">
        {viewingPO && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-slate-500">Supplier:</span> <span className="font-medium">{viewingPO.supplier_name}</span></div>
              <div><span className="text-slate-500">Date:</span> <span className="font-medium">{viewingPO.date}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className={statusBadge(viewingPO.status)}>{viewingPO.status}</span></div>
              <div><span className="text-slate-500">Expected:</span> <span className="font-medium">{viewingPO.expected_delivery || 'N/A'}</span></div>
              <div><span className="text-slate-500">Total:</span> <span className="font-bold">{formatCurrency(viewingPO.total_amount)}</span></div>
            </div>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Medicine</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Qty</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Unit Price</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Amount</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-500">Received</th>
                </tr>
              </thead>
              <tbody>
                {poItems.map(item => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{item.medicine_name}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(item.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                    <td className="px-3 py-2 text-center">{item.received_quantity || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Receive PO Modal */}
      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title="Receive Items" size="xl">
        <form onSubmit={handleReceive} className="space-y-4">
          <div className="text-sm text-slate-600 mb-2">Enter batch numbers and expiry dates for received items:</div>
          <div className="space-y-3">
            {receiveItems.map((item, idx) => (
              <div key={item.id} className="p-3 border border-slate-200 rounded-lg">
                <div className="font-medium text-slate-800 mb-2">{item.medicine_name} (Ordered: {item.quantity})</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Batch Number</label>
                    <input className="input text-sm" value={item.batch_number_input} onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, batch_number_input: e.target.value} : r))} required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Expiry Date</label>
                    <input type="date" className="input text-sm" value={item.expiry_date_input} onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, expiry_date_input: e.target.value} : r))} required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Received Qty</label>
                    <input type="number" min="0" className="input text-sm" value={item.received_qty_input} onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, received_qty_input: e.target.value} : r))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-success flex-1" disabled={saving}>{saving ? 'Processing...' : 'Receive & Update Stock'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowReceiveModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
