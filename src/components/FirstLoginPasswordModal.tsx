import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldAlert, ArrowRight, AlertCircle } from 'lucide-react';
import { changeTemporaryPassword, type ApiUser } from '../services/api';

interface FirstLoginPasswordModalProps {
  user: ApiUser;
  initialPassword?: string;
  onSuccess: (updatedUser: ApiUser) => void;
}

export default function FirstLoginPasswordModal({
  user,
  initialPassword = '',
  onSuccess,
}: FirstLoginPasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState(initialPassword);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword.trim()) {
      setError('Please enter your current temporary password.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Your new password must be at least 6 characters long.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('Your new password must be different from your temporary password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match. Please verify and retype.');
      return;
    }

    try {
      setLoading(true);
      const res = await changeTemporaryPassword(currentPassword, newPassword);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md bg-[#0f173b]/95 backdrop-blur-xl border border-amber-500/40 rounded-2xl shadow-2xl p-6 sm:p-8 z-10 transition-all duration-300">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 mb-4 ring-4 ring-amber-500/10">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">
          Password Change Required
        </h2>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            First-Time Security Setup
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Welcome, <span className="font-semibold text-white">{user.name}</span>! Your account was initialized with a temporary password by your Project Manager. Please set a new permanent password to access your dashboard.
        </p>
      </div>

      {/* Account Info Pill */}
      <div className="mb-5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
        <div>
          <span className="text-slate-400 block text-[11px]">Signed in as:</span>
          <span className="font-medium text-white">{user.email}</span>
        </div>
        <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold text-[11px]">
          {user.role}
        </span>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Temporary Password */}
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1.5">
            Current Temporary Password
          </label>
          <div className="relative rounded-xl shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="h-5 w-5" />
            </div>
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter temporary password"
              className="w-full pl-11 pr-11 py-2.5 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-amber-500/80 focus:border-transparent transition-all"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1.5">
            New Permanent Password
          </label>
          <div className="relative rounded-xl shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="h-5 w-5" />
            </div>
            <input
              type={showNewPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full pl-11 pr-11 py-2.5 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-amber-500/80 focus:border-transparent transition-all"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Confirm New Password */}
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1.5">
            Confirm New Password
          </label>
          <div className="relative rounded-xl shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="h-5 w-5" />
            </div>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full pl-11 pr-4 py-2.5 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-amber-500/80 focus:border-transparent transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-600/30 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span>Updating password...</span>
          ) : (
            <>
              <span>Save Password & Access Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
