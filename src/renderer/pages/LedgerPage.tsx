import { useState, useEffect } from 'react';
import { Users, Truck, TrendingUp, TrendingDown } from 'lucide-react';

type LedgerTab = 'customer' | 'supplier';

export default function LedgerPage() {
  const [tab, setTab]           = useState<LedgerTab>('customer');
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [ledger, setLedger]     = useState<any | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => { loadOutstanding(); }, [tab]);

  const loadOutstanding = async () => {
    setLoading(true);
    try {
      if (tab === 'customer') {
        const res = await window.api.ledgerCustomerOutstanding();
        if (res.success) setCustomers(res.data);
      } else {
        const res = await window.api.ledgerSupplierOutstanding();
        if (res.success) setSuppliers(res.data);
      }
    } finally { setLoading(false); }
  };

  const loadLedger = async (entity: any) => {
    setSelected(entity);
    setLoading(true);
    try {
      const res = tab === 'customer'
        ? await window.api.customerLedger(entity.id, fromDate || undefined, toDate || undefined)
        : await window.api.supplierLedger(entity.id, fromDate || undefined, toDate || undefined);
      if (res.success) setLedger(res.data);
    } finally { setLoading(false); }
  };

  const list = tab === 'customer' ? customers : suppliers;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ledger</h1>
        <p className="text-gray-500 text-sm mt-1">Customer & Supplier account statements</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'customer', label: 'Customers', icon: <Users size={16} /> },
          { id: 'supplier', label: 'Suppliers', icon: <Truck size={16} /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id as LedgerTab); setSelected(null); setLedger(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t.id ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Entity list */}
        <div className="w-72 shrink-0">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-sm font-medium">
              {tab === 'customer' ? 'Outstanding Customers' : 'Outstanding Suppliers'}
            </div>
            {loading && !selected && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">Loading...</div>
            )}
            {list.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">No outstanding accounts</div>
            )}
            {list.map(entity => (
              <div
                key={entity.id}
                onClick={() => loadLedger(entity)}
                className={`px-4 py-3 border-b cursor-pointer hover:bg-gray-50 ${
                  selected?.id === entity.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="font-medium text-sm">{entity.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{entity.phone}</div>
                <div className="text-sm font-bold text-red-600 mt-1">
                  ₹{(entity.credit_used ?? entity.outstanding ?? 0).toFixed(2)} due
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ledger panel */}
        <div className="flex-1">
          {!selected ? (
            <div className="bg-white rounded-xl border flex items-center justify-center h-64 text-gray-400">
              Select a {tab} to view ledger
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white rounded-xl border p-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold">{selected.name}</div>
                  <div className="text-sm text-gray-500">{selected.phone}</div>
                </div>
                <div className="text-right">
                  {tab === 'customer' ? (
                    <>
                      <div className="text-sm text-gray-500">Credit Limit / Used</div>
                      <div className="text-lg font-bold">
                        ₹{(selected.credit_limit ?? 0).toFixed(2)} / ₹{(selected.credit_used ?? 0).toFixed(2)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-gray-500">Outstanding</div>
                      <div className="text-lg font-bold text-red-600">₹{(selected.outstanding ?? 0).toFixed(2)}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Date filter */}
              <div className="flex gap-4 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    className="border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    className="border rounded px-3 py-2 text-sm" />
                </div>
                <button onClick={() => loadLedger(selected)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  Filter
                </button>
              </div>

              {/* Opening/Closing balance */}
              {ledger && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border p-4">
                      <div className="text-sm text-gray-500">Opening Balance</div>
                      <div className="text-xl font-bold">₹{(ledger.openingBalance ?? 0).toFixed(2)}</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                      <div className="text-sm text-gray-500">Closing Balance</div>
                      <div className={`text-xl font-bold ${(ledger.closingBalance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{Math.abs(ledger.closingBalance ?? 0).toFixed(2)}
                        {ledger.closingBalance > 0 ? ' Dr' : ' Cr'}
                      </div>
                    </div>
                  </div>

                  {/* Ledger entries */}
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Reference</th>
                          <th className="px-4 py-3 text-left">Narration</th>
                          <th className="px-4 py-3 text-right">Debit</th>
                          <th className="px-4 py-3 text-right">Credit</th>
                          <th className="px-4 py-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.entries?.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No transactions</td></tr>
                        )}
                        {ledger.entries?.map((entry: any) => (
                          <tr key={entry.id} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600">{entry.entry_date}</td>
                            <td className="px-4 py-3 font-mono text-xs">{entry.reference_number}</td>
                            <td className="px-4 py-3 text-gray-600">{entry.narration}</td>
                            <td className="px-4 py-3 text-right">
                              {entry.debit > 0 ? (
                                <span className="text-red-600 flex items-center justify-end gap-1">
                                  <TrendingUp size={12} /> ₹{entry.debit.toFixed(2)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.credit > 0 ? (
                                <span className="text-green-600 flex items-center justify-end gap-1">
                                  <TrendingDown size={12} /> ₹{entry.credit.toFixed(2)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              ₹{Math.abs(entry.balance).toFixed(2)}
                              <span className="text-xs ml-1 text-gray-400">
                                {entry.balance >= 0 ? 'Dr' : 'Cr'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
