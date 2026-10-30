import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, CheckCircle2, Info, AlertCircle, KeyRound } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // First-login password change state
  const [pendingPasswordChangeUser, setPendingPasswordChangeUser] = useState<ApiUser | null>(null);
  const [pendingInitialPassword, setPendingInitialPassword] = useState('');

  // Quick preset accounts for convenience
  const handleSelectPreset = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setErrorMessage(null);
  };

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
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#070b19] overflow-hidden">
      {/* Background Decorative Ambient Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Render First-Login Password Change Modal if required */}
      {pendingPasswordChangeUser ? (
        <FirstLoginPasswordModal
          user={pendingPasswordChangeUser}
          initialPassword={pendingInitialPassword}
          onSuccess={handlePasswordChangeComplete}
        />
      ) : (
        /* Main Centered Login Card */
        <div className="relative w-full max-w-md bg-[#0f173b]/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl p-6 sm:p-8 z-10 transition-all duration-300 hover:border-purple-500/40">
          
          {/* System Header & Branding */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white shadow-lg shadow-purple-500/25 mb-4 ring-4 ring-purple-500/10">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Project Management System
            </h1>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                Single Sign-On Portal
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              Enter your credentials to access your PMS workspace.
            </p>
          </div>

          {/* Informational role pill (indicating single common login) */}
          <div className="mb-5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
            <Info className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Universal portal for <strong>PM</strong>, <strong>TL</strong>, <strong>TM</strong>, and <strong>Tester</strong></span>
          </div>

          {/* Quick select verified test accounts */}
          <div className="mb-5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <span className="text-slate-400 block mb-2 font-medium flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-purple-400" />
              Quick fill existing demo accounts:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectPreset('pm@pms.local', 'PmPassword123!')}
                className="px-2.5 py-1 rounded-lg bg-[#141e4b] hover:bg-purple-600/30 text-slate-200 hover:text-white border border-slate-700/80 transition-all text-[11px] flex items-center gap-1.5 cursor-pointer"
              >
                <span className="font-semibold text-purple-300">PM</span>
                <span>Alex Morgan</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('tl@pms.local', 'TlPassword123!')}
                className="px-2.5 py-1 rounded-lg bg-[#141e4b] hover:bg-purple-600/30 text-slate-200 hover:text-white border border-slate-700/80 transition-all text-[11px] flex items-center gap-1.5 cursor-pointer"
              >
                <span className="font-semibold text-indigo-300">TL</span>
                <span>Jordan Lee</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('tm@pms.local', 'TmPassword123!')}
                className="px-2.5 py-1 rounded-lg bg-[#141e4b] hover:bg-purple-600/30 text-slate-200 hover:text-white border border-slate-700/80 transition-all text-[11px] flex items-center gap-1.5 cursor-pointer"
              >
                <span className="font-semibold text-emerald-300">TM</span>
                <span>Taylor Smith</span>
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Success Message Banner */}
          {successMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{successMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-200 mb-1.5">
                Email Address
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
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
                  className="w-full pl-11 pr-4 py-2.5 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-200 mb-1.5">
                Password
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
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
                  className="w-full pl-11 pr-11 py-2.5 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  id="toggle-password-visibility"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-purple-300 transition-colors focus:outline-none cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Governance Notice */}
            <div className="text-[11px] text-slate-400 bg-slate-900/40 p-2 rounded-lg border border-slate-800/80">
              <span>Account registration is governed by the Project Manager. If you do not have an account, please contact your manager.</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
