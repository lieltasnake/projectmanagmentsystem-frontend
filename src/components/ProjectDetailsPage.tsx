import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  UserCheck,
  CheckSquare,
  Users,
  LayoutGrid,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Layers,
  Plus,
  X,
  Info,
  ShieldCheck,
  Flag,
  TrendingUp,
  Briefcase,
  RotateCcw,
  MessageSquare,
  Paperclip,
  ExternalLink,
  Check,
  LayoutList,
  Kanban,
  GripVertical,
  GitBranch,
  RefreshCw,
  Database,
} from 'lucide-react';
import type { Project, Task, TeamMember, Bug, ProjectStatus, UserRole } from '../types/pms';
import TaskReviewModal from './TaskReviewModal';
import { useProjectTeam } from '../hooks/useProjectTeam';
import {
  getProjectStatuses,
  approveTask,
  getProjectGitHubRepositories,
  connectProjectGitHubRepo,
  disconnectProjectGitHubRepo,
  getGitHubInstallations,
  getGitHubRepositories,
  type ProjectGitHubRepository,
  type GitHubInstallation,
} from '../services/api';

interface ProjectDetailsPageProps {
  project: Project;
  tasks: Task[];
  teamMembers: TeamMember[];
  currentUserRole?: UserRole;
  currentUserName?: string;
  bugs?: Bug[];
  onBack: () => void;
  onAddTask?: (task: Task) => void;
  onUpdateTask?: (task: Task) => void;
  onAddBug?: (bug: Bug) => void;
  onUpdateBug?: (bug: Bug) => void;
  onProjectUpdated?: (project: Project) => void;
}

type TabId = 'overview' | 'tasks' | 'team' | 'github';

const PRIORITIES: Task['priority'][] = ['High', 'Medium', 'Low'];

function getStatusBadge(status: Project['status']) {
  switch (status) {
    case 'Completed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Completed (PM Approved)
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <Clock className="w-3.5 h-3.5" />
          In Progress
        </span>
      );
    case 'Planning':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-soft text-accent-light border border-accent/30">
          <Layers className="w-3.5 h-3.5" />
          Planning
        </span>
      );
    case 'On Hold':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5" />
          On Hold
        </span>
      );
    default:
      return null;
  }
}

function getTaskStatusBadge(status: Task['status'], recommendation?: Task['tlRecommendation'], isLegacyDone = false) {
  // Legacy/Unapproved DONE badge: never displayed as Completed.
  if (isLegacyDone) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-900/20 text-rose-400 border border-rose-500/30">
        <AlertTriangle className="w-3 h-3" />
        Legacy/Unapproved DONE
      </span>
    );
  }

  // Generic badge for custom/dynamic statuses not covered by the hardcoded switch.
  const knownStatuses = ['Completed', 'In Progress', 'Under Review', 'Not Started'];
  if (!knownStatuses.includes(status)) {
    const cfg = {
      label: status,
      badgeBg: 'bg-slate-700/30 text-slate-300 border-slate-600/40',
      border: 'border-slate-700/80',
      dot: 'bg-slate-400',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.badgeBg} border ${cfg.border}`}>
        <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
        {status}
      </span>
    );
  }
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-soft text-accent-light border border-accent/30">
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

export default function ProjectDetailsPage({
  project,
  tasks,
  currentUserRole = 'Project Manager',
  currentUserName = 'Workspace User',
  bugs = [],
  onBack,
  onAddTask,
  onUpdateTask,
  onAddBug,
  onUpdateBug,
  onProjectUpdated,
}: ProjectDetailsPageProps) {
  void onProjectUpdated;
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const { members: hookTeamMembers } = useProjectTeam(project.id);

  const projectTasks = tasks.filter((t) => t.projectId === project.id);

  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    assignedTo: '',
    priority: 'Medium' as Task['priority'],
    deadline: '',
    status: 'Not Started' as Task['status'],
  });
  const [taskFormNotice, setTaskFormNotice] = useState<string | null>(null);
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'board'>('list');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Dynamic project-specific statuses
  const [projectStatuses, setProjectStatuses] = useState<ProjectStatus[]>([]);

  const effectiveStatuses = useMemo(() => {
    if (projectStatuses.length > 0) {
      return projectStatuses.map((s) => s.name);
    }
    return ['Not Started', 'In Progress', 'Under Review', 'Completed'];
  }, [projectStatuses]);

  const completionStatusMemo = useMemo(() => {
    return projectStatuses.find((s) => s.isCompletionStatus);
  }, [projectStatuses]);

  const completionName = completionStatusMemo ? completionStatusMemo.name : 'Completed';

  // GitHub repository connection state
  const [githubConnectedRepos, setGithubConnectedRepos] = useState<ProjectGitHubRepository[]>([]);
  const [githubAvailableRepos, setGithubAvailableRepos] = useState<GitHubRepository[]>([]);
  const [githubInstallations, setGithubInstallations] = useState<GitHubInstallation[]>([]);
  const [githubSelectedInstallationId, setGithubSelectedInstallationId] = useState<string | null>(null);
  const [githubConnectedLoading, setGithubConnectedLoading] = useState(false);
  const [githubAvailableLoading, setGithubAvailableLoading] = useState(false);
  const [githubConnectLoading, setGithubConnectLoading] = useState(false);
  const [githubDisconnectLoading, setGithubDisconnectLoading] = useState(false);
  const [githubConnectError, setGithubConnectError] = useState<string | null>(null);
  const [githubDisconnectError, setGithubDisconnectError] = useState<string | null>(null);
  const [githubRepoToConnect, setGithubRepoToConnect] = useState<GitHubRepository | null>(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [githubRepoToDisconnect, setGithubRepoToDisconnect] = useState<ProjectGitHubRepository | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const isLegacyUnapprovedDone = useCallback((task: Task): boolean => {
    const completionStatus = projectStatuses.find((s) => s.isCompletionStatus);
    return (
      (task as any).statusId === null &&
      task.status === (completionStatus ? completionStatus.name : 'Completed')
    );
  }, [projectStatuses]);

  // Load statuses for the current project
  useEffect(() => {
    (async () => {
      try {
        const res = await getProjectStatuses(project.id);
        setProjectStatuses(res.statuses || []);
      } catch {
        setProjectStatuses([]);
      }
    })();
  }, [project.id]);

  // GitHub repository connection state management
  const fetchGithubInstallations = useCallback(async () => {
    setGithubAvailableLoading(true);
    try {
      const res = await getGitHubInstallations();
      if (res.success) {
        setGithubInstallations(res.installations);
        // Auto-select the first active installation
        const activeInst = res.installations.find((i) => i.isActive === true);
        if (activeInst) {
          setGithubSelectedInstallationId(activeInst.installationId);
        } else if (res.installations.length > 0) {
          setGithubSelectedInstallationId(res.installations[0].installationId);
        }
      }
    } catch {
      setGithubInstallations([]);
    } finally {
      setGithubAvailableLoading(false);
    }
  }, []);

  const fetchInstallationRepositories = useCallback(async (installationId: string) => {
    setGithubAvailableLoading(true);
    try {
      const res = await getGitHubRepositories(installationId);
      if (res.success) {
        setGithubAvailableRepos(res.repositories);
      } else {
        setGithubAvailableRepos([]);
      }
    } catch {
      setGithubAvailableRepos([]);
    } finally {
      setGithubAvailableLoading(false);
    }
  }, []);

  const fetchProjectGithubRepos = useCallback(async () => {
    setGithubConnectedLoading(true);
    setGithubConnectError(null);
    try {
      const res = await getProjectGitHubRepositories(project.id);
      if (res.success) {
        setGithubConnectedRepos(res.repositories);
      } else {
        setGithubConnectedRepos([]);
      }
    } catch {
      setGithubConnectedRepos([]);
    } finally {
      setGithubConnectedLoading(false);
    }
  }, [project.id]);

  const handleConnectRepo = async () => {
    if (!githubRepoToConnect || !githubSelectedInstallationId) return;
    setGithubConnectLoading(true);
    setGithubConnectError(null);
    try {
      const res = await connectProjectGitHubRepo(project.id, githubRepoToConnect.github_repo_id);
      if (res.success) {
        setGithubConnectError(null);
        setConnectDialogOpen(false);
        setGithubRepoToConnect(null);
        await fetchProjectGithubRepos();
      } else {
        setGithubConnectError(res.message || 'Failed to connect repository.');
      }
    } catch (err: any) {
      setGithubConnectError(err.message || 'Failed to connect repository.');
    } finally {
      setGithubConnectLoading(false);
    }
  };

  const handleDisconnectRepo = (repo: ProjectGitHubRepository) => {
    setGithubRepoToDisconnect(repo);
    setDisconnectDialogOpen(true);
  };

  const handleConfirmDisconnect = async () => {
    if (!githubRepoToDisconnect) return;
    setGithubDisconnectLoading(true);
    setGithubDisconnectError(null);
    try {
      const res = await disconnectProjectGitHubRepo(project.id, githubRepoToDisconnect.githubRepoId);
      if (res.success) {
        setGithubDisconnectError(null);
        setDisconnectDialogOpen(false);
        setGithubRepoToDisconnect(null);
        await fetchProjectGithubRepos();
      } else {
        setGithubDisconnectError(res.message || 'Failed to disconnect repository.');
      }
    } catch (err: any) {
      setGithubDisconnectError(err.message || 'Failed to disconnect repository.');
    } finally {
      setGithubDisconnectLoading(false);
    }
  };

  // Load GitHub data for this project
  useEffect(() => {
    fetchGithubInstallations();
    fetchProjectGithubRepos();
  }, [project.id, fetchGithubInstallations, fetchProjectGithubRepos]);

  useEffect(() => {
    if (githubSelectedInstallationId) {
      fetchInstallationRepositories(githubSelectedInstallationId);
    } else {
      setGithubAvailableRepos([]);
    }
  }, [githubSelectedInstallationId, fetchInstallationRepositories]);

  const isPM = currentUserRole === 'Project Manager';

  const handleOpenTaskModal = () => {
    const r = String(currentUserRole || '').toUpperCase().replace(/[\s_-]+/g, '');
    const canCreate = r === 'PROJECTMANAGER' || r === 'PM' || r === 'TEAMLEADER' || r === 'TL';
    if (!canCreate) return;
    setTaskFormNotice(null);
    setTaskForm({ title: '', assignedTo: '', priority: 'Medium', deadline: '', status: 'Not Started' });
    setIsTaskModalOpen(true);
  };

  const handleCloseTaskModal = () => {
    setIsTaskModalOpen(false);
    setTaskFormNotice(null);
  };

  const handleTaskFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newTask: Task = {
      id: `task-${Date.now()}`,
      projectId: project.id,
      title: taskForm.title,
      assignedTo: taskForm.assignedTo || undefined,
      priority: taskForm.priority,
      deadline: taskForm.deadline,
      status: taskForm.status,
      subtasks: [],
    };
    if (onAddTask) {
      onAddTask(newTask);
      setTaskFormNotice(`Task "${newTask.title}" has been added to this project.`);
    } else {
      setTaskFormNotice(
        `Frontend form verified: Task "${newTask.title}" is ready for backend API storage.`
      );
    }
  };

  const handleToggleSubtask = (targetTask: Task, subtaskId: string) => {
    if (!onUpdateTask) return;

    const isTeamMember = currentUserRole === 'Team Member';
    const isTeamLeader = currentUserRole === 'Team Leader';
    const isProjectManager = currentUserRole === 'Project Manager';

    const isAssigned = Boolean(
      targetTask.assignedTo &&
      targetTask.assignedTo.trim().toLowerCase() === currentUserName.trim().toLowerCase()
    );

    const completionStatus = projectStatuses.find((s) => s.isCompletionStatus);
    const currentCompletionName = completionStatus ? completionStatus.name : 'Completed';

    const canManage =
      targetTask.status !== currentCompletionName &&
      (isProjectManager || isTeamLeader || (isTeamMember && isAssigned));

    if (!canManage) return;

    const currentSubtasks = targetTask.subtasks || [];
    const updatedSubtasks = currentSubtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    // CRITICAL: Completing every subtask must NEVER automatically change
    // the parent task status to 'Completed'. Parent status remains strictly unchanged.
    const updatedTask: Task = {
      ...targetTask,
      subtasks: updatedSubtasks,
    };

    onUpdateTask(updatedTask);
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    if (task.status === newStatus || !onUpdateTask) return;

    if (newStatus === completionName && currentUserRole !== 'Project Manager') {
      setPermissionNotice(
        'Permission Denied: Only the Project Manager can approve a task as Completed. Team Members must submit tasks for review.'
      );
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    const isAssigned = Boolean(
      task.assignedTo &&
      task.assignedTo.trim().toLowerCase() === currentUserName.trim().toLowerCase()
    );

    const canManage =
      task.status !== completionName &&
      (currentUserRole === 'Project Manager' ||
        currentUserRole === 'Team Leader' ||
        (currentUserRole === 'Team Member' && isAssigned));

    if (!canManage) {
      setPermissionNotice('Permission Denied: You do not have permission to modify this task.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    // PM completing a task via the completion status must use the backend
    // approval endpoint. Never create a local final_approve review record
    // as a substitute for backend approval.
    if (newStatus === completionName && currentUserRole === 'Project Manager') {
      try {
        const res = await approveTask(task.id);
        if (res.success) {
          // Backend approval succeeded. Refresh local task state from the
          // backend's approval decision.
          onUpdateTask({
            ...task,
            status: res.status || completionName,
            approvedAt: new Date().toISOString(),
            approvedById: currentUserName,
          });
        } else {
          setPermissionNotice(res.message || 'Failed to complete task.');
          setTimeout(() => setPermissionNotice(null), 4000);
        }
      } catch (err: any) {
        setPermissionNotice(err.message || 'Failed to complete task.');
        setTimeout(() => setPermissionNotice(null), 4000);
      }
      return;
    }

    // Non-completion status changes: no local approval record is created.
    onUpdateTask({
      ...task,
      status: newStatus as Task['status'],
    });
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId) return;

    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;
    handleStatusChange(targetTask, targetStatus);
  };

  const assignedTeamLeader = hookTeamMembers.find((m) => m.isTeamLeader) || null;

  const assignedMembers = hookTeamMembers.filter((m) => !m.isTeamLeader);


  const tabs: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'tasks', label: `Tasks (${projectTasks.length})`, icon: CheckSquare },
    { id: 'team', label: `Team (${hookTeamMembers.length})`, icon: Users },
    { id: 'github', label: 'GitHub', icon: GitBranch },
  ];

  const taskStats = {
    total: projectTasks.length,
    completed: projectTasks.filter((t) => t.approvedAt && t.approvedById).length,
    inProgress: projectTasks.filter((t) => t.status === 'In Progress' && !(t.approvedAt && t.approvedById)).length,
    underReview: projectTasks.filter((t) => t.status === 'Under Review' && !(t.approvedAt && t.approvedById)).length,
    notStarted: projectTasks.filter((t) => t.status === 'Not Started' && !(t.approvedAt && t.approvedById)).length,
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors group cursor-pointer"
          aria-label="Back to Projects"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Projects</span>
        </button>
        <span className="text-slate-600">/</span>
        <span className="text-sm text-white font-semibold truncate max-w-[200px] sm:max-w-none">
          {project.name}
        </span>
      </div>

      {/* Project Header Card */}
      <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[11px] font-mono text-accent-light px-2 py-0.5 rounded-md bg-accent-soft border border-accent/20">
                {project.id}
              </span>
              {project.projectKey && (
                <span className="text-[9px] font-medium text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-500/30">
                  {project.projectKey}
                </span>
              )}
              {getStatusBadge(project.status)}
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                {project.priority}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {project.name}
            </h2>
            {project.description && (
              <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5 shrink-0 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-accent to-accent-hover text-white font-bold text-xs flex items-center justify-center shadow-md shadow-accent/20 ring-1 ring-accent/30">
              {project.manager.avatarInitials}
            </div>
            <div>
              <div className="text-xs font-semibold text-white">{project.manager.name}</div>
              <div className="text-[10px] text-accent-light flex items-center gap-1">
                <UserCheck className="w-3 h-3" />
                <span>Project Manager</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dates + Progress */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-3">
            <div className="text-[10px] text-slate-400 mb-1">Start Date</div>
            <div className="text-xs text-white font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {project.startDate}
            </div>
          </div>
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-3">
            <div className="text-[10px] text-slate-400 mb-1">Deadline</div>
            <div className="text-xs text-white font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-accent-light" />
              {project.deadline}
            </div>
          </div>
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-3">
            <div className="text-[10px] text-slate-400 mb-1">Tasks</div>
            <div className="text-xs text-white font-medium flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
              {taskStats.completed}/{taskStats.total} complete
            </div>
          </div>
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-3">
            <div className="text-[10px] text-slate-400 mb-1.5">Progress</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    project.progress === 100
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-accent to-accent-hover'
                  }`}
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <span className="text-xs font-bold text-white">{project.progress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#0b112c]/80 border border-slate-800 rounded-2xl p-1.5 w-full sm:w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-md shadow-accent/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent-light" />
              Task Status Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Not Started', value: taskStats.notStarted, color: 'text-slate-300', bg: 'bg-slate-600/20 border-slate-600/30' },
                { label: 'In Progress', value: taskStats.inProgress, color: 'text-indigo-300', bg: 'bg-indigo-500/15 border-indigo-500/30' },
                { label: 'Under Review', value: taskStats.underReview, color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30' },
                { label: 'Completed', value: taskStats.completed, color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30' },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl border p-3 ${s.bg}`}>
                  <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            {taskStats.total > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300">Overall Completion</span>
                  <span className="font-bold text-white">{project.progress}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-700"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  A task is counted as <strong className="text-white">Completed</strong> only after final PM approval. TLs may review and recommend but cannot grant final approval.
                </p>
              </div>
            )}
            {taskStats.total === 0 && (
              <p className="mt-4 text-xs text-slate-400">
                No tasks yet. Switch to the Tasks tab to add the first task.
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-accent-light" />
              Project Details
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block">Project ID</span>
                <span className="font-mono text-accent-light">{project.id}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Status</span>
                {getStatusBadge(project.status)}
              </div>
              <div>
                <span className="text-slate-400 block">Priority</span>
                <span className="text-white font-semibold">{project.priority}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Responsible PM</span>
                <span className="text-white font-semibold">{project.manager.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Team Leader</span>
                {assignedTeamLeader ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {assignedTeamLeader.name
                        .split(/[\s._-]+/)
                        .slice(0, 2)
                        .map((s: string) => s.charAt(0).toUpperCase())
                        .join('') || 'U'}
                    </span>
                    <span className="text-white font-semibold">{assignedTeamLeader.name}</span>
                  </div>
                ) : (
                  <span className="text-slate-500 italic">Not Assigned</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block">Assigned Members</span>
                <span className="text-white font-semibold">
                  {assignedMembers.length > 0 ? `${assignedMembers.length} member(s)` : 'None'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Start Date</span>
                <span className="text-white">{project.startDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Deadline</span>
                <span className="text-white">{project.deadline}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {permissionNotice && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between gap-3 shadow-lg">
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

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">Project Tasks</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Tasks are completed only upon final PM approval.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* List / Board Switcher */}
              <div className="bg-[#0b112c]/90 p-1 rounded-xl border border-slate-800 flex items-center gap-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setTaskViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    taskViewMode === 'list'
                      ? 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-md shadow-accent/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                  title="List View"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskViewMode('board')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    taskViewMode === 'board'
                      ? 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-md shadow-accent/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                  title="Board View"
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span>Board</span>
                </button>
              </div>

              {(() => {
                const r = String(currentUserRole || '').toUpperCase().replace(/[\s_-]+/g, '');
                const canCreateTask = r === 'PROJECTMANAGER' || r === 'PM' || r === 'TEAMLEADER' || r === 'TL';
                return canCreateTask ? (
                  <button
                    type="button"
                    onClick={handleOpenTaskModal}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-accent to-accent-hover hover:from-accent hover:to-accent-hover shadow-lg shadow-accent/25 transition-all cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Task</span>
                  </button>
                ) : null;
              })()}
            </div>
          </div>

          {projectTasks.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 text-center flex flex-col items-center justify-center min-h-[280px]">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4">
                <CheckSquare className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white">No tasks yet</h4>
              <p className="mt-2 text-xs text-slate-400 max-w-sm leading-relaxed">
                This project has no tasks. Click "Add Task" to create the first task.
              </p>
            </div>
          ) : taskViewMode === 'list' ? (
            <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#0b112c]/90 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold">Task Title</th>
                      <th className="px-5 py-3.5 font-semibold">Assigned To</th>
                      <th className="px-5 py-3.5 font-semibold">Priority</th>
                      <th className="px-5 py-3.5 font-semibold">Deadline</th>
                      <th className="px-5 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Workflow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {projectTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-white">{task.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-slate-500 font-mono">{task.id}</span>
                            {task.taskKey && (
                              <span className="text-[9px] font-medium text-indigo-300 px-1.5 py-0.2 rounded bg-indigo-900/40 border border-indigo-500/30">
                                {task.taskKey}
                              </span>
                            )}
                            {task.comments && task.comments.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-light bg-accent-soft px-1.5 py-0.2 rounded border border-accent/30">
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
                            {task.subtasks && task.subtasks.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-light bg-accent-soft px-1.5 py-0.2 rounded border border-accent/30">
                                <CheckSquare className="w-2.5 h-2.5" />
                                {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length} subtasks
                              </span>
                            )}
                          </div>
                          {task.subtasks && task.subtasks.length > 0 && (
                            <div className="mt-2 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2 max-w-md">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                                  <CheckSquare className="w-3.5 h-3.5 text-accent-light" />
                                  <span>
                                    {task.subtasks.filter((s) => s.completed).length} of {task.subtasks.length} subtasks completed
                                  </span>
                                </span>
                                <span className="text-[10px] font-mono text-accent-light font-semibold">
                                  {Math.round((task.subtasks.filter((s) => s.completed).length / task.subtasks.length) * 100)}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    task.subtasks.filter((s) => s.completed).length === task.subtasks.length
                                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                      : 'bg-gradient-to-r from-accent to-accent-hover'
                                  }`}
                                  style={{
                                    width: `${Math.round(
                                      (task.subtasks.filter((s) => s.completed).length / task.subtasks.length) * 100
                                    )}%`,
                                  }}
                                />
                              </div>
                              <div className="space-y-1 max-h-32 overflow-y-auto pt-0.5">
                                {task.subtasks.map((st) => {
                                  const canManage =
                                    task.status !== 'Completed' &&
                                    (currentUserRole === 'Project Manager' ||
                                      currentUserRole === 'Team Leader' ||
                                      (currentUserRole === 'Team Member' &&
                                        Boolean(
                                          task.assignedTo &&
                                            task.assignedTo.trim().toLowerCase() ===
                                              currentUserName.trim().toLowerCase()
                                        )));

                                  return (
                                    <div key={st.id} className="flex items-center gap-2 text-[11px]">
                                      <button
                                        type="button"
                                        disabled={!canManage}
                                        onClick={() => handleToggleSubtask(task, st.id)}
                                        title={
                                          canManage
                                            ? st.completed
                                              ? 'Mark subtask incomplete'
                                              : 'Mark subtask complete'
                                            : 'Read-only'
                                        }
                                        className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                                          st.completed
                                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                            : 'border-slate-700 bg-slate-800 text-transparent hover:border-accent'
                                        } ${canManage ? 'cursor-pointer' : 'cursor-default'}`}
                                      >
                                        {st.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                      </button>
                                      <span
                                        className={`truncate ${
                                          st.completed ? 'text-slate-400 line-through' : 'text-slate-200'
                                        }`}
                                      >
                                        {st.title}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {task.reviewFeedback && (
                            <div className="mt-1 text-[10px] text-accent-light line-clamp-1 italic">
                              Note: {task.reviewFeedback}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {task.assignedTo ? (
                            <span className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-accent to-accent-hover text-white font-bold text-[9px] flex items-center justify-center">
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
                          {getTaskStatusBadge(task.status, task.tlRecommendation, isLegacyUnapprovedDone(task))}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => setReviewingTask(task)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-accent-soft hover:bg-accent-soft text-accent-light border border-accent/30 transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>{task.status === completionName ? 'View Details' : 'Details & Review'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Project Details Board View */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
              {effectiveStatuses.map((statusKey) => {
                const columnTasks = projectTasks.filter((t) => t.status === statusKey);
                const isDropTarget = dragOverColumn === statusKey;

                return (
                  <div
                    key={statusKey}
                    onDragOver={(e) => handleDragOver(e, statusKey)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, statusKey)}
                    className={`rounded-2xl bg-[#0f173b]/95 border transition-all flex flex-col min-h-[380px] shadow-xl ${
                      isDropTarget
                        ? 'border-accent ring-2 ring-accent/30 bg-[#141d4b]'
                        : 'border-slate-700/70'
                    }`}
                  >
                    <div className="p-3.5 border-b border-slate-800 bg-[#0b112c]/90 rounded-t-2xl flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider text-white">
                        {statusKey}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {columnTasks.length}
                      </span>
                    </div>

                    <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[500px]">
                      {columnTasks.length === 0 ? (
                        <div className="h-28 rounded-xl border border-dashed border-slate-800/80 flex items-center justify-center text-slate-500 text-xs">
                          Drop tasks here
                        </div>
                      ) : (
                        columnTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/70 hover:border-accent/60 shadow-md space-y-2 cursor-grab active:cursor-grabbing group hover:shadow-accent/10 transition-all"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {task.id}
                              </span>
                              <div className="flex items-center gap-1">
                                {getPriorityBadge(task.priority)}
                                <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" />
                              </div>
                            </div>
                            <h4 className="text-xs font-bold text-white break-words">
                              {task.title}
                            </h4>
                            {task.subtasks && task.subtasks.length > 0 && (
                              <div className="text-[10px] text-accent-light flex items-center gap-1 pt-1 border-t border-slate-800">
                                <CheckSquare className="w-3 h-3 text-accent-light" />
                                <span>
                                  {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length} subtasks
                                </span>
                              </div>
                            )}
                            <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px]">
                              <span className="text-slate-400 truncate max-w-[90px]">
                                {task.assignedTo || 'Unassigned'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setReviewingTask(task)}
                                className="px-2 py-0.5 rounded text-[10px] bg-accent-soft text-accent-light border border-accent/30 hover:bg-accent-soft cursor-pointer font-semibold"
                              >
                                {task.status === completionName ? 'Details' : 'Review'}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Review and Approval Modal */}
          {reviewingTask && (
            <TaskReviewModal
              task={reviewingTask}
              project={project}
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
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Project Team</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Assigned Team Leader and Team Members registered for this project.
            </p>
          </div>
          {hookTeamMembers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 text-center flex flex-col items-center justify-center min-h-[280px]">
              <div className="w-14 h-14 rounded-2xl bg-accent-soft border border-accent/30 flex items-center justify-center text-accent-light mb-4">
                <Users className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white">No team members assigned</h4>
              <p className="mt-2 text-xs text-slate-400 max-w-sm leading-relaxed">
                No Team Leader or Team Members have been assigned to this project yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {hookTeamMembers.map((member) => {
                const isTL = member.id === project.teamLeaderId;
                return (
                  <div
                    key={member.id}
                    className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-4 flex items-center gap-3 hover:border-accent/40 transition-all shadow-lg"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl text-white font-bold text-sm flex items-center justify-center shadow-md shrink-0 ${
                        isTL
                          ? 'bg-gradient-to-tr from-amber-500 to-orange-500 shadow-amber-500/20'
                          : 'bg-gradient-to-tr from-accent to-accent-hover shadow-accent/20'
                      }`}
                    >
                      {member.name
                        .split(/[\s._-]+/)
                        .slice(0, 2)
                        .map((s: string) => s.charAt(0).toUpperCase())
                        .join('') || 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">{member.name}</span>
                        {isTL && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Team Leader
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-accent-light">{member.role}</div>
                      <div className="text-[10px] text-slate-400 truncate">{member.skills && member.skills.length > 0 ? member.skills.join(', ') : 'No skills recorded'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* GitHub Tab */}
      {activeTab === 'github' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-accent-light" />
                GitHub Integration
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect GitHub repositories from your workspace installation to this project.
              </p>
            </div>
          </div>

          {/* Installation not connected notice */}
          {githubInstallations.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/60 bg-[#0f173b]/40 p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mx-auto mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white mb-2">No GitHub installation</h4>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed mx-auto">
                No GitHub App installation is configured for this workspace. A Project Manager must
                complete the GitHub App installation flow before repositories can be connected to projects.
              </p>
            </div>
          )}

          {githubInstallations.length > 0 && (
            <>
              {/* Repository selector + connect (PM only) */}
              <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">Connect Repository</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Select a repository from your GitHub App installation to connect to this project.
                    </p>
                  </div>
                  {isPM && githubSelectedInstallationId && githubAvailableRepos.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        value={githubRepoToConnect?.github_repo_id || ''}
                        onChange={(e) => {
                          const selected = githubAvailableRepos.find(
                            (r) => r.github_repo_id === e.target.value
                          );
                          setGithubRepoToConnect(selected || null);
                        }}
                        className="w-full sm:w-auto px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:border-accent focus:outline-none cursor-pointer"
                      >
                        <option value="">— Select a repository —</option>
                        {githubAvailableRepos.map((repo) => (
                          <option key={repo.github_repo_id} value={repo.github_repo_id}>
                            {repo.full_name || repo.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={
                          githubConnectLoading ||
                          !githubRepoToConnect ||
                          !githubSelectedInstallationId
                        }
                        onClick={handleConnectRepo}
                        className="px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          githubConnectLoading
                            ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-lg shadow-accent/25'
                        }"
                      >
                        {githubConnectLoading ? 'Connecting...' : 'Connect Repository'}
                      </button>
                    </div>
                  )}
                  {isPM && githubConnectError && (
                    <div className="w-full p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>{githubConnectError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Connected repositories list */}
              <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-white">
                    Connected Repositories ({githubConnectedRepos.length})
                  </h4>
                </div>

                {githubConnectedLoading ? (
                  <div className="h-40 flex items-center justify-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  </div>
                ) : githubConnectedRepos.length === 0 ? (
                  <div className="p-8 rounded-xl border-2 border-dashed border-slate-800/60 bg-slate-900/30 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mx-auto mb-3">
                      <Database className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">No connected repositories</h4>
                    <p className="text-xs text-slate-400 max-w-sm leading-relaxed mx-auto">
                      No GitHub repositories are connected to this project yet.
                      {isPM ? 'Click "Connect Repository" above to add one.' : ''}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Repository</th>
                          <th className="py-2.5 px-3">Owner</th>
                          <th className="py-2.5 px-3">Visibility</th>
                          <th className="py-2.5 px-3">Default Branch</th>
                          <th className="py-2.5 px-3">Connected At</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {githubConnectedRepos
                          .filter((repo) => repo.is_active)
                          .map((repo) => (
                          <tr
                            key={repo.githubRepoId}
                            className="hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="py-3 px-3">
                              <span className="text-sm font-medium text-white truncate">
                                {repo.fullName || repo.name}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                                {repo.githubRepoId}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-300 truncate max-w-xs">
                              {repo.ownerLogin || '—'}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                  repo.private
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {repo.private ? 'Private' : 'Public'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-300 font-mono truncate max-w-xs">
                              {repo.defaultBranch || '—'}
                            </td>
                            <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                              {repo.connectedAt ? new Date(repo.connectedAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {isPM ? (
                                <button
                                  type="button"
                                  onClick={() => handleDisconnectRepo(repo)}
                                  disabled={githubDisconnectLoading}
                                  className="px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:text-white hover:bg-rose-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {githubDisconnectLoading ? 'Disconnecting...' : 'Disconnect'}
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-500 italic">Read-only</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Role notice */}
          {!isPM && (
            <div className="p-4 rounded-xl bg-accent-soft/10 border border-accent/20">
              <div className="flex items-center gap-2 text-xs text-accent-light">
                <Info className="w-3 h-3" />
                <span>
                  Repository connection actions are restricted to Project Manager role. Your current role is{" "}
                  <span className="font-semibold">{currentUserRole}</span>.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent to-accent-hover flex items-center justify-center text-white shadow-md shadow-accent/25">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Add Task</h3>
                  <p className="text-xs text-slate-400">Project: {project.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseTaskModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
              <Info className="w-4 h-4 text-accent-light shrink-0 mt-0.5" />
              <span>
                <strong>Project pre-selected:</strong> This task will belong to "{project.name}".
              </span>
            </div>

            {taskFormNotice && (
              <div className="mt-3 p-3 rounded-xl bg-accent-soft border border-accent/40 text-accent-light text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-accent-light shrink-0 mt-0.5" />
                <span>{taskFormNotice}</span>
              </div>
            )}

            <form onSubmit={handleTaskFormSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="taskTitle" className="block text-xs font-medium text-slate-200 mb-1">
                  Task Title <span className="text-accent-light">*</span>
                </label>
                <input
                  id="taskTitle"
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="e.g. Design API schema"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/80"
                />
              </div>

              <div>
                <label htmlFor="taskAssignee" className="block text-xs font-medium text-slate-200 mb-1">
                  Assigned To
                </label>
                {hookTeamMembers.length === 0 ? (
                  <div className="w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700/60 text-xs text-slate-500 italic">
                    No project team members yet — go to the Team tab to add members.
                  </div>
                ) : (
                  <select
                    id="taskAssignee"
                    value={taskForm.assignedTo}
                    onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/80 cursor-pointer"
                  >
                    <option value="" className="bg-[#0f173b]">— Unassigned —</option>
                    {hookTeamMembers
                      .filter((m: any) => m.isActive !== false)
                      .map((m: any) => (
                        <option key={m.id} value={m.id} className="bg-[#0f173b]">
                          {m.name}{m.skills && m.skills.length > 0 ? ` — Skills: ${m.skills.join(', ')}` : ' — No skills recorded'}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="taskPriority" className="block text-xs font-medium text-slate-200 mb-1">
                    Priority
                  </label>
                  <select
                    id="taskPriority"
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Task['priority'] })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/80 cursor-pointer"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p} className="bg-[#0f173b]">{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="taskStatus" className="block text-xs font-medium text-slate-200 mb-1">
                    Status
                  </label>
                  <select
                    id="taskStatus"
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as Task['status'] })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/80 cursor-pointer"
                  >
                    {effectiveStatuses.map((s) => (
                      <option key={s} value={s} className="bg-[#0f173b]">{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="taskDeadline" className="block text-xs font-medium text-slate-200 mb-1">
                  Deadline
                </label>
                <input
                  id="taskDeadline"
                  type="date"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/80"
                />
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseTaskModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-accent to-accent-hover hover:from-accent hover:to-accent-hover shadow-md shadow-accent/30 transition-all cursor-pointer"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disconnect Repository Confirmation Dialog */}
      {disconnectDialogOpen && githubRepoToDisconnect && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-[#0f173b] border border-slate-700/80 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 shadow-md shadow-rose-500/20">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Disconnect Repository</h3>
                  <p className="text-xs text-slate-400">Project: {project.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDisconnectDialogOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>Disconnect "{githubRepoToDisconnect.fullName || githubRepoToDisconnect.name}"?</strong>
                This will remove the repository connection from this project. The connection history will be preserved.
              </span>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDisconnectDialogOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={githubDisconnectLoading}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 shadow-md shadow-rose-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {githubDisconnectLoading ? 'Disconnecting...' : 'Confirm Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
