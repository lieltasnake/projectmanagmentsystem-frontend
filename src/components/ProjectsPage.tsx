import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FolderKanban,
  Search,
  Plus,
  Calendar,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  SlidersHorizontal,
  Layers,
  X,
  Briefcase,
  Users,
  ShieldCheck,
  Edit,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import type { Project, TeamMember, UserRole } from '../types/pms';
import { createProject, updateProject, deleteProject, getUsers, getProjectStatuses, type ApiUser } from '../services/api';

export type { Project };



interface ProjectsPageProps {
  projects?: Project[];
  teamMembers?: TeamMember[];
  currentUserRole?: UserRole;
  currentUserName?: string;
  onAddProject?: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
  onSelectProject?: (project: Project) => void;
}

export default function ProjectsPage({
  projects = [],
  teamMembers = [],
  currentUserRole = 'Project Manager',
  currentUserName = '',
  onAddProject,
  onEditProject,
  onDeleteProject,
  onSelectProject,
}: ProjectsPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#6366f1');
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
        setIsAddingStatus(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const modalScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when modal opens to guarantee heading and top inputs are immediately visible
  useEffect(() => {
    if (isCreateModalOpen || isEditModalOpen) {
      if (modalScrollRef.current) {
        modalScrollRef.current.scrollTop = 0;
      }
    }
  }, [isCreateModalOpen, isEditModalOpen]);

  // Real users fetched from the backend (source of truth for team assignment)
  const [availableUsers, setAvailableUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState('');

  const loadAvailableUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await getUsers({ status: 'active' });
      if (res && Array.isArray(res.users)) {
        setAvailableUsers(res.users);
      }
    } catch (err: any) {
      setUsersError(err?.message || 'Failed to load users from the server.');
      setAvailableUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadAvailableUsers();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Split real backend users by role for the dropdowns
  const registeredTLs = useMemo(
    () => availableUsers.filter((u) => u.role === 'TL' && u.isActive),
    [availableUsers]
  );
  const registeredTMs = useMemo(
    () => availableUsers.filter((u) => u.role === 'TM' && u.isActive),
    [availableUsers]
  );

  // Team Members filtered by skill search
  const filteredTMs = useMemo(
    () =>
      registeredTMs.filter((tm) => {
        const term = skillFilter.toLowerCase().trim();
        if (!term) return true;
        const haystack = [
          tm.name,
          tm.email,
          ...(tm.skills || []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      }),
    [registeredTMs, skillFilter]
  );

  // Lookup real users by ID (backend users take precedence over the prop)
  const userLookup = useMemo(() => {
    const map = new Map<string, { name: string; email?: string }>();
    [...(teamMembers || []), ...availableUsers].forEach((u) => {
      map.set(String(u.id), u);
    });
    return map;
  }, [teamMembers, availableUsers]);

  // Controlled form state for the project creation form
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    deadline: '',
    status: 'Not Started' as any,
    priority: 'Medium' as Project['priority'],
    teamLeaderId: '',
    teamMemberIds: [] as string[],
    statuses: [
      { name: 'Not Started', color: '#3b82f6', sortOrder: 1, isCompletionStatus: false },
      { name: 'In Progress', color: '#6366f1', sortOrder: 2, isCompletionStatus: false },
      { name: 'Under Review', color: '#f59e0b', sortOrder: 3, isCompletionStatus: false },
      { name: 'Completed', color: '#10b981', sortOrder: 4, isCompletionStatus: true },
    ] as { name: string; color: string | null; sortOrder: number; isCompletionStatus: boolean }[],
  });

  // State to show validation error or notice when user submits the form
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Filter projects when real project data is provided
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        (project.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (project.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (project.manager?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'All' || project.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, searchTerm, statusFilter]);

  const handleOpenModal = () => {
    setFormError(null);
    setEditingProject(null);
    setFormData({
      name: '',
      description: '',
      startDate: '',
      deadline: '',
      status: 'Not Started',
      priority: formData.priority || 'Medium',
      teamLeaderId: '',
      teamMemberIds: [],
      statuses: [
        { name: 'Not Started', color: '#3b82f6', sortOrder: 1, isCompletionStatus: false },
        { name: 'In Progress', color: '#6366f1', sortOrder: 2, isCompletionStatus: false },
        { name: 'Under Review', color: '#f59e0b', sortOrder: 3, isCompletionStatus: false },
        { name: 'Completed', color: '#10b981', sortOrder: 4, isCompletionStatus: true },
      ],
    });
    setIsEditModalOpen(false);
    setIsCreateModalOpen(true);
    loadAvailableUsers();
  };

  const handleEditOpen = async (project: Project) => {
    setFormError(null);
    let projectStatuses = [
      { name: 'Not Started', color: '#3b82f6', sortOrder: 1, isCompletionStatus: false },
      { name: 'In Progress', color: '#6366f1', sortOrder: 2, isCompletionStatus: false },
      { name: 'Under Review', color: '#f59e0b', sortOrder: 3, isCompletionStatus: false },
      { name: 'Completed', color: '#10b981', sortOrder: 4, isCompletionStatus: true },
    ];
    try {
      const res = await getProjectStatuses(project.id);
      if (res && res.statuses && res.statuses.length > 0) {
        projectStatuses = res.statuses.map((s, idx) => ({
          name: s.name,
          color: s.color || '#3b82f6',
          sortOrder: s.sortOrder || idx + 1,
          isCompletionStatus: Boolean(s.isCompletionStatus),
        }));
      }
    } catch {
      // Fallback to default
    }

    setFormData({
      name: project.name,
      description: project.description || '',
      startDate: project.startDate,
      deadline: project.deadline,
      status: project.status,
      priority: project.priority || 'Medium',
      teamLeaderId: project.teamLeaderId || '',
      teamMemberIds: project.teamMemberIds || [],
      statuses: projectStatuses,
    });
    setEditingProject(project);
    setIsCreateModalOpen(false);
    setIsEditModalOpen(true);
    loadAvailableUsers();
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setEditingProject(null);
    setFormError(null);
    setFormData({
      name: '',
      description: '',
      startDate: '',
      deadline: '',
      status: 'Not Started',
      priority: 'Medium',
      teamLeaderId: '',
      teamMemberIds: [],
      statuses: [
        { name: 'Not Started', color: '#3b82f6', sortOrder: 1, isCompletionStatus: false },
        { name: 'In Progress', color: '#6366f1', sortOrder: 2, isCompletionStatus: false },
        { name: 'Under Review', color: '#f59e0b', sortOrder: 3, isCompletionStatus: false },
        { name: 'Completed', color: '#10b981', sortOrder: 4, isCompletionStatus: true },
      ],
    });
  };



  const handleRemoveStatus = (index: number) => {
    setFormData((prev) => {
      if (prev.statuses.length <= 1) return prev;
      const target = prev.statuses[index];
      const remaining = prev.statuses.filter((_, i) => i !== index);
      // If we removed the completion status, designate the last status as completion
      if (target.isCompletionStatus && remaining.length > 0) {
        remaining[remaining.length - 1].isCompletionStatus = true;
      }
      return { ...prev, statuses: remaining };
    });
  };

  const computeInitials = (name: string): string => {
    return (
      name
        .split(/[\s._-]+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'U'
    );
  };

  const handleDeleteProject = async (project: Project) => {
    if (currentUserRole !== 'Project Manager') return;
    const confirmed = window.confirm(
      `Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`
    );
    if (!confirmed) return;
    if (isDeleting) return;

    setIsDeleting(project.id);
    try {
      const res = await deleteProject(project.id);
      if (res.success) {
        if (onDeleteProject) {
          onDeleteProject(project.id);
        }
        setToast({ type: 'success', message: 'Project deleted successfully.' });
      } else {
        setToast({ type: 'error', message: (res as any).error || 'Failed to delete project.' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to delete project.' });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleToggleMember = (memberId: string) => {
    setFormData((prev: any) => {
      const ids = prev.teamMemberIds || [];
      return {
        ...prev,
        teamMemberIds: ids.includes(memberId)
          ? ids.filter((id: string) => id !== memberId)
          : [...ids, memberId],
      };
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Validate required fields
    if (!formData.name.trim()) {
      setFormError('Please enter a Project Title.');
      return;
    }
    if (!formData.startDate) {
      setFormError('Please select a Start Date.');
      return;
    }
    if (!formData.deadline) {
      setFormError('Please select a Project Deadline.');
      return;
    }

    // 2. Validate deadline is not earlier than startDate
    if (new Date(formData.deadline) < new Date(formData.startDate)) {
      setFormError('Deadline cannot be earlier than the start date.');
      return;
    }

    // 3. Validate task statuses
    if (formData.statuses.length === 0) {
      setFormError('At least one task status is required for the project.');
      return;
    }

    const hasEmptyStatus = formData.statuses.some((s) => !s.name.trim());
    if (hasEmptyStatus) {
      setFormError('Status names cannot be blank. Please provide a name for all statuses.');
      return;
    }

    const lowerNames = formData.statuses.map((s) => s.name.trim().toLowerCase());
    const duplicateName = lowerNames.find((name, idx) => lowerNames.indexOf(name) !== idx);
    if (duplicateName) {
      const originalName = formData.statuses.find((s) => s.name.trim().toLowerCase() === duplicateName)?.name || duplicateName;
      setFormError(`Duplicate status name "${originalName}" is not allowed. Each status name must be unique.`);
      return;
    }

    const completionCount = formData.statuses.filter((s) => s.isCompletionStatus).length;
    if (completionCount !== 1) {
      setFormError('Exactly one status must be designated as the Completion status.');
      return;
    }

    if (editingProject) {
      setIsCreating(true);

      try {
        const updated = await updateProject(editingProject.id, {
          name: formData.name.trim(),
          description: formData.description.trim(),
          startDate: formData.startDate,
          deadline: formData.deadline,
          status: formData.status,
          priority: formData.priority,
          teamLeaderId: formData.teamLeaderId || undefined,
          teamMemberIds:
            formData.teamMemberIds.length > 0 ? [...formData.teamMemberIds] : undefined,
        });

        if (updated.success && updated.project) {
          if (onEditProject) {
            onEditProject(updated.project);
          } else if (onAddProject) {
            onAddProject(updated.project);
          }

          setToast({ type: 'success', message: 'Project updated successfully!' });
          setIsEditModalOpen(false);
          setEditingProject(null);
          setFormError(null);
          setFormData({
            name: '',
            description: '',
            startDate: '',
            deadline: '',
            status: 'Not Started',
            priority: 'Medium',
            teamLeaderId: '',
            teamMemberIds: [],
            statuses: [
              { name: 'Not Started', color: '#3b82f6', sortOrder: 1, isCompletionStatus: false },
              { name: 'In Progress', color: '#6366f1', sortOrder: 2, isCompletionStatus: false },
              { name: 'Under Review', color: '#f59e0b', sortOrder: 3, isCompletionStatus: false },
              { name: 'Completed', color: '#10b981', sortOrder: 4, isCompletionStatus: true },
            ],
          });
        } else {
          setFormError((updated as any).error || 'Failed to update project.');
          setToast({ type: 'error', message: (updated as any).error || 'Failed to update project.' });
        }
      } catch (err: any) {
        setFormError(err.message || 'Failed to update project.');
        setToast({ type: 'error', message: err.message || 'Failed to update project.' });
        setIsCreating(false);
      }
      return;
    }

    // Create mode: send to backend
    setIsCreating(true);

    try {
      const created = await createProject({
        name: formData.name.trim(),
        description: formData.description.trim(),
        startDate: formData.startDate,
        deadline: formData.deadline,
        status: formData.status,
        priority: 'Medium',
        teamLeaderId: formData.teamLeaderId || undefined,
        teamMemberIds:
          formData.teamMemberIds.length > 0 ? [...formData.teamMemberIds] : undefined,
        statuses: formData.statuses.map((s, idx) => ({
          name: s.name.trim(),
          color: s.color,
          sortOrder: idx + 1,
          isCompletionStatus: s.isCompletionStatus,
        })),
      });

      if (created.success && created.project) {
        if (onAddProject) {
          onAddProject(created.project);
        }

        // Reset form and close modal
        setFormData({
          name: '',
          description: '',
          startDate: '',
          deadline: '',
          status: 'Not Started',
          priority: 'Medium',
          teamLeaderId: '',
      teamMemberIds: [],
      statuses: [
        { name: 'Not Started', color: '#3b82f6', sortOrder: 1, isCompletionStatus: false },
        { name: 'In Progress', color: '#6366f1', sortOrder: 2, isCompletionStatus: false },
        { name: 'Under Review', color: '#f59e0b', sortOrder: 3, isCompletionStatus: false },
        { name: 'Completed', color: '#10b981', sortOrder: 4, isCompletionStatus: true },
      ],
    });
    setIsCreateModalOpen(false);
        setFormError(null);
      } else {
        setFormError((created as any).error || 'Failed to create project.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to create project.');
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Completed (PM Approved)
          </span>
        );
      case 'In Progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            In Progress
          </span>
        );
      case 'Planning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            Planning
          </span>
        );
      case 'On Hold':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            On Hold
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Projects
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-light border border-accent/30">
              {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Manage, track progress, and coordinate enterprise initiatives across teams.
          </p>
        </div>

        {/* Create Project Button â€” PM only */}
        {currentUserRole === 'Project Manager' && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-accent to-accent-hover hover:from-accent hover:to-accent-hover shadow-lg shadow-accent/25 active:scale-[0.99] transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Project</span>
          </button>
        )}
      </div>

      {/* 2. Empty State when no real projects exist */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 sm:p-14 text-center flex flex-col items-center justify-center min-h-[380px]">
          <div className="w-16 h-16 rounded-2xl bg-accent-soft border border-accent/30 flex items-center justify-center text-accent-light mb-4 shadow-lg shadow-accent/10">
            <FolderKanban className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">
            No projects yet. Create your first project.
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            There are currently no active projects in the database. When projects are created by the Project Manager, they will appear here with progress tracking, assigned leads, and milestone deadlines.
          </p>
          {currentUserRole === 'Project Manager' && (
            <button
              type="button"
              onClick={handleOpenModal}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-accent hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create your first project</span>
            </button>
          )}
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
                placeholder="Search by project name, description, or Project Manager..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/80"
              />
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 md:pb-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Status:</span>
              </div>

              {(['All', 'In Progress', 'Completed', 'Planning', 'On Hold'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    statusFilter === status
                      ? 'bg-accent text-white shadow-md shadow-accent/20'
                      : 'bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60'
                  }`}
                >
                  {status}
                </button>
              ))}

              {/* Toggle between Card / Table layout */}
              <div className="ml-auto md:ml-2 flex items-center border border-slate-700/80 rounded-xl p-0.5 bg-slate-900/70 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'card' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'table' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Table
                </button>
              </div>
            </div>
          </div>

          {/* Filtered empty state */}
          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-12 text-center flex flex-col items-center justify-center min-h-[280px]">
              <div className="w-12 h-12 rounded-2xl bg-accent-soft border border-accent/20 flex items-center justify-center text-accent-light mb-3">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white">No matching projects found</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                No projects matched your criteria. Try adjusting your search query or status filter.
              </p>
            </div>
          ) : viewMode === 'card' ? (
            /* Card Layout */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => onSelectProject && onSelectProject(project)}
                  className={`rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 hover:border-accent/50 shadow-xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-accent/10 group ${onSelectProject ? 'cursor-pointer' : ''}`}
                >
                  <div>
                    {/* Header: Status and Code */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[11px] font-mono text-accent-light/80 px-2 py-0.5 rounded-md bg-accent-soft border border-accent/20">
                        {project.id}
                      </span>
                      {project.projectKey && (
                        <span className="text-[10px] font-medium text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-500/30">
                          {project.projectKey}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        {currentUserRole === 'Project Manager' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditOpen(project);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-accent-light hover:bg-accent-soft transition-colors"
                            title="Edit Project"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {currentUserRole === 'Project Manager' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project);
                            }}
                            disabled={isDeleting === project.id}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete Project"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {getStatusBadge(project.status)}
                      </div>
                    </div>

                    {/* Project Title & Description */}
                    <h3 className="text-base font-bold text-white group-hover:text-accent-light transition-colors line-clamp-1">
                      {project.name}
                    </h3>
                    <p className="mt-1.5 text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>

                    {/* Project Manager Details */}
                    <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-accent-hover text-white font-semibold text-xs flex items-center justify-center shadow-md shadow-accent/20 ring-1 ring-accent/30">
                          {project.manager.avatarInitials}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white">
                            {project.manager.name}
                          </div>
                          <div className="text-[10px] text-accent-light flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-accent-light" />
                            <span>Responsible PM</span>
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                        {project.priority}
                      </span>
                    </div>

                    {/* Team Assignment Chips */}
                    {(project.teamLeaderId || (project.teamMemberIds && project.teamMemberIds.length > 0)) && (
                      <div className="mt-3 space-y-1.5">
                          {project.teamLeaderId && (() => {
                            const tl = userLookup.get(String(project.teamLeaderId));
                            return tl ? (
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span className="text-[10px] text-indigo-300 font-medium">TL:</span>
                              <span className="text-[10px] text-slate-200 truncate">{tl.name}</span>
                            </div>
                          ) : null;
                        })()}
                        {project.teamMemberIds && project.teamMemberIds.length > 0 && (
                          <div className="flex items-start gap-1.5">
                            <Users className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="text-[10px] text-emerald-300 font-medium shrink-0">Team:</span>
                            <span className="text-[10px] text-slate-300 leading-relaxed">
                              {project.teamMemberIds
                                .map((id) => userLookup.get(String(id))?.name)
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dates: Start & Deadline */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Start Date</span>
                        <span className="text-slate-200 font-medium flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {project.startDate}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Deadline</span>
                        <span className="text-slate-200 font-medium flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-purple-400" />
                          {project.deadline}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-300 font-medium">Completion Progress</span>
                      <span className="font-bold text-white">{project.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          project.progress === 100
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : 'bg-gradient-to-r from-accent to-accent-hover'
                        }`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        Tasks: <strong>{project.tasksCount.completed}</strong>/{project.tasksCount.total}
                      </span>
                      {project.status === 'Completed' && (
                        <span className="text-emerald-400 text-[10px] font-medium">Verified by PM</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table Layout */
            <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#0b112c]/90 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Project Name</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Project Manager</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Team</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Start Date</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Deadline</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Status</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Progress</th>
                      <th scope="col" className="px-4 py-3.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredProjects.map((project) => (
                      <tr
                        key={project.id}
                        onClick={() => onSelectProject && onSelectProject(project)}
                        className={`hover:bg-slate-800/40 transition-colors ${onSelectProject ? 'cursor-pointer' : ''}`}
                      >
                    {/* Project Name & Description */}
                         <td className="px-5 py-4 max-w-xs">
                           <div className="flex items-center gap-2">
                             <span className="text-[10px] font-mono text-accent-light/80 px-1.5 py-0.5 rounded bg-accent-soft border border-accent/20">
                               {project.id}
                             </span>
                             {project.projectKey && (
                               <span className="text-[9px] font-medium text-emerald-300 px-1.5 py-0.2 rounded bg-emerald-900/40 border border-emerald-500/30">
                                 {project.projectKey}
                               </span>
                             )}
                             <div className="font-bold text-white text-sm">{project.name}</div>
                           </div>
                           <p className="mt-1 text-slate-400 text-[11px] line-clamp-1">
                             {project.description}
                           </p>
                         </td>

                        {/* Responsible PM */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-accent to-accent-hover text-white font-semibold text-[10px] flex items-center justify-center">
                              {project.manager.avatarInitials}
                            </div>
                            <div>
                              <div className="font-semibold text-white">{project.manager.name}</div>
                              <div className="text-[10px] text-accent-light">Responsible PM</div>
                            </div>
                          </div>
                        </td>

                        {/* Team Assignment */}
                        <td className="px-5 py-4">
                          <div className="space-y-0.5 text-[11px]">
                            {project.teamLeaderId ? (
                              <div className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span className="text-indigo-300">{userLookup.get(String(project.teamLeaderId))?.name ?? 'â€”'}</span>
                              </div>
                            ) : <span className="text-slate-600 italic">No TL</span>}
                            {project.teamMemberIds && project.teamMemberIds.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="text-slate-300">{project.teamMemberIds.length} member{project.teamMemberIds.length !== 1 ? 's' : ''}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Start Date */}
                        <td className="px-5 py-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                          {project.startDate}
                        </td>

                        {/* Deadline */}
                        <td className="px-5 py-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                          {project.deadline}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {getStatusBadge(project.status)}
                        </td>

                        {/* Progress */}
                        <td className="px-5 py-4 whitespace-nowrap w-44">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-semibold text-white">{project.progress}%</span>
                            <span className="text-slate-400 text-[10px]">
                              {project.tasksCount.completed}/{project.tasksCount.total} tasks
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className={`h-full rounded-full ${
                                project.progress === 100
                                  ? 'bg-emerald-400'
                                  : 'bg-gradient-to-r from-accent to-accent-hover'
                              }`}
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                        </td>

                        {/* Open Details */}
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {currentUserRole === 'Project Manager' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditOpen(project);
                                }}
className="p-1 rounded-lg text-slate-400 hover:text-accent-light hover:bg-accent-soft transition-colors"
                                title="Edit Project"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <span className="text-[11px] text-purple-400 font-medium">
                              View â†’
                            </span>
                            {currentUserRole === 'Project Manager' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProject(project);
                                }}
                                disabled={isDeleting === project.id}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete project"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

            {/* Modern, Compact Create / Edit Project Modal */}
      {(isCreateModalOpen || isEditModalOpen) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            className="relative w-full max-w-lg sm:max-w-xl bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl flex flex-col my-auto overflow-hidden max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent-soft border border-accent/30 flex items-center justify-center text-accent-light shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="create-project-title" className="text-base sm:text-lg font-bold text-white leading-tight">
                    {editingProject ? 'Edit Project' : 'Create New Project'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingProject ? 'Update project settings and assignments' : 'Define project details, schedule, and team'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div ref={modalScrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Validation Error Banner */}
              {formError && (
                <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5 shadow-sm">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{formError}</span>
                </div>
              )}

              <form id="create-project-form" onSubmit={handleFormSubmit} className="space-y-5">
                {/* Project Details */}
                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="projectName" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Project Title <span className="text-accent-light">*</span>
                    </label>
                    <input
                      id="projectName"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Website Redesign, Mobile App..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-accent transition-all"
                    />
                  </div>

                  <div>
                    <label htmlFor="projectDescription" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Description
                    </label>
                    <textarea
                      id="projectDescription"
                      rows={2}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Add a brief description of project goals and scope..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/80 focus:border-accent transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Timeline, Priority & Status */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="startDate" className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Start Date <span className="text-accent-light">*</span>
                      </label>
                      <input
                        id="startDate"
                        type="date"
                        required
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/80 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label htmlFor="deadline" className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Deadline <span className="text-accent-light">*</span>
                      </label>
                      <input
                        id="deadline"
                        type="date"
                        required
                        value={formData.deadline}
                        onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/80 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label htmlFor="projectPriority" className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Priority
                      </label>
                      <select
                        id="projectPriority"
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value as Project['priority'] })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/80 cursor-pointer"
                      >
                        <option value="High" className="bg-[#0f172a]">High Priority</option>
                        <option value="Medium" className="bg-[#0f172a]">Medium Priority</option>
                        <option value="Low" className="bg-[#0f172a]">Low Priority</option>
                      </select>
                    </div>

                    {/* Initial Project Status Dropdown with + Add Status */}
                    <div className="relative" ref={statusDropdownRef}>
                      <label htmlFor="projectStatus" className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Initial Project Status
                      </label>
<button
                        type="button"
                        id="projectStatus"
                        onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-white flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-accent/80 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                formData.statuses.find(
                                  (s) => s.name.toLowerCase() === (formData.status || '').toLowerCase()
                                )?.color || '#3b82f6',
                            }}
                          />
                          <span className="truncate">
                            {formData.status || 'Not Started'}
                          </span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${
                            isStatusDropdownOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {/* Dropdown Menu */}
                      {isStatusDropdownOpen && (
                        <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-full sm:w-72 rounded-xl bg-[#0b1120] border border-slate-700/90 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                          {/* Status Options List */}
                          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                            {formData.statuses.map((status, idx) => {
                              const isSelected =
                                (formData.status || '').toLowerCase() === status.name.toLowerCase();
                              return (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    setFormData({ ...formData, status: status.name as any });
                                    setIsStatusDropdownOpen(false);
                                  }}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-purple-600/30 text-white font-semibold border border-purple-500/40'
                                      : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: status.color || '#3b82f6' }}
                                    />
                                    <span className="truncate">{status.name}</span>
                                    {status.isCompletionStatus && (
                                      <span className="text-[9px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                                        Done
                                      </span>
                                    )}
                                  </div>

                                  {/* Delete custom status if not completion and length > 1 */}
                                  {formData.statuses.length > 1 && !status.isCompletionStatus && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveStatus(idx);
                                      }}
                                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-1 shrink-0"
                                      title="Remove status"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* + Add Status button / inline input */}
                          <div className="border-t border-slate-800/80 pt-1.5 mt-1.5">
                            {isAddingStatus ? (
                              <div className="p-2 space-y-2 bg-slate-900 rounded-lg border border-slate-700/80">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={newStatusColor}
                                    onChange={(e) => setNewStatusColor(e.target.value)}
                                    className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer p-0 shrink-0"
                                    title="Pick color"
                                  />
                                  <input
                                    type="text"
                                    autoFocus
                                    value={newStatusName}
                                    onChange={(e) => setNewStatusName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const trimmed = newStatusName.trim();
                                        if (!trimmed) return;
                                        if (
                                          formData.statuses.some(
                                            (s) => s.name.toLowerCase() === trimmed.toLowerCase()
                                          )
                                        ) {
                                          setFormError(`Status "${trimmed}" already exists.`);
                                          return;
                                        }
                                        const newS = {
                                          name: trimmed,
                                          color: newStatusColor || '#6366f1',
                                          sortOrder: formData.statuses.length + 1,
                                          isCompletionStatus: false,
                                        };
                                        // Append to status list without changing currently selected status at top
                                        setFormData((prev) => ({
                                          ...prev,
                                          statuses: [...prev.statuses, newS],
                                        }));
                                        setNewStatusName('');
                                        setIsAddingStatus(false);
                                      }
                                    }}
                                    placeholder="Status name..."
                                    className="flex-1 min-w-0 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-accent"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsAddingStatus(false);
                                      setNewStatusName('');
                                    }}
                                    className="px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const trimmed = newStatusName.trim();
                                      if (!trimmed) return;
                                      if (
                                        formData.statuses.some(
                                          (s) => s.name.toLowerCase() === trimmed.toLowerCase()
                                        )
                                      ) {
                                        setFormError(`Status "${trimmed}" already exists.`);
                                        return;
                                      }
                                      const newS = {
                                        name: trimmed,
                                        color: newStatusColor || '#6366f1',
                                        sortOrder: formData.statuses.length + 1,
                                        isCompletionStatus: false,
                                      };
                                      // Append without changing selected status at top
                                      setFormData((prev) => ({
                                        ...prev,
                                        statuses: [...prev.statuses, newS],
                                      }));
                                      setNewStatusName('');
                                      setIsAddingStatus(false);
                                    }}
                                    className="px-2.5 py-0.5 rounded bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAddingStatus(true);
                                  setNewStatusName('');
                                  setNewStatusColor('#6366f1');
                                }}
                                className="w-full py-1 px-2.5 rounded-lg border border-dashed border-accent/30 hover:border-accent/70 bg-accent-soft hover:bg-accent/10 text-accent-light text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 text-accent-light" />
                                <span>Add Status</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Team Leadership & Assignments */}
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Project Manager */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-accent text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {computeInitials(currentUserName || 'PM')}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{currentUserName || 'Current User'}</div>
                          <div className="text-[10px] text-slate-400">Project Manager</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 shrink-0">
                        Owner
                      </span>
                    </div>

                    {/* Team Leader */}
                    <div>
                      {usersLoading ? (
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                          Loading Team Leaders...
                        </div>
                      ) : usersError ? (
                        <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                          {usersError}
                        </div>
                      ) : registeredTLs.length === 0 ? (
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                          No Team Leaders available
                        </div>
                      ) : (
                        <select
                          id="assignTL"
                          value={formData.teamLeaderId}
                          onChange={(e) => setFormData({ ...formData, teamLeaderId: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                        >
                          <option value="" className="bg-[#0f172a]">-- Assign Team Leader --</option>
                          {registeredTLs.map((tl) => (
                            <option key={tl.id} value={tl.id} className="bg-[#0f172a]">
                              {tl.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Team Members Selection */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        Team Members
                      </label>
                      <span className="text-[11px] font-medium text-accent-light bg-accent-soft px-2 py-0.5 rounded-full border border-accent/20">
                        {formData.teamMemberIds.length} selected
                      </span>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Search className="w-3.5 h-3.5" />
                      </div>
                      <input
                        value={skillFilter}
                        onChange={(e) => setSkillFilter(e.target.value)}
                        placeholder="Search members by name or skill..."
                        className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/70 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/70"
                      />
                    </div>

                    <div className="rounded-xl bg-slate-900/80 border border-slate-800 max-h-36 overflow-y-auto divide-y divide-slate-800/60 shadow-inner">
                      {usersLoading ? (
                        <div className="p-3 text-center text-xs text-slate-400">Loading members...</div>
                      ) : registeredTMs.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">No members found.</div>
                      ) : filteredTMs.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">No members match search.</div>
                      ) : (
                        filteredTMs.map((tm) => {
                          const selected = formData.teamMemberIds.includes(String(tm.id));
                          return (
<label
                              key={tm.id}
                              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                                selected ? 'bg-accent-soft' : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => handleToggleMember(String(tm.id))}
                                className="accent-purple-500 w-3.5 h-3.5 rounded shrink-0 cursor-pointer"
                              />
                              <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                {computeInitials(tm.name)}
                              </div>
                              <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                                <span className="text-xs text-slate-200 truncate">{tm.name}</span>
                                {tm.skills && tm.skills.length > 0 && (
                                  <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                    {tm.skills.slice(0, 2).join(', ')}
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer (Clean & Professional) */}
            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-project-form"
                disabled={isCreating}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-accent to-accent-hover hover:from-accent hover:to-accent-hover shadow-md shadow-accent/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{editingProject ? 'Saving...' : 'Creating...'}</span>
                  </>
                ) : (
                  <span>{editingProject ? 'Save Changes' : 'Create Project'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}


      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[100] px-6 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
