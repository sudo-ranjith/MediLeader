import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Activity, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoggedIn } = useAuthStore();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  useEffect(() => {
    if (isLoggedIn) navigate('/dashboard');
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    checkForUsers();
  }, []);

  async function checkForUsers() {
    try {
      const res = await window.api.authHasAdmin();
      // Default to register tab only when we can confirm no admin exists yet
      if (res?.success && res?.data?.hasAdmin === false) setTab('register');
    } catch {
      // Default to login on any error
    } finally {
      setCheckingUsers(false);
    }
  }

  function switchTab(next: 'login' | 'register') {
    setTab(next);
    setError('');
    setSuccess('');
    setEmail('');
    setPassword('');
    setName('');
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const result = await window.api.authSetupAdmin(email, password, name || undefined);
      if (!result.success) {
        setError(result.error ?? 'Registration failed');
      } else {
        setSuccess('Account created! Please sign in.');
        switchTab('login');
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
      if (!result.success) {
        setError(result.error ?? 'Login failed');
      } else if (result.data?.token && result.data?.user) {
        login(result.data.token, result.data.user);
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
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Activity size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">MediLeader</h1>
          <p className="text-slate-500 text-sm mt-1">Pharmacy Management System</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign Up
          </button>
        </div>

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  onClick={() => {}}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
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
              {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : 'Sign In'}
            </button>
            <p className="text-center text-sm text-slate-500">
              Don't have an account?{' '}
              <button type="button" onClick={() => switchTab('register')} className="text-blue-600 hover:underline font-medium">
                Sign up
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                className="input"
                placeholder="Admin Name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                className="input"
                placeholder="admin@pharmacy.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
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
              {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : 'Create Account'}
            </button>
            <p className="text-center text-sm text-slate-500">
              Already have an account?{' '}
              <button type="button" onClick={() => switchTab('login')} className="text-blue-600 hover:underline font-medium">
                Sign in
              </button>
            </p>
          </form>
        )}

        <p className="text-center text-slate-400 text-xs mt-6">
          MediLeader — Made for Tamil Nadu Pharmacies
        </p>
      </div>
    </div>
  );
}
