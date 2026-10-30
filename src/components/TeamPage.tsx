import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Search,
  Edit2,
  X,
  AlertTriangle,
  CheckSquare,
  Building,
  KeyRound,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import type { TeamMember, Task, UserRole } from '../types/pms';
import {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  resetUserPassword,
  dbRoleToDisplayRole,
  displayRoleToDbRole,
  type ApiUser,
} from '../services/api';

export type TeamRole = 'Project Manager' | 'Team Leader' | 'Team Member' | 'Tester';

interface TeamPageProps {
  currentUserRole?: UserRole;
  currentUserEmail?: string;
  members?: TeamMember[];
  tasks?: Task[];
  onAddMember?: (member: TeamMember) => void;
  onUpdateMember?: (member: TeamMember) => void;
  onRemoveMember?: (memberId: string) => void;
}

const COMMON_TEAMS = ['Management', 'Platform Engineering', 'Frontend Dev', 'Backend Dev', 'Quality Assurance', 'DevOps & Infra', 'UI/UX Design', 'General'];

export default function TeamPage({
  currentUserRole = 'Project Manager',
  currentUserEmail = '',
  members: propMembers = [],
  tasks = [],
  onAddMember,
  onUpdateMember,
}: TeamPageProps) {
  const isPM = currentUserRole === 'Project Manager';

  // Live database users (for PM and live sync)
  const [dbUsers, setDbUsers] = useState<ApiUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [teamFilter, setTeamFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [statusUserToToggle, setStatusUserToToggle] = useState<ApiUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<ApiUser | null>(null);
  const [generatedTempPass, setGeneratedTempPass] = useState<string | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Create User Form State
  const [createFormData, setCreateFormData] = useState({
    name: '',
    email: '',
    role: 'TM' as 'TL' | 'TM' | 'TESTER' | 'PM',
    team: 'Frontend Dev',
    temporaryPassword: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit User Form State
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    role: 'TM',
    team: '',
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Reset Password Form State
  const [customResetPassword, setCustomResetPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  // Load registered users from backend for PM
  const fetchDbUsers = async () => {
    try {
      setIsLoading(true);
      setApiError(null);
      const res = await getUsers();
      setDbUsers(res.users);
    } catch (err: any) {
      console.warn('Could not load users from backend API:', err.message);
      // If error (or non-PM), fallback gracefully
      setApiError(err.message || 'Failed to load user records from server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isPM) {
      fetchDbUsers();
    }
  }, [isPM]);

  // Merge database users into UI members representation
  const activeMembersList: TeamMember[] = useMemo(() => {
    if (isPM && dbUsers.length > 0) {
      return dbUsers.map((u) => ({
        id: String(u.id),
        name: u.name,
        email: u.email,
        role: dbRoleToDisplayRole(u.role),
        department: u.team || 'General',
        avatarInitials: u.name
          .split(/[\s._-]+/)
          .slice(0, 2)
          .map((s) => s.charAt(0).toUpperCase())
          .join('') || 'U',
      }));
    }
    return propMembers;
  }, [isPM, dbUsers, propMembers]);

  // Dynamic distinct list of teams for filter
  const distinctTeams = useMemo(() => {
    const set = new Set<string>();
    if (dbUsers.length > 0) {
      dbUsers.forEach((u) => {
        if (u.team) set.add(u.team);
      });
    } else {
      propMembers.forEach((m) => {
        if (m.department) set.add(m.department);
      });
    }
    COMMON_TEAMS.forEach((t) => set.add(t));
    return Array.from(set);
  }, [dbUsers, propMembers]);

  // Filtered users for PM view
  const filteredDbUsers = useMemo(() => {
    return dbUsers.filter((user) => {
      const displayRole = dbRoleToDisplayRole(user.role);
      const matchesSearch =
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.team && user.team.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesRole =
        roleFilter === 'All' ||
        displayRole === roleFilter ||
        user.role.toUpperCase() === displayRoleToDbRole(roleFilter);

      const matchesTeam =
        teamFilter === 'All' ||
        (user.team && user.team.toLowerCase() === teamFilter.toLowerCase());

      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Active' && user.isActive) ||
        (statusFilter === 'Deactivated' && !user.isActive);

      return matchesSearch && matchesRole && matchesTeam && matchesStatus;
    });
  }, [dbUsers, searchTerm, roleFilter, teamFilter, statusFilter]);

  // Filtered members for non-PM view
  const filteredMembers = useMemo(() => {
    return activeMembersList.filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.department && member.department.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesRole = roleFilter === 'All' || member.role === roleFilter;
      const matchesTeam = teamFilter === 'All' || (member.department && member.department.toLowerCase() === teamFilter.toLowerCase());

      return matchesSearch && matchesRole && matchesTeam;
    });
  }, [activeMembersList, searchTerm, roleFilter, teamFilter]);

  // Member tasks lookup map
  const memberTasksMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    activeMembersList.forEach((m) => {
      map[m.id] = tasks.filter(
        (t) =>
          t.assignedTo &&
          (t.assignedTo.toLowerCase() === m.name.toLowerCase() ||
            t.assignedTo.toLowerCase() === m.email.toLowerCase())
      );
    });
    return map;
  }, [activeMembersList, tasks]);

  // Helper: generate random secure temporary password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let res = 'Temp!';
    for (let i = 0; i < 7; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  // 1. Create User Handlers
  const handleOpenCreateModal = () => {
    const autoPass = generateRandomPassword();
    setCreateFormData({
      name: '',
      email: '',
      role: 'TM',
      team: 'Frontend Dev',
      temporaryPassword: autoPass,
    });
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createFormData.name.trim() || !createFormData.email.trim() || !createFormData.temporaryPassword.trim()) {
      setCreateError('Please fill in all required fields.');
      return;
    }

    if (createFormData.temporaryPassword.length < 6) {
      setCreateError('Temporary password must be at least 6 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createUser({
        name: createFormData.name.trim(),
        email: createFormData.email.trim(),
        password: createFormData.temporaryPassword.trim(),
        role: createFormData.role,
        team: createFormData.team.trim() || 'General',
      });

      setApiSuccess(`User account "${res.user.name}" created successfully! Temporary password: ${createFormData.temporaryPassword}`);
      setTimeout(() => setApiSuccess(null), 8000);

      // Refresh list
      await fetchDbUsers();

      // Synchronize with parent state
      if (onAddMember) {
        onAddMember({
          id: String(res.user.id),
          name: res.user.name,
          email: res.user.email,
          role: dbRoleToDisplayRole(res.user.role),
          department: res.user.team,
          avatarInitials: res.user.name
            .split(/[\s._-]+/)
            .slice(0, 2)
            .map((s) => s.charAt(0).toUpperCase())
            .join('') || 'U',
        });
      }

      setIsCreateModalOpen(false);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create user account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Edit User Handlers
  const handleOpenEditModal = (user: ApiUser) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team || 'General',
    });
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    try {
      setIsSubmitting(true);
      const res = await updateUser(editingUser.id, {
        name: editFormData.name.trim(),
        email: editFormData.email.trim(),
        role: editFormData.role,
        team: editFormData.team.trim(),
      });

      setApiSuccess(`Account for "${res.user.name}" updated successfully.`);
      setTimeout(() => setApiSuccess(null), 5000);

      await fetchDbUsers();

      if (onUpdateMember) {
        onUpdateMember({
          id: String(res.user.id),
          name: res.user.name,
          email: res.user.email,
          role: dbRoleToDisplayRole(res.user.role),
          department: res.user.team,
          avatarInitials: res.user.name
            .split(/[\s._-]+/)
            .slice(0, 2)
            .map((s) => s.charAt(0).toUpperCase())
            .join('') || 'U',
        });
      }

      setEditingUser(null);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Status Activation/Deactivation Handlers
  const handleToggleStatus = async () => {
    if (!statusUserToToggle) return;
    try {
      setIsSubmitting(true);
      const newStatus = !statusUserToToggle.isActive;
      await updateUserStatus(statusUserToToggle.id, newStatus);
      setApiSuccess(
        `User account "${statusUserToToggle.name}" has been ${newStatus ? 'activated' : 'deactivated'}.`
      );
      setTimeout(() => setApiSuccess(null), 5000);
      await fetchDbUsers();
      setStatusUserToToggle(null);
    } catch (err: any) {
      setApiError(err.message || 'Failed to update user status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Password Reset Handlers
  const handleOpenResetModal = (user: ApiUser) => {
    setResetPasswordUser(user);
    setCustomResetPassword(generateRandomPassword());
    setGeneratedTempPass(null);
    setCopiedPass(false);
    setResetError(null);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    setResetError(null);

    try {
      setIsSubmitting(true);
      const res = await resetUserPassword(resetPasswordUser.id, customResetPassword.trim());
      setGeneratedTempPass(res.temporaryPassword);
      setApiSuccess(`Password reset for "${resetPasswordUser.name}". The user must change it at next login.`);
      await fetchDbUsers();
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyPassword = () => {
    if (generatedTempPass) {
      navigator.clipboard.writeText(generatedTempPass);
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2500);
    }
  };

  const getRoleBadge = (role: string) => {
    const normalized = role.toUpperCase();
    if (normalized === 'PM' || normalized === 'PROJECT MANAGER') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          Project Manager
        </span>
      );
    }
    if (normalized === 'TL' || normalized === 'TEAM LEADER') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          Team Leader
        </span>
      );
    }
    if (normalized === 'TESTER') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          Tester (QA)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-600/25 text-slate-300 border border-slate-600/40">
        <Users className="w-3.5 h-3.5 text-slate-400" />
        Team Member
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {isPM ? 'User Management' : 'Team Directory'}
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {isPM ? `${dbUsers.length} Users` : `${activeMembersList.length} Members`}
            </span>
            {isPM && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {dbUsers.filter((u) => u.isActive).length} Active
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-300">
            {isPM
              ? 'Create accounts, manage workspace permissions, reset passwords, and control user access.'
              : 'Collaborate with Project Managers, Team Leaders, Team Members, and Testers.'}
          </p>
        </div>

        {isPM && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDbUsers}
              disabled={isLoading}
              className="p-2.5 rounded-xl text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 transition-all cursor-pointer"
              title="Refresh users list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/25 active:scale-[0.99] transition-all cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create User Account</span>
            </button>
          </div>
        )}
      </div>

      {/* Global Alerts */}
      {apiSuccess && (
        <div className="p-4 rounded-xl bg-purple-950/70 border border-purple-500/40 text-purple-200 text-sm flex items-start gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{apiSuccess}</span>
        </div>
      )}

      {apiError && (
        <div className="p-4 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-sm flex items-start gap-3 animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{apiError}</span>
        </div>
      )}

      {/* 2. Filters Bar */}
      <div className="p-4 rounded-2xl bg-[#0f173b]/80 border border-slate-700/60 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or team..."
              className="w-full pl-10 pr-4 py-2 bg-[#0a0f26]/80 text-white placeholder-slate-500 text-sm rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 focus:border-transparent transition-all"
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-[#0a0f26]/80 text-white text-xs rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
          >
            <option value="All">All Roles</option>
            <option value="Project Manager">Project Manager (PM)</option>
            <option value="Team Leader">Team Leader (TL)</option>
            <option value="Team Member">Team Member (TM)</option>
            <option value="Tester">Tester (QA)</option>
          </select>

          {/* Team Filter */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-2 bg-[#0a0f26]/80 text-white text-xs rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
          >
            <option value="All">All Teams</option>
            {distinctTeams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Status Filter (PM Only) */}
          {isPM && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-[#0a0f26]/80 text-white text-xs rounded-xl border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Deactivated">Deactivated Only</option>
            </select>
          )}
        </div>
      </div>

      {/* 3. Main Content: PM View vs Team Directory View */}
      {isPM ? (
        /* PM USER MANAGEMENT TABLE */
        <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 shadow-xl overflow-hidden">
          {filteredDbUsers.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <Users className="w-10 h-10 text-slate-500 mb-3" />
              <h3 className="text-base font-semibold text-white">No users match your criteria</h3>
              <p className="mt-1 text-xs text-slate-400">Try adjusting your search terms or filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-[#0a0f26]/90 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-semibold">User</th>
                    <th scope="col" className="px-4 py-3.5 font-semibold">Role</th>
                    <th scope="col" className="px-4 py-3.5 font-semibold">Team Assignment</th>
                    <th scope="col" className="px-4 py-3.5 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3.5 font-semibold">Password Status</th>
                    <th scope="col" className="px-5 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredDbUsers.map((u) => {
                    const initials = u.name
                      .split(/[\s._-]+/)
                      .slice(0, 2)
                      .map((s) => s.charAt(0).toUpperCase())
                      .join('') || 'U';
                    const isSelf = currentUserEmail.toLowerCase() === u.email.toLowerCase();

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* User Identity */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-md ring-1 ring-purple-500/30 shrink-0">
                              {initials}
                            </div>
                            <div>
                              <div className="font-bold text-white flex items-center gap-2">
                                <span>{u.name}</span>
                                {isSelf && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3 text-slate-500" />
                                <span>{u.email}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {getRoleBadge(u.role)}
                        </td>

                        {/* Team */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-800">
                            <Building className="w-3.5 h-3.5 text-purple-400" />
                            <span>{u.team || 'General'}</span>
                          </span>
                        </td>

                        {/* Account Status */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {u.isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
                              <XCircle className="w-3 h-3 text-red-400" />
                              Deactivated
                            </span>
                          )}
                        </td>

                        {/* Password Status */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {u.mustChangePassword ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30" title="User must change password at next login">
                              <KeyRound className="w-3 h-3 text-amber-400" />
                              Must Change
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Permanent</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(u)}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Edit user details and assignment"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            {/* Reset Password Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenResetModal(u)}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-amber-300 hover:bg-amber-950/40 transition-colors cursor-pointer"
                              title="Reset user password"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>

                            {/* Activate / Deactivate Toggle */}
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => setStatusUserToToggle(u)}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isSelf
                                  ? 'text-slate-600 cursor-not-allowed opacity-50'
                                  : u.isActive
                                  ? 'text-slate-300 hover:text-red-400 hover:bg-red-950/40'
                                  : 'text-slate-300 hover:text-emerald-400 hover:bg-emerald-950/40'
                              }`}
                              title={
                                isSelf
                                  ? 'You cannot deactivate your own account'
                                  : u.isActive
                                  ? 'Deactivate account'
                                  : 'Activate account'
                              }
                            >
                              {u.isActive ? (
                                <XCircle className="w-4 h-4 text-red-400" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* NON-PM TEAM DIRECTORY CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredMembers.map((member) => {
            const assignedTasks = memberTasksMap[member.id] || [];
            const completedTasks = assignedTasks.filter((t) => t.status === 'Completed').length;

            return (
              <div
                key={member.id}
                className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 shadow-xl p-5 flex flex-col justify-between transition-all duration-300 hover:border-purple-500/40"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {getRoleBadge(member.role)}
                    {member.department && (
                      <span className="text-[11px] text-purple-300/80 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800">
                        {member.department}
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-3.5 mt-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-base flex items-center justify-center shadow-md shadow-purple-500/20 ring-1 ring-purple-500/30 shrink-0">
                      {member.avatarInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-white truncate">{member.name}</h3>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Assigned Tasks</span>
                    </span>
                    <span className="font-semibold text-white">
                      {completedTasks}/{assignedTasks.length} complete
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: CREATE USER (PM ONLY)                            */}
      {/* ========================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#0f173b] border border-purple-500/40 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">Create User Account</h3>
                  <p className="text-xs text-slate-400">Initialize a new team member and issue credentials</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mt-4 p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={createFormData.name}
                  onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                  placeholder="e.g. Sarah Connor"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                  placeholder="e.g. sarah.connor@pms.local"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Role Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    User Role *
                  </label>
                  <select
                    value={createFormData.role}
                    onChange={(e) => setCreateFormData({ ...createFormData, role: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="TL">Team Leader (TL)</option>
                    <option value="TM">Team Member (TM)</option>
                    <option value="TESTER">Tester (QA)</option>
                    <option value="PM">Project Manager (PM)</option>
                  </select>
                </div>

                {/* Team Assignment */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Team Assignment
                  </label>
                  <input
                    type="text"
                    value={createFormData.team}
                    onChange={(e) => setCreateFormData({ ...createFormData, team: e.target.value })}
                    placeholder="e.g. Platform Engineering"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Temporary Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Temporary Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateFormData({ ...createFormData, temporaryPassword: generateRandomPassword() })}
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate New</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={createFormData.temporaryPassword}
                    onChange={(e) => setCreateFormData({ ...createFormData, temporaryPassword: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <p className="mt-1 text-[11px] text-amber-300/80">
                  The user will be required to change this temporary password upon first login.
                </p>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: EDIT USER (PM ONLY)                              */}
      {/* ========================================================= */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#0f173b] border border-purple-500/40 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">Edit User Details</h3>
                  <p className="text-xs text-slate-400">Update account profile, role, or team assignment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="mt-4 p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">User Role</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="TL">Team Leader (TL)</option>
                    <option value="TM">Team Member (TM)</option>
                    <option value="TESTER">Tester (QA)</option>
                    <option value="PM">Project Manager (PM)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Team Assignment</label>
                  <input
                    type="text"
                    value={editFormData.team}
                    onChange={(e) => setEditFormData({ ...editFormData, team: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: RESET PASSWORD (PM ONLY)                         */}
      {/* ========================================================= */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#0f173b] border border-amber-500/40 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">Reset Password</h3>
                  <p className="text-xs text-slate-400">For {resetPasswordUser.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetError && (
              <div className="mt-4 p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {generatedTempPass ? (
              <div className="mt-5 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-sm">
                  <div className="font-bold flex items-center gap-2 mb-1 text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Temporary Password Generated
                  </div>
                  <p className="text-xs text-slate-300">
                    Provide this temporary password to <span className="font-semibold text-white">{resetPasswordUser.name}</span>. They will be required to set a new password at next login.
                  </p>

                  <div className="mt-3 p-3 bg-black/60 rounded-xl border border-slate-800 flex items-center justify-between font-mono text-base text-white">
                    <span>{generatedTempPass}</span>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="p-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/60 text-purple-300 flex items-center gap-1 text-xs cursor-pointer"
                    >
                      {copiedPass ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedPass ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setResetPasswordUser(null)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="mt-5 space-y-4">
                <p className="text-xs text-slate-300">
                  Generate a temporary password for this user. The account will immediately be flagged to require a new password at their next login attempt.
                </p>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Temporary Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomResetPassword(generateRandomPassword())}
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Re-generate</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={customResetPassword}
                    onChange={(e) => setCustomResetPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setResetPasswordUser(null)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: ACTIVATE / DEACTIVATE CONFIRMATION (PM ONLY)    */}
      {/* ========================================================= */}
      {statusUserToToggle && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md ${
                  statusUserToToggle.isActive
                    ? 'bg-gradient-to-tr from-rose-600 to-red-500'
                    : 'bg-gradient-to-tr from-emerald-600 to-green-500'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white leading-tight">
                  {statusUserToToggle.isActive ? 'Deactivate Account?' : 'Activate Account?'}
                </h3>
                <p className="text-xs text-slate-400">{statusUserToToggle.name} ({statusUserToToggle.email})</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              {statusUserToToggle.isActive ? (
                <>
                  Deactivating this account will <strong>immediately prevent the user from logging in</strong>.
                  <span className="block mt-2 text-xs text-emerald-400">
                    Safe Data Guarantee: All projects, assigned tasks, and historical activity belonging to this user will remain completely intact in the database.
                  </span>
                </>
              ) : (
                <>
                  Activating this account will <strong>restore login access</strong> for the user immediately.
                </>
              )}
            </p>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStatusUserToToggle(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleToggleStatus}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg cursor-pointer ${
                  statusUserToToggle.isActive
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                }`}
              >
                {isSubmitting
                  ? 'Processing...'
                  : statusUserToToggle.isActive
                  ? 'Confirm Deactivation'
                  : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
