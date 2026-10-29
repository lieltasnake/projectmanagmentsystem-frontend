import React, { useState, useEffect } from 'react';
import {
  User,
  Palette,
  Bell,
  Info,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Moon,
  Sun,
  AlertCircle,
  Sparkles,
  Check,
  RotateCcw,
  Clock,
  Send,
} from 'lucide-react';
import type {
  UserProfile,
  UserRole,
  NotificationPreferences,
  AppearanceSettings,
  Task,
  Project,
} from '../types/pms';

interface SettingsPageProps {
  userProfile: UserProfile;
  currentUserRole: UserRole;
  notificationPreferences: NotificationPreferences;
  appearanceSettings: AppearanceSettings;
  tasks?: Task[];
  projects?: Project[];
  onUpdateProfile: (updated: UserProfile) => void;
  onUpdateNotificationPreferences: (updated: NotificationPreferences) => void;
  onUpdateAppearance: (updated: AppearanceSettings) => void;
}

export default function SettingsPage({
  userProfile,
  currentUserRole,
  notificationPreferences,
  appearanceSettings,
  tasks = [],
  projects: _projects = [],
  onUpdateProfile,
  onUpdateNotificationPreferences,
  onUpdateAppearance,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'notifications' | 'about'>('profile');

  // Local form state for Profile
  const [fullName, setFullName] = useState(userProfile.name);
  const [email, setEmail] = useState(userProfile.email);
  const [department, setDepartment] = useState(userProfile.department || 'Engineering & Delivery');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Keep local form inputs synchronized if userProfile updates in shared state
  useEffect(() => {
    setFullName(userProfile.name);
    setEmail(userProfile.email);
    setDepartment(userProfile.department || 'Engineering & Delivery');
  }, [userProfile.name, userProfile.email, userProfile.department]);

  // Handle Profile Save
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrorMsg('');
    setProfileSuccessMsg('');

    if (!fullName.trim()) {
      setProfileErrorMsg('Full Name cannot be empty.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setProfileErrorMsg('Please enter a valid email address.');
      return;
    }

    onUpdateProfile({
      name: fullName.trim(),
      email: email.trim(),
      role: userProfile.role, // Role cannot be modified by user
      department: department.trim(),
    });

    setProfileSuccessMsg('Personal profile updated successfully.');
    setTimeout(() => setProfileSuccessMsg(''), 4000);
  };

  // Handle Profile Reset
  const handleResetProfile = () => {
    setFullName(userProfile.name);
    setEmail(userProfile.email);
    setDepartment(userProfile.department || 'Engineering & Delivery');
    setProfileErrorMsg('');
    setProfileSuccessMsg('');
  };

  // Avatar Initials
  const avatarInitials = (fullName || userProfile.name)
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('') || 'U';

  // Calculate live matching counts for notification preferences
  const today = new Date();
  const in3Days = new Date(today);
  in3Days.setDate(in3Days.getDate() + 3);

  const deadlineCount = tasks.filter((t) => {
    if (!t.deadline || t.status === 'Completed') return false;
    const d = new Date(t.deadline);
    return d < today || d <= in3Days;
  }).length;

  const reviewUpdatesCount = tasks.filter(
    (t) => t.status === 'Under Review'
  ).length;

  const correctionCount = tasks.filter(
    (t) => t.tlRecommendation === 'corrections_requested'
  ).length;

  const completedCount = tasks.filter(
    (t) => t.status === 'Completed'
  ).length;

  // Toggle notification preference
  const toggleNotification = (key: keyof NotificationPreferences) => {
    onUpdateNotificationPreferences({
      ...notificationPreferences,
      [key]: !notificationPreferences[key],
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Settings
            </h2>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
              Stage 4
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Personal profile, workspace appearance, notification preferences, and system governance.
          </p>
        </div>

        {/* Current Active Role Badge */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#0f173b]/80 border border-purple-500/20 text-xs">
          <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
          <div>
            <span className="text-slate-400">Active Role: </span>
            <span className="font-semibold text-white">{currentUserRole}</span>
          </div>
        </div>
      </div>

      {/* 2. Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === 'appearance'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Appearance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Notifications</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-900/80 text-purple-300 font-bold border border-purple-500/30">
            {Object.values(notificationPreferences).filter(Boolean).length}/4
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('about')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 cursor-pointer ${
            activeTab === 'about'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>About</span>
        </button>
      </div>

      {/* 3. Tab Contents */}

      {/* ── TAB 1: PROFILE ── */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Success / Error Alerts */}
          {profileSuccessMsg && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>{profileSuccessMsg}</span>
            </div>
          )}

          {profileErrorMsg && (
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{profileErrorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Avatar & Identity Summary Card */}
            <div className="p-6 rounded-2xl bg-[#0f173b]/60 border border-slate-800 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-400 flex items-center justify-center text-white text-3xl font-extrabold shadow-xl shadow-purple-500/20 ring-4 ring-purple-500/20 mb-4">
                {avatarInitials}
              </div>
              <h3 className="text-lg font-bold text-white">{fullName || userProfile.name}</h3>
              <p className="text-xs text-slate-300 mt-0.5">{email || userProfile.email}</p>
              
              <div className="mt-4 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>{userProfile.role}</span>
              </div>

              <div className="mt-6 w-full pt-4 border-t border-slate-800 text-left space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Department:</span>
                  <span className="font-medium text-white">{department}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Permission Level:</span>
                  <span className="font-medium text-emerald-400">
                    {userProfile.role === 'Project Manager'
                      ? 'Full Governance (Final Approval)'
                      : userProfile.role === 'Team Leader'
                      ? 'Review & Recommendation'
                      : 'Task Execution & Submission'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Account Type:</span>
                  <span className="font-medium text-slate-300">Workspace Member</span>
                </div>
              </div>
            </div>

            {/* Right: Editable Profile Form */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-[#0f173b]/60 border border-slate-800">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
                <div>
                  <h3 className="text-base font-bold text-white">Personal Information</h3>
                  <p className="text-xs text-slate-300">
                    Update your display name, contact email, and operational department.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label htmlFor="fullName" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                    placeholder="e.g. Full Name"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email Address *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                    placeholder="e.g. alex.morgan@pmsworkspace.io"
                  />
                </div>

                {/* Department */}
                <div>
                  <label htmlFor="department" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Department
                  </label>
                  <select
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                  >
                    <option value="Engineering & Delivery">Engineering & Delivery</option>
                    <option value="Product Management">Product Management</option>
                    <option value="UI/UX & Product Design">UI/UX & Product Design</option>
                    <option value="Quality Assurance & Testing">Quality Assurance & Testing</option>
                    <option value="DevOps & Infrastructure">DevOps & Infrastructure</option>
                    <option value="Operations & Strategy">Operations & Strategy</option>
                  </select>
                </div>

                {/* Role (Strictly Read-Only / Non-Editable) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>Assigned Role</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-500/20 font-normal">
                        Self-Editing Not Permitted
                      </span>
                    </label>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Governance Locked</span>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={userProfile.role}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-sm text-slate-300 cursor-not-allowed select-none font-semibold pl-10"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Users cannot change their own role. Role elevations and reassignments must be performed through workspace administrative governance.
                  </p>
                </div>

                {/* Form Buttons */}
                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handleResetProfile}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800/60 text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/25 flex items-center gap-2 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Profile Changes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Role Governance Scope Explanation */}
          <div className="p-5 rounded-2xl bg-purple-900/10 border border-purple-500/20">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Active Governance Scope: {userProfile.role}</span>
            </h4>
            {userProfile.role === 'Project Manager' && (
              <p className="text-xs text-slate-300 leading-relaxed">
                As a <strong>Project Manager</strong>, you have exclusive authority to grant final task approval and mark tasks Completed. You can create projects, assign work, inspect live demo deliverables, and manage team members across the workspace.
              </p>
            )}
            {userProfile.role === 'Team Leader' && (
              <p className="text-xs text-slate-300 leading-relaxed">
                As a <strong>Team Leader</strong>, you inspect submitted task deliverables and demo evidence. You can recommend tasks for final Project Manager approval or request revisions with structured feedback.
              </p>
            )}
            {userProfile.role === 'Team Member' && (
              <p className="text-xs text-slate-300 leading-relaxed">
                As a <strong>Team Member</strong>, you work on assigned project tasks, upload progress files, engage in discussions via comments, and submit formal demo evidence with live URLs for leader review.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: APPEARANCE ── */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#0f173b]/60 border border-slate-800 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white">Theme & Color Mode</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Select your preferred visual mode for the PMS workspace surface.
              </p>
            </div>

            {/* Dark Mode vs Light Mode Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Dark Mode Option */}
              <div
                onClick={() => onUpdateAppearance({ ...appearanceSettings, theme: 'dark' })}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  appearanceSettings.theme === 'dark'
                    ? 'border-purple-500 bg-[#070b19] shadow-xl shadow-purple-500/10'
                    : 'border-slate-800 bg-[#070b19]/60 hover:border-slate-700'
                }`}
              >
                {appearanceSettings.theme === 'dark' && (
                  <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Dark Mode (Default)</h4>
                    <span className="text-[10px] text-purple-300 font-medium">Recommended for PMS</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  High-contrast deep navy and indigo aesthetic. Calibrated for long project governance sessions and eye comfort.
                </p>

                {/* Mini Preview Box */}
                <div className="p-2.5 rounded-lg bg-[#0b112c] border border-slate-800 flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-purple-600" />
                  <div className="h-2 w-16 rounded bg-slate-700" />
                  <div className="h-2 w-8 rounded bg-slate-800 ml-auto" />
                </div>
              </div>

              {/* Light Mode Option */}
              <div
                onClick={() => onUpdateAppearance({ ...appearanceSettings, theme: 'light' })}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                  appearanceSettings.theme === 'light'
                    ? 'border-purple-500 bg-slate-900 shadow-xl shadow-purple-500/10'
                    : 'border-slate-800 bg-[#070b19]/60 hover:border-slate-700'
                }`}
              >
                {appearanceSettings.theme === 'light' && (
                  <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Light Mode</h4>
                    <span className="text-[10px] text-amber-300 font-medium">High Clarity Studio</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  Crisp slate surfaces with bright background styling. Ideal for daytime lighting and presentation viewing.
                </p>

                {/* Mini Preview Box */}
                <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-amber-500" />
                  <div className="h-2 w-16 rounded bg-slate-300" />
                  <div className="h-2 w-8 rounded bg-slate-400 ml-auto" />
                </div>
              </div>
            </div>

            {/* Accent Color Selection */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-sm font-bold text-white mb-1">Brand Accent Color</h4>
              <p className="text-xs text-slate-300 mb-3">
                Tailor the primary visual highlight across buttons, badges, and progress meters.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {[
                  { id: 'purple', label: 'Vibrant Purple (Default)', class: 'bg-purple-600' },
                  { id: 'indigo', label: 'Electric Indigo', class: 'bg-indigo-600' },
                  { id: 'emerald', label: 'Emerald Green', class: 'bg-emerald-600' },
                  { id: 'blue', label: 'Ocean Blue', class: 'bg-blue-600' },
                ].map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => onUpdateAppearance({ ...appearanceSettings, accentColor: color.id as any })}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      appearanceSettings.accentColor === color.id
                        ? 'border-purple-500 bg-purple-500/15 text-white'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full ${color.class}`} />
                    <span>{color.label}</span>
                    {appearanceSettings.accentColor === color.id && (
                      <Check className="w-3 h-3 text-purple-400 ml-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Compact Mode Density */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Compact Table & Card Layout</h4>
                <p className="text-xs text-slate-300">
                  Reduce padding to display more task rows and metric cards per screen.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdateAppearance({
                    ...appearanceSettings,
                    compactMode: !appearanceSettings.compactMode,
                  })
                }
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                  appearanceSettings.compactMode ? 'bg-purple-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                    appearanceSettings.compactMode ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: NOTIFICATIONS ── */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#0f173b]/60 border border-slate-800 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Event Notification Preferences</h3>
                <p className="text-xs text-slate-300">
                  Enable or disable notification categories. Disabling a category removes its alerts from the Notifications page and updates your unread badge.
                </p>
              </div>

              {/* Bulk Toggle Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateNotificationPreferences({
                      taskDeadlines: true,
                      reviewUpdates: true,
                      correctionRequests: true,
                      taskCompletion: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
                >
                  Enable All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateNotificationPreferences({
                      taskDeadlines: false,
                      reviewUpdates: false,
                      correctionRequests: false,
                      taskCompletion: false,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
                >
                  Disable All
                </button>
              </div>
            </div>

            {/* Notification Category Preferences Grid */}
            <div className="space-y-4">
              {/* 1. Task Deadlines */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Task Deadlines</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/15 text-rose-300 border border-rose-500/20">
                        {deadlineCount} active
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Alerts for overdue tasks that passed their deadline and upcoming tasks due within 3 days.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleNotification('taskDeadlines')}
                  className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                    notificationPreferences.taskDeadlines ? 'bg-purple-600' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      notificationPreferences.taskDeadlines ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* 2. Review Updates */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Review Updates</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                        {reviewUpdatesCount} under review
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Alerts when tasks and live demo evidence are submitted for review, or when a Team Leader recommends approval.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleNotification('reviewUpdates')}
                  className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                    notificationPreferences.reviewUpdates ? 'bg-purple-600' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      notificationPreferences.reviewUpdates ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* 3. Correction Requests */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Correction Requests</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/20">
                        {correctionCount} pending
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Alerts when a task requires revision or when reviewers return work with corrective guidance notes.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleNotification('correctionRequests')}
                  className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                    notificationPreferences.correctionRequests ? 'bg-purple-600' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      notificationPreferences.correctionRequests ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* 4. Task Completion */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Task Completion</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                        {completedCount} completed
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Alerts when a Project Manager grants final sign-off and officially transitions a task to Completed.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleNotification('taskCompletion')}
                  className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                    notificationPreferences.taskCompletion ? 'bg-purple-600' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      notificationPreferences.taskCompletion ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Notification Bridge Notice */}
            <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-slate-300 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>
                These preferences filter notifications in real time across the workspace. When a category is turned off, its alerts are suppressed from the Notifications page and will not contribute to the sidebar unread counter.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: ABOUT ── */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          {/* Main App Identity Card */}
          <div className="p-6 rounded-2xl bg-[#0f173b]/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-purple-500/25 ring-2 ring-purple-500/20 shrink-0">
              <ShieldCheck className="w-9 h-9" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-extrabold text-white">Project Management System (PMS)</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                A multi-role project governance and task tracking platform engineered in alignment with the <em>Pixel Addis Solution</em> specifications. Designed to coordinate workflows between Project Managers, Team Leaders, and Team Members with structured review and approval controls, live demo verification, and workspace metrics.
              </p>
            </div>
          </div>

          {/* System Specifications Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Application Name</span>
              <p className="text-sm font-bold text-white mt-1">PMS Portal</p>
              <p className="text-[11px] text-purple-300 mt-0.5">Pixel Addis Solution</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Known Version</span>
              <p className="text-sm font-bold text-white mt-1">v1.0.0 (Release 1)</p>
              <p className="text-[11px] text-emerald-400 mt-0.5">Client Package 0.0.0</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Frontend Stack</span>
              <p className="text-sm font-bold text-white mt-1">React 19 + TypeScript</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Vite & Tailwind CSS</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Storage Architecture</span>
              <p className="text-sm font-bold text-white mt-1">In-Memory State</p>
              <p className="text-[11px] text-emerald-400 mt-0.5">Zero Database / Ephemeral</p>
            </div>
          </div>

          {/* Role Governance & Permissions Matrix */}
          <div className="p-6 rounded-2xl bg-[#0f173b]/60 border border-slate-800">
            <h4 className="text-base font-bold text-white mb-2">Role Permissions Matrix</h4>
            <p className="text-xs text-slate-300 mb-4">
              Governance rules ensuring appropriate separation of duties across all three roles.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">System Capability</th>
                    <th className="py-2.5 px-3 text-center">Project Manager</th>
                    <th className="py-2.5 px-3 text-center">Team Leader</th>
                    <th className="py-2.5 px-3 text-center">Team Member</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-white">Create Projects & Assign Tasks</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-white">Manage Team Members</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-white">Execute Tasks & Post Comments</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-white">Submit Formal Live Demo Evidence</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-white">Review & Recommend Approval (TL)</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                    <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">Yes</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-white">Grant Final Approval & Mark Completed</td>
                    <td className="py-2.5 px-3 text-center text-purple-400 font-bold">Exclusive Authority</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">Recommend Only</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-white">Configure Personal Profile & Notifications</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">Yes</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
