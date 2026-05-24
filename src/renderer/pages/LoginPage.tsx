import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Activity, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoggedIn } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  useEffect(() => {
    if (isLoggedIn) navigate('/dashboard');
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    checkForUsers();
  }, []);

  async function checkForUsers() {
    try {
      const users = await window.api.dbSelect('SELECT COUNT(*) as count FROM users');
      const count = (users[0] as any)?.count || 0;
      if (count === 0) setIsSetup(true);
    } catch {
      setIsSetup(true);
    } finally {
      setCheckingUsers(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const result = await window.api.authSetupAdmin(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        setSetupDone(true);
        setIsSetup(false);
        setEmail('');
        setPassword('');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await window.api.authLogin(email, password);
      if (result.error) {
        setError(result.error);
      } else if (result.token && result.user) {
        login(result.token, result.user);
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  if (checkingUsers) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Activity size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Pharma Vault</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isSetup ? 'Create your admin account to get started' : setupDone ? 'Account created! Please sign in.' : 'Sign in to your account'}
          </p>
        </div>

        {setupDone && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Admin account created successfully. Please sign in.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              className="input"
              placeholder="admin@pharmacy.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input pr-10"
                placeholder={isSetup ? 'Min 8 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={isSetup ? 8 : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : isSetup ? 'Create Admin Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-slate-400 text-xs mt-6">
          Pharma Vault v1.0 — Made for Tamil Nadu Pharmacies
        </p>
      </div>
    </div>
  );
}
