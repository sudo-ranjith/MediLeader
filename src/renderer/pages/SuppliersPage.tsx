import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Wallet, History } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuthStore } from '../stores/authStore';

interface Supplier {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin?: string;
  dl_number?: string;
  outstanding?: number;
}

const emptyForm    = { name: '', phone: '', email: '', address: '', gstin: '', dl_number: '' };
const emptyPayForm = { amount: '', method: 'cash', reference: '', notes: '', payment_date: new Date().toISOString().split('T')[0] };
const fmt = (n: number) => `₹${(n ?? 0).toFixed(2)}`;

export default function SuppliersPage() {
  const { user } = useAuthStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [showPayModal, setShowPayModal]     = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingSupplier, setEditingSupplier]   = useState<Supplier | null>(null);
  const [payingSupplier, setPayingSupplier]     = useState<Supplier | null>(null);
  const [historySupplier, setHistorySupplier]   = useState<Supplier | null>(null);
  const [paymentHistory, setPaymentHistory]     = useState<any[]>([]);
  const [form, setForm]       = useState(emptyForm);
  const [payForm, setPayForm] = useState(emptyPayForm);
  const [saving, setSaving]   = useState(false);
  const [paying, setPaying]   = useState(false);
  const [payError, setPayError] = useState('');
  const [error, setError]     = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    const res = await window.api.supplierList(search || undefined);
    if (res.success) setSuppliers(res.data);
    setLoading(false);
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
    setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', gstin: s.gstin || '', dl_number: s.dl_number || '' });
    setError('');
    setShowModal(true);
  }

  function openPay(s: Supplier) {
    setPayingSupplier(s);
    setPayForm(emptyPayForm);
    setPayError('');
    setShowPayModal(true);
  }

  async function openHistory(s: Supplier) {
    setHistorySupplier(s);
    setPaymentHistory([]);
    setShowHistoryModal(true);
    const res = await window.api.supplierPayments(s.id);
    if (res.success) setPaymentHistory(res.data);
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payingSupplier) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { setPayError('Enter a valid amount'); return; }
    setPayError('');
    setPaying(true);
    const res = await window.api.supplierPay({
      supplier_id:  payingSupplier.id,
      payment_date: payForm.payment_date,
      amount,
      method:       payForm.method,
      reference:    payForm.reference || undefined,
      notes:        payForm.notes || undefined,
      created_by:   user?.id ?? 1,
    });
    setPaying(false);
    if (!res.success) { setPayError(res.error ?? 'Payment failed'); return; }
    setShowPayModal(false);
    loadSuppliers();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = {
        name:      form.name,
        phone:     form.phone || undefined,
        email:     form.email || undefined,
        address:   form.address || undefined,
        gstin:     form.gstin || undefined,
        dl_number: form.dl_number || undefined,
      };
      const res = editingSupplier
        ? await window.api.supplierUpdate(editingSupplier.id, data)
        : await window.api.supplierCreate(data);
      if (!res.success) { setError(res.error ?? 'Failed to save'); return; }
      setShowModal(false);
      loadSuppliers();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await window.api.supplierDelete(id);
    if (!res.success) { alert('Cannot delete: ' + res.error); return; }
    setDeleteId(null);
    loadSuppliers();
  }

  const columns: Column<Supplier>[] = [
    { key: 'name',      header: 'Supplier Name', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'phone',     header: 'Phone',          render: r => r.phone || '—' },
    { key: 'email',     header: 'Email',          render: r => r.email || '—' },
    { key: 'gstin',     header: 'GSTIN',          render: r => r.gstin ? <span className="font-mono text-xs">{r.gstin}</span> : '—' },
    { key: 'dl_number', header: 'DL Number',      render: r => r.dl_number || '—' },
    { key: 'outstanding', header: 'Outstanding',  render: r => (
      <span className={(r.outstanding ?? 0) > 0 ? 'text-red-600 font-medium' : 'text-slate-500'}>{fmt(r.outstanding ?? 0)}</span>
    )},
    { key: 'actions',   header: 'Actions',        render: r => (
      <div className="flex gap-2">
        <button onClick={e => { e.stopPropagation(); openHistory(r); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors" title="Payment history"><History size={14} /></button>
        {(r.outstanding ?? 0) > 0 && (
          <button onClick={e => { e.stopPropagation(); openPay(r); }} className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors" title="Record payment"><Wallet size={14} /></button>
        )}
        <button onClick={e => { e.stopPropagation(); openEdit(r); }} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors" title="Edit"><Edit2 size={14} /></button>
        <button onClick={e => { e.stopPropagation(); setDeleteId(r.id); }} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors" title="Delete"><Trash2 size={14} /></button>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN</label>
              <input className="input font-mono" value={form.gstin} onChange={e => setForm(f => ({...f, gstin: e.target.value}))} placeholder="15-char GSTIN" maxLength={15} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Drug License No.</label>
              <input className="input" value={form.dl_number} onChange={e => setForm(f => ({...f, dl_number: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : editingSupplier ? 'Update Supplier' : 'Add Supplier'}</button>
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

      <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title="Record Supplier Payment" size="md">
        {payingSupplier && (
          <form onSubmit={handlePay} className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-red-800">{payingSupplier.name}</div>
              <div className="text-red-700 mt-0.5">Outstanding: <span className="font-bold">{fmt(payingSupplier.outstanding ?? 0)}</span></div>
            </div>
            {payError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{payError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) *</label>
                <input
                  type="number" min="1" step="0.01"
                  className="input"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({...f, amount: e.target.value}))}
                  placeholder={`Max ${fmt(payingSupplier.outstanding ?? 0)}`}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date" className="input"
                  value={payForm.payment_date}
                  onChange={e => setPayForm(f => ({...f, payment_date: e.target.value}))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
                <select className="input" value={payForm.method} onChange={e => setPayForm(f => ({...f, method: e.target.value}))}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="neft">NEFT / RTGS</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reference / UTR</label>
                <input className="input" value={payForm.reference} onChange={e => setPayForm(f => ({...f, reference: e.target.value}))} placeholder="Optional" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input className="input" value={payForm.notes} onChange={e => setPayForm(f => ({...f, notes: e.target.value}))} placeholder="Optional" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary flex-1" disabled={paying}>
                {paying ? 'Recording…' : 'Record Payment'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowPayModal(false)}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} title={`Payment History — ${historySupplier?.name ?? ''}`} size="lg">
        {paymentHistory.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No payments recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Date</th>
                <th className="text-right px-3 py-2 font-medium text-slate-500">Amount</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Method</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Reference</th>
              </tr>
            </thead>
            <tbody>
              {paymentHistory.map((p: any) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-500">{p.payment_date}</td>
                  <td className="px-3 py-2 text-right font-medium text-green-600">{fmt(p.amount)}</td>
                  <td className="px-3 py-2 capitalize text-slate-600">{p.method}</td>
                  <td className="px-3 py-2 text-slate-400">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
