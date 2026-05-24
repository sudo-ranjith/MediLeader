import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, Search, Edit2, ShoppingBag } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { dbRun } from '../hooks/useDatabase';
import { differenceInDays, parseISO } from 'date-fns';

interface StockRow {
  id: number;
  medicine_id: number;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  reorder_level: number;
}

interface Medicine {
  id: number;
  name: string;
}

export default function StockPage() {
  const navigate = useNavigate();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<StockRow | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    medicine_id: '',
    batch_number: '',
    expiry_date: '',
    quantity: '',
    reorder_level: '10',
  });

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const sql = search
        ? `SELECT s.*, m.name as medicine_name FROM stock s JOIN medicines m ON s.medicine_id = m.id WHERE m.name LIKE ? OR s.batch_number LIKE ? ORDER BY s.expiry_date ASC`
        : `SELECT s.*, m.name as medicine_name FROM stock s JOIN medicines m ON s.medicine_id = m.id ORDER BY s.expiry_date ASC`;
      const params = search ? [`%${search}%`, `%${search}%`] : [];
      const result = await window.api.dbSelect(sql, params);
      setStock(result as StockRow[]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadStock();
    loadMedicines();
  }, [loadStock]);

  async function loadMedicines() {
    const result = await window.api.dbSelect('SELECT id, name FROM medicines ORDER BY name ASC', []);
    setMedicines(result as Medicine[]);
  }

  function getStatus(row: StockRow): 'ok' | 'warning' | 'danger' {
    const today = new Date();
    const expiry = parseISO(row.expiry_date);
    const daysToExpiry = differenceInDays(expiry, today);
    if (daysToExpiry < 0 || row.quantity <= row.reorder_level) return 'danger';
    if (daysToExpiry <= 30) return 'warning';
    return 'ok';
  }

  function getDaysToExpiry(expiryDate: string) {
    return differenceInDays(parseISO(expiryDate), new Date());
  }

  const lowStockItems = stock.filter(s => getStatus(s) === 'danger');

  async function handleQuickReorder() {
    const lowStock = stock.filter(s => s.quantity <= s.reorder_level && s.quantity >= 0);
    if (lowStock.length === 0) { alert('No low-stock items found.'); return; }

    const poNumber = await window.api.generatePONumber();
    const suppliersResult = await window.api.dbSelect('SELECT id, name FROM suppliers ORDER BY name ASC LIMIT 1', []);
    const supplierId = (suppliersResult[0] as any)?.id;
    if (!supplierId) {
      alert('Please add a supplier first before creating a reorder PO.');
      return;
    }
    const supplierName = (suppliersResult[0] as any)?.name;
    const syncId = await window.api.generateUUID();
    const total = lowStock.reduce((s, item) => s + (item.reorder_level * 2), 0);

    const poResult = await window.api.dbRun(
      `INSERT INTO purchase_orders (po_number, supplier_id, supplier_name, status, total_amount, notes, sync_id)
       VALUES (?, ?, ?, 'draft', ?, 'Auto-generated reorder for low stock items', ?)`,
      [poNumber, supplierId, supplierName, total, syncId]
    );
    const poId = poResult.lastID;

    for (const item of lowStock) {
      await window.api.dbRun(
        `INSERT INTO po_items (po_id, medicine_id, medicine_name, quantity, unit_price, amount)
         VALUES (?, ?, ?, ?, 0, 0)`,
        [poId, item.medicine_id, item.medicine_name, item.reorder_level * 2]
      );
    }

    navigate('/purchase-orders');
  }

  async function handleAddStock(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await dbRun(
        `INSERT INTO stock (medicine_id, batch_number, expiry_date, quantity, reorder_level) VALUES (?,?,?,?,?)
         ON CONFLICT(medicine_id, batch_number) DO UPDATE SET quantity = quantity + excluded.quantity, expiry_date = excluded.expiry_date, reorder_level = excluded.reorder_level`,
        [form.medicine_id, form.batch_number, form.expiry_date, parseInt(form.quantity), parseInt(form.reorder_level)]
      );
      setShowAddModal(false);
      setForm({ medicine_id: '', batch_number: '', expiry_date: '', quantity: '', reorder_level: '10' });
      loadStock();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingItem) return;
    setSaving(true);
    try {
      await dbRun(`UPDATE stock SET quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [parseInt(adjustQty), adjustingItem.id]);
      setShowAdjustModal(false);
      loadStock();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<StockRow>[] = [
    { key: 'medicine_name', header: 'Medicine', render: r => <span className="font-medium">{r.medicine_name}</span> },
    { key: 'batch_number', header: 'Batch No.' },
    { key: 'expiry_date', header: 'Expiry Date', render: r => {
      const days = getDaysToExpiry(r.expiry_date);
      return (
        <div>
          <div>{r.expiry_date}</div>
          <div className={`text-xs ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-amber-500' : 'text-slate-400'}`}>
            {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`}
          </div>
        </div>
      );
    }},
    { key: 'quantity', header: 'Quantity', render: r => (
      <span className={`font-semibold ${r.quantity <= r.reorder_level ? 'text-red-600' : 'text-slate-700'}`}>{r.quantity}</span>
    )},
    { key: 'reorder_level', header: 'Reorder Level' },
    { key: 'status', header: 'Status', render: r => {
      const s = getStatus(r);
      return s === 'ok'
        ? <span className="badge-green">OK</span>
        : s === 'warning'
        ? <span className="badge-yellow">Expiring Soon</span>
        : <span className="badge-red">{r.quantity <= r.reorder_level && parseISO(r.expiry_date) >= new Date() ? 'Low Stock' : 'Critical'}</span>;
    }},
    { key: 'actions', header: 'Actions', render: r => (
      <button onClick={() => { setAdjustingItem(r); setAdjustQty(String(r.quantity)); setShowAdjustModal(true); }}
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
              {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} require attention: {lowStockItems.slice(0, 3).map(i => i.medicine_name).join(', ')}{lowStockItems.length > 3 ? ` and ${lowStockItems.length - 3} more` : ''}.
            </div>
          </div>
          <button onClick={handleQuickReorder} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex-shrink-0">
            <ShoppingBag size={14} /> Quick Reorder
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search stock..." value={search} onChange={e => setSearch(e.target.value)} />
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
            <select className="select" value={form.medicine_id} onChange={e => setForm(f => ({...f, medicine_id: e.target.value}))} required>
              <option value="">Select medicine...</option>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
              <input type="number" min="1" className="input" value={form.quantity} onChange={e => setForm(f => ({...f, quantity: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reorder Level</label>
              <input type="number" min="0" className="input" value={form.reorder_level} onChange={e => setForm(f => ({...f, reorder_level: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving...' : 'Add Stock'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Adjust Quantity Modal */}
      <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Adjust Quantity" size="sm">
        {adjustingItem && (
          <form onSubmit={handleAdjust} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="font-medium">{adjustingItem.medicine_name}</div>
              <div className="text-slate-500">Batch: {adjustingItem.batch_number}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Quantity</label>
              <input type="number" min="0" className="input" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} required autoFocus />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving...' : 'Update'}</button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
