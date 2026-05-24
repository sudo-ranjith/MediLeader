import { useState, useEffect } from 'react';
import { Save, Plus, Info, Download, Upload, RefreshCw } from 'lucide-react';
import Modal from '../components/Modal';
import { dbRun } from '../hooks/useDatabase';
import { useAuthStore } from '../stores/authStore';

interface Setting { key: string; value: string; }
interface User { id: number; email: string; role: string; is_active: number; }

type Tab = 'pharmacy' | 'sync' | 'users' | 'backup' | 'about';

export default function SettingsPage() {
  const { token, user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('pharmacy');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'cashier' });
  const [addUserError, setAddUserError] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [dataPath, setDataPath] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    loadSettings();
    loadUsers();
    window.api.getVersion().then(setAppVersion);
    window.api.getUserDataPath().then(setDataPath);
  }, []);

  async function loadSettings() {
    const rows = await window.api.dbSelect('SELECT key, value FROM settings', []) as Setting[];
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value || ''; });
    setSettings(map);
  }

  async function loadUsers() {
    const rows = await window.api.dbSelect('SELECT id, email, role, is_active FROM users ORDER BY id ASC', []) as User[];
    setUsers(rows);
  }

  function updateSetting(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    setSaveMsg('');
    try {
      const ops = Object.entries(settings).map(([key, value]) => ({
        sql: `UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`,
        params: [value, key],
      }));
      await window.api.dbTransaction(ops);
      setSaveMsg('Settings saved successfully!');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err: any) {
      setSaveMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddUserError('');
    if (newUser.password.length < 8) { setAddUserError('Password must be at least 8 characters'); return; }
    if (!token) { setAddUserError('Not authenticated'); return; }
    const result = await window.api.authCreateUser(newUser, token);
    if (result.error) { setAddUserError(result.error); return; }
    setShowAddUser(false);
    setNewUser({ email: '', password: '', role: 'cashier' });
    loadUsers();
  }

  async function toggleUserActive(userId: number, currentActive: number) {
    if (userId === currentUser?.id) { alert('Cannot deactivate your own account'); return; }
    await dbRun(`UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [currentActive ? 0 : 1, userId]);
    loadUsers();
  }

  async function handleManualSync() {
    if (!token) return;
    setSyncing(true);
    setSyncMsg('');
    const result = await window.api.syncManual(token);
    setSyncing(false);
    if (result.success) {
      setSyncMsg(`Sync complete — pulled: ${result.pulled}, pushed: ${result.pushed}`);
      loadSettings();
    } else {
      setSyncMsg('Sync failed: ' + result.error);
    }
  }

  async function handleBackupExport() {
    setBackupMsg('');
    const result = await window.api.backupExport();
    if (result.cancelled) return;
    if (result.success) {
      setBackupMsg('Backup exported to: ' + result.path);
    } else {
      setBackupMsg('Export failed: ' + result.error);
    }
  }

  async function handleBackupImport() {
    if (!confirm('Importing a backup will replace all current data and restart the app. Continue?')) return;
    setBackupMsg('');
    const result = await window.api.backupImport();
    if (result.cancelled) return;
    if (!result.success) {
      setBackupMsg('Import failed: ' + result.error);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pharmacy', label: 'Pharmacy Details' },
    { id: 'sync', label: 'Cloud Sync' },
    { id: 'users', label: 'User Management' },
    { id: 'backup', label: 'Backup & Restore' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="max-w-3xl space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {saveMsg && (
        <div className={`p-3 rounded-lg text-sm font-medium ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {saveMsg}
        </div>
      )}

      {/* Pharmacy Details */}
      {activeTab === 'pharmacy' && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-700">Pharmacy Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Pharmacy Name</label>
              <input className="input" value={settings.pharmacy_name || ''} onChange={e => updateSetting('pharmacy_name', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <textarea className="input resize-none" rows={2} value={settings.pharmacy_address || ''} onChange={e => updateSetting('pharmacy_address', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input className="input" value={settings.pharmacy_phone || ''} onChange={e => updateSetting('pharmacy_phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" className="input" value={settings.pharmacy_email || ''} onChange={e => updateSetting('pharmacy_email', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN</label>
              <input className="input font-mono" value={settings.pharmacy_gstin || ''} onChange={e => updateSetting('pharmacy_gstin', e.target.value)} placeholder="15-char GSTIN" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Prefix</label>
              <input className="input" value={settings.invoice_prefix || 'INV'} onChange={e => updateSetting('invoice_prefix', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">PO Prefix</label>
              <input className="input" value={settings.po_prefix || 'PO'} onChange={e => updateSetting('po_prefix', e.target.value)} />
            </div>
          </div>
          <button onClick={saveSettings} className="btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Cloud Sync */}
      {activeTab === 'sync' && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-700">Cloud Sync Settings</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Backend URL</label>
            <input className="input" value={settings.backend_url || ''} onChange={e => updateSetting('backend_url', e.target.value)} placeholder="https://your-api.railway.app" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Auto Sync</label>
            <button
              onClick={() => updateSetting('auto_sync', settings.auto_sync === 'true' ? 'false' : 'true')}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.auto_sync === 'true' ? 'bg-blue-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.auto_sync === 'true' ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sync Interval</label>
            <select className="select" value={settings.sync_interval || '15'} onChange={e => updateSetting('sync_interval', e.target.value)}>
              <option value="5">Every 5 minutes</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
            </select>
          </div>
          {settings.last_sync_time && (
            <div className="text-sm text-slate-500">Last synced: {settings.last_sync_time}</div>
          )}
          {syncMsg && (
            <div className={`p-3 rounded-lg text-sm border ${syncMsg.startsWith('Sync failed') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              {syncMsg}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={saveSettings} className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button onClick={handleManualSync} className="btn-secondary" disabled={syncing}>
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}

      {/* User Management */}
      {activeTab === 'users' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">User Management</h2>
            {currentUser?.role === 'admin' && (
              <button onClick={() => { setAddUserError(''); setShowAddUser(true); }} className="btn-primary text-sm">
                <Plus size={14} /> Add Staff
              </button>
            )}
          </div>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className={`flex items-center justify-between p-3 border rounded-lg ${!u.is_active ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
                <div>
                  <div className="font-medium text-slate-800">{u.email}</div>
                  <div className="text-xs text-slate-500 capitalize mt-0.5">{u.role} {u.id === currentUser?.id ? '(You)' : ''}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={u.is_active ? 'badge-green' : 'badge-gray'}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  {currentUser?.role === 'admin' && u.id !== currentUser?.id && (
                    <button
                      onClick={() => toggleUserActive(u.id, u.is_active)}
                      className={`text-xs px-2 py-1 rounded border ${u.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup & Restore */}
      {activeTab === 'backup' && (
        <div className="card space-y-5">
          <h2 className="font-semibold text-slate-700">Backup & Restore</h2>
          {backupMsg && (
            <div className={`p-3 rounded-lg text-sm border ${backupMsg.startsWith('Export failed') || backupMsg.startsWith('Import failed') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              {backupMsg}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Download size={20} className="text-blue-600" />
              </div>
              <div className="font-semibold text-slate-800">Export Backup</div>
              <p className="text-sm text-slate-500">Save a copy of the entire database (medicines, stock, invoices, customers, settings) to a file.</p>
              <button onClick={handleBackupExport} className="btn-primary w-full">
                <Download size={15} /> Export Database
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Upload size={20} className="text-amber-600" />
              </div>
              <div className="font-semibold text-slate-800">Import Backup</div>
              <p className="text-sm text-slate-500">Restore from a previously exported backup file. The app will restart automatically.</p>
              <button onClick={handleBackupImport} className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                <Upload size={15} /> Import & Restore
              </button>
            </div>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <strong>Warning:</strong> Importing a backup will permanently replace all current data. Make sure to export a backup of your current data first.
          </div>
        </div>
      )}

      {/* About */}
      {activeTab === 'about' && (
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <Info size={24} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-lg text-slate-800">Pharma Vault</div>
              <div className="text-slate-500 text-sm">Version {appVersion || '1.0.0'}</div>
            </div>
          </div>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="font-medium text-slate-700 mb-1">About</div>
              <p>Offline-first pharmacy management system built for Tamil Nadu pharmacies. Manages medicines, stock, billing with GST, purchase orders, and reports.</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="font-medium text-slate-700 mb-1">Data Location</div>
              <div className="font-mono text-xs text-slate-500 break-all">{dataPath}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="font-medium text-slate-700 mb-1">Tech Stack</div>
              <p>Electron + React + SQLite (better-sqlite3) + Tailwind CSS + Recharts</p>
            </div>
            <div className="text-center text-slate-400 text-xs mt-4">
              Made with care for Tamil Nadu pharmacies
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <Modal isOpen={showAddUser} onClose={() => setShowAddUser(false)} title="Add Staff Member" size="sm">
        <form onSubmit={handleAddUser} className="space-y-4">
          {addUserError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{addUserError}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input type="email" className="input" value={newUser.email} onChange={e => setNewUser(u => ({...u, email: e.target.value}))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password * (min 8 chars)</label>
            <input type="password" className="input" value={newUser.password} onChange={e => setNewUser(u => ({...u, password: e.target.value}))} required minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select className="select" value={newUser.role} onChange={e => setNewUser(u => ({...u, role: e.target.value}))}>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">Add User</button>
            <button type="button" className="btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
