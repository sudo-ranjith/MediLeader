import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, Search, Edit2, ShoppingBag } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuthStore } from '../stores/authStore';

interface StockRow {
  id: number;
  medicine_id: number;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  purchase_price: number;
  mrp: number;
  quantity: number;
  reorder_level: number;
}

interface Medicine { id: number; name: string; mrp: number; }

function daysToExpiry(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function getStatus(row: StockRow): 'ok' | 'warning' | 'danger' {
  const days = daysToExpiry(row.expiry_date);
  if (days < 0 || row.quantity <= row.reorder_level) return 'danger';
  if (days <= 30) return 'warning';
  return 'ok';
}

export default function StockPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stock, setStock]         = useState<StockRow[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showAddModal, setShowAddModal]       = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingItem, setAdjustingItem]     = useState<StockRow | null>(null);
  const [adjustQty, setAdjustQty]   = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [form, setForm] = useState({
    medicine_id: '', batch_number: '', expiry_date: '',
    purchase_price: '', mrp: '', quantity: '', reorder_level: '10',
  });

  const loadStock = useCallback(async () => {
    setLoading(true);
    const res = await window.api.batchListAll();
    if (res.success) {
      const filtered = search
        ? res.data.filter((r: StockRow) =>
            r.medicine_name.toLowerCase().includes(search.toLowerCase()) ||
            r.batch_number.toLowerCase().includes(search.toLowerCase()))
        : res.data;
      setStock(filtered);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadStock, 300);
    return () => clearTimeout(t);
  }, [loadStock]);

  useEffect(() => {
    window.api.medicineList().then(res => {
      if (res.success) setMedicines(res.data);
    });
  }, []);

  function onMedicineChange(medicineId: string) {
    const med = medicines.find(m => m.id === Number(medicineId));
    setForm(f => ({ ...f, medicine_id: medicineId, mrp: med ? String(med.mrp) : f.mrp }));
  }

  async function handleAddStock(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await window.api.batchCreate({
        medicine_id:    Number(form.medicine_id),
        batch_number:   form.batch_number,
        expiry_date:    form.expiry_date,
        purchase_price: parseFloat(form.purchase_price) || 0,
        mrp:            parseFloat(form.mrp) || 0,
        quantity:       parseInt(form.quantity),
        reorder_level:  parseInt(form.reorder_level) || 10,
        created_by:     user?.id ?? 1,
      });
      if (!res.success) { setError(res.error ?? 'Failed to add stock'); return; }
      setShowAddModal(false);
      setForm({ medicine_id: '', batch_number: '', expiry_date: '', purchase_price: '', mrp: '', quantity: '', reorder_level: '10' });
      loadStock();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingItem) return;
    setSaving(true);
    try {
      const res = await window.api.batchAdjust(
        adjustingItem.id,
        parseInt(adjustQty),
        adjustReason || 'Manual adjustment',
        user?.id ?? 1,
      );
      if (!res.success) { alert(res.error ?? 'Failed to adjust'); return; }
      setShowAdjustModal(false);
      loadStock();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const lowStockItems = stock.filter(s => getStatus(s) === 'danger');

  const columns: Column<StockRow>[] = [
    { key: 'medicine_name', header: 'Medicine', render: r => <span className="font-medium">{r.medicine_name}</span> },
    { key: 'batch_number',  header: 'Batch No.' },
    { key: 'expiry_date',   header: 'Expiry Date', render: r => {
      const days = daysToExpiry(r.expiry_date);
      return (
        <div>
          <div>{r.expiry_date}</div>
          <div className={`text-xs ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-amber-500' : 'text-slate-400'}`}>
            {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`}
          </div>
        </div>
      );
    }},
    { key: 'quantity',      header: 'Qty', render: r => (
      <span className={`font-semibold ${r.quantity <= r.reorder_level ? 'text-red-600' : 'text-slate-700'}`}>{r.quantity}</span>
    )},
    { key: 'mrp',           header: 'MRP',        render: r => `₹${r.mrp.toFixed(2)}` },
    { key: 'reorder_level', header: 'Reorder Lvl' },
    { key: 'status',        header: 'Status',     render: r => {
      const s = getStatus(r);
      return s === 'ok'      ? <span className="badge-green">OK</span>
           : s === 'warning' ? <span className="badge-yellow">Expiring Soon</span>
           :                   <span className="badge-red">{r.quantity <= r.reorder_level ? 'Low Stock' : 'Expired'}</span>;
    }},
    { key: 'actions', header: 'Actions', render: r => (
      <button onClick={() => { setAdjustingItem(r); setAdjustQty(String(r.quantity)); setAdjustReason(''); setShowAdjustModal(true); }}
        className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors">
        <Edit2 size={14} />
      </button>
    )},
  ];

  return (
    <div className="space-y-4">
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium text-red-700">Stock Alert</div>
            <div className="text-red-600 text-sm mt-1">
              {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} need attention: {lowStockItems.slice(0, 3).map(i => i.medicine_name).join(', ')}{lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : ''}.
            </div>
          </div>
          <button onClick={() => navigate('/purchase-orders')}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex-shrink-0">
            <ShoppingBag size={14} /> Create PO
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search batches..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => { setError(''); setShowAddModal(true); }} className="btn-primary">
          <Plus size={16} /> Add Stock
        </button>
      </div>

      <div className="card p-0">
        <DataTable columns={columns} data={stock} loading={loading} emptyMessage="No stock records found." />
      </div>

      {/* Add Stock Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Stock Entry">
        <form onSubmit={handleAddStock} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Medicine *</label>
            <select className="select" value={form.medicine_id} onChange={e => onMedicineChange(e.target.value)} required>
              <option value="">Select medicine…</option>
              {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Batch Number *</label>
              <input className="input" value={form.batch_number} onChange={e => setForm(f => ({...f, batch_number: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date *</label>
              <input type="date" className="input" value={form.expiry_date} onChange={e => setForm(f => ({...f, expiry_date: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Price (₹) *</label>
              <input type="number" min="0" step="0.01" className="input" value={form.purchase_price} onChange={e => setForm(f => ({...f, purchase_price: e.target.value}))} required placeholder="Cost per unit" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">MRP (₹) *</label>
              <input type="number" min="0" step="0.01" className="input" value={form.mrp} onChange={e => setForm(f => ({...f, mrp: e.target.value}))} required placeholder="Max retail price" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
              <input type="number" min="1" className="input" value={form.quantity} onChange={e => setForm(f => ({...f, quantity: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reorder Level</label>
              <input type="number" min="0" className="input" value={form.reorder_level} onChange={e => setForm(f => ({...f, reorder_level: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : 'Add Stock'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Adjust Quantity Modal */}
      <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Adjust Stock" size="sm">
        {adjustingItem && (
          <form onSubmit={handleAdjust} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="font-medium">{adjustingItem.medicine_name}</div>
              <div className="text-slate-500">Batch: {adjustingItem.batch_number} | Current Qty: {adjustingItem.quantity}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Quantity *</label>
              <input type="number" min="0" className="input" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
              <input className="input" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Physical count correction" />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : 'Update Stock'}</button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
