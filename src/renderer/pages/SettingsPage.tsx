import { useState, useEffect } from 'react';
import { Save, RefreshCw, Plus, Trash2, Shield, Info } from 'lucide-react';
import { dbRun, dbSelect } from '../hooks/useDatabase';
import { useAuthStore } from '../stores/authStore';
import Modal from '../components/Modal';

export default function SettingsPage() {
  const { user, token } = useAuthStore();
  const [activeSection, setActiveSection] = useState('pharmacy');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addUserModal, setAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'cashier' });
  const [userError, setUserError] = useState('');
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => { loadSettings(); loadUsers(); loadVersion(); }, []);

  async function loadVersion() {
    try { const v = await window.api.getVersion(); setVersion(v); } catch {}
  }

  async function loadSettings() {
    const rows = await dbSelect<{ key: string; value: string }>('SELECT key, value FROM settings', []);
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value || ''; });
    setSettings(map);
  }

  async function loadUsers() {
    const u = await window.api.dbSelect('SELECT id, email, role, is_active, created_at FROM users ORDER BY id', []);
    setUsers(u as any[]);
  }

  function setSetting(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function saveSettings(keys: string[]) {
    setSaving(true);
    try {
      for (const key of keys) {
        await dbRun('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)', [key, settings[key] || '']);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  async function handleAddUser() {
    setUserError('');
    if (!newUser.email || !newUser.password) { setUserError('Email and password required'); return; }
    if (newUser.password.length < 8) { setUserError('Password must be at least 8 characters'); return; }
    const result = await window.api.authCreateUser(newUser, token || '');
    if (result.error) { setUserError(result.error); return; }
    setAddUserModal(false);
    setNewUser({ email: '', password: '', role: 'cashier' });
    loadUsers();
  }

  async function toggleUser(id: number, active: number) {
    await dbRun('UPDATE users SET is_active=? WHERE id=?', [active ? 0 : 1, id]);
    loadUsers();
  }

  const sections = [
    { id: 'pharmacy', label: 'Pharmacy Details' },
    { id: 'sync', label: 'Cloud Sync' },
    { id: 'users', label: 'User Management' },
    { id: 'about', label: 'About' },
  ];

  const pharmacyKeys = ['pharmacy_name', 'pharmacy_address', 'pharmacy_phone', 'pharmacy_email', 'pharmacy_gstin'];
  const syncKeys = ['backend_url', 'auto_sync', 'sync_interval'];

  return (
    <div className="flex gap-6">
      {/* Sidebar nav */}
      <div className="w-48 flex-shrink-0">
        <div className="card p-2 space-y-1">
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === s.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-2xl">
        {saved && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
            Settings saved successfully!
          </div>
        )}

        {/* Pharmacy Details */}
        {activeSection === 'pharmacy' && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-slate-700 text-lg">Pharmacy Details</h3>
            <p className="text-sm text-slate-500">This information will appear on invoices and reports.</p>
            {[
              { key: 'pharmacy_name', label: 'Pharmacy Name', placeholder: 'Your Pharmacy Name' },
              { key: 'pharmacy_address', label: 'Address', placeholder: 'Street, City, State' },
              { key: 'pharmacy_phone', label: 'Phone Number', placeholder: '+91 9876543210' },
              { key: 'pharmacy_email', label: 'Email', placeholder: 'pharmacy@email.com' },
              { key: 'pharmacy_gstin', label: 'GSTIN', placeholder: '22AAAAA0000A1Z5' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                <input className="input" value={settings[f.key] || ''} onChange={e => setSetting(f.key, e.target.value)} placeholder={f.placeholder} />
              </div>
            ))}
            <button onClick={() => saveSettings(pharmacyKeys)} className="btn-primary" disabled={saving}>
              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <><Save size={16} />Save Details</>}
            </button>
          </div>
        )}

        {/* Cloud Sync */}
        {activeSection === 'sync' && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-slate-700 text-lg">Cloud Sync Settings</h3>
            <p className="text-sm text-slate-500">Configure sync with your Pharma Vault cloud backend (Pro plan required).</p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Backend URL</label>
              <input className="input" value={settings.backend_url || ''} onChange={e => setSetting('backend_url', e.target.value)} placeholder="https://your-api.railway.app" />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700">Auto Sync</div>
                <div className="text-xs text-slate-500">Automatically sync data with cloud</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer"
                  checked={settings.auto_sync === 'true'}
                  onChange={e => setSetting('auto_sync', e.target.checked ? 'true' : 'false')} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sync Interval</label>
              <select className="select" value={settings.sync_interval || '15'} onChange={e => setSetting('sync_interval', e.target.value)}>
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every hour</option>
              </select>
            </div>

            {settings.last_sync_time && (
              <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                Last synced: {new Date(settings.last_sync_time).toLocaleString()}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => saveSettings(syncKeys)} className="btn-primary" disabled={saving}>
                <Save size={16} />Save Settings
              </button>
              <button className="btn-secondary"><RefreshCw size={16} />Sync Now</button>
            </div>
          </div>
        )}

        {/* User Management */}
        {activeSection === 'users' && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 text-lg">User Management</h3>
              {user?.role === 'admin' && (
                <button onClick={() => { setUserError(''); setAddUserModal(true); }} className="btn-primary text-sm">
                  <Plus size={16} />Add Staff
                </button>
              )}
            </div>

            {user?.role !== 'admin' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-center gap-2">
                <Shield size={16} />Only admins can manage users.
              </div>
            )}

            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <div className="font-medium text-sm">{u.email}</div>
                    <div className="text-xs text-slate-500 capitalize">{u.role} • {u.is_active ? 'Active' : 'Inactive'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={u.is_active ? 'badge-green' : 'badge-gray'}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    {user?.role === 'admin' && u.id !== user.id && (
                      <button onClick={() => toggleUser(u.id, u.is_active)} className="p-1.5 rounded hover:bg-slate-200 text-slate-500 text-xs">
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* About */}
        {activeSection === 'about' && (
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <Info size={24} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-800">Pharma Vault</h3>
                <p className="text-slate-500 text-sm">Version {version}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              <p><strong>Built for:</strong> Independent Pharmacies in Tamil Nadu</p>
              <p><strong>Features:</strong> Offline-first, GST billing, inventory management, cloud sync</p>
              <p><strong>Support:</strong> WhatsApp / Email</p>
              <p><strong>Pricing:</strong> Free (desktop) | Pro ₹999/month (cloud sync)</p>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="font-medium text-blue-700 text-sm">Pro Plan Benefits</div>
              <ul className="mt-2 space-y-1 text-blue-600 text-xs">
                <li>• Cloud sync across multiple devices</li>
                <li>• Up to 3 staff accounts</li>
                <li>• Advanced analytics & reports</li>
                <li>• Priority WhatsApp support</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <Modal isOpen={addUserModal} onClose={() => setAddUserModal(false)} title="Add Staff Account" size="sm">
        {userError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{userError}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" className="input" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="staff@pharmacy.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input type="password" className="input" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Min 8 characters" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select className="select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setAddUserModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleAddUser} className="btn-primary"><Plus size={16} />Create Account</button>
        </div>
      </Modal>
    </div>
  );
}
