import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import type { TeamMember, UserRole } from '../types/pms';
import { login, dbRoleToDisplayRole, type ApiUser } from '../services/api';
import FirstLoginPasswordModal from './FirstLoginPasswordModal';

export type { UserRole };

interface LoginPageProps {
  onLogin?: (email: string, role?: UserRole, name?: string) => void;
  teamMembers?: TeamMember[];
}

export default function LoginPage({ onLogin }: LoginPageProps = {}) {
  // Form input state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // First-login password change state
  const [pendingPasswordChangeUser, setPendingPasswordChangeUser] = useState<ApiUser | null>(null);
  const [pendingInitialPassword, setPendingInitialPassword] = useState('');

  // Form submission connecting to real backend API
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();

    if (!trimmedEmail || !trimmedPass) {
      setErrorMessage('Please enter both an email address and a password.');
      return;
    }

    try {
      setLoading(true);
      const res = await login(trimmedEmail, trimmedPass);

      if (res.mustChangePassword) {
        // Must change temporary password before dashboard access
        setPendingInitialPassword(trimmedPass);
        setPendingPasswordChangeUser(res.user);
        return;
      }

      setSuccessMessage(`Welcome back, ${res.user.name}! Accessing workspace...`);
      const displayRole = dbRoleToDisplayRole(res.user.role);

      setTimeout(() => {
        if (onLogin) {
          onLogin(res.user.email, displayRole, res.user.name);
        }
      }, 500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please verify your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeComplete = (updatedUser: ApiUser) => {
    setPendingPasswordChangeUser(null);
    setSuccessMessage(`Password updated successfully! Welcome to your dashboard, ${updatedUser.name}.`);
    const displayRole = dbRoleToDisplayRole(updatedUser.role);

    setTimeout(() => {
      if (onLogin) {
        onLogin(updatedUser.email, displayRole, updatedUser.name);
      }
    }, 600);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#070b19] overflow-hidden">
      {/* Background Decorative Ambient Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-accent-soft rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent-soft rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-accent-soft/40 rounded-full blur-[120px] pointer-events-none" />

      {/* Render First-Login Password Change Modal if required */}
      {pendingPasswordChangeUser ? (
        <FirstLoginPasswordModal
          user={pendingPasswordChangeUser}
          initialPassword={pendingInitialPassword}
          onSuccess={handlePasswordChangeComplete}
        />
      ) : (
        <div className="w-full max-w-[420px] z-10">
          {/* Main Centered Login Card */}
          <div className="bg-[#0f173b]/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl p-7 sm:p-8 transition-all duration-300 hover:border-accent/40">
            {/* System Header & Branding */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-accent to-accent-hover text-white shadow-lg shadow-accent/25 mb-3.5 ring-4 ring-accent/10">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Welcome back
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Sign in to your PMS workspace
              </p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-5 p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            {/* Success Message Banner */}
            {successMessage && (
              <div className="mb-5 p-3 rounded-xl bg-accent-soft border border-accent/40 text-accent-light text-xs flex items-start gap-2.5 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-accent-light shrink-0 mt-0.5" />
                <span className="leading-snug">{successMessage}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setErrorMessage('Please contact your administrator to reset your password.')}
                    className="text-xs text-accent-light hover:underline transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-11 py-2.5 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    id="toggle-password-visibility"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-accent-light transition-colors focus:outline-none cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Remember this device</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-accent to-accent-hover hover:from-accent hover:to-accent-hover shadow-lg shadow-accent/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <span>Signing in...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Minimalist Professional Footer */}
          <div className="mt-6 text-center text-xs text-slate-500">
            <span>Project Management System &bull; Secure Enterprise Portal</span>
          </div>
        </div>
      )}
    </div>
  );
}
