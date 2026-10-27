import React, { useState, useMemo } from 'react';
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
  Info,
  Briefcase,
} from 'lucide-react';
import type { Project } from '../types/pms';

export type { Project };

interface ProjectsPageProps {
  projects?: Project[];
  onAddProject?: (project: Project) => void;
  onSelectProject?: (project: Project) => void;
}

export default function ProjectsPage({ projects = [], onAddProject, onSelectProject }: ProjectsPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Controlled form state for the project creation form
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    managerName: '',
    startDate: '',
    deadline: '',
    status: 'Planning' as Project['status'],
  });

  // State to show validation error or notice when user submits the form
  const [formError, setFormError] = useState<string | null>(null);

  // Filter projects when real project data is provided
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.manager.name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'All' || project.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, searchTerm, statusFilter]);

  const handleOpenModal = () => {
    setFormError(null);
    setFormData({
      name: '',
      description: '',
      managerName: '',
      startDate: '',
      deadline: '',
      status: 'Planning',
    });
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setFormError(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate required fields
    if (!formData.name.trim() || !formData.managerName.trim() || !formData.startDate || !formData.deadline) {
      setFormError('Please fill in all required fields.');
      return;
    }

    // Validate deadline is not earlier than startDate
    if (new Date(formData.deadline) < new Date(formData.startDate)) {
      setFormError('Deadline cannot be earlier than the start date.');
      return;
    }

    // Generate safe unique project ID
    const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();
    const newProjectId = `PRJ-${uniqueSuffix}`;

    // Derive avatar initials
    const initials = formData.managerName
      .trim()
      .split(/[\s._-]+/)
      .slice(0, 2)
      .map((s) => s.charAt(0).toUpperCase())
      .join('') || 'PM';

    const newProject: Project = {
      id: newProjectId,
      name: formData.name.trim(),
      description: formData.description.trim(),
      manager: {
        name: formData.managerName.trim(),
        role: 'Project Manager',
        avatarInitials: initials,
      },
      startDate: formData.startDate,
      deadline: formData.deadline,
      status: formData.status,
      progress: 0,
      priority: 'Medium',
      tasksCount: {
        completed: 0,
        total: 0,
      },
    };

    if (onAddProject) {
      onAddProject(newProject);
    }

    // Reset form and close modal
    setFormData({
      name: '',
      description: '',
      managerName: '',
      startDate: '',
      deadline: '',
      status: 'Planning',
    });
    setIsCreateModalOpen(false);
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

        {/* Create Project Button */}
        <button
          type="button"
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/25 active:scale-[0.99] transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Project</span>
        </button>
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
          <button
            type="button"
            onClick={handleOpenModal}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create your first project</span>
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
                      <div>{getStatusBadge(project.status)}</div>
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
                          <span className="text-[11px] text-purple-400 font-medium">
                            View →
                          </span>
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
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">Create New Project</h3>
                  <p className="text-xs text-slate-400">Fill in the project details below</p>
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
                <strong>Create Project:</strong> Enter project specifications. Newly created projects will appear in your workspace and task assignment workflows.
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

              {/* Responsible Project Manager */}
              <div>
                <label htmlFor="projectManager" className="block text-xs font-medium text-slate-200 mb-1">
                  Responsible Project Manager <span className="text-purple-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <input
                    id="projectManager"
                    type="text"
                    required
                    value={formData.managerName}
                    onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                    placeholder="e.g. Lead Project Manager Name"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                  />
                </div>
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
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/30 transition-all cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
