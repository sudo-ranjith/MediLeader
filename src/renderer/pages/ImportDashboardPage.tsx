import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, RotateCcw, CheckCircle, XCircle, Clock, AlertTriangle, FileText, TrendingUp } from 'lucide-react';

interface Session {
  id: number;
  session_id: string;
  source_software: string;
  entity_type: string;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  failed_rows: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

const SOFTWARE_LABELS: Record<string, string> = {
  marg: 'Marg ERP', wings: 'Wings', busy: 'Busy', gofrugal: 'GoFrugal',
  retailgraph: 'RetailGraph', medico: 'Medico', excel: 'Excel',
  generic_csv: 'CSV / Custom',
};
const ENTITY_LABELS: Record<string, string> = {
  medicines: 'Medicine Master', batches: 'Stock / Batches',
  customers: 'Customers', suppliers: 'Suppliers',
};
const STATUS_CONFIG: Record<string, { label: string; icon: any; cls: string }> = {
  completed:   { label: 'Completed',   icon: CheckCircle,    cls: 'text-green-600 bg-green-50' },
  rolled_back: { label: 'Rolled Back', icon: RotateCcw,      cls: 'text-slate-500 bg-slate-100' },
  failed:      { label: 'Failed',      icon: XCircle,        cls: 'text-red-600 bg-red-50' },
  importing:   { label: 'In Progress', icon: Clock,          cls: 'text-blue-600 bg-blue-50' },
  ready:       { label: 'Ready',       icon: AlertTriangle,  cls: 'text-amber-600 bg-amber-50' },
  analyzed:    { label: 'Analyzed',    icon: FileText,       cls: 'text-slate-500 bg-slate-100' },
  pending:     { label: 'Pending',     icon: Clock,          cls: 'text-slate-400 bg-slate-50' },
};

export default function ImportDashboardPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await window.api.migrationHistory();
    if (res.success) setSessions(res.data);
    setLoading(false);
  }

  async function handleRollback(session: Session) {
    if (!confirm(`Roll back import "${session.file_name}"? This will delete ${session.imported_rows} imported records.`)) return;
    setRolling(session.session_id);
    const res = await window.api.migrationRollback(session.session_id);
    setRolling(null);
    if (res.success) {
      alert(`Rolled back ${res.data.rolledBack} records.`);
      load();
    } else {
      alert(res.error ?? 'Rollback failed');
    }
  }

  const totalImported = sessions.filter(s => s.status === 'completed').reduce((s, r) => s + r.imported_rows, 0);
  const totalFailed   = sessions.filter(s => s.status === 'completed').reduce((s, r) => s + r.failed_rows, 0);
  const completedSessions = sessions.filter(s => s.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Data Import & Migration</h1>
          <p className="text-sm text-slate-500 mt-0.5">Import from Marg, Wings, Busy, GoFrugal, Excel or any CSV</p>
        </div>
        <button onClick={() => navigate('/import/wizard')} className="btn-primary flex items-center gap-2">
          <Upload size={16} /> New Import
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Imports', value: sessions.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Completed', value: completedSessions, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Records Imported', value: totalImported.toLocaleString(), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Failed Rows', value: totalFailed.toLocaleString(), icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
        ].map(stat => (
          <div key={stat.label} className="card">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon size={20} className={stat.color} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Session table */}
      <div className="card p-0">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">Import History</h2>
          <button onClick={load} className="text-sm text-slate-400 hover:text-slate-600">Refresh</button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-16 text-center">
            <Upload size={40} className="mx-auto mb-3 text-slate-300" />
            <div className="text-slate-500 font-medium">No imports yet</div>
            <div className="text-slate-400 text-sm mt-1">Start by clicking "New Import" above</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-slate-500">File</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Source</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Total</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Imported</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Skipped</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Failed</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                return (
                  <tr key={s.session_id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-medium text-slate-700 truncate max-w-xs" title={s.file_name}>{s.file_name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{ENTITY_LABELS[s.entity_type] ?? s.entity_type}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{SOFTWARE_LABELS[s.source_software] ?? s.source_software}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{s.total_rows}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium">{s.imported_rows}</td>
                    <td className="px-4 py-3 text-right text-amber-500">{s.skipped_rows}</td>
                    <td className="px-4 py-3 text-right text-red-500">{s.failed_rows}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cfg.cls}`}>
                        <Icon size={12} /> {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{s.created_at?.slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-4 py-3">
                      {s.status === 'completed' && s.imported_rows > 0 && (
                        <button
                          onClick={() => handleRollback(s)}
                          disabled={rolling === s.session_id}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                        >
                          <RotateCcw size={12} /> {rolling === s.session_id ? '...' : 'Rollback'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
