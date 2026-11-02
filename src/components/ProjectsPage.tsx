import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderKanban,
  Search,
  Plus,
  Calendar,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  SlidersHorizontal,
  Layers,
  X,
  Info,
  Briefcase,
  Users,
  ShieldCheck,
  Edit,
} from 'lucide-react';
import type { Project, TeamMember, UserRole } from '../types/pms';
import { createProject, updateProject, deleteProject, getUsers, type ApiUser } from '../services/api';

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
    status: 'Planning' as Project['status'],
    priority: 'Medium' as Project['priority'],
    teamLeaderId: '',
    teamMemberIds: [] as string[],
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
      status: 'Planning',
      priority: 'Medium',
      teamLeaderId: '',
      teamMemberIds: [],
    });
    setIsEditModalOpen(false);
    setIsCreateModalOpen(true);
    // Fetch the latest available users when opening the creation form
    loadAvailableUsers();
  };

  const handleEditOpen = (project: Project) => {
    setFormError(null);
    setFormData({
      name: project.name,
      description: project.description,
      startDate: project.startDate,
      deadline: project.deadline,
      status: project.status,
      priority: project.priority,
      teamLeaderId: project.teamLeaderId || '',
      teamMemberIds: project.teamMemberIds || [],
    });
    setEditingProject(project);
    setIsCreateModalOpen(false);
    setIsEditModalOpen(true);
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
      status: 'Planning',
      priority: 'Medium',
      teamLeaderId: '',
      teamMemberIds: [],
    });
    setIsEditModalOpen(false);
    setEditingProject(null);
  };

  // Toggle a team member in/out of the multi-select list
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

    // Validate required fields
    if (!formData.name.trim() || !formData.startDate || !formData.deadline) {
      setFormError('Please fill in all required fields.');
      return;
    }

    // Validate deadline is not earlier than startDate
    if (new Date(formData.deadline) < new Date(formData.startDate)) {
      setFormError('Deadline cannot be earlier than the start date.');
      return;
    }

    // Edit mode: update existing project via backend
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
            status: 'Planning',
            priority: 'Medium',
            teamLeaderId: '',
            teamMemberIds: [],
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
          status: 'Planning',
          priority: 'Medium',
          teamLeaderId: '',
          teamMemberIds: [],
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
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Manage, track progress, and coordinate enterprise initiatives across teams.
          </p>
        </div>

        {/* Create Project Button — PM only */}
        {currentUserRole === 'Project Manager' && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/25 active:scale-[0.99] transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Project</span>
          </button>
        )}
      </div>

      {/* 2. Empty State when no real projects exist */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 sm:p-14 text-center flex flex-col items-center justify-center min-h-[380px]">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-lg shadow-purple-500/10">
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
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/20 cursor-pointer"
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
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
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
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
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
                    viewMode === 'card' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'table' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
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
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
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
                  className={`rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 hover:border-purple-500/50 shadow-xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-purple-500/10 group ${onSelectProject ? 'cursor-pointer' : ''}`}
                >
                  <div>
                    {/* Header: Status and Code */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[11px] font-mono text-purple-300/80 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20">
                        {project.id}
                      </span>
                      <div className="flex items-center gap-1">
                        {currentUserRole === 'Project Manager' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditOpen(project);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
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
                    <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
                      {project.name}
                    </h3>
                    <p className="mt-1.5 text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>

                    {/* Project Manager Details */}
                    <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-semibold text-xs flex items-center justify-center shadow-md shadow-purple-500/20 ring-1 ring-purple-500/30">
                          {project.manager.avatarInitials}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white">
                            {project.manager.name}
                          </div>
                          <div className="text-[10px] text-purple-300 flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-purple-400" />
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
                            : 'bg-gradient-to-r from-purple-500 to-indigo-500'
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
                            <span className="text-[10px] font-mono text-purple-300/80 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                              {project.id}
                            </span>
                            <div className="font-bold text-white text-sm">{project.name}</div>
                          </div>
                          <p className="mt-1 text-slate-400 text-[11px] line-clamp-1">
                            {project.description}
                          </p>
                        </td>

                        {/* Responsible PM */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-semibold text-[10px] flex items-center justify-center">
                              {project.manager.avatarInitials}
                            </div>
                            <div>
                              <div className="font-semibold text-white">{project.manager.name}</div>
                              <div className="text-[10px] text-purple-300">Responsible PM</div>
                            </div>
                          </div>
                        </td>

                        {/* Team Assignment */}
                        <td className="px-5 py-4">
                          <div className="space-y-0.5 text-[11px]">
                            {project.teamLeaderId ? (
                              <div className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span className="text-indigo-300">{userLookup.get(String(project.teamLeaderId))?.name ?? '—'}</span>
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
                                  : 'bg-gradient-to-r from-purple-500 to-indigo-500'
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
                                className="p-1 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
                                title="Edit Project"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <span className="text-[11px] text-purple-400 font-medium">
                              View →
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

      {/* 3. "Create Project" Form Modal */}
      {(isCreateModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">
                    {editingProject ? 'Edit Project' : 'Create New Project'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingProject
                      ? 'Update the project details below'
                      : 'Fill in the project details below'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Architecture / Status Notice */}
            <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                <strong>Create Project:</strong> Assign a Team Leader and Team Members from registered workspace users. Assignments are saved and visible after refresh.
              </span>
            </div>

            {/* Validation Error Banner */}
            {formError && (
              <div className="mt-3 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Project Creation Form */}
            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              {/* Project Name */}
              <div>
                <label htmlFor="projectName" className="block text-xs font-medium text-slate-200 mb-1">
                  Project Name <span className="text-purple-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <FolderKanban className="w-4 h-4" />
                  </div>
                  <input
                    id="projectName"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Enterprise Cloud Platform"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="projectDescription" className="block text-xs font-medium text-slate-200 mb-1">
                  Description
                </label>
                <div className="relative">
                  <textarea
                    id="projectDescription"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the project objectives and scope..."
                    className="w-full p-3 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80 resize-none"
                  />
                </div>
              </div>

              {/* Responsible Project Manager — auto-filled from logged-in user */}
              <div>
                <label className="block text-xs font-medium text-slate-200 mb-1">
                  Responsible Project Manager
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-700/60 text-sm text-slate-200">
                  <UserCheck className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{currentUserName || 'Current User (PM)'}</span>
                  <span className="ml-auto text-[10px] text-purple-300 font-medium">Auto-assigned</span>
                </div>
              </div>

              {/* Assign Team Leader */}
              <div>
                <label htmlFor="assignTL" className="block text-xs font-medium text-slate-200 mb-1">
                  Assign Team Leader
                </label>
                {usersLoading ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-900/50 border border-slate-700/60 text-xs text-slate-400 italic">
                    Loading available users...
                  </div>
                ) : usersError ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{usersError}</span>
                  </div>
                ) : registeredTLs.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/30 border border-amber-700/30 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    No active Team Leaders available. Create one in the Team page first.
                  </div>
                ) : (
                  <select
                    id="assignTL"
                    value={formData.teamLeaderId}
                    onChange={(e) => setFormData({ ...formData, teamLeaderId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                  >
                    <option value="" className="bg-[#0f173b]">— None (assign later) —</option>
                    {registeredTLs.map((tl) => (
                      <option key={tl.id} value={tl.id} className="bg-[#0f173b]">
                        {tl.name}{tl.skills && tl.skills.length > 0 ? ` — Skills: ${tl.skills.join(', ')}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Assign Team Members */}
              <div>
                <label className="block text-xs font-medium text-slate-200 mb-1">
                  Assign Team Members
                  {formData.teamMemberIds.length > 0 && (
                    <span className="ml-2 text-[10px] text-emerald-300 font-normal">
                      ({formData.teamMemberIds.length} selected)
                    </span>
                  )}
                </label>
                {usersLoading ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-900/50 border border-slate-700/60 text-xs text-slate-400 italic">
                    Loading available users...
                  </div>
                ) : usersError ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{usersError}</span>
                  </div>
                ) : registeredTMs.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/30 border border-amber-700/30 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    No active Team Members available. Create Team Members in the Team page first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Skill search / filter */}
                    <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1">
                        Search by name, email, or skill
                      </label>
                      <input
                        id="skillFilter"
                        value={skillFilter}
                        onChange={(e) => setSkillFilter(e.target.value)}
                        placeholder="e.g. React, TypeScript, PostgreSQL..."
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                      />
                    </div>
                    <div className="rounded-xl bg-slate-900/80 border border-slate-700/80 max-h-40 overflow-y-auto divide-y divide-slate-800/60">
                      {filteredTMs.length === 0 && skillFilter.trim() !== '' ? (
                        <div className="p-3 text-center text-xs text-slate-400 italic">
                          No Team Members match the selected skill.
                        </div>
                      ) : (
                        filteredTMs.map((tm) => {
                          const selected = formData.teamMemberIds.includes(String(tm.id));
                          return (
                            <label
                              key={tm.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                selected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => handleToggleMember(String(tm.id))}
                                className="accent-emerald-500 w-3.5 h-3.5 shrink-0"
                              />
                          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                            {tm.name
                              .split(/[\s._-]+/)
                              .slice(0, 2)
                              .map((s) => s.charAt(0).toUpperCase())
                              .join('') || 'U'}
                          </div>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-white truncate">{tm.name}</div>
                                <div className="text-[10px] text-slate-400 truncate">{tm.role || ''}</div>
                                {tm.skills && tm.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {tm.skills.map((skill) => (
                                      <span
                                        key={skill}
                                        className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[9px] text-purple-300"
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                    {filteredTMs.length === 0 && skillFilter.trim() === '' && (
                      <div className="p-2 text-center text-xs text-slate-500 italic">
                        No eligible Team Members available.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dates Grid: Start Date & Deadline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="startDate" className="block text-xs font-medium text-slate-200 mb-1">
                    Start Date <span className="text-purple-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="startDate"
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="deadline" className="block text-xs font-medium text-slate-200 mb-1">
                    Deadline <span className="text-purple-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="deadline"
                      type="date"
                      required
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                    />
                  </div>
                </div>
              </div>

              {/* Status Select */}
              <div>
                <label htmlFor="projectStatus" className="block text-xs font-medium text-slate-200 mb-1">
                  Status
                </label>
                <select
                  id="projectStatus"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                >
                  <option value="Planning" className="bg-[#0f173b]">Planning</option>
                  <option value="In Progress" className="bg-[#0f173b]">In Progress</option>
                  <option value="On Hold" className="bg-[#0f173b]">On Hold</option>
                  <option value="Completed" className="bg-[#0f173b]">Completed (PM Approved)</option>
                </select>
              </div>

              {/* Modal Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingProject ? 'Save Changes' : isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
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
