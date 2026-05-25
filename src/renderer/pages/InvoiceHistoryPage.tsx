import { useState, useEffect, useRef } from 'react';
import { Search, Eye, Printer, XCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from '../components/Modal';
import { useAuthStore } from '../stores/authStore';

interface Invoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_id?: number;
  invoice_date: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  paid_amount: number;
  payment_method: string;
  status: string;
  supply_type: string;
}

const STATUS_STYLES: Record<string, string> = {
  paid:      'bg-green-100 text-green-700',
  credit:    'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-600',
  partial:   'bg-blue-100 text-blue-700',
};

const fmt = (n: number) => `₹${(n ?? 0).toFixed(2)}`;
const PAGE_SIZE = 20;

export default function InvoiceHistoryPage() {
  const { user } = useAuthStore();
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(0);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [fromDate, setFromDate]   = useState('');
  const [toDate, setToDate]       = useState('');

  const [viewInvoice, setViewInvoice]       = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail]   = useState(false);
  const [cancelling, setCancelling]         = useState(false);
  const [printing, setPrinting]             = useState<'thermal' | 'a4' | null>(null);
  const searchTimer                          = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [search, status, fromDate, toDate, page]);

  async function load() {
    setLoading(true);
    const res = await window.api.invoiceList({
      search:   search   || undefined,
      fromDate: fromDate || undefined,
      toDate:   toDate   || undefined,
      status:   status   || undefined,
      limit:    PAGE_SIZE,
      offset:   page * PAGE_SIZE,
    });
    if (res.success) {
      setInvoices(res.data.rows ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }

  async function openDetail(inv: Invoice) {
    setLoadingDetail(true);
    setViewInvoice({ ...inv, items: [] });
    const res = await window.api.invoiceGet(inv.id);
    if (res.success) setViewInvoice(res.data);
    setLoadingDetail(false);
  }

  async function handleCancel() {
    if (!viewInvoice) return;
    if (!confirm(`Cancel invoice ${viewInvoice.invoice_number}? This cannot be undone.`)) return;
    setCancelling(true);
    const res = await window.api.invoiceCancel(viewInvoice.id, user?.id ?? 1);
    setCancelling(false);
    if (!res.success) { alert(res.error ?? 'Cancel failed'); return; }
    setViewInvoice((v: any) => ({ ...v, status: 'cancelled' }));
    load();
  }

  async function handlePrint(type: 'thermal' | 'a4') {
    if (!viewInvoice) return;
    setPrinting(type);
    if (type === 'thermal') await window.api.printInvoiceThermal(viewInvoice.id);
    else                    await window.api.printInvoiceA4(viewInvoice.id);
    setPrinting(null);
  }

  function resetFilters() {
    setFromDate(''); setToDate(''); setStatus(''); setSearch(''); setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(fromDate || toDate || status || search);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Invoice History</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Loading…' : `${total} invoice${total !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8 text-sm"
            placeholder="Invoice # or customer name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select
          className="input text-sm w-36"
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(0); }}
        >
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="credit">Credit</option>
          <option value="partial">Partial</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="date"
          className="input text-sm w-40"
          value={fromDate}
          onChange={e => { setFromDate(e.target.value); setPage(0); }}
        />
        <span className="text-slate-400 text-sm">to</span>
        <input
          type="date"
          className="input text-sm w-40"
          value={toDate}
          onChange={e => { setToDate(e.target.value); setPage(0); }}
        />
        {hasFilters && (
          <button className="btn-secondary text-sm" onClick={resetFilters}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="card p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Total</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Paid</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Method</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400 text-sm">Loading…</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <FileText size={40} className="mx-auto mb-3 text-slate-300" />
                  <div className="text-slate-500 font-medium">No invoices found</div>
                  {hasFilters && (
                    <div className="text-slate-400 text-sm mt-1">Try adjusting your filters</div>
                  )}
                </td>
              </tr>
            ) : invoices.map(inv => (
              <tr
                key={inv.id}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => openDetail(inv)}
              >
                <td className="px-4 py-3 font-medium text-blue-600">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-slate-700">{inv.customer_name}</td>
                <td className="px-4 py-3 text-slate-500">{inv.invoice_date}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(inv.total_amount)}</td>
                <td className="px-4 py-3 text-right text-slate-500">{fmt(inv.paid_amount)}</td>
                <td className="px-4 py-3 capitalize text-slate-500">{inv.payment_method}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    className="p-1.5 rounded hover:bg-slate-200 text-slate-400 transition-colors"
                    onClick={e => { e.stopPropagation(); openDetail(inv); }}
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-1">{page + 1} / {totalPages}</span>
              <button
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={!!viewInvoice}
        onClose={() => setViewInvoice(null)}
        title={viewInvoice?.invoice_number ?? 'Invoice Detail'}
        size="xl"
      >
        {viewInvoice && (
          <div className="space-y-4">
            {/* Header grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm bg-slate-50 rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer</span>
                <span className="font-medium">{viewInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date</span>
                <span className="font-medium">{viewInvoice.invoice_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment</span>
                <span className="capitalize font-medium">{viewInvoice.payment_method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Supply Type</span>
                <span className="capitalize font-medium">{viewInvoice.supply_type}</span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-slate-500">Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[viewInvoice.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {viewInvoice.status}
                </span>
              </div>
            </div>

            {/* Items table */}
            {loadingDetail ? (
              <div className="text-center py-6 text-slate-400 text-sm">Loading items…</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Medicine</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Batch</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Qty</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Rate</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">GST%</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Disc%</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewInvoice.items ?? []).map((item: any) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{item.medicine_name}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-xs">{item.batch_number || '—'}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{fmt(item.unit_price)}</td>
                        <td className="px-3 py-2 text-right">{item.gst_rate}%</td>
                        <td className="px-3 py-2 text-right">{item.discount_pct || 0}%</td>
                        <td className="px-3 py-2 text-right font-medium">{fmt(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{fmt((viewInvoice.total_amount ?? 0) - (viewInvoice.tax_amount ?? 0) + (viewInvoice.discount_amount ?? 0))}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>GST</span>
                  <span>{fmt(viewInvoice.tax_amount)}</span>
                </div>
                {(viewInvoice.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{fmt(viewInvoice.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-1.5">
                  <span>Total</span>
                  <span>{fmt(viewInvoice.total_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Paid</span>
                  <span>{fmt(viewInvoice.paid_amount)}</span>
                </div>
                {(viewInvoice.total_amount - viewInvoice.paid_amount) > 0.01 && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Balance</span>
                    <span>{fmt(viewInvoice.total_amount - viewInvoice.paid_amount)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                className="btn-secondary flex items-center gap-1.5 text-sm"
                onClick={() => handlePrint('thermal')}
                disabled={printing !== null}
              >
                <Printer size={14} />
                {printing === 'thermal' ? 'Printing…' : 'Thermal Print'}
              </button>
              <button
                className="btn-secondary flex items-center gap-1.5 text-sm"
                onClick={() => handlePrint('a4')}
                disabled={printing !== null}
              >
                <Printer size={14} />
                {printing === 'a4' ? 'Printing…' : 'A4 Print'}
              </button>
              {viewInvoice.status !== 'cancelled' && (
                <button
                  className="btn-danger flex items-center gap-1.5 text-sm ml-auto"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  <XCircle size={14} />
                  {cancelling ? 'Cancelling…' : 'Cancel Invoice'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
