import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Swords, User, Mail, Lock, Eye, EyeOff, KeyRound, MailCheck, ArrowLeft, ShieldCheck, Loader2, RefreshCw } from 'lucide-react';

const Login = ({ initialView, onResetComplete }) => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // --- Forgot Password State ---
  const [view, setView] = useState(initialView || 'auth'); // 'auth' | 'forgot' | 'inbox' | 'reset'
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);

  // --- Listen for PASSWORD_RECOVERY event from Supabase (fallback for unmounted scenarios) ---
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('reset');
        setResetError('');
        setResetSuccess('');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- Resend cooldown timer ---
  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(cooldownRef.current);
    }
  }, [resendCooldown]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username }
          }
        });

        if (error) throw error;

        // Profile is auto-created by the database trigger (handle_new_user)

        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // --- Send Password Reset Email ---
  const handleSendReset = async (e) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    setResetError('');

    try {
      const redirectUrl = window.location.origin + '/';
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: redirectUrl
      });
      if (error) throw error;
      setView('inbox');
      setResendCooldown(60);
    } catch (err) {
      setResetError(err.message || 'Failed to send reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  // --- Resend Reset Email ---
  const handleResend = async () => {
    if (resendCooldown > 0 || !resetEmail) return;
    setResetLoading(true);
    setResetError('');
    try {
      const redirectUrl = window.location.origin + '/';
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: redirectUrl
      });
      if (error) throw error;
      setResendCooldown(60);
      setResetSuccess('Reset link resent!');
      setTimeout(() => setResetSuccess(''), 3000);
    } catch (err) {
      setResetError(err.message || 'Failed to resend.');
    } finally {
      setResetLoading(false);
    }
  };

  // --- Update Password ---
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters.');
      return;
    }
    setResetLoading(true);
    setResetError('');

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetSuccess('Password updated successfully!');
      setTimeout(() => {
        setView('auth');
        setResetSuccess('');
        setNewPassword('');
        setConfirmPassword('');
        if (onResetComplete) onResetComplete(); // Clear recovery flag in App.jsx
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      setResetError(err.message || 'Failed to update password.');
    } finally {
      setResetLoading(false);
    }
  };

  const goBackToLogin = () => {
    setView('auth');
    setResetEmail('');
    setResetError('');
    setResetSuccess('');
    setNewPassword('');
    setConfirmPassword('');
  };

  // ==========================================
  //  RENDER: Forgot Password — Phase 1 (Email Input)
  // ==========================================
  if (view === 'forgot') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950">
        <div className="max-w-md w-full mx-auto p-6">
          <div className="text-center mb-8">
            <Swords className="mx-auto h-16 w-16 text-cyan-400 mb-4" />
            <h1 className="text-4xl font-bold text-slate-100 mb-2">The Socratic Arena</h1>
            <p className="text-lg text-slate-400">Where minds collide and ideas evolve</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
            <div className="text-center mb-6">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full animate-pulse"></div>
                <div className="relative bg-amber-500/10 border border-amber-500/30 rounded-full p-4">
                  <KeyRound className="h-8 w-8 text-amber-400" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-slate-100 mb-2">Reset Password</h2>
              <p className="text-sm text-slate-400">Enter the email linked to your account and we'll send you a reset link.</p>
            </div>

            {resetError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-500/50 text-red-200 text-sm">
                {resetError}
              </div>
            )}

            <form onSubmit={handleSendReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Mail className="inline w-4 h-4 mr-2" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  placeholder="your@email.com"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full rounded-lg bg-amber-500 px-6 py-3 text-lg font-semibold text-slate-950 transition-all duration-200 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-5 w-5" />
                    Send Reset Link
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={goBackToLogin}
                className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  //  RENDER: Forgot Password — Phase 2 (Check Inbox)
  // ==========================================
  if (view === 'inbox') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950">
        <div className="max-w-md w-full mx-auto p-6">
          <div className="text-center mb-8">
            <Swords className="mx-auto h-16 w-16 text-cyan-400 mb-4" />
            <h1 className="text-4xl font-bold text-slate-100 mb-2">The Socratic Arena</h1>
            <p className="text-lg text-slate-400">Where minds collide and ideas evolve</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
            <div className="text-center mb-6">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse"></div>
                <div className="relative bg-emerald-500/10 border border-emerald-500/30 rounded-full p-4">
                  <MailCheck className="h-8 w-8 text-emerald-400" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-slate-100 mb-2">Check Your Inbox</h2>
              <p className="text-sm text-slate-400 mt-2">
                We sent a password reset link to
              </p>
              <p className="text-cyan-400 font-bold text-sm mt-1">{resetEmail}</p>
            </div>

            {resetError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-500/50 text-red-200 text-sm">
                {resetError}
              </div>
            )}
            {resetSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-900/50 border border-emerald-500/50 text-emerald-200 text-sm">
                {resetSuccess}
              </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-5">
              <p className="text-xs text-slate-400 leading-relaxed">
                Click the link in the email to create a new password. The link will expire in 1 hour. 
                If you don't see it, check your <span className="text-slate-300 font-medium">spam folder</span>.
              </p>
            </div>

            <div className="text-center space-y-4">
              <button
                onClick={handleResend}
                disabled={resendCooldown > 0 || resetLoading}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${resetLoading ? 'animate-spin' : ''}`} />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}
              </button>

              <div>
                <button
                  onClick={goBackToLogin}
                  className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  //  RENDER: Forgot Password — Phase 3 (Set New Password)
  // ==========================================
  if (view === 'reset') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950">
        <div className="max-w-md w-full mx-auto p-6">
          <div className="text-center mb-8">
            <Swords className="mx-auto h-16 w-16 text-cyan-400 mb-4" />
            <h1 className="text-4xl font-bold text-slate-100 mb-2">The Socratic Arena</h1>
            <p className="text-lg text-slate-400">Where minds collide and ideas evolve</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
            <div className="text-center mb-6">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse"></div>
                <div className="relative bg-cyan-500/10 border border-cyan-500/30 rounded-full p-4">
                  <ShieldCheck className="h-8 w-8 text-cyan-400" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-slate-100 mb-2">Create New Password</h2>
              <p className="text-sm text-slate-400">Choose a strong password for your Socratic Arena account.</p>
            </div>

            {resetError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-500/50 text-red-200 text-sm">
                {resetError}
              </div>
            )}
            {resetSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-900/50 border border-emerald-500/50 text-emerald-200 text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {resetSuccess}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Lock className="inline w-4 h-4 mr-2" />
                  New Password
                </label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 pr-12 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="•••••••••"
                  minLength={6}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 bottom-3 text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <ShieldCheck className="inline w-4 h-4 mr-2" />
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full rounded-lg border bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:outline-none focus:ring-2 ${
                    confirmPassword && confirmPassword !== newPassword
                      ? 'border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20'
                      : confirmPassword && confirmPassword === newPassword
                        ? 'border-emerald-500/50 focus:border-emerald-500/50 focus:ring-emerald-500/20'
                        : 'border-slate-600 focus:border-cyan-500/50 focus:ring-cyan-500/20'
                  }`}
                  placeholder="•••••••••"
                  required
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-rose-400 text-xs mt-1.5 font-medium">Passwords do not match</p>
                )}
                {confirmPassword && confirmPassword === newPassword && (
                  <p className="text-emerald-400 text-xs mt-1.5 font-medium">Passwords match ✓</p>
                )}
              </div>

              <button
                type="submit"
                disabled={resetLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                className="w-full rounded-lg bg-cyan-500 px-6 py-3 text-lg font-semibold text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5" />
                    Update Password
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  //  RENDER: Default Auth (Login / Sign Up)
  // ==========================================
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950">
      <div className="max-w-md w-full mx-auto p-6">
        <div className="text-center mb-8">
          <div className="mb-4">
            <Swords className="mx-auto h-16 w-16 text-cyan-400 mb-4" />
          </div>
          <h1 className="text-4xl font-bold text-slate-100 mb-2">The Socratic Arena</h1>
          <p className="text-lg text-slate-400">Where minds collide and ideas evolve</p>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-slate-100 mb-6 text-center">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-500/50 text-red-200 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    placeholder="Choose a username"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Mail className="inline w-4 h-4 mr-2" />
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Lock className="inline w-4 h-4 mr-2" />
                  Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 pr-12 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  placeholder="•••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 bottom-0 h-[48px] flex items-center justify-center text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Forgot Password Link — only on Sign In */}
              {!isSignUp && (
                <div className="text-right -mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setView('forgot');
                      setResetEmail(email); // Pre-fill with current email if entered
                      setResetError('');
                    }}
                    className="text-xs text-cyan-400/80 hover:text-cyan-300 transition-colors font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-cyan-500 px-6 py-3 text-lg font-semibold text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-r-2 border-cyan-500 border-t-transparent"></div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <User className="mr-2 h-5 w-5" />
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </div>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
