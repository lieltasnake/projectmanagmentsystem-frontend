import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Search,
  SlidersHorizontal,
  Edit2,
  Trash2,
  X,
  AlertTriangle,
  CheckSquare,
  Building,
} from 'lucide-react';
import type { TeamMember, Task } from '../types/pms';

export type TeamRole = 'Project Manager' | 'Team Leader' | 'Team Member' | 'Tester';

interface TeamPageProps {
  members?: TeamMember[];
  tasks?: Task[];
  onAddMember?: (member: TeamMember) => void;
  onUpdateMember?: (member: TeamMember) => void;
  onRemoveMember?: (memberId: string) => void;
}

const ROLES: TeamRole[] = ['Project Manager', 'Team Leader', 'Team Member', 'Tester'];

export default function TeamPage({
  members = [],
  tasks = [],
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}: TeamPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'Team Member' as TeamRole,
    department: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);

  // Member tasks lookup map (assigned tasks count and list)
  const memberTasksMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    members.forEach((m) => {
      // match tasks either by exact assignedTo name or ID
      map[m.id] = tasks.filter(
        (t) =>
          t.assignedTo &&
          (t.assignedTo.toLowerCase() === m.name.toLowerCase() ||
            t.assignedTo.toLowerCase() === m.email.toLowerCase())
      );
    });
    return map;
  }, [members, tasks]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.department && member.department.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesRole = roleFilter === 'All' || member.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [members, searchTerm, roleFilter]);

  const handleOpenAddModal = () => {
    setEditingMember(null);
    setFormData({
      name: '',
      email: '',
      role: 'Team Member',
      department: '',
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      role: member.role,
      department: member.department || '',
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleCloseFormModal = () => {
    setIsFormModalOpen(false);
    setEditingMember(null);
    setFormError(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();
    const trimmedDept = formData.department.trim();

    // 1. Required validation
    if (!trimmedName || !trimmedEmail) {
      setFormError('Please enter both name and email.');
      return;
    }

    // 2. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setFormError('Please enter a valid email address (e.g. user@pms.com).');
      return;
    }

    // 3. Unique email validation across other members
    const emailExists = members.some(
      (m) =>
        m.email.toLowerCase() === trimmedEmail.toLowerCase() &&
        (!editingMember || m.id !== editingMember.id)
    );
    if (emailExists) {
      setFormError('A team member with this email address already exists.');
      return;
    }

    // Generate avatar initials
    const initials = trimmedName
      .split(/[\s._-]+/)
      .slice(0, 2)
      .map((s) => s.charAt(0).toUpperCase())
      .join('') || 'TM';

    if (editingMember) {
      // Update existing member
      const updated: TeamMember = {
        ...editingMember,
        name: trimmedName,
        email: trimmedEmail,
        role: formData.role,
        department: trimmedDept || undefined,
        avatarInitials: initials,
      };
      if (onUpdateMember) {
        onUpdateMember(updated);
      }
    } else {
      // Create new member with unique ID
      const newId = `TM-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();
      const newMember: TeamMember = {
        id: newId,
        name: trimmedName,
        email: trimmedEmail,
        role: formData.role,
        department: trimmedDept || undefined,
        avatarInitials: initials,
      };
      if (onAddMember) {
        onAddMember(newMember);
      }
    }

    handleCloseFormModal();
  };

  const handleConfirmDelete = () => {
    if (memberToDelete && onRemoveMember) {
      onRemoveMember(memberToDelete.id);
    }
    setMemberToDelete(null);
  };

  const getRoleBadge = (role: TeamRole) => {
    switch (role) {
      case 'Project Manager':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            Project Manager
          </span>
        );
      case 'Team Leader':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            Team Leader
          </span>
        );
      case 'Tester':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            Tester (QA)
          </span>
        );
      case 'Team Member':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-600/25 text-slate-300 border border-slate-600/40">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            Team Member
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Team
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {members.length} {members.length === 1 ? 'Member' : 'Members'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Collaborators across Project Managers (PM), Team Leaders (TL), and Team Members (TM).
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/25 active:scale-[0.99] transition-all cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Member</span>
        </button>
      </div>

      {/* 2. Empty State when no real members entered */}
      {members.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 sm:p-14 text-center flex flex-col items-center justify-center min-h-[380px]">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-lg shadow-purple-500/10">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">
            No team members registered yet
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            There are currently no team members in this workspace. Click "Add Member" to register Project Managers, Team Leaders, and Team Members.
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/20 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add your first team member</span>
          </button>
        </div>
      ) : (
        <>
          {/* Search & Filter Bar */}
          <div className="bg-[#0f173b]/90 border border-slate-700/60 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or department..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
              />
            </div>

            {/* Role Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Role:</span>
              </div>
              {(['All', 'Project Manager', 'Team Leader', 'Team Member', 'Tester'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    roleFilter === r
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                      : 'bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Filtered empty state */}
          {filteredMembers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-12 text-center flex flex-col items-center justify-center min-h-[260px]">
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white">No matching members found</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Try adjusting your search query or role filter.
              </p>
            </div>
          ) : (
            /* Members Card Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredMembers.map((member) => {
                const assignedTasks = memberTasksMap[member.id] || [];
                const completedTasks = assignedTasks.filter((t) => t.status === 'Completed').length;

                return (
                  <div
                    key={member.id}
                    className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 hover:border-purple-500/50 shadow-xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-purple-500/10 group"
                  >
                    <div>
                      {/* Top Bar: Role badge & Action buttons */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        {getRoleBadge(member.role)}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(member)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                            title="Edit member details"
                            aria-label={`Edit ${member.name}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMemberToDelete(member)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Remove member"
                            aria-label={`Remove ${member.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Member Info */}
                      <div className="flex items-start gap-3.5 mt-2">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-base flex items-center justify-center shadow-md shadow-purple-500/20 ring-1 ring-purple-500/30 shrink-0">
                          {member.avatarInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors truncate">
                            {member.name}
                          </h3>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate">{member.email}</span>
                          </div>
                          {member.department && (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-purple-300/80">
                              <Building className="w-3 h-3 text-purple-400 shrink-0" />
                              <span>{member.department}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Assigned Tasks Summary Section */}
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

                      {assignedTasks.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {assignedTasks.slice(0, 2).map((t) => (
                            <div
                              key={t.id}
                              className="text-[11px] text-slate-300 bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800 truncate flex items-center justify-between"
                            >
                              <span className="truncate">{t.title}</span>
                              <span className="text-[10px] text-purple-300/90 ml-2 font-mono shrink-0">
                                {t.status}
                              </span>
                            </div>
                          ))}
                          {assignedTasks.length > 2 && (
                            <div className="text-[10px] text-slate-500 italic pl-1">
                              +{assignedTasks.length - 2} more tasks
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 italic bg-slate-900/40 p-2 rounded-lg border border-slate-800/60">
                          No tasks assigned to this member currently.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 3. Add / Edit Member Form Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">
                    {editingMember ? 'Edit Team Member' : 'Add Team Member'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingMember ? 'Update collaborator details' : 'Register a new team member'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseFormModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner */}
            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="memberName" className="block text-xs font-medium text-slate-200 mb-1">
                  Full Name <span className="text-purple-400">*</span>
                </label>
                <input
                  id="memberName"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Dr. Allison Cameron"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                />
              </div>

              <div>
                <label htmlFor="memberEmail" className="block text-xs font-medium text-slate-200 mb-1">
                  Email Address <span className="text-purple-400">*</span>
                </label>
                <input
                  id="memberEmail"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. cameron@pms.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                />
              </div>

              <div>
                <label htmlFor="memberRole" className="block text-xs font-medium text-slate-200 mb-1">
                  Role <span className="text-purple-400">*</span>
                </label>
                <select
                  id="memberRole"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as TeamRole })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="bg-[#0f173b]">
                      {r}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  {formData.role === 'Project Manager' && 'Full executive authority; final task approval to Completed.'}
                  {formData.role === 'Team Leader' && 'Reviews submitted tasks; can request corrections or recommend approval.'}
                  {formData.role === 'Team Member' && 'Works on assigned tasks and submits completed work for review.'}
                  {formData.role === 'Tester' && 'Performs QA testing on submitted work, reports bugs, and verifies fixes.'}
                </p>
              </div>

              <div>
                <label htmlFor="memberDept" className="block text-xs font-medium text-slate-200 mb-1">
                  Department (Optional)
                </label>
                <input
                  id="memberDept"
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g. Clinical Systems Engineering"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                />
              </div>

              {/* Modal Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/30 transition-all cursor-pointer"
                >
                  {editingMember ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Delete Confirmation Modal */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Remove Team Member</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Are you sure you want to remove <strong className="text-white">{memberToDelete.name}</strong> ({memberToDelete.role}) from the team?
            </p>
            <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/30 transition-all cursor-pointer"
              >
                Remove Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
