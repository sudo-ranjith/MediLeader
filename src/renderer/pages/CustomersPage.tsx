import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, Wallet } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuthStore } from '../stores/authStore';

interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin?: string;
  credit_limit: number;
  credit_used: number;
}

const emptyForm = { name: '', phone: '', email: '', address: '', gstin: '', credit_limit: '0' };
const emptyPayForm = { amount: '', method: 'cash', reference: '', notes: '', payment_date: new Date().toISOString().split('T')[0] };
const fmt = (n: number) => `₹${(n ?? 0).toFixed(2)}`;

export default function CustomersPage() {
  const { user } = useAuthStore();
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showPayModal, setShowPayModal]   = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [payingCustomer, setPayingCustomer]   = useState<Customer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [form, setForm]               = useState(emptyForm);
  const [payForm, setPayForm]         = useState(emptyPayForm);
  const [saving, setSaving]           = useState(false);
  const [paying, setPaying]           = useState(false);
  const [payError, setPayError]       = useState('');
  const [error, setError]             = useState('');
  const [deleteId, setDeleteId]       = useState<number | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const res = await window.api.customerList(search || undefined);
    if (res.success) setCustomers(res.data);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadCustomers, 300);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  function openAdd() {
    setEditingCustomer(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    setEditingCustomer(c);
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', gstin: c.gstin || '', credit_limit: String(c.credit_limit || 0) });
    setError('');
    setShowModal(true);
  }

  async function openView(c: Customer) {
    setViewingCustomer(c);
    setCustomerInvoices([]);
    setShowViewModal(true);
    const res = await window.api.customerInvoices(c.id);
    if (res.success) setCustomerInvoices(res.data);
  }

  function openCollectPayment(c: Customer) {
    setPayingCustomer(c);
    setPayForm(emptyPayForm);
    setPayError('');
    setShowPayModal(true);
  }

  async function handleCollectPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payingCustomer) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { setPayError('Enter a valid amount'); return; }
    if (amount > (payingCustomer.credit_used ?? 0)) { setPayError(`Amount exceeds outstanding (${fmt(payingCustomer.credit_used)})`); return; }
    setPayError('');
    setPaying(true);
    const res = await window.api.customerCollectPayment({
      customer_id:  payingCustomer.id,
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
    loadCustomers();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = {
        name:         form.name,
        phone:        form.phone || undefined,
        email:        form.email || undefined,
        address:      form.address || undefined,
        gstin:        form.gstin || undefined,
        credit_limit: parseFloat(form.credit_limit) || 0,
      };
      const res = editingCustomer
        ? await window.api.customerUpdate(editingCustomer.id, data)
        : await window.api.customerCreate(data);
      if (!res.success) { setError(res.error ?? 'Failed to save'); return; }
      setShowModal(false);
      loadCustomers();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await window.api.customerDelete(id);
    if (!res.success) { alert('Cannot delete: ' + res.error); return; }
    setDeleteId(null);
    loadCustomers();
  }

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Name', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'phone', header: 'Phone', render: r => r.phone || '—' },
    { key: 'email', header: 'Email', render: r => r.email || '—' },
    { key: 'credit_limit', header: 'Credit Limit', render: r => fmt(r.credit_limit) },
    { key: 'credit_used', header: 'Credit Used', render: r => (
      <span className={(r.credit_used ?? 0) > 0 ? 'text-amber-600 font-medium' : ''}>{fmt(r.credit_used ?? 0)}</span>
    )},
    { key: 'available', header: 'Available', render: r => {
      const avail = Math.max(0, (r.credit_limit ?? 0) - (r.credit_used ?? 0));
      return <span className={avail <= 0 ? 'text-red-600' : 'text-green-600'}>{fmt(avail)}</span>;
    }},
    { key: 'actions', header: 'Actions', render: r => (
      <div className="flex gap-2">
        <button onClick={e => { e.stopPropagation(); openView(r); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors" title="View details"><Eye size={14} /></button>
        {(r.credit_used ?? 0) > 0 && (
          <button onClick={e => { e.stopPropagation(); openCollectPayment(r); }} className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors" title="Collect payment"><Wallet size={14} /></button>
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
          <input className="input pl-9" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Customer</button>
      </div>

      <div className="card p-0">
        <DataTable columns={columns} data={customers} loading={loading} emptyMessage="No customers found." />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingCustomer ? 'Edit Customer' : 'Add Customer'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="10-digit mobile" />
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
              <input className="input font-mono" value={form.gstin} onChange={e => setForm(f => ({...f, gstin: e.target.value}))} placeholder="15-digit GSTIN" maxLength={15} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Credit Limit (₹)</label>
              <input type="number" min="0" step="0.01" className="input" value={form.credit_limit} onChange={e => setForm(f => ({...f, credit_limit: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : editingCustomer ? 'Update Customer' : 'Add Customer'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Customer Details" size="lg">
        {viewingCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Name:</span> <span className="font-medium">{viewingCustomer.name}</span></div>
              <div><span className="text-slate-500">Phone:</span> <span className="font-medium">{viewingCustomer.phone || '—'}</span></div>
              <div><span className="text-slate-500">Email:</span> <span className="font-medium">{viewingCustomer.email || '—'}</span></div>
              <div><span className="text-slate-500">GSTIN:</span> <span className="font-mono text-xs">{viewingCustomer.gstin || '—'}</span></div>
              <div><span className="text-slate-500">Credit Limit:</span> <span className="font-medium">{fmt(viewingCustomer.credit_limit)}</span></div>
              <div><span className="text-slate-500">Credit Used:</span> <span className="font-medium text-amber-600">{fmt(viewingCustomer.credit_used)}</span></div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">Recent Invoices</div>
              {customerInvoices.length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-4">No invoices found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Invoice #</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Date</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Total</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerInvoices.map((inv: any) => (
                      <tr key={inv.id} className="border-t">
                        <td className="px-3 py-2 font-medium text-blue-600">{inv.invoice_number}</td>
                        <td className="px-3 py-2 text-slate-500">{inv.invoice_date}</td>
                        <td className="px-3 py-2 text-right">{fmt(inv.total_amount)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Customer" size="sm">
        <p className="text-slate-600 mb-4">Are you sure you want to delete this customer?</p>
        <div className="flex gap-3">
          <button className="btn-danger flex-1" onClick={() => handleDelete(deleteId!)}>Delete</button>
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
        </div>
      </Modal>

      <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title="Collect Payment" size="md">
        {payingCustomer && (
          <form onSubmit={handleCollectPayment} className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-amber-800">{payingCustomer.name}</div>
              <div className="text-amber-700 mt-0.5">Outstanding: <span className="font-bold">{fmt(payingCustomer.credit_used ?? 0)}</span></div>
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
                  placeholder={`Max ${fmt(payingCustomer.credit_used ?? 0)}`}
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
    </div>
  );
}
