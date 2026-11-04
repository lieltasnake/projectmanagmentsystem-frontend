import React, { useMemo, useState } from 'react';
import {
  FolderKanban,
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Filter,
  BarChart3,
  Calendar,
  Layers,
  Sparkles,
  RotateCcw,
  User,
  Bug as BugIcon,
} from 'lucide-react';
import type { Project, Task, Bug } from '../types/pms';

interface ReportsPageProps {
  projects?: Project[];
  tasks?: Task[];
  bugs?: Bug[];
}

const THEME_STYLES = {
  purple: {
    cardBg: 'bg-purple-950/20 border-purple-500/20 hover:border-purple-500/40',
    iconBg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    text: 'text-purple-400',
    subText: 'text-purple-300/70',
  },
  blue: {
    cardBg: 'bg-blue-950/20 border-blue-500/20 hover:border-blue-500/40',
    iconBg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    text: 'text-blue-400',
    subText: 'text-blue-300/70',
  },
  emerald: {
    cardBg: 'bg-emerald-950/20 border-emerald-500/20 hover:border-emerald-500/40',
    iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    text: 'text-emerald-400',
    subText: 'text-emerald-300/70',
  },
  amber: {
    cardBg: 'bg-amber-950/20 border-amber-500/20 hover:border-amber-500/40',
    iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    text: 'text-amber-400',
    subText: 'text-amber-300/70',
  },
  rose: {
    cardBg: 'bg-rose-950/20 border-rose-500/20 hover:border-rose-500/40',
    iconBg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    text: 'text-rose-400',
    subText: 'text-rose-300/70',
  },
  slate: {
    cardBg: 'bg-slate-900/40 border-slate-700/40 hover:border-slate-600/50',
    iconBg: 'bg-slate-700/30 text-slate-300 border-slate-600/40',
    text: 'text-slate-300',
    subText: 'text-slate-400',
  },
};

export default function ReportsPage({
  projects = [],
  tasks = [],
  bugs = [],
}: ReportsPageProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Midnight-anchored date matching DashboardLayout rule
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayDate = useMemo(() => new Date(todayStr), [todayStr]);

  // Project lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  // Overdue check strictly consistent with Dashboard
  const isTaskOverdue = (task: Task): boolean => {
    return Boolean(
      task.status !== 'Completed' &&
        task.deadline &&
        new Date(task.deadline) < todayDate
    );
  };

  // Filter tasks based on selected project and status
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesProject =
        selectedProjectId === 'all' || t.projectId === selectedProjectId;

      let matchesStatus = true;
      if (selectedStatus === 'Completed') {
        matchesStatus = t.status === 'Completed';
      } else if (selectedStatus === 'In Progress') {
        matchesStatus = t.status === 'In Progress';
      } else if (selectedStatus === 'Under Review') {
        matchesStatus = t.status === 'Under Review';
      } else if (selectedStatus === 'Not Started') {
        matchesStatus = t.status === 'Not Started';
      } else if (selectedStatus === 'Overdue') {
        matchesStatus = isTaskOverdue(t);
      }

      return matchesProject && matchesStatus;
    });
  }, [tasks, selectedProjectId, selectedStatus, todayDate]);

  // Filter projects based on selected project
  const visibleProjects = useMemo(() => {
    if (selectedProjectId === 'all') return projects;
    return projects.filter((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  // Scope counts to the selected project (or all projects)
  const scopedTasks = useMemo(() => {
    if (selectedProjectId === 'all') return tasks;
    return tasks.filter((t) => t.projectId === selectedProjectId);
  }, [tasks, selectedProjectId]);

  const counts = useMemo(() => {
    const totalProjects = visibleProjects.length;
    const totalTasks = scopedTasks.length;
    const completed = scopedTasks.filter((t) => t.status === 'Completed').length;
    const inProgress = scopedTasks.filter((t) => t.status === 'In Progress').length;
    const underReview = scopedTasks.filter((t) => t.status === 'Under Review').length;
    const notStarted = scopedTasks.filter((t) => t.status === 'Not Started').length;
    const overdue = scopedTasks.filter((t) => isTaskOverdue(t)).length;

    const completionRate =
      totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

    return {
      totalProjects,
      totalTasks,
      completed,
      inProgress,
      underReview,
      notStarted,
      overdue,
      completionRate,
    };
  }, [visibleProjects, scopedTasks, todayDate]);

  const hasActiveFilters = selectedProjectId !== 'all' || selectedStatus !== 'All';

  const resetFilters = () => {
    setSelectedProjectId('all');
    setSelectedStatus('All');
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-8 h-8 text-purple-400" />
            Reports & Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Real-time project health, task completion status, and deadline compliance.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#0f173b]/90 border border-slate-700/60 px-3 py-1.5 rounded-xl shadow-sm">
            <Filter className="w-4 h-4 text-purple-400 shrink-0" />
            <label htmlFor="report-project-filter" className="text-xs font-semibold text-slate-400 shrink-0">
              Project:
            </label>
            <select
              id="report-project-filter"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer pr-2"
            >
              <option value="all" className="bg-slate-900 text-white">
                All Projects ({projects.length})
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#0f173b]/90 border border-slate-700/60 px-3 py-1.5 rounded-xl shadow-sm">
            <label htmlFor="report-status-filter" className="text-xs font-semibold text-slate-400 shrink-0">
              Status:
            </label>
            <select
              id="report-status-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer pr-2"
            >
              <option value="All" className="bg-slate-900 text-white">All Statuses</option>
              <option value="Completed" className="bg-slate-900 text-white">Completed</option>
              <option value="In Progress" className="bg-slate-900 text-white">In Progress</option>
              <option value="Under Review" className="bg-slate-900 text-white">Under Review</option>
              <option value="Not Started" className="bg-slate-900 text-white">Not Started (Pending)</option>
              <option value="Overdue" className="bg-slate-900 text-white">Overdue</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 px-3 py-2 rounded-xl transition-colors"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Empty State when no projects exist in the app */}
      {projects.length === 0 && tasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-12 text-center flex flex-col items-center justify-center min-h-[380px]">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-lg shadow-purple-950/40">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No Project Data to Report</h3>
          <p className="mt-1.5 text-sm text-slate-300 max-w-md">
            Create projects and assign tasks in your workspace to generate real-time metrics, completion summaries, and progress reports.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <StatCard
              title="Projects"
              value={counts.totalProjects}
              subtitle={selectedProjectId === 'all' ? 'All active' : 'Selected'}
              icon={<FolderKanban className="w-5 h-5" />}
              theme="purple"
            />
            <StatCard
              title="Total Tasks"
              value={counts.totalTasks}
              subtitle={`${counts.completionRate}% complete`}
              icon={<CheckSquare className="w-5 h-5" />}
              theme="slate"
            />
            <StatCard
              title="Completed"
              value={counts.completed}
              subtitle="PM Approved"
              icon={<CheckCircle2 className="w-5 h-5" />}
              theme="emerald"
            />
            <StatCard
              title="In Progress"
              value={counts.inProgress}
              subtitle="Ongoing"
              icon={<Clock className="w-5 h-5" />}
              theme="blue"
            />
            <StatCard
              title="Under Review"
              value={counts.underReview}
              subtitle="Pending PM / TL"
              icon={<AlertCircle className="w-5 h-5" />}
              theme="amber"
            />
            <StatCard
              title="Overdue"
              value={counts.overdue}
              subtitle={counts.overdue > 0 ? 'Action required' : 'On schedule'}
              icon={<AlertTriangle className="w-5 h-5" />}
              theme="rose"
            />
            {bugs.length > 0 && (
              <StatCard
                title="Active Defects"
                value={bugs.filter((b) => b.status !== 'Verified').length}
                subtitle={`${bugs.filter((b) => b.status === 'Verified').length} verified`}
                icon={<BugIcon className="w-5 h-5" />}
                theme="amber"
              />
            )}
          </div>

          {/* Overall Completion Banner */}
          <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 sm:p-6 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Overall Completion Status
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-1">
                  {counts.completed} of {counts.totalTasks} tasks completed across{' '}
                  {counts.totalProjects} {counts.totalProjects === 1 ? 'project' : 'projects'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  {counts.overdue > 0
                    ? `Notice: ${counts.overdue} task${counts.overdue > 1 ? 's are' : ' is'} overdue and requires immediate review.`
                    : 'All ongoing tasks are currently tracking within their scheduled deadlines.'}
                </p>
              </div>
              <div className="flex items-baseline gap-2 sm:text-right shrink-0">
                <span className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-indigo-300 to-emerald-400">
                  {counts.completionRate}%
                </span>
                <span className="text-xs text-slate-400 font-medium">Overall Progress</span>
              </div>
            </div>
            <div className="mt-4 w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  counts.completionRate === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-500'
                }`}
                style={{ width: `${Math.min(counts.completionRate, 100)}%` }}
              />
            </div>
          </div>

          {/* Project-Wise Progress & Breakdown */}
          <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-400" />
                  Project-Wise Progress & Status Summary
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Calculated dynamically from real task counts and project deadlines.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/50">
                {visibleProjects.length} {visibleProjects.length === 1 ? 'Project' : 'Projects'}
              </span>
            </div>

            {visibleProjects.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
                No projects match the selected filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {visibleProjects.map((project) => {
                  const pTasks = tasks.filter((t) => t.projectId === project.id);
                  const pCompleted = pTasks.filter((t) => t.status === 'Completed').length;
                  const pInProgress = pTasks.filter((t) => t.status === 'In Progress').length;
                  const pUnderReview = pTasks.filter((t) => t.status === 'Under Review').length;
                  const pNotStarted = pTasks.filter((t) => t.status === 'Not Started').length;
                  const pOverdue = pTasks.filter((t) => isTaskOverdue(t)).length;

                  const progress =
                    pTasks.length > 0
                      ? Math.round((pCompleted / pTasks.length) * 100)
                      : 0;

                  return (
                    <div
                      key={project.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 hover:border-slate-700 transition-colors space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <h4 className="text-base font-bold text-white">{project.name}</h4>
                            <span
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                                project.status === 'Completed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : project.status === 'In Progress'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-slate-700/30 text-slate-300 border-slate-600/40'
                              }`}
                            >
                              {project.status}
                            </span>
                            <span
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                                project.priority === 'High'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  : project.priority === 'Medium'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-slate-700/30 text-slate-300 border-slate-600/40'
                              }`}
                            >
                              {project.priority} Priority
                            </span>
                          </div>
                          {project.description && (
                            <p className="text-xs text-slate-300 line-clamp-1">
                              {project.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs shrink-0">
                          {project.deadline && (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>Due: {project.deadline}</span>
                            </div>
                          )}
                          <div className="text-right">
                            <span className="text-sm font-bold text-white">{progress}%</span>
                            <span className="text-slate-400 text-xs ml-1">
                              ({pCompleted}/{pTasks.length})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            progress === 100
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* Status Badges Row */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        <span className="bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 font-medium">
                          Total: <strong className="text-white">{pTasks.length}</strong>
                        </span>
                        <span className="bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/20 font-medium">
                          Completed: <strong className="text-emerald-400">{pCompleted}</strong>
                        </span>
                        <span className="bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-md border border-blue-500/20 font-medium">
                          In Progress: <strong className="text-blue-400">{pInProgress}</strong>
                        </span>
                        <span className="bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/20 font-medium">
                          Under Review: <strong className="text-amber-400">{pUnderReview}</strong>
                        </span>
                        <span className="bg-slate-700/30 text-slate-300 px-2 py-0.5 rounded-md border border-slate-600/30 font-medium">
                          Pending: <strong className="text-slate-200">{pNotStarted}</strong>
                        </span>
                        {pOverdue > 0 && (
                          <span className="bg-rose-500/15 text-rose-300 px-2 py-0.5 rounded-md border border-rose-500/30 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            Overdue: <strong className="text-rose-400">{pOverdue}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filtered Tasks Report Table */}
          <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-purple-400" />
                  Task Status Breakdown
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Showing {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}{' '}
                  {hasActiveFilters ? 'matching active filters' : 'across all projects'}
                </p>
              </div>

              {hasActiveFilters && (
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>
                    Filtered by:{' '}
                    <strong className="text-white">
                      {selectedProjectId !== 'all'
                        ? projectMap.get(selectedProjectId)?.name || 'Project'
                        : 'All Projects'}
                    </strong>
                    {selectedStatus !== 'All' && (
                      <>
                        {' · '}
                        <strong className="text-purple-300">{selectedStatus}</strong>
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>

            {filteredTasks.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400 space-y-2">
                <p className="text-sm">No tasks match the selected filters.</p>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
                  >
                    Clear filters to view all tasks
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="py-3 px-3">Task</th>
                      <th className="py-3 px-3">Project</th>
                      <th className="py-3 px-3">Assigned To</th>
                      <th className="py-3 px-3">Priority</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Deadline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredTasks.map((task) => {
                      const overdue = isTaskOverdue(task);
                      const project = projectMap.get(task.projectId);

                      return (
                        <tr
                          key={task.id}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <span className="font-semibold text-white block">
                              {task.title}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {project ? project.name : '—'}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {task.assignedTo ? (
                              <span className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                {task.assignedTo}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                                task.priority === 'High'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  : task.priority === 'Medium'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                                task.status === 'Completed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : task.status === 'In Progress'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : task.status === 'Under Review'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-slate-700/30 text-slate-300 border-slate-600/40'
                              }`}
                            >
                              {task.status === 'Completed' && (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              )}
                              {task.status}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {task.deadline ? (
                              <span
                                className={`text-xs font-medium inline-flex items-center gap-1 ${
                                  overdue
                                    ? 'text-rose-400 font-semibold'
                                    : 'text-slate-300'
                                }`}
                              >
                                {overdue && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                                {task.deadline}
                                {overdue && (
                                  <span className="text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/30">
                                    Overdue
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
  theme: keyof typeof THEME_STYLES;
}

function StatCard({ title, value, subtitle, icon, theme }: StatCardProps) {
  const styles = THEME_STYLES[theme];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-lg transition-all duration-300 ${styles.cardBg} group`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider truncate">
          {title}
        </span>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-transform duration-300 group-hover:scale-110 ${styles.iconBg}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {value}
        </div>
        <div className={`mt-1 text-xs truncate ${styles.subText}`}>{subtitle}</div>
      </div>
    </div>
  );
}
