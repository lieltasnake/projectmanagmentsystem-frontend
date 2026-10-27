import React, { useState, useMemo } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  SlidersHorizontal,
  Clock,
  CheckCircle2,
  Layers,
  ShieldCheck,
  Flag,
  FolderKanban,
  X,
  Info,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  Paperclip,
  ExternalLink,
} from 'lucide-react';
import type { Task, Project, TeamMember } from '../types/pms';
import TaskReviewModal, { type UserRole } from './TaskReviewModal';

interface TasksPageProps {
  tasks?: Task[];
  projects?: Project[];
  teamMembers?: TeamMember[];
  currentUserRole?: UserRole;
  currentUserName?: string;
  onAddTask?: (task: Task) => void;
  onUpdateTask?: (task: Task) => void;
  onSelectProject?: (project: Project) => void;
}

const TASK_STATUSES: Task['status'][] = ['Not Started', 'In Progress', 'Under Review', 'Completed'];
const PRIORITIES: Task['priority'][] = ['High', 'Medium', 'Low'];

function getTaskStatusBadge(status: Task['status'], recommendation?: Task['tlRecommendation']) {
  switch (status) {
    case 'Completed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          Completed
        </span>
      );
    case 'In Progress':
      if (recommendation === 'corrections_requested') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <RotateCcw className="w-3 h-3" />
            Revision Required
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <Clock className="w-3 h-3" />
          In Progress
        </span>
      );
    case 'Under Review':
      if (recommendation === 'recommended') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <ShieldCheck className="w-3 h-3" />
            TL Recommended
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <ShieldCheck className="w-3 h-3" />
          Under Review
        </span>
      );
    case 'Not Started':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-600/30 text-slate-300 border border-slate-600/40">
          <Layers className="w-3 h-3" />
          Not Started
        </span>
      );
  }
}

function getPriorityBadge(priority: Task['priority']) {
  switch (priority) {
    case 'High':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
          <Flag className="w-3 h-3" />
          High
        </span>
      );
    case 'Medium':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Flag className="w-3 h-3" />
          Medium
        </span>
      );
    case 'Low':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-600/30 text-slate-300 border border-slate-600/40">
          <Flag className="w-3 h-3" />
          Low
        </span>
      );
  }
}

export default function TasksPage({
  tasks = [],
  projects = [],
  teamMembers = [],
  currentUserRole = 'Project Manager',
  currentUserName = 'Workspace User',
  onAddTask,
  onUpdateTask,
  onSelectProject,
}: TasksPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('All');

  // Task creation modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    projectId: '',
    assignedTo: '',
    priority: 'Medium' as Task['priority'],
    deadline: '',
    status: 'Not Started' as Task['status'],
  });
  const [formNotice, setFormNotice] = useState<string | null>(null);

  // Review & Approval modal state
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);

  // Build project name lookup map
  const projectMap = useMemo(() => {
    const m: Record<string, Project> = {};
    projects.forEach((p) => { m[p.id] = p; });
    return m;
  }, [projects]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const projectName = projectMap[task.projectId]?.name ?? '';
      const matchesSearch =
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.assignedTo ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        projectName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProject =
        projectFilter === 'All' || task.projectId === projectFilter;
      return matchesSearch && matchesProject;
    });
  }, [tasks, searchTerm, projectFilter, projectMap]);

  const handleOpenModal = () => {
    setFormNotice(null);
    setTaskForm({
      title: '',
      projectId: projects.length > 0 ? projects[0].id : '',
      assignedTo: '',
      priority: 'Medium',
      deadline: '',
      status: 'Not Started',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormNotice(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.projectId) return;
    const newTask: Task = {
      id: `task-${Date.now()}`,
      projectId: taskForm.projectId,
      title: taskForm.title,
      assignedTo: taskForm.assignedTo || undefined,
      priority: taskForm.priority,
      deadline: taskForm.deadline,
      status: taskForm.status,
    };
    if (onAddTask) {
      onAddTask(newTask);
      setFormNotice(`Task "${newTask.title}" has been created successfully.`);
    } else {
      setFormNotice(
        `Frontend form verified: Task "${newTask.title}" is ready for backend API storage.`
      );
    }
  };

  const noProjects = projects.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Tasks
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            All tasks across your projects. Tasks are officially completed upon PM approval.
          </p>
        </div>

        <button
          type="button"
          onClick={noProjects ? undefined : handleOpenModal}
          disabled={noProjects}
          title={noProjects ? 'Create a project first before adding tasks.' : 'Add a new task'}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* No-projects warning */}
      {noProjects && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 p-3.5 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>No projects exist yet.</strong> Please create a project first before adding tasks. Tasks must belong to a project.
          </span>
        </div>
      )}

      {/* Empty State — no tasks at all */}
      {tasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 sm:p-14 text-center flex flex-col items-center justify-center min-h-[380px]">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-500/10">
            <CheckSquare className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No tasks found</h3>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            {noProjects
              ? 'Create a project first, then add tasks to it from the Projects page or from here.'
              : 'No tasks have been created yet. Click "New Task" to create the first one.'}
          </p>
        </div>
      ) : (
        <>
          {/* Search & Filter Bar */}
          <div className="bg-[#0f173b]/90 border border-slate-700/60 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by task title, assignee, or project name..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
              />
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Project:</span>
              </div>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
              >
                <option value="All" className="bg-[#0f173b]">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0f173b]">{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* No results after filter */}
          {filteredTasks.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 text-center flex flex-col items-center justify-center min-h-[220px]">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                <CheckSquare className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white">No matching tasks</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Try adjusting your search or project filter.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#0b112c]/90 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold">Task Title</th>
                      <th className="px-5 py-3.5 font-semibold">Project</th>
                      <th className="px-5 py-3.5 font-semibold">Assigned To</th>
                      <th className="px-5 py-3.5 font-semibold">Priority</th>
                      <th className="px-5 py-3.5 font-semibold">Deadline</th>
                      <th className="px-5 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Workflow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredTasks.map((task) => {
                      const project = projectMap[task.projectId];
                      return (
                        <tr key={task.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-white">{task.title}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-slate-500 font-mono">{task.id}</span>
                              {task.comments && task.comments.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-300 bg-purple-500/15 px-1.5 py-0.2 rounded border border-purple-500/30">
                                  <MessageSquare className="w-2.5 h-2.5" />
                                  {task.comments.length}
                                </span>
                              )}
                              {task.attachments && task.attachments.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-300 bg-blue-500/15 px-1.5 py-0.2 rounded border border-blue-500/30">
                                  <Paperclip className="w-2.5 h-2.5" />
                                  {task.attachments.length}
                                </span>
                              )}
                              {task.demoSubmission && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.2 rounded border border-emerald-500/30">
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  Demo
                                </span>
                              )}
                            </div>
                            {task.reviewFeedback && (
                              <div className="mt-1 text-[10px] text-purple-300/80 line-clamp-1 italic">
                                Note: {task.reviewFeedback}
                              </div>
                            )}
                          </td>

                          {/* Project Name — clickable */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {project ? (
                              <button
                                type="button"
                                onClick={() => onSelectProject && onSelectProject(project)}
                                className={`flex items-center gap-1.5 text-left group ${onSelectProject ? 'cursor-pointer' : ''}`}
                                title={`Open project: ${project.name}`}
                              >
                                <FolderKanban className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span className="text-purple-300 group-hover:text-purple-200 group-hover:underline transition-colors font-medium">
                                  {project.name}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Unknown project</span>
                            )}
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {task.assignedTo ? (
                              <span className="flex items-center gap-1.5">
                                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-[9px] flex items-center justify-center shrink-0">
                                  {task.assignedTo.slice(0, 2).toUpperCase()}
                                </div>
                                <span>{task.assignedTo}</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">Unassigned</span>
                            )}
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {getPriorityBadge(task.priority)}
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[11px]">
                            {task.deadline || <span className="text-slate-500">—</span>}
                          </td>

                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {getTaskStatusBadge(task.status, task.tlRecommendation)}
                          </td>

                          {/* Workflow Review Action button */}
                          <td className="px-4 py-3.5 whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={() => setReviewingTask(task)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-600/20 hover:bg-purple-600/35 text-purple-300 border border-purple-500/30 transition-all cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>{task.status === 'Completed' ? 'View Details' : 'Details & Review'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Review and Approval Modal */}
      {reviewingTask && (
        <TaskReviewModal
          task={reviewingTask}
          project={projectMap[reviewingTask.projectId]}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onClose={() => setReviewingTask(null)}
          onUpdateTask={(updated) => {
            if (onUpdateTask) onUpdateTask(updated);
            setReviewingTask(null);
          }}
        />
      )}

      {/* New Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">New Task</h3>
                  <p className="text-xs text-slate-400">Fill in the task details below</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                <strong>Frontend form design:</strong> When the backend is connected, this task will be saved to the database linked to the selected project.
              </span>
            </div>

            {formNotice && (
              <div className="mt-3 p-3 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <span>{formNotice}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              {/* Task Title */}
              <div>
                <label htmlFor="newTaskTitle" className="block text-xs font-medium text-slate-200 mb-1">
                  Task Title <span className="text-purple-400">*</span>
                </label>
                <input
                  id="newTaskTitle"
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="e.g. Write technical specification"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                />
              </div>

              {/* Project Select */}
              <div>
                <label htmlFor="newTaskProject" className="block text-xs font-medium text-slate-200 mb-1">
                  Project <span className="text-purple-400">*</span>
                </label>
                <select
                  id="newTaskProject"
                  required
                  value={taskForm.projectId}
                  onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                >
                  <option value="" disabled className="bg-[#0f173b]">Select a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#0f173b]">{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Assigned To */}
              <div>
                <label htmlFor="newTaskAssignee" className="block text-xs font-medium text-slate-200 mb-1">
                  Assigned To
                </label>
                {teamMembers.length === 0 ? (
                  <div className="w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700/60 text-xs text-slate-500 italic">
                    No team members added yet — go to the Team page to add members.
                  </div>
                ) : (
                  <select
                    id="newTaskAssignee"
                    value={taskForm.assignedTo}
                    onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                  >
                    <option value="" className="bg-[#0f173b]">— Unassigned —</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.name} className="bg-[#0f173b]">
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Priority + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="newTaskPriority" className="block text-xs font-medium text-slate-200 mb-1">
                    Priority
                  </label>
                  <select
                    id="newTaskPriority"
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Task['priority'] })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p} className="bg-[#0f173b]">{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="newTaskStatus" className="block text-xs font-medium text-slate-200 mb-1">
                    Status
                  </label>
                  <select
                    id="newTaskStatus"
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as Task['status'] })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-[#0f173b]">{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label htmlFor="newTaskDeadline" className="block text-xs font-medium text-slate-200 mb-1">
                  Deadline
                </label>
                <input
                  id="newTaskDeadline"
                  type="date"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                />
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
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
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
