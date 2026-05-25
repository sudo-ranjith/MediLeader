import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';

interface Medicine {
  id: number;
  name: string;
  generic_name?: string;
  hsn_code?: string;
  gst_rate: number;
  unit: string;
  mrp: number;
  cost: number;
  barcode?: string;
  manufacturer?: string;
  schedule: string;
  is_active: number;
}

const emptyForm = {
  name: '',
  generic_name: '',
  hsn_code: '',
  gst_rate: 0,
  unit: 'strip',
  mrp: '',
  cost: '',
  barcode: '',
  manufacturer: '',
  schedule: 'OTC',
};

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [deleteId, setDeleteId]   = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadMedicines = useCallback(async () => {
    setLoading(true);
    const res = await window.api.medicineList(debouncedSearch || undefined);
    if (res.success) setMedicines(res.data);
    setLoading(false);
  }, [debouncedSearch]);

  useEffect(() => { loadMedicines(); }, [loadMedicines]);

  function openAdd() {
    setEditingMed(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(med: Medicine) {
    setEditingMed(med);
    setForm({
      name:         med.name,
      generic_name: med.generic_name ?? '',
      hsn_code:     med.hsn_code ?? '',
      gst_rate:     med.gst_rate,
      unit:         med.unit || 'strip',
      mrp:          String(med.mrp),
      cost:         String(med.cost),
      barcode:      med.barcode ?? '',
      manufacturer: med.manufacturer ?? '',
      schedule:     med.schedule ?? 'OTC',
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const mrp  = parseFloat(form.mrp as string);
    const cost = parseFloat(form.cost as string);
    if (isNaN(mrp) || mrp <= 0)  { setError('MRP must be greater than 0');  return; }
    if (isNaN(cost) || cost <= 0) { setError('Cost must be greater than 0'); return; }

    setSaving(true);
    try {
      const data = {
        name:         form.name,
        generic_name: form.generic_name || undefined,
        hsn_code:     form.hsn_code || undefined,
        gst_rate:     form.gst_rate,
        unit:         form.unit,
        mrp,
        cost,
        barcode:      form.barcode || undefined,
        manufacturer: form.manufacturer || undefined,
        schedule:     form.schedule,
      };

      const res = editingMed
        ? await window.api.medicineUpdate(editingMed.id, data)
        : await window.api.medicineCreate(data);

      if (!res.success) { setError(res.error ?? 'Failed to save'); return; }
      setShowModal(false);
      loadMedicines();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await window.api.medicineDelete(id);
    if (!res.success) { alert('Cannot delete: ' + res.error); return; }
    setDeleteId(null);
    loadMedicines();
  }

  const columns: Column<Medicine>[] = [
    { key: 'name',         header: 'Medicine Name',  render: r => <span className="font-medium">{r.name}{r.generic_name && <span className="text-slate-400 text-xs ml-1">({r.generic_name})</span>}</span> },
    { key: 'hsn_code',     header: 'HSN Code',       render: r => r.hsn_code || '—' },
    { key: 'unit',         header: 'Unit',            render: r => <span className="capitalize">{r.unit}</span> },
    { key: 'mrp',          header: 'MRP (₹)',         render: r => `₹${r.mrp.toFixed(2)}` },
    { key: 'cost',         header: 'Cost (₹)',        render: r => `₹${r.cost.toFixed(2)}` },
    { key: 'gst_rate',     header: 'GST %',           render: r => `${r.gst_rate}%` },
    { key: 'schedule',     header: 'Schedule',        render: r => <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100">{r.schedule}</span> },
    { key: 'manufacturer', header: 'Manufacturer',    render: r => r.manufacturer || '—' },
    {
      key: 'actions', header: 'Actions',
      render: r => (
        <div className="flex gap-2">
          <button onClick={e => { e.stopPropagation(); openEdit(r); }} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors">
            <Edit2 size={14} />
          </button>
          <button onClick={e => { e.stopPropagation(); setDeleteId(r.id); }} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search medicines..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Medicine</button>
      </div>

      <div className="card p-0">
        <DataTable columns={columns} data={medicines} loading={loading} emptyMessage="No medicines found. Add your first medicine!" />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingMed ? 'Edit Medicine' : 'Add Medicine'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Medicine Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Generic Name</label>
              <input className="input" value={form.generic_name} onChange={e => setForm(f => ({...f, generic_name: e.target.value}))} placeholder="e.g. Paracetamol" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">HSN Code</label>
              <input className="input" value={form.hsn_code} onChange={e => setForm(f => ({...f, hsn_code: e.target.value}))} placeholder="e.g. 3004" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
              <select className="select" value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
                {['strip', 'bottle', 'box', 'tablet', 'ml', 'injection', 'sachet', 'tube', 'vial'].map(u => (
                  <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Schedule</label>
              <select className="select" value={form.schedule} onChange={e => setForm(f => ({...f, schedule: e.target.value}))}>
                {['OTC', 'H', 'H1', 'X', 'G'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">MRP / Selling Price (₹) *</label>
              <input className="input" type="number" min="0.01" step="0.01" value={form.mrp} onChange={e => setForm(f => ({...f, mrp: e.target.value}))} required placeholder="0.00" />
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
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : editingMed ? 'Update Medicine' : 'Add Medicine'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

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
