import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface Conflict {
  id: number;
  entity_type: string;
  sync_id: string;
  created_at: string;
}

export default function ConflictsPage() {
  const { token } = useAuthStore();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await window.api.syncGetConflicts();
      setConflicts(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConflicts(); }, [loadConflicts]);

  async function handleResolve(id: number) {
    await window.api.syncResolveConflict(id);
    setConflicts(prev => prev.filter(c => c.id !== id));
  }

  async function handleResolveAll() {
    for (const c of conflicts) await window.api.syncResolveConflict(c.id);
    setConflicts([]);
  }

  async function handleManualSync() {
    if (!token) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await window.api.syncManual(token);
      if (result.success) {
        setSyncResult({ success: true, message: `Synced: pulled ${result.pulled}, pushed ${result.pushed}, conflicts ${result.conflicts}` });
        loadConflicts();
      } else {
        setSyncResult({ success: false, message: result.error || 'Sync failed' });
      }
    } finally {
      setSyncing(false);
    }
  }

  const entityLabel: Record<string, string> = {
    medicine: 'Medicine',
    customer: 'Customer',
    supplier: 'Supplier',
    stock: 'Stock',
    invoice: 'Invoice',
  };

  const entityColor: Record<string, string> = {
    medicine: 'badge-blue',
    customer: 'badge-green',
    supplier: 'badge-yellow',
    stock: 'badge-gray',
    invoice: 'badge-red',
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Sync Conflicts</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Records where local changes conflicted with server data (server version kept).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleManualSync} disabled={syncing} className="btn-primary text-sm">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          {conflicts.length > 0 && (
            <button onClick={handleResolveAll} className="btn-secondary text-sm">
              <CheckCircle size={14} /> Dismiss All
            </button>
          )}
        </div>
      </div>

      {syncResult && (
        <div className={`p-3 rounded-lg text-sm font-medium border ${syncResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {syncResult.message}
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : conflicts.length === 0 ? (
        <div className="card text-center py-16">
          <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
          <div className="font-medium text-slate-700">No conflicts</div>
          <div className="text-sm text-slate-500 mt-1">All data is in sync with the server.</div>
        </div>
      ) : (
        <div className="card p-0">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-amber-700 text-sm">
            <AlertTriangle size={16} />
            <span>{conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected. The server version was kept in each case.</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-500">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500">Sync ID</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500">Detected At</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map(c => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className={entityColor[c.entity_type] || 'badge-gray'}>
                      {entityLabel[c.entity_type] || c.entity_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 max-w-xs truncate">{c.sync_id}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleResolve(c.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      title="Dismiss conflict"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card bg-blue-50 border-blue-100 text-sm text-blue-700 space-y-1">
        <div className="font-medium">About Sync Conflicts</div>
        <p>A conflict occurs when you edited a record offline and the server also had a newer version of the same record. The server version is kept automatically. You can dismiss these notifications once reviewed.</p>
      </div>
    </div>
  );
}
