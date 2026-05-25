import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, CheckCircle, Send, Eye } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuthStore } from '../stores/authStore';

interface PO {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  order_date: string;
  expected_delivery: string;
  total_amount: number;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
}

interface POItem {
  id: number;
  medicine_id: number;
  medicine_name: string;
  ordered_qty: number;
  received_qty: number;
  free_qty: number;
  unit_price: number;
  total_amount: number;
}

interface Supplier { id: number; name: string; }
interface Medicine { id: number; name: string; mrp: number; }

const fmt = (n: number) => `₹${(n ?? 0).toFixed(2)}`;

export default function PurchaseOrderPage() {
  const { user } = useAuthStore();
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
  const [receiveItems, setReceiveItems] = useState<Array<POItem & {
    batch_number_input: string;
    expiry_date_input: string;
    received_qty_input: string;
    free_qty_input: string;
    unit_price_input: string;
    reorder_level_input: string;
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [poForm, setPOForm] = useState({
    supplier_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery: '',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<Array<{
    medicine_id: string;
    medicine_name: string;
    ordered_qty: string;
    free_qty: string;
    unit_price: string;
  }>>([{ medicine_id: '', medicine_name: '', ordered_qty: '', free_qty: '0', unit_price: '' }]);

  const loadPOs = useCallback(async () => {
    setLoading(true);
    const res = await window.api.poList({});
    if (res.success) {
      const rows: PO[] = res.data.rows ?? res.data;
      const filtered = search
        ? rows.filter(p =>
            p.po_number.toLowerCase().includes(search.toLowerCase()) ||
            p.supplier_name.toLowerCase().includes(search.toLowerCase()))
        : rows;
      setPOs(filtered);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { const t = setTimeout(loadPOs, 300); return () => clearTimeout(t); }, [loadPOs]);

  useEffect(() => {
    window.api.supplierList().then(r => { if (r.success) setSuppliers(r.data); });
    window.api.medicineList().then(r => { if (r.success) setMedicines(r.data); });
  }, []);

  function addLine() {
    setLineItems(prev => [...prev, { medicine_id: '', medicine_name: '', ordered_qty: '', free_qty: '0', unit_price: '' }]);
  }

  function updateLine(idx: number, field: string, value: string) {
    setLineItems(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'medicine_id') {
        const med = medicines.find(m => m.id === Number(value));
        return { ...l, medicine_id: value, medicine_name: med?.name || '', unit_price: med ? String(med.mrp) : l.unit_price };
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
    const validItems = lineItems.filter(l => l.medicine_id && Number(l.ordered_qty) > 0 && Number(l.unit_price) > 0);
    if (validItems.length === 0) { setError('Add at least one valid item'); return; }
    setSaving(true);
    try {
      const res = await window.api.poCreate({
        supplier_id:       Number(poForm.supplier_id),
        supply_type:       'intrastate',
        order_date:        poForm.order_date,
        expected_delivery: poForm.expected_delivery || undefined,
        notes:             poForm.notes || undefined,
        created_by:        user?.id ?? 1,
        items: validItems.map(l => ({
          medicine_id: Number(l.medicine_id),
          ordered_qty: Number(l.ordered_qty),
          free_qty:    Number(l.free_qty) || 0,
          unit_price:  parseFloat(l.unit_price),
        })),
      });
      if (!res.success) { setError(res.error ?? 'Failed to create PO'); return; }
      setShowCreateModal(false);
      setLineItems([{ medicine_id: '', medicine_name: '', ordered_qty: '', free_qty: '0', unit_price: '' }]);
      setPOForm({ supplier_id: '', order_date: new Date().toISOString().split('T')[0], expected_delivery: '', notes: '' });
      loadPOs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openView(po: PO) {
    setViewingPO(po);
    const res = await window.api.poGet(po.id);
    if (res.success) setPOItems(res.data.items ?? []);
    setShowViewModal(true);
  }

  async function updateStatus(po: PO, status: 'sent') {
    const res = await window.api.poUpdateStatus(po.id, status);
    if (!res.success) { alert(res.error ?? 'Failed to update status'); return; }
    loadPOs();
  }

  async function openReceive(po: PO) {
    const res = await window.api.poGet(po.id);
    if (!res.success) { alert('Failed to load PO details'); return; }
    const items: POItem[] = res.data.items ?? [];
    setReceiveItems(items.map(i => ({
      ...i,
      batch_number_input:   '',
      expiry_date_input:    '',
      received_qty_input:   String(i.ordered_qty - i.received_qty),
      free_qty_input:       '0',
      unit_price_input:     String(i.unit_price),
      reorder_level_input:  '10',
    })));
    setViewingPO(po);
    setShowReceiveModal(true);
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!viewingPO) return;
    setSaving(true);
    try {
      const items = receiveItems
        .filter(item => Number(item.received_qty_input) > 0 && item.batch_number_input && item.expiry_date_input)
        .map(item => ({
          po_item_id:    item.id,
          batch_number:  item.batch_number_input,
          expiry_date:   item.expiry_date_input,
          received_qty:  Number(item.received_qty_input),
          free_qty:      Number(item.free_qty_input) || 0,
          unit_price:    parseFloat(item.unit_price_input) || item.unit_price,
          reorder_level: Number(item.reorder_level_input) || 10,
        }));

      if (items.length === 0) { alert('Enter at least one received item with batch and expiry'); setSaving(false); return; }

      const res = await window.api.poReceive({
        po_id:        viewingPO.id,
        receipt_date: new Date().toISOString().split('T')[0],
        items,
        created_by:   user?.id ?? 1,
      });
      if (!res.success) { alert(res.error ?? 'Failed to receive'); setSaving(false); return; }
      setShowReceiveModal(false);
      loadPOs();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const statusBadge = (status: string) => ({
    draft: 'badge-gray', sent: 'badge-yellow', partial: 'badge-yellow', received: 'badge-green', cancelled: 'badge-red'
  }[status] ?? 'badge-gray');

  const columns: Column<PO>[] = [
    { key: 'po_number',    header: 'PO Number',   render: r => <span className="font-medium text-blue-600">{r.po_number}</span> },
    { key: 'supplier_name', header: 'Supplier' },
    { key: 'order_date',   header: 'Date' },
    { key: 'expected_delivery', header: 'Expected Delivery', render: r => r.expected_delivery || '-' },
    { key: 'total_amount', header: 'Total',        render: r => fmt(r.total_amount) },
    { key: 'status',       header: 'Status',       render: r => <span className={statusBadge(r.status)}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span> },
    { key: 'actions',      header: 'Actions',      render: r => (
      <div className="flex gap-2">
        <button onClick={() => openView(r)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"><Eye size={14} /></button>
        {r.status === 'draft' && (
          <button onClick={() => updateStatus(r, 'sent')} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors" title="Mark as Sent"><Send size={14} /></button>
        )}
        {(r.status === 'sent' || r.status === 'partial') && (
          <button onClick={() => openReceive(r)} className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors" title="Receive Items"><CheckCircle size={14} /></button>
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
              <input type="date" className="input" value={poForm.order_date} onChange={e => setPOForm(f => ({...f, order_date: e.target.value}))} />
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
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 w-20">Qty</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500 w-20">Free</th>
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
                        <input type="number" min="1" className="input text-xs" value={line.ordered_qty} onChange={e => updateLine(idx, 'ordered_qty', e.target.value)} placeholder="0" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" className="input text-xs" value={line.free_qty} onChange={e => updateLine(idx, 'free_qty', e.target.value)} placeholder="0" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0.01" step="0.01" className="input text-xs" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} placeholder="0.00" />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {line.ordered_qty && line.unit_price ? fmt(Number(line.ordered_qty) * Number(line.unit_price)) : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right font-semibold text-slate-600">Total:</td>
                    <td className="px-3 py-2 font-bold text-slate-800">
                      {fmt(lineItems.reduce((s, l) => s + (Number(l.ordered_qty) * Number(l.unit_price) || 0), 0))}
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
              <div><span className="text-slate-500">Date:</span> <span className="font-medium">{viewingPO.order_date}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className={statusBadge(viewingPO.status)}>{viewingPO.status}</span></div>
              <div><span className="text-slate-500">Expected:</span> <span className="font-medium">{viewingPO.expected_delivery || 'N/A'}</span></div>
              <div><span className="text-slate-500">Total:</span> <span className="font-bold">{fmt(viewingPO.total_amount)}</span></div>
            </div>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Medicine</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Ordered</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Free</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Unit Price</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Amount</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-500">Received</th>
                </tr>
              </thead>
              <tbody>
                {poItems.map(item => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{item.medicine_name}</td>
                    <td className="px-3 py-2 text-right">{item.ordered_qty}</td>
                    <td className="px-3 py-2 text-right">{item.free_qty}</td>
                    <td className="px-3 py-2 text-right">{fmt(item.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(item.total_amount)}</td>
                    <td className="px-3 py-2 text-center">{item.received_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Receive PO Modal */}
      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title="Receive Items (GRN)" size="xl">
        <form onSubmit={handleReceive} className="space-y-4">
          <div className="text-sm text-slate-600">Enter batch details for each received item:</div>
          <div className="space-y-3">
            {receiveItems.map((item, idx) => (
              <div key={item.id} className="p-3 border border-slate-200 rounded-lg">
                <div className="font-medium text-slate-800 mb-2">
                  {item.medicine_name}
                  <span className="ml-2 text-xs text-slate-500">Ordered: {item.ordered_qty} | Already received: {item.received_qty}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Batch Number *</label>
                    <input className="input text-sm" value={item.batch_number_input}
                      onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, batch_number_input: e.target.value} : r))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Expiry Date *</label>
                    <input type="date" className="input text-sm" value={item.expiry_date_input}
                      onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, expiry_date_input: e.target.value} : r))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Received Qty</label>
                    <input type="number" min="0" className="input text-sm" value={item.received_qty_input}
                      onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, received_qty_input: e.target.value} : r))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Free Qty</label>
                    <input type="number" min="0" className="input text-sm" value={item.free_qty_input}
                      onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, free_qty_input: e.target.value} : r))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Unit Price (₹)</label>
                    <input type="number" min="0" step="0.01" className="input text-sm" value={item.unit_price_input}
                      onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, unit_price_input: e.target.value} : r))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Reorder Level</label>
                    <input type="number" min="0" className="input text-sm" value={item.reorder_level_input}
                      onChange={e => setReceiveItems(prev => prev.map((r, i) => i === idx ? {...r, reorder_level_input: e.target.value} : r))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Processing...' : 'Receive & Update Stock'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowReceiveModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
