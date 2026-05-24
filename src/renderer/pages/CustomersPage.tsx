import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Eye } from 'lucide-react';
import DataTable, { Column } from '../components/DataTable';
import Modal from '../components/Modal';
import { dbRun } from '../hooks/useDatabase';
import { formatCurrency } from '../utils/gstCalculator';

interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  gst_number: string;
  credit_limit: number;
  credit_used: number;
}

const emptyForm = { name: '', phone: '', email: '', address: '', city: '', gst_number: '', credit_limit: '0' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const sql = search
        ? `SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name ASC`
        : `SELECT * FROM customers ORDER BY name ASC`;
      const params = search ? [`%${search}%`, `%${search}%`] : [];
      setCustomers(await window.api.dbSelect(sql, params) as Customer[]);
    } finally {
      setLoading(false);
    }
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
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', city: c.city || '', gst_number: c.gst_number || '', credit_limit: String(c.credit_limit || 0) });
    setError('');
    setShowModal(true);
  }

  async function openView(c: Customer) {
    setViewingCustomer(c);
    const invoices = await window.api.dbSelect(`SELECT invoice_number, date, total, payment_method, status FROM invoices WHERE customer_id = ? ORDER BY id DESC LIMIT 5`, [c.id]);
    setCustomerInvoices(invoices);
    setShowViewModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingCustomer) {
        await dbRun(
          `UPDATE customers SET name=?, phone=?, email=?, address=?, city=?, gst_number=?, credit_limit=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [form.name, form.phone || null, form.email || null, form.address || null, form.city || null, form.gst_number || null, parseFloat(form.credit_limit) || 0, editingCustomer.id]
        );
      } else {
        await dbRun(
          `INSERT INTO customers (name, phone, email, address, city, gst_number, credit_limit) VALUES (?,?,?,?,?,?,?)`,
          [form.name, form.phone || null, form.email || null, form.address || null, form.city || null, form.gst_number || null, parseFloat(form.credit_limit) || 0]
        );
      }
      setShowModal(false);
      loadCustomers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await dbRun(`DELETE FROM customers WHERE id=?`, [id]);
      setDeleteId(null);
      loadCustomers();
    } catch (err: any) {
      alert('Cannot delete: ' + err.message);
    }
  }

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Name', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'phone', header: 'Phone', render: r => r.phone || '-' },
    { key: 'email', header: 'Email', render: r => r.email || '-' },
    { key: 'credit_limit', header: 'Credit Limit', render: r => formatCurrency(r.credit_limit || 0) },
    { key: 'credit_used', header: 'Credit Used', render: r => (
      <span className={(r.credit_used || 0) > 0 ? 'text-amber-600 font-medium' : ''}>{formatCurrency(r.credit_used || 0)}</span>
    )},
    { key: 'available', header: 'Available Credit', render: r => (
      <span className={(r.credit_limit - r.credit_used) <= 0 ? 'text-red-600' : 'text-green-600'}>
        {formatCurrency(Math.max(0, (r.credit_limit || 0) - (r.credit_used || 0)))}
      </span>
    )},
    { key: 'actions', header: 'Actions', render: r => (
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); openView(r); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"><Eye size={14} /></button>
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
          <input className="input pl-9" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Customer</button>
      </div>

      <div className="card p-0">
        <DataTable columns={columns} data={customers} loading={loading} emptyMessage="No customers found." />
      </div>

      {/* Add/Edit Modal */}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input className="input" value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
              <input className="input" value={form.gst_number} onChange={e => setForm(f => ({...f, gst_number: e.target.value}))} placeholder="GSTIN" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Credit Limit (₹)</label>
              <input type="number" min="0" step="0.01" className="input" value={form.credit_limit} onChange={e => setForm(f => ({...f, credit_limit: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving...' : editingCustomer ? 'Update' : 'Add Customer'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* View Customer Modal */}
      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Customer Details" size="lg">
        {viewingCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Name:</span> <span className="font-medium">{viewingCustomer.name}</span></div>
              <div><span className="text-slate-500">Phone:</span> <span className="font-medium">{viewingCustomer.phone || '-'}</span></div>
              <div><span className="text-slate-500">Email:</span> <span className="font-medium">{viewingCustomer.email || '-'}</span></div>
              <div><span className="text-slate-500">City:</span> <span className="font-medium">{viewingCustomer.city || '-'}</span></div>
              <div><span className="text-slate-500">Credit Limit:</span> <span className="font-medium">{formatCurrency(viewingCustomer.credit_limit || 0)}</span></div>
              <div><span className="text-slate-500">Credit Used:</span> <span className="font-medium text-amber-600">{formatCurrency(viewingCustomer.credit_used || 0)}</span></div>
            </div>
            <div>
              <div className="font-medium text-slate-700 mb-2">Last 5 Invoices</div>
              {customerInvoices.length === 0 ? (
                <div className="text-slate-400 text-sm">No invoices found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-2">Invoice</th><th className="text-left py-2">Date</th><th className="text-left py-2">Method</th><th className="text-right py-2">Total</th><th className="text-left py-2">Status</th></tr></thead>
                  <tbody>
                    {customerInvoices.map((inv: any, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-blue-600">{inv.invoice_number}</td>
                        <td className="py-2 text-slate-500">{inv.date}</td>
                        <td className="py-2 capitalize">{inv.payment_method}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(inv.total)}</td>
                        <td className="py-2"><span className={inv.status === 'paid' ? 'badge-green' : 'badge-yellow'}>{inv.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Customer" size="sm">
        <p className="text-slate-600 mb-4">Are you sure you want to delete this customer?</p>
        <div className="flex gap-3">
          <button className="btn-danger flex-1" onClick={() => handleDelete(deleteId!)}>Delete</button>
          <button className="btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
