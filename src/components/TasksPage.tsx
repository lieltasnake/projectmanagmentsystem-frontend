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
  Check,
  LayoutList,
  Kanban,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  Edit2,
  Trash2,
  GripVertical,
  AlertCircle,
  Bug as BugIcon,
} from 'lucide-react';
import type { Task, Project, TeamMember, Subtask, Bug } from '../types/pms';
import TaskReviewModal, { type UserRole } from './TaskReviewModal';

interface TasksPageProps {
  tasks?: Task[];
  projects?: Project[];
  teamMembers?: TeamMember[];
  currentUserRole?: UserRole;
  currentUserName?: string;
  bugs?: Bug[];
  onAddTask?: (task: Task) => void;
  onUpdateTask?: (task: Task) => void;
  onSelectProject?: (project: Project) => void;
  onAddBug?: (bug: Bug) => void;
  onUpdateBug?: (bug: Bug) => void;
}

export type TaskViewMode = 'list' | 'board';
export type TaskSortField = 'deadline' | 'priority' | 'title' | 'status' | 'id';
export type SortOrder = 'asc' | 'desc';

const TASK_STATUSES: Task['status'][] = ['Not Started', 'In Progress', 'Under Review', 'Completed'];
const PRIORITIES: Task['priority'][] = ['High', 'Medium', 'Low'];

const STATUS_CONFIG: Record<
  Task['status'],
  { label: string; color: string; badgeBg: string; border: string; dot: string }
> = {
  'Not Started': {
    label: 'Not Started',
    color: 'text-slate-300',
    badgeBg: 'bg-slate-700/30 text-slate-300 border-slate-600/40',
    border: 'border-slate-700/80',
    dot: 'bg-slate-400',
  },
  'In Progress': {
    label: 'In Progress',
    color: 'text-indigo-300',
    badgeBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    border: 'border-indigo-500/50',
    dot: 'bg-indigo-400',
  },
  'Under Review': {
    label: 'Under Review',
    color: 'text-amber-300',
    badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    border: 'border-amber-500/50',
    dot: 'bg-amber-400',
  },
  Completed: {
    label: 'Completed',
    color: 'text-emerald-300',
    badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    border: 'border-emerald-500/50',
    dot: 'bg-emerald-400',
  },
};

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
  bugs = [],
  onAddTask,
  onUpdateTask,
  onSelectProject,
  onAddBug,
  onUpdateBug,
}: TasksPageProps) {
  // View mode: 'list' | 'board'
  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    try {
      return (localStorage.getItem('pms_tasks_view_mode') as TaskViewMode) || 'list';
    } catch {
      return 'list';
    }
  });

  const handleSetViewMode = (mode: TaskViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('pms_tasks_view_mode', mode);
    } catch {
      // ignore
    }
  };

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('All');

  // Sorting
  const [sortField, setSortField] = useState<TaskSortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Collapsed status groups in List View
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Inline Quick Task Title Editing
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');

  // Inline Quick Subtask Adding
  const [quickSubtaskTaskId, setQuickSubtaskTaskId] = useState<string | null>(null);
  const [quickSubtaskTitle, setQuickSubtaskTitle] = useState('');

  // Inline Quick Task Adding per status
  const [quickAddStatus, setQuickAddStatus] = useState<Task['status'] | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddProjectId, setQuickAddProjectId] = useState<string>('');

  // Drag-and-drop state for Board View
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<Task['status'] | null>(null);

  // Permission / Action alerts
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Expanded subtask checklists on cards / rows
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

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
    projects.forEach((p) => {
      m[p.id] = p;
    });
    return m;
  }, [projects]);

  // Role permissions helpers
  const isTeamMember = currentUserRole === 'Team Member';
  const isTeamLeader = currentUserRole === 'Team Leader';
  const isProjectManager = currentUserRole === 'Project Manager';

  const canManageTask = (task: Task): boolean => {
    if (isProjectManager) return true;
    if (isTeamLeader) return true;
    if (isTeamMember) {
      return Boolean(
        task.assignedTo &&
          task.assignedTo.trim().toLowerCase() === currentUserName.trim().toLowerCase()
      );
    }
    return false;
  };

  // Filtered & Sorted Tasks
  const filteredTasks = useMemo(() => {
    const list = tasks.filter((task) => {
      const projectName = projectMap[task.projectId]?.name ?? '';
      const matchesSearch =
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.assignedTo ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        projectName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProject = projectFilter === 'All' || task.projectId === projectFilter;
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
      const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;

      let matchesAssignee = true;
      if (assigneeFilter === 'Unassigned') {
        matchesAssignee = !task.assignedTo;
      } else if (assigneeFilter !== 'All') {
        matchesAssignee = task.assignedTo === assigneeFilter;
      }

      return matchesSearch && matchesProject && matchesStatus && matchesPriority && matchesAssignee;
    });

    const priorityRank: Record<Task['priority'], number> = {
      High: 3,
      Medium: 2,
      Low: 1,
    };

    const statusRank: Record<Task['status'], number> = {
      'Not Started': 1,
      'In Progress': 2,
      'Under Review': 3,
      Completed: 4,
    };

    return [...list].sort((a, b) => {
      let comp = 0;
      if (sortField === 'deadline') {
        const dA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const dB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        comp = dA - dB;
      } else if (sortField === 'priority') {
        comp = priorityRank[a.priority] - priorityRank[b.priority];
      } else if (sortField === 'status') {
        comp = statusRank[a.status] - statusRank[b.status];
      } else if (sortField === 'title') {
        comp = a.title.localeCompare(b.title);
      } else {
        comp = a.id.localeCompare(b.id);
      }
      return sortOrder === 'asc' ? comp : -comp;
    });
  }, [
    tasks,
    searchTerm,
    projectFilter,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    sortField,
    sortOrder,
    projectMap,
  ]);

  // Group tasks by status for List and Board views
  const tasksByStatus = useMemo(() => {
    const grouped: Record<Task['status'], Task[]> = {
      'Not Started': [],
      'In Progress': [],
      'Under Review': [],
      Completed: [],
    };
    filteredTasks.forEach((t) => {
      if (grouped[t.status]) {
        grouped[t.status].push(t);
      } else {
        grouped['Not Started'].push(t);
      }
    });
    return grouped;
  }, [filteredTasks]);

  // Status Change Handler with strict workflow and role governance
  const handleStatusChange = (task: Task, newStatus: Task['status']) => {
    if (task.status === newStatus) return;

    // Strict Governance: Only the Project Manager can approve and complete tasks
    if (newStatus === 'Completed') {
      if (!isProjectManager) {
        setPermissionNotice(
          'Permission Denied: Only the Project Manager can approve a task as Completed. Team Members must submit tasks for review.'
        );
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }
    }

    if (!canManageTask(task)) {
      setPermissionNotice('Permission Denied: You do not have permission to modify this task.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    let updatedRecommendation = task.tlRecommendation;
    let updatedFeedback = task.reviewFeedback;
    const history = [...(task.reviewHistory || [])];

    if (newStatus === 'Completed' && isProjectManager) {
      history.unshift({
        id: `rev-${Date.now()}`,
        authorRole: currentUserRole,
        authorName: currentUserName,
        action: 'final_approve',
        comment: 'Task approved and completed via ClickUp board/list view.',
        timestamp: new Date().toLocaleString(),
      });
      updatedFeedback = `[Approved by PM ${currentUserName}]: Officially completed.`;
    } else if (newStatus === 'Under Review') {
      history.unshift({
        id: `rev-${Date.now()}`,
        authorRole: currentUserRole,
        authorName: currentUserName,
        action: 'submit',
        comment: 'Task submitted for review via board/list view.',
        timestamp: new Date().toLocaleString(),
      });
      updatedFeedback = `Submitted for review by ${currentUserName}.`;
      updatedRecommendation = undefined;
    } else if (newStatus === 'In Progress' && task.status === 'Under Review') {
      history.unshift({
        id: `rev-${Date.now()}`,
        authorRole: currentUserRole,
        authorName: currentUserName,
        action: 'request_corrections',
        comment: 'Returned to In Progress for revision.',
        timestamp: new Date().toLocaleString(),
      });
      updatedRecommendation = 'corrections_requested';
      updatedFeedback = `Revision required by ${currentUserRole} (${currentUserName}).`;
    }

    const updatedTask: Task = {
      ...task,
      status: newStatus,
      tlRecommendation: updatedRecommendation,
      reviewFeedback: updatedFeedback,
      reviewHistory: history,
    };

    if (onUpdateTask) {
      onUpdateTask(updatedTask);
    }
  };

  // Drag and Drop Handlers for Board View
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: Task['status']) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId) return;

    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    handleStatusChange(targetTask, targetStatus);
  };

  // Inline Quick Title Editing
  const handleStartEditTitle = (task: Task) => {
    if (!canManageTask(task) || task.status === 'Completed') return;
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  };

  const handleSaveEditTitle = (task: Task) => {
    const trimmed = editingTaskTitle.trim();
    if (!trimmed || trimmed === task.title) {
      setEditingTaskId(null);
      return;
    }
    if (!onUpdateTask || !canManageTask(task)) return;

    onUpdateTask({
      ...task,
      title: trimmed,
    });
    setEditingTaskId(null);
    setEditingTaskTitle('');
  };

  // Inline Quick Priority Editing
  const handlePriorityChange = (task: Task, newPriority: Task['priority']) => {
    if (!onUpdateTask || !canManageTask(task) || task.status === 'Completed') return;
    onUpdateTask({
      ...task,
      priority: newPriority,
    });
  };

  // Inline Quick Assignee Editing
  const handleAssigneeChange = (task: Task, newAssignee: string) => {
    if (!onUpdateTask || !canManageTask(task) || task.status === 'Completed') return;
    onUpdateTask({
      ...task,
      assignedTo: newAssignee || undefined,
    });
  };

  // Subtask Toggling
  const handleToggleSubtask = (targetTask: Task, subtaskId: string) => {
    if (!onUpdateTask) return;
    if (targetTask.status === 'Completed' || !canManageTask(targetTask)) return;

    const currentSubtasks = targetTask.subtasks || [];
    const updatedSubtasks = currentSubtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    // CRITICAL: Completing all subtasks must NEVER change parent task status
    const updatedTask: Task = {
      ...targetTask,
      subtasks: updatedSubtasks,
    };

    onUpdateTask(updatedTask);
  };

  // Inline Subtask Adding
  const handleAddSubtaskInline = (task: Task) => {
    const title = quickSubtaskTitle.trim();
    if (!title || !onUpdateTask) return;
    if (task.status === 'Completed' || !canManageTask(task)) {
      setPermissionNotice('Permission Denied: Cannot add subtasks to this task.');
      setTimeout(() => setPermissionNotice(null), 3000);
      return;
    }

    const currentSubtasks = task.subtasks || [];
    const newSubtask: Subtask = {
      id: `subtask-${Date.now()}`,
      title,
      completed: false,
    };

    onUpdateTask({
      ...task,
      subtasks: [...currentSubtasks, newSubtask],
    });

    setQuickSubtaskTitle('');
    setQuickSubtaskTaskId(null);
  };

  // Inline Subtask Deleting
  const handleDeleteSubtask = (task: Task, subtaskId: string) => {
    if (!onUpdateTask || task.status === 'Completed' || !canManageTask(task)) return;
    const currentSubtasks = task.subtasks || [];
    onUpdateTask({
      ...task,
      subtasks: currentSubtasks.filter((s) => s.id !== subtaskId),
    });
  };

  // Quick Task Adding for a Column / Status Group
  const handleQuickAddTask = (status: Task['status']) => {
    const title = quickAddTitle.trim();
    if (!title || !onAddTask) return;

    const projectId = quickAddProjectId || (projects.length > 0 ? projects[0].id : '');
    if (!projectId) {
      setPermissionNotice('Please create a project first before adding tasks.');
      setTimeout(() => setPermissionNotice(null), 3000);
      return;
    }

    const newTask: Task = {
      id: `task-${Date.now()}`,
      projectId,
      title,
      assignedTo: undefined,
      priority: 'Medium',
      deadline: '',
      status,
      subtasks: [],
    };

    onAddTask(newTask);
    setQuickAddTitle('');
    setQuickAddStatus(null);
  };

  // Modal Task Creation
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
      subtasks: [],
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

  const toggleGroupCollapse = (status: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [status]: !prev[status],
    }));
  };

  const toggleSubtaskExpand = (taskId: string) => {
    setExpandedSubtasks((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const hasActiveFilters =
    searchTerm !== '' ||
    projectFilter !== 'All' ||
    statusFilter !== 'All' ||
    priorityFilter !== 'All' ||
    assigneeFilter !== 'All' ||
    sortField !== 'id' ||
    sortOrder !== 'desc';

  const handleResetFilters = () => {
    setSearchTerm('');
    setProjectFilter('All');
    setStatusFilter('All');
    setPriorityFilter('All');
    setAssigneeFilter('All');
    setSortField('id');
    setSortOrder('desc');
  };

  const noProjects = projects.length === 0;

  return (
    <div className="space-y-6">
      {/* ── Top Header with ClickUp View Switcher & Actions ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Tasks
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            ClickUp-style task management with interactive List and Board views. Final approval strictly by Project Manager.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* View Mode Switcher */}
          <div className="bg-[#0b112c]/90 p-1 rounded-xl border border-slate-800 flex items-center gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => handleSetViewMode('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
              title="Switch to List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>List</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                {filteredTasks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetViewMode('board')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'board'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
              title="Switch to Board View"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Board</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                {filteredTasks.length}
              </span>
            </button>
          </div>

          {/* New Task Button */}
          <button
            type="button"
            onClick={noProjects ? undefined : handleOpenModal}
            disabled={noProjects}
            title={noProjects ? 'Create a project first before adding tasks.' : 'Add a new task'}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Permission / Action Notice */}
      {permissionNotice && (
        <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{permissionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setPermissionNotice(null)}
            className="text-rose-400 hover:text-white text-xs cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* No-projects warning */}
      {noProjects && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 p-3.5 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>No projects exist yet.</strong> Please create a project first before adding tasks.
          </span>
        </div>
      )}

      {/* ── Search, Filters, and Sorting Control Bar ── */}
      <div className="bg-[#0f173b]/90 border border-slate-700/60 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tasks by title, ID, assignee, or project..."
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Project Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/80 border border-slate-700/80 rounded-xl px-2.5 py-1.5">
              <FolderKanban className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="All" className="bg-[#0f173b]">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0f173b]">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/80 border border-slate-700/80 rounded-xl px-2.5 py-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="All" className="bg-[#0f173b]">All Statuses</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-[#0f173b]">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/80 border border-slate-700/80 rounded-xl px-2.5 py-1.5">
              <Flag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="All" className="bg-[#0f173b]">All Priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="bg-[#0f173b]">
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/80 border border-slate-700/80 rounded-xl px-2.5 py-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="All" className="bg-[#0f173b]">All Assignees</option>
                <option value="Unassigned" className="bg-[#0f173b]">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.name} className="bg-[#0f173b]">
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sorting Controls & Filter Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-400">Sort by:</span>
            <div className="flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 rounded-lg px-2 py-1">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as TaskSortField)}
                className="bg-transparent text-xs text-purple-300 focus:outline-none cursor-pointer font-medium"
              >
                <option value="id" className="bg-[#0f173b]">Date Created (ID)</option>
                <option value="deadline" className="bg-[#0f173b]">Deadline</option>
                <option value="priority" className="bg-[#0f173b]">Priority</option>
                <option value="title" className="bg-[#0f173b]">Task Title</option>
                <option value="status" className="bg-[#0f173b]">Status</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title={sortOrder === 'asc' ? 'Ascending (click to change)' : 'Descending (click to change)'}
              >
                {sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-purple-400" /> : <ArrowDown className="w-3.5 h-3.5 text-purple-400" />}
              </button>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-purple-400 hover:text-purple-300 underline font-medium cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-400">
            Showing <strong className="text-white">{filteredTasks.length}</strong> of{' '}
            <strong className="text-white">{tasks.length}</strong> tasks
          </div>
        </div>
      </div>

      {/* ── Main Content Area: Empty State vs List vs Board ── */}
      {tasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 sm:p-14 text-center flex flex-col items-center justify-center min-h-[380px]">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-500/10">
            <CheckSquare className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No tasks found</h3>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            {noProjects
              ? 'Create a project first, then add tasks to it.'
              : 'No tasks have been created yet. Click "New Task" to create the first one.'}
          </p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 text-center flex flex-col items-center justify-center min-h-[220px]">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <CheckSquare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white">No matching tasks</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            Try adjusting your search terms or filters.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-3 px-3 py-1.5 rounded-lg text-xs bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* ═══════════════════════════════════════════════
           CLICKUP-STYLE GROUPED LIST VIEW
        ═══════════════════════════════════════════════ */
        <div className="space-y-6">
          {TASK_STATUSES.map((statusKey) => {
            const groupTasks = tasksByStatus[statusKey] || [];
            const isCollapsed = collapsedGroups[statusKey];
            const cfg = STATUS_CONFIG[statusKey];

            return (
              <div
                key={statusKey}
                className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 shadow-xl overflow-hidden transition-all"
              >
                {/* Status Group Header */}
                <div className="p-3.5 px-5 bg-[#0b112c]/90 border-b border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(statusKey)}
                      className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                      <span className="font-bold text-xs uppercase tracking-wider text-white">
                        {statusKey}
                      </span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {groupTasks.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddStatus(quickAddStatus === statusKey ? null : statusKey);
                      setQuickAddTitle('');
                      setQuickAddProjectId(projects.length > 0 ? projects[0].id : '');
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Task</span>
                  </button>
                </div>

                {/* Inline Quick Add Task Row */}
                {quickAddStatus === statusKey && (
                  <div className="p-3 bg-purple-950/20 border-b border-purple-500/30 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickAddTask(statusKey);
                        if (e.key === 'Escape') setQuickAddStatus(null);
                      }}
                      placeholder={`Enter task title for ${statusKey}... (Press Enter to save)`}
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-slate-900 border border-purple-500/60 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                    <select
                      value={quickAddProjectId}
                      onChange={(e) => setQuickAddProjectId(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none cursor-pointer"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#0f173b]">
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!quickAddTitle.trim()}
                      onClick={() => handleQuickAddTask(statusKey)}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 cursor-pointer"
                    >
                      Save Task
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAddStatus(null)}
                      className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Status Group Task List */}
                {!isCollapsed && (
                  groupTasks.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 italic">
                      No tasks in {statusKey}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-[#0b112c]/50 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="px-5 py-2.5 font-semibold">Task Title & Subtasks</th>
                            <th className="px-4 py-2.5 font-semibold">Project</th>
                            <th className="px-4 py-2.5 font-semibold">Assignee</th>
                            <th className="px-4 py-2.5 font-semibold">Priority</th>
                            <th className="px-4 py-2.5 font-semibold">Deadline</th>
                            <th className="px-4 py-2.5 font-semibold">Status</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Review Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {groupTasks.map((task) => {
                            const project = projectMap[task.projectId];
                            const subtasks = task.subtasks || [];
                            const totalSubtasks = subtasks.length;
                            const completedSubtasks = subtasks.filter((s) => s.completed).length;
                            const subtaskPercent =
                              totalSubtasks > 0
                                ? Math.round((completedSubtasks / totalSubtasks) * 100)
                                : 0;
                            const isEditingTitle = editingTaskId === task.id;
                            const isExpandedSubtasks = Boolean(expandedSubtasks[task.id]);

                            return (
                              <tr
                                key={task.id}
                                className="hover:bg-slate-800/35 transition-colors group"
                              >
                                {/* Title & Subtasks Cell */}
                                <td className="px-5 py-3.5 max-w-sm">
                                  {isEditingTitle ? (
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <input
                                        type="text"
                                        autoFocus
                                        value={editingTaskTitle}
                                        onChange={(e) => setEditingTaskTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSaveEditTitle(task);
                                          if (e.key === 'Escape') setEditingTaskId(null);
                                        }}
                                        className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-purple-500 text-white focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSaveEditTitle(task)}
                                        className="p-1 rounded text-emerald-400 hover:bg-slate-800"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingTaskId(null)}
                                        className="p-1 rounded text-slate-400 hover:bg-slate-800"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-white break-words">
                                        {task.title}
                                      </span>
                                      {canManageTask(task) && task.status !== 'Completed' && (
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditTitle(task)}
                                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-white transition-opacity cursor-pointer"
                                          title="Edit task title"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Task Badges & Subtask Summary */}
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {task.id}
                                    </span>

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

                                    {bugs.filter((b) => b.taskId === task.id && b.status !== 'Verified').length > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-500/20 px-1.5 py-0.2 rounded border border-rose-500/30">
                                        <BugIcon className="w-2.5 h-2.5" />
                                        {bugs.filter((b) => b.taskId === task.id && b.status !== 'Verified').length} open
                                      </span>
                                    )}

                                    {totalSubtasks > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSubtaskExpand(task.id)}
                                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-300 bg-purple-500/15 px-1.5 py-0.2 rounded border border-purple-500/30 hover:bg-purple-500/25 transition-colors cursor-pointer"
                                        title="Click to expand/collapse checklist"
                                      >
                                        <CheckSquare className="w-2.5 h-2.5" />
                                        <span>
                                          {completedSubtasks}/{totalSubtasks} subtasks
                                        </span>
                                        {isExpandedSubtasks ? (
                                          <ChevronDown className="w-2.5 h-2.5" />
                                        ) : (
                                          <ChevronRight className="w-2.5 h-2.5" />
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {/* Subtasks Progress & Checklist (Expandable) */}
                                  {totalSubtasks > 0 && (
                                    <div className="mt-2 p-2 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5 max-w-sm">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="font-semibold text-slate-300 flex items-center gap-1">
                                          <CheckSquare className="w-3 h-3 text-purple-400" />
                                          <span>
                                            {completedSubtasks} of {totalSubtasks} completed
                                          </span>
                                        </span>
                                        <span className="font-mono text-purple-300 font-bold">
                                          {subtaskPercent}%
                                        </span>
                                      </div>
                                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            completedSubtasks === totalSubtasks
                                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                              : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                          }`}
                                          style={{ width: `${subtaskPercent}%` }}
                                        />
                                      </div>

                                      {/* Subtask checklist items */}
                                      {isExpandedSubtasks && (
                                        <div className="space-y-1 pt-1 border-t border-slate-800">
                                          {subtasks.map((st) => (
                                            <div
                                              key={st.id}
                                              className="flex items-center justify-between gap-2 text-[11px] group/sub"
                                            >
                                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                <button
                                                  type="button"
                                                  disabled={
                                                    task.status === 'Completed' ||
                                                    !canManageTask(task)
                                                  }
                                                  onClick={() => handleToggleSubtask(task, st.id)}
                                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                                    st.completed
                                                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                                      : 'border-slate-700 bg-slate-800 text-transparent hover:border-purple-500'
                                                  } ${
                                                    task.status !== 'Completed' && canManageTask(task)
                                                      ? 'cursor-pointer'
                                                      : 'cursor-default'
                                                  }`}
                                                  title={
                                                    canManageTask(task)
                                                      ? st.completed
                                                        ? 'Mark incomplete'
                                                        : 'Mark complete'
                                                      : 'Read-only'
                                                  }
                                                >
                                                  {st.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                                </button>
                                                <span
                                                  className={`truncate ${
                                                    st.completed
                                                      ? 'text-slate-400 line-through'
                                                      : 'text-slate-200'
                                                  }`}
                                                >
                                                  {st.title}
                                                </span>
                                              </div>

                                              {canManageTask(task) && task.status !== 'Completed' && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteSubtask(task, st.id)}
                                                  className="opacity-0 group-hover/sub:opacity-100 p-0.5 rounded text-slate-500 hover:text-rose-400 transition-opacity cursor-pointer"
                                                  title="Delete subtask"
                                                >
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                              )}
                                            </div>
                                          ))}

                                          {/* Quick inline subtask input */}
                                          {canManageTask(task) && task.status !== 'Completed' && (
                                            <div className="pt-1 flex items-center gap-1">
                                              <input
                                                type="text"
                                                value={quickSubtaskTaskId === task.id ? quickSubtaskTitle : ''}
                                                onChange={(e) => {
                                                  setQuickSubtaskTaskId(task.id);
                                                  setQuickSubtaskTitle(e.target.value);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') handleAddSubtaskInline(task);
                                                }}
                                                placeholder="+ Add subtask..."
                                                className="w-full px-2 py-0.5 text-[10px] rounded bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                                              />
                                              {quickSubtaskTaskId === task.id && quickSubtaskTitle.trim() && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleAddSubtaskInline(task)}
                                                  className="p-1 rounded text-purple-400 hover:text-purple-300"
                                                >
                                                  <Plus className="w-3 h-3" />
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {task.reviewFeedback && (
                                    <div className="mt-1 text-[10px] text-purple-300/80 line-clamp-1 italic">
                                      Note: {task.reviewFeedback}
                                    </div>
                                  )}
                                </td>

                                {/* Project Column */}
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  {project ? (
                                    <button
                                      type="button"
                                      onClick={() => onSelectProject && onSelectProject(project)}
                                      className={`flex items-center gap-1.5 text-left group ${
                                        onSelectProject ? 'cursor-pointer' : ''
                                      }`}
                                      title={`Open project: ${project.name}`}
                                    >
                                      <FolderKanban className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                      <span className="text-purple-300 group-hover:text-purple-200 group-hover:underline transition-colors font-medium">
                                        {project.name}
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="text-slate-500 italic text-[11px]">
                                      Unknown project
                                    </span>
                                  )}
                                </td>

                                {/* Assignee Column (with inline selector) */}
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  {canManageTask(task) && task.status !== 'Completed' ? (
                                    <select
                                      value={task.assignedTo || ''}
                                      onChange={(e) => handleAssigneeChange(task, e.target.value)}
                                      className="px-2 py-1 rounded-lg bg-slate-900/80 border border-slate-700/80 text-[11px] text-white focus:outline-none cursor-pointer"
                                    >
                                      <option value="" className="bg-[#0f173b]">Unassigned</option>
                                      {teamMembers.map((m) => (
                                        <option key={m.id} value={m.name} className="bg-[#0f173b]">
                                          {m.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : task.assignedTo ? (
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

                                {/* Priority Column (with inline selector) */}
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  {canManageTask(task) && task.status !== 'Completed' ? (
                                    <select
                                      value={task.priority}
                                      onChange={(e) =>
                                        handlePriorityChange(task, e.target.value as Task['priority'])
                                      }
                                      className="px-2 py-1 rounded-lg bg-slate-900/80 border border-slate-700/80 text-[11px] text-white focus:outline-none cursor-pointer"
                                    >
                                      {PRIORITIES.map((p) => (
                                        <option key={p} value={p} className="bg-[#0f173b]">
                                          {p}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    getPriorityBadge(task.priority)
                                  )}
                                </td>

                                {/* Deadline Column */}
                                <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px]">
                                  {task.deadline ? (
                                    <span className="flex items-center gap-1 text-slate-300">
                                      <Calendar className="w-3 h-3 text-purple-400" />
                                      {task.deadline}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>

                                {/* Status Column (with strict PM completion check) */}
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  {canManageTask(task) && task.status !== 'Completed' ? (
                                    <select
                                      value={task.status}
                                      onChange={(e) =>
                                        handleStatusChange(task, e.target.value as Task['status'])
                                      }
                                      className="px-2 py-1 rounded-lg bg-slate-900/80 border border-slate-700/80 text-[11px] font-semibold text-white focus:outline-none cursor-pointer"
                                    >
                                      {TASK_STATUSES.map((s) => (
                                        <option key={s} value={s} className="bg-[#0f173b]">
                                          {s} {s === 'Completed' && !isProjectManager ? '(PM Only)' : ''}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    getTaskStatusBadge(task.status, task.tlRecommendation)
                                  )}
                                </td>

                                {/* Actions Column */}
                                <td className="px-4 py-3.5 whitespace-nowrap text-right">
                                  <button
                                    type="button"
                                    onClick={() => setReviewingTask(task)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-600/20 hover:bg-purple-600/35 text-purple-300 border border-purple-500/30 transition-all cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span>
                                      {task.status === 'Completed' ? 'View Details' : 'Details & Review'}
                                    </span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══════════════════════════════════════════════
           CLICKUP-STYLE KANBAN BOARD VIEW
        ═══════════════════════════════════════════════ */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {TASK_STATUSES.map((statusKey) => {
            const columnTasks = tasksByStatus[statusKey] || [];
            const cfg = STATUS_CONFIG[statusKey];
            const isDropTarget = dragOverColumn === statusKey;

            return (
              <div
                key={statusKey}
                onDragOver={(e) => handleDragOver(e, statusKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, statusKey)}
                className={`rounded-2xl bg-[#0f173b]/95 border transition-all flex flex-col min-h-[420px] shadow-xl ${
                  isDropTarget
                    ? 'border-purple-500 ring-2 ring-purple-500/30 bg-[#141d4b]'
                    : cfg.border
                }`}
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-slate-800 bg-[#0b112c]/90 rounded-t-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <span className="font-bold text-xs uppercase tracking-wider text-white">
                      {statusKey}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {columnTasks.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddStatus(quickAddStatus === statusKey ? null : statusKey);
                      setQuickAddTitle('');
                      setQuickAddProjectId(projects.length > 0 ? projects[0].id : '');
                    }}
                    className="p-1 rounded text-purple-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    title={`Add task in ${statusKey}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Inline Quick Add for this column */}
                {quickAddStatus === statusKey && (
                  <div className="p-3 bg-purple-950/30 border-b border-purple-500/40 space-y-2">
                    <input
                      type="text"
                      autoFocus
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickAddTask(statusKey);
                        if (e.key === 'Escape') setQuickAddStatus(null);
                      }}
                      placeholder="Task title... (Enter to save)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-purple-500/60 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={quickAddProjectId}
                        onChange={(e) => setQuickAddProjectId(e.target.value)}
                        className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-white focus:outline-none"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id} className="bg-[#0f173b]">
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!quickAddTitle.trim()}
                        onClick={() => handleQuickAddTask(statusKey)}
                        className="px-2.5 py-1 rounded bg-purple-600 text-white text-[11px] font-semibold hover:bg-purple-500 disabled:opacity-50 cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickAddStatus(null)}
                        className="px-1.5 py-1 text-slate-400 hover:text-white text-[11px] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Column Body / Cards List */}
                <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                  {columnTasks.length === 0 ? (
                    <div className="h-32 rounded-xl border border-dashed border-slate-800/80 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-3">
                      <span>Drag tasks here</span>
                      <span className="text-[10px] text-slate-600 mt-1">or click + to create</span>
                    </div>
                  ) : (
                    columnTasks.map((task) => {
                      const project = projectMap[task.projectId];
                      const subtasks = task.subtasks || [];
                      const totalSubtasks = subtasks.length;
                      const completedSubtasks = subtasks.filter((s) => s.completed).length;
                      const subtaskPercent =
                        totalSubtasks > 0
                          ? Math.round((completedSubtasks / totalSubtasks) * 100)
                          : 0;
                      const isExpanded = Boolean(expandedSubtasks[task.id]);

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/70 hover:border-purple-500/60 shadow-md space-y-2.5 transition-all cursor-grab active:cursor-grabbing group hover:shadow-purple-500/10"
                        >
                          {/* Card Top Pill Row */}
                          <div className="flex items-center justify-between gap-2">
                            {project ? (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 truncate max-w-[150px]">
                                {project.name}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-mono">
                                {task.id}
                              </span>
                            )}

                            <div className="flex items-center gap-1 shrink-0">
                              {getPriorityBadge(task.priority)}
                              <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                            </div>
                          </div>

                          {/* Task Title */}
                          <h4 className="text-xs font-bold text-white leading-snug break-words">
                            {task.title}
                          </h4>

                          {/* Recommendation Flag if any */}
                          {task.tlRecommendation && (
                            <div className="text-[10px]">
                              {task.tlRecommendation === 'recommended' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                  TL Recommended
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  Revision Required
                                </span>
                              )}
                            </div>
                          )}

                          {/* Open Bugs Badge on Card */}
                          {bugs.filter((b) => b.taskId === task.id && b.status !== 'Verified').length > 0 && (
                            <div className="text-[10px]">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                                <BugIcon className="w-2.5 h-2.5" />
                                <span>{bugs.filter((b) => b.taskId === task.id && b.status !== 'Verified').length} open bug{bugs.filter((b) => b.taskId === task.id && b.status !== 'Verified').length === 1 ? '' : 's'}</span>
                              </span>
                            </div>
                          )}

                          {/* Subtasks Progress on Card */}
                          {totalSubtasks > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-slate-800">
                              <div className="flex items-center justify-between text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => toggleSubtaskExpand(task.id)}
                                  className="font-semibold text-slate-300 flex items-center gap-1 hover:text-white cursor-pointer"
                                >
                                  <CheckSquare className="w-3 h-3 text-purple-400" />
                                  <span>
                                    {completedSubtasks}/{totalSubtasks} subtasks
                                  </span>
                                  {isExpanded ? (
                                    <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="w-2.5 h-2.5 text-slate-400" />
                                  )}
                                </button>
                                <span className="font-mono text-purple-300 font-bold text-[10px]">
                                  {subtaskPercent}%
                                </span>
                              </div>

                              <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    completedSubtasks === totalSubtasks
                                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                      : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                  }`}
                                  style={{ width: `${subtaskPercent}%` }}
                                />
                              </div>

                              {/* Expandable checklist right on the board card */}
                              {isExpanded && (
                                <div className="space-y-1 pt-1.5 max-h-28 overflow-y-auto">
                                  {subtasks.map((st) => (
                                    <div
                                      key={st.id}
                                      className="flex items-center gap-1.5 text-[11px]"
                                    >
                                      <button
                                        type="button"
                                        disabled={
                                          task.status === 'Completed' ||
                                          !canManageTask(task)
                                        }
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleSubtask(task, st.id);
                                        }}
                                        className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                          st.completed
                                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                            : 'border-slate-700 bg-slate-800 text-transparent hover:border-purple-500'
                                        } ${
                                          task.status !== 'Completed' && canManageTask(task)
                                            ? 'cursor-pointer'
                                            : 'cursor-default'
                                        }`}
                                      >
                                        {st.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                      </button>
                                      <span
                                        className={`truncate ${
                                          st.completed
                                            ? 'text-slate-400 line-through'
                                            : 'text-slate-200'
                                        }`}
                                      >
                                        {st.title}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Card Footer: Assignee, Deadline & Review Action */}
                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[10px]">
                            {/* Assignee Avatar */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              {task.assignedTo ? (
                                <>
                                  <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-[8px] flex items-center justify-center shrink-0">
                                    {task.assignedTo.slice(0, 2).toUpperCase()}
                                  </div>
                                  <span className="text-slate-300 truncate max-w-[80px]">
                                    {task.assignedTo}
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-500 italic">Unassigned</span>
                              )}
                            </div>

                            {/* Deadline or Action */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {task.deadline && (
                                <span className="text-slate-400 flex items-center gap-1 font-mono">
                                  <Calendar className="w-2.5 h-2.5 text-purple-400" />
                                  {task.deadline}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setReviewingTask(task)}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-600/20 hover:bg-purple-600/35 text-purple-300 border border-purple-500/30 transition-all cursor-pointer"
                              >
                                Review
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Task Review and Workflow Approval Modal ── */}
      {reviewingTask && (
        <TaskReviewModal
          task={reviewingTask}
          project={projectMap[reviewingTask.projectId]}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          bugs={bugs}
          onClose={() => setReviewingTask(null)}
          onUpdateTask={(updated) => {
            if (onUpdateTask) onUpdateTask(updated);
            setReviewingTask(updated);
          }}
          onAddBug={onAddBug}
          onUpdateBug={onUpdateBug}
        />
      )}

      {/* ── New Task Creation Modal ── */}
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
                <strong>Task creation:</strong> Tasks sync automatically across List and Board views and persist in browser storage.
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
