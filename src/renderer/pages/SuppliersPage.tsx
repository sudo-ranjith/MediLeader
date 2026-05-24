import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { dbRun } from '../hooks/useDatabase';

interface Supplier {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  gst_number: string;
  dl_number: string;
}

const emptyForm = { name: '', phone: '', email: '', address: '', city: '', gst_number: '', dl_number: '' };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const sql = search
        ? `SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? OR city LIKE ? ORDER BY name ASC`
        : `SELECT * FROM suppliers ORDER BY name ASC`;
      const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
      setSuppliers(await window.api.dbSelect(sql, params) as Supplier[]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadSuppliers, 300);
    return () => clearTimeout(t);
  }, [loadSuppliers]);

  function openAdd() {
    setEditingSupplier(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(s: Supplier) {
    setEditingSupplier(s);
    setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', city: s.city || '', gst_number: s.gst_number || '', dl_number: s.dl_number || '' });
    setError('');
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingSupplier) {
        await dbRun(
          `UPDATE suppliers SET name=?, phone=?, email=?, address=?, city=?, gst_number=?, dl_number=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [form.name, form.phone || null, form.email || null, form.address || null, form.city || null, form.gst_number || null, form.dl_number || null, editingSupplier.id]
        );
      } else {
        await dbRun(
          `INSERT INTO suppliers (name, phone, email, address, city, gst_number, dl_number) VALUES (?,?,?,?,?,?,?)`,
          [form.name, form.phone || null, form.email || null, form.address || null, form.city || null, form.gst_number || null, form.dl_number || null]
        );
      }
      setShowModal(false);
      loadSuppliers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await dbRun(`DELETE FROM suppliers WHERE id=?`, [id]);
      setDeleteId(null);
      loadSuppliers();
    } catch (err: any) {
      alert('Cannot delete: ' + err.message);
    }
  }

  const columns: Column<Supplier>[] = [
    { key: 'name', header: 'Supplier Name', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'phone', header: 'Phone', render: r => r.phone || '-' },
    { key: 'email', header: 'Email', render: r => r.email || '-' },
    { key: 'city', header: 'City', render: r => r.city || '-' },
    { key: 'gst_number', header: 'GSTIN', render: r => r.gst_number ? <span className="font-mono text-xs">{r.gst_number}</span> : '-' },
    { key: 'dl_number', header: 'DL Number', render: r => r.dl_number || '-' },
    { key: 'actions', header: 'Actions', render: r => (
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"><Edit2 size={14} /></button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Supplier</button>
      </div>

      <div className="card p-0">
        <DataTable columns={columns} data={suppliers} loading={loading} emptyMessage="No suppliers found." />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Supplier Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <input className="input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input className="input" value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN</label>
              <input className="input font-mono" value={form.gst_number} onChange={e => setForm(f => ({...f, gst_number: e.target.value}))} placeholder="15-char GSTIN" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Drug License Number</label>
              <input className="input" value={form.dl_number} onChange={e => setForm(f => ({...f, dl_number: e.target.value}))} placeholder="DL No." />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving...' : editingSupplier ? 'Update' : 'Add Supplier'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Supplier" size="sm">
        <p className="text-slate-600 mb-4">Are you sure you want to delete this supplier?</p>
        <div className="flex gap-3">
          <button className="btn-danger flex-1" onClick={() => handleDelete(deleteId!)}>Delete</button>
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
