import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { dbRun } from '../hooks/useDatabase';

interface Medicine {
  id: number;
  name: string;
  hsn_code: string;
  gst_rate: number;
  unit: string;
  price: number;
  cost: number;
  barcode: string;
  manufacturer: string;
}

const emptyForm = {
  name: '',
  hsn_code: '',
  gst_rate: 0,
  unit: 'strip',
  price: '',
  cost: '',
  barcode: '',
  manufacturer: '',
};

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadMedicines = useCallback(async () => {
    setLoading(true);
    try {
      const sql = debouncedSearch
        ? `SELECT * FROM medicines WHERE name LIKE ? OR hsn_code LIKE ? ORDER BY name ASC`
        : `SELECT * FROM medicines ORDER BY name ASC`;
      const params = debouncedSearch ? [`%${debouncedSearch}%`, `%${debouncedSearch}%`] : [];
      const result = await window.api.dbSelect(sql, params);
      setMedicines(result as Medicine[]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadMedicines();
  }, [loadMedicines]);

  function openAdd() {
    setEditingMed(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(med: Medicine) {
    setEditingMed(med);
    setForm({
      name: med.name,
      hsn_code: med.hsn_code || '',
      gst_rate: med.gst_rate,
      unit: med.unit || 'strip',
      price: String(med.price),
      cost: String(med.cost),
      barcode: med.barcode || '',
      manufacturer: med.manufacturer || '',
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const price = parseFloat(form.price as string);
    const cost = parseFloat(form.cost as string);
    if (isNaN(price) || price <= 0) { setError('Price must be greater than 0'); return; }
    if (isNaN(cost) || cost <= 0) { setError('Cost must be greater than 0'); return; }

    setSaving(true);
    try {
      if (editingMed) {
        await dbRun(
          `UPDATE medicines SET name=?, hsn_code=?, gst_rate=?, unit=?, price=?, cost=?, barcode=?, manufacturer=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [form.name, form.hsn_code || null, form.gst_rate, form.unit, price, cost, form.barcode || null, form.manufacturer || null, editingMed.id]
        );
      } else {
        await dbRun(
          `INSERT INTO medicines (name, hsn_code, gst_rate, unit, price, cost, barcode, manufacturer) VALUES (?,?,?,?,?,?,?,?)`,
          [form.name, form.hsn_code || null, form.gst_rate, form.unit, price, cost, form.barcode || null, form.manufacturer || null]
        );
      }
      setShowModal(false);
      loadMedicines();
    } catch (err: any) {
      setError(err.message || 'Failed to save medicine');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await dbRun(`DELETE FROM medicines WHERE id=?`, [id]);
      setDeleteId(null);
      loadMedicines();
    } catch (err: any) {
      alert('Cannot delete: ' + err.message);
    }
  }

  const columns: Column<Medicine>[] = [
    { key: 'name', header: 'Medicine Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: 'hsn_code', header: 'HSN Code', render: (r) => r.hsn_code || '-' },
    { key: 'unit', header: 'Unit', render: (r) => <span className="capitalize">{r.unit || '-'}</span> },
    { key: 'price', header: 'MRP (₹)', render: (r) => `₹${r.price.toFixed(2)}` },
    { key: 'cost', header: 'Cost (₹)', render: (r) => `₹${r.cost.toFixed(2)}` },
    { key: 'gst_rate', header: 'GST %', render: (r) => `${r.gst_rate}%` },
    { key: 'manufacturer', header: 'Manufacturer', render: (r) => r.manufacturer || '-' },
    {
      key: 'actions', header: 'Actions',
      render: (r) => (
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors">
            <Edit2 size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search medicines..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={16} /> Add Medicine
        </button>
      </div>

      <div className="card p-0">
        <DataTable columns={columns} data={medicines} loading={loading} emptyMessage="No medicines found. Add your first medicine!" />
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingMed ? 'Edit Medicine' : 'Add Medicine'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Medicine Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">HSN Code</label>
              <input className="input" value={form.hsn_code} onChange={e => setForm(f => ({...f, hsn_code: e.target.value}))} placeholder="e.g. 3004" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
              <select className="select" value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
                {['strip', 'bottle', 'box', 'tablet', 'ml', 'injection', 'sachet'].map(u => (
                  <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">MRP / Selling Price (₹) *</label>
              <input className="input" type="number" min="0.01" step="0.01" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} required placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₹) *</label>
              <input className="input" type="number" min="0.01" step="0.01" value={form.cost} onChange={e => setForm(f => ({...f, cost: e.target.value}))} required placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">GST Rate (%)</label>
              <select className="select" value={form.gst_rate} onChange={e => setForm(f => ({...f, gst_rate: Number(e.target.value)}))}>
                {[0, 5, 12, 18].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Barcode</label>
              <input className="input" value={form.barcode} onChange={e => setForm(f => ({...f, barcode: e.target.value}))} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Manufacturer</label>
              <input className="input" value={form.manufacturer} onChange={e => setForm(f => ({...f, manufacturer: e.target.value}))} placeholder="Optional" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving...' : editingMed ? 'Update Medicine' : 'Add Medicine'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Medicine" size="sm">
        <p className="text-slate-600 mb-4">Are you sure you want to delete this medicine? This cannot be undone.</p>
        <div className="flex gap-3">
          <button className="btn-danger flex-1" onClick={() => handleDelete(deleteId!)}>Delete</button>
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
