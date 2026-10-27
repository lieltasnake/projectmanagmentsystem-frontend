import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, CheckCircle2, Info } from 'lucide-react';

interface LoginPageProps {
  onLogin?: (email: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps = {}) {
  // State for form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // State for frontend demo feedback
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  // Handle form submission (demonstration only, no backend)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setDemoMessage('Please fill in both email and password.');
      return;
    }

    setDemoMessage(
      `Frontend Demo: Signed in as "${email}" ${
        rememberMe ? '(Remember me active)' : ''
      }. Ready for PM, TL, or TM role routing!`
    );

    if (onLogin) {
      onLogin(email);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#070b19] overflow-hidden">
      {/* Background Decorative Ambient Glows (Navy & Purple accents) */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Centered Login Card */}
      <div className="relative w-full max-w-md bg-[#0f173b]/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl p-6 sm:p-8 z-10 transition-all duration-300 hover:border-purple-500/40">
        
        {/* System Header & Branding */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white shadow-lg shadow-purple-500/25 mb-4 ring-4 ring-purple-500/10">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Project Management System
          </h1>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              PMS Portal
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            Welcome back! Please enter your credentials to access your workspace.
          </p>
        </div>

        {/* Informational role pill (indicating single common login) */}
        <div className="mb-6 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
          <Info className="w-4 h-4 text-purple-400 shrink-0" />
          <span>Universal portal for <strong>PM</strong>, <strong>TL</strong>, and <strong>TM</strong></span>
        </div>

        {/* Demo Message Banner */}
        {demoMessage && (
          <div className="mb-5 p-3.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{demoMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
                className="w-full pl-11 pr-4 py-3 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 focus:border-transparent transition-all"
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
                className="w-full pl-11 pr-11 py-3 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 focus:border-transparent transition-all"
              />
              <button
                type="button"
                id="toggle-password-visibility"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-purple-300 transition-colors focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password Row */}
          <div className="flex items-center justify-between text-sm pt-1">
            <label className="flex items-center cursor-pointer select-none">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-[#0a0f26] text-purple-600 focus:ring-purple-500 focus:ring-offset-0 focus:ring-offset-transparent transition cursor-pointer"
              />
              <span className="ml-2 text-xs sm:text-sm text-slate-300 hover:text-white transition-colors">
                Remember me
              </span>
            </label>

            <button
              type="button"
              onClick={() => setDemoMessage('Password reset instructions would be sent in production.')}
              className="text-xs sm:text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors focus:outline-none underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            id="sign-in-btn"
            className="w-full mt-2 py-3.5 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-purple-500/80 focus:ring-offset-2 focus:ring-offset-[#0f173b] shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>Sign In</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        {/* Footer Note */}
        <div className="mt-7 text-center border-t border-slate-800/80 pt-4">
          <p className="text-xs text-slate-400">
            Secure login protected with role-based workspace permissions
          </p>
        </div>

      </div>
    </div>
  );
}
