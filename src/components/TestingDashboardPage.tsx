import React, { useState, useMemo } from 'react';
import {
  Bug,
  TestTube,
  AlertOctagon,
  AlertTriangle,
  Clock,
  RotateCcw,
  CheckCheck,
  Search,
  Plus,
  X,
  ExternalLink,
  Paperclip,
  User,
  Eye,
  FileText,
  Image as ImageIcon,
  Check,
  Trash2,
  RefreshCw,
  Info,
  Calendar,
} from 'lucide-react';
import type {
  Bug as BugType,
  Task,
  Project,
  TeamMember,
  TaskAttachment,
  TaskReviewEntry,
  UserRole,
} from '../types/pms';

interface TestingDashboardPageProps {
  tasks: Task[];
  projects: Project[];
  teamMembers: TeamMember[];
  bugs: BugType[];
  currentUserRole: UserRole;
  currentUserName: string;
  onAddTask?: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onAddBug: (bug: BugType) => void;
  onUpdateBug: (bug: BugType) => void;
  onDeleteBug?: (bugId: string) => void;
  onSelectProject?: (project: Project) => void;
}

export type TestingTab = 'awaiting' | 'bugs' | 'retesting';

export const BUG_STATUSES: BugType['status'][] = [
  'Open',
  'Assigned',
  'In Progress',
  'Fixed',
  'Retesting',
  'Verified',
  'Reopened',
];

export const BUG_SEVERITIES: BugType['severity'][] = [
  'Critical',
  'High',
  'Medium',
  'Low',
];

export function getSeverityBadge(severity: BugType['severity']) {
  switch (severity) {
    case 'Critical':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <AlertOctagon className="w-3 h-3 text-rose-400" />
          Critical
        </span>
      );
    case 'High':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/40">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
          High
        </span>
      );
    case 'Medium':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <Clock className="w-3 h-3 text-amber-400" />
          Medium
        </span>
      );
    case 'Low':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
          <Info className="w-3 h-3 text-blue-400" />
          Low
        </span>
      );
  }
}

export function getBugStatusBadge(status: BugType['status']) {
  switch (status) {
    case 'Open':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-700/40 text-slate-300 border border-slate-600/50">
          <AlertTriangle className="w-3 h-3 text-slate-400" />
          Open
        </span>
      );
    case 'Assigned':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
          <User className="w-3 h-3 text-indigo-400" />
          Assigned
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40">
          <Clock className="w-3 h-3 text-purple-400" />
          In Progress
        </span>
      );
    case 'Fixed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/40">
          <Check className="w-3 h-3 text-teal-400" />
          Fixed
        </span>
      );
    case 'Retesting':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <RefreshCw className="w-3 h-3 text-amber-400" />
          Retesting
        </span>
      );
    case 'Verified':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <CheckCheck className="w-3 h-3 text-emerald-400" />
          Verified
        </span>
      );
    case 'Reopened':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <RotateCcw className="w-3 h-3 text-rose-400" />
          Reopened
        </span>
      );
    default:
      return null;
  }
}

// Icon for file attachments
function AttachmentIcon({ type, name }: { type: string; name: string }) {
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    return <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
}

export default function TestingDashboardPage({
  tasks,
  projects,
  teamMembers,
  bugs,
  currentUserRole,
  currentUserName,
  onUpdateTask,
  onAddBug,
  onUpdateBug,
  onDeleteBug: _onDeleteBug,
  onSelectProject: _onSelectProject,
}: TestingDashboardPageProps) {
  const [activeTab, setActiveTab] = useState<TestingTab>('awaiting');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [projectFilter, setProjectFilter] = useState<string>('All');

  // Modals
  const [isReportBugModalOpen, setIsReportBugModalOpen] = useState(false);
  const [targetTaskForBug, setTargetTaskForBug] = useState<Task | null>(null);
  const [selectedBugForDetail, setSelectedBugForDetail] = useState<BugType | null>(null);
  const [taskToFailReview, setTaskToFailReview] = useState<Task | null>(null);
  const [failReasonText, setFailReasonText] = useState('');

  // Project map for quick lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  // Task map for quick lookup
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [tasks]);

  // Role permissions
  const isTester = currentUserRole === 'Tester';

  // 1. Tasks Awaiting Testing
  // Tasks currently in 'Under Review' status that require QA testing
  const tasksAwaitingTesting = useMemo(() => {
    return tasks.filter((t) => {
      // Must be Under Review
      if (t.status !== 'Under Review') return false;
      // Match project filter
      if (projectFilter !== 'All' && t.projectId !== projectFilter) return false;
      // Match search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pName = projectMap.get(t.projectId)?.name.toLowerCase() || '';
        return (
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.assignedTo && t.assignedTo.toLowerCase().includes(q)) ||
          pName.includes(q)
        );
      }
      return true;
    });
  }, [tasks, projectFilter, searchQuery, projectMap]);

  // 2. Retesting Queue
  // Bugs in 'Retesting' or 'Fixed' awaiting tester verification
  const retestingBugs = useMemo(() => {
    return bugs.filter((b) => {
      if (b.status !== 'Retesting' && b.status !== 'Fixed') return false;
      if (projectFilter !== 'All' && b.projectId !== projectFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          (b.assignedTo && b.assignedTo.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [bugs, projectFilter, searchQuery]);

  // 3. Filtered All Bugs
  const filteredBugs = useMemo(() => {
    return bugs.filter((b) => {
      if (statusFilter !== 'All' && b.status !== statusFilter) return false;
      if (severityFilter !== 'All' && b.severity !== severityFilter) return false;
      if (projectFilter !== 'All' && b.projectId !== projectFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const tTitle = taskMap.get(b.taskId)?.title.toLowerCase() || '';
        const pName = projectMap.get(b.projectId)?.name.toLowerCase() || '';
        return (
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          (b.assignedTo && b.assignedTo.toLowerCase().includes(q)) ||
          b.reportedBy.toLowerCase().includes(q) ||
          tTitle.includes(q) ||
          pName.includes(q)
        );
      }
      return true;
    });
  }, [bugs, statusFilter, severityFilter, projectFilter, searchQuery, taskMap, projectMap]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = bugs.length;
    const openCount = bugs.filter((b) =>
      ['Open', 'Assigned', 'In Progress', 'Reopened'].includes(b.status)
    ).length;
    const retestCount = bugs.filter((b) => ['Fixed', 'Retesting'].includes(b.status)).length;
    const verifiedCount = bugs.filter((b) => b.status === 'Verified').length;
    const criticalHigh = bugs.filter((b) =>
      ['Critical', 'High'].includes(b.severity) && b.status !== 'Verified'
    ).length;

    return {
      awaitingCount: tasksAwaitingTesting.length,
      total,
      openCount,
      retestCount,
      verifiedCount,
      criticalHigh,
    };
  }, [bugs, tasksAwaitingTesting]);

  // Handle open report bug modal for a specific task
  const handleOpenReportModal = (task?: Task) => {
    setTargetTaskForBug(task || null);
    setIsReportBugModalOpen(true);
  };

  // ── Action: Tester Fails Testing on Task (Sends back for corrections) ──
  const handleFailTestingConfirm = () => {
    if (!taskToFailReview) return;
    const timestamp = new Date().toLocaleString();

    const reviewEntry: TaskReviewEntry = {
      id: `rev-${Date.now()}`,
      authorRole: currentUserRole,
      authorName: currentUserName,
      action: 'request_corrections',
      comment: failReasonText.trim()
        ? `[QA Testing Failed by ${currentUserName}]: ${failReasonText.trim()}`
        : `QA Testing Failed by Tester (${currentUserName}). Returned to developer for bug fixes and revision.`,
      timestamp,
    };

    const updated: Task = {
      ...taskToFailReview,
      status: 'In Progress',
      tlRecommendation: 'corrections_requested',
      reviewFeedback: failReasonText.trim()
        ? `[QA Testing Failed]: ${failReasonText.trim()}`
        : `QA Testing Failed by ${currentUserName}. Returned for revision.`,
      reviewHistory: [reviewEntry, ...(taskToFailReview.reviewHistory || [])],
    };

    onUpdateTask(updated);
    setTaskToFailReview(null);
    setFailReasonText('');
  };

  // ── Action: Tester Passes Testing on Task ──
  const handlePassTesting = (task: Task) => {
    // Check if task has unresolved bugs
    const openTaskBugs = bugs.filter(
      (b) => b.taskId === task.id && b.status !== 'Verified'
    );

    if (openTaskBugs.length > 0) {
      alert(
        `Cannot pass testing: This task has ${openTaskBugs.length} unresolved bug(s). All reported bugs must be Verified before QA can approve.`
      );
      return;
    }

    const timestamp = new Date().toLocaleString();
    const reviewEntry: TaskReviewEntry = {
      id: `rev-${Date.now()}`,
      authorRole: currentUserRole,
      authorName: currentUserName,
      action: 'recommend_approval',
      comment: `QA Testing Passed by ${currentUserName}. All acceptance criteria verified with 0 open defects. Recommended for Team Leader / Project Manager approval.`,
      timestamp,
    };

    const updated: Task = {
      ...task,
      status: 'Under Review',
      tlRecommendation: 'recommended',
      reviewFeedback: `[QA Passed by ${currentUserName}]: Ready for TL & PM final governance sign-off.`,
      reviewHistory: [reviewEntry, ...(task.reviewHistory || [])],
    };

    onUpdateTask(updated);
  };

  // ── Action: Update Bug Status ──
  const handleUpdateBugStatus = (
    bug: BugType,
    nextStatus: BugType['status'],
    resolutionNotes?: string
  ) => {
    const timestamp = new Date().toLocaleString();
    const updated: BugType = {
      ...bug,
      status: nextStatus,
      resolutionNotes: resolutionNotes || bug.resolutionNotes,
      updatedAt: timestamp,
    };

    onUpdateBug(updated);
    if (selectedBugForDetail?.id === bug.id) {
      setSelectedBugForDetail(updated);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>Testing & QA Dashboard</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {isTester ? 'Tester Active' : `${currentUserRole} View`}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                End-to-end quality assurance, bug tracking lifecycle, and test verification workflow.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button: Report Bug */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenReportModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 shadow-lg shadow-amber-600/25 active:scale-[0.99] transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Report Bug</span>
          </button>
        </div>
      </div>

      {/* 2. Metrics Summary Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Card 1: Awaiting Testing */}
        <div
          onClick={() => setActiveTab('awaiting')}
          className={`p-4 rounded-2xl bg-[#0f173b]/90 border transition-all cursor-pointer ${
            activeTab === 'awaiting'
              ? 'border-purple-500 shadow-lg shadow-purple-500/10'
              : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Awaiting Test</span>
            <TestTube className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {metrics.awaitingCount}
          </div>
          <div className="text-[10px] text-purple-300 mt-0.5">Tasks submitted</div>
        </div>

        {/* Card 2: Total Reported Bugs */}
        <div
          onClick={() => setActiveTab('bugs')}
          className={`p-4 rounded-2xl bg-[#0f173b]/90 border transition-all cursor-pointer ${
            activeTab === 'bugs'
              ? 'border-indigo-500 shadow-lg shadow-indigo-500/10'
              : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Bugs</span>
            <Bug className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {metrics.total}
          </div>
          <div className="text-[10px] text-indigo-300 mt-0.5">Linked to tasks</div>
        </div>

        {/* Card 3: Active / Open Bugs */}
        <div
          onClick={() => {
            setActiveTab('bugs');
            setStatusFilter('Open');
          }}
          className="p-4 rounded-2xl bg-[#0f173b]/90 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Open / Fixing</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-300">
            {metrics.openCount}
          </div>
          <div className="text-[10px] text-amber-300/80 mt-0.5">Assigned to devs</div>
        </div>

        {/* Card 4: Retesting Queue */}
        <div
          onClick={() => setActiveTab('retesting')}
          className={`p-4 rounded-2xl bg-[#0f173b]/90 border transition-all cursor-pointer ${
            activeTab === 'retesting'
              ? 'border-amber-500 shadow-lg shadow-amber-500/10'
              : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Retesting</span>
            <RefreshCw className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400">
            {metrics.retestCount}
          </div>
          <div className="text-[10px] text-amber-300/80 mt-0.5">Ready for verify</div>
        </div>

        {/* Card 5: Verified Bugs */}
        <div
          onClick={() => {
            setActiveTab('bugs');
            setStatusFilter('Verified');
          }}
          className="p-4 rounded-2xl bg-[#0f173b]/90 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Verified</span>
            <CheckCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400">
            {metrics.verifiedCount}
          </div>
          <div className="text-[10px] text-emerald-300/80 mt-0.5">QA confirmed</div>
        </div>

        {/* Card 6: Critical / High Bugs */}
        <div
          onClick={() => {
            setActiveTab('bugs');
            setSeverityFilter('Critical');
          }}
          className="p-4 rounded-2xl bg-[#0f173b]/90 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Critical/High</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-rose-400">
            {metrics.criticalHigh}
          </div>
          <div className="text-[10px] text-rose-300/80 mt-0.5">Immediate priority</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs sm:text-sm">
        <button
          type="button"
          onClick={() => setActiveTab('awaiting')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'awaiting'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <TestTube className="w-4 h-4" />
          <span>Awaiting Testing</span>
          {metrics.awaitingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
              {metrics.awaitingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bugs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'bugs'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Bug className="w-4 h-4" />
          <span>Bug Tracking Registry</span>
          {bugs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
              {bugs.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('retesting')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'retesting'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retesting Queue</span>
          {metrics.retestCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-slate-900 font-bold">
              {metrics.retestCount}
            </span>
          )}
        </button>
      </div>

      {/* 4. Filter & Search Controls */}
      <div className="bg-[#0f173b]/90 border border-slate-700/60 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by bug title, task, developer, project..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project Filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
          >
            <option value="All">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter (Only for bugs tab) */}
          {activeTab === 'bugs' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
            >
              <option value="All">All Statuses</option>
              {BUG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          {/* Severity Filter (Only for bugs tab) */}
          {activeTab === 'bugs' && (
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80 cursor-pointer"
            >
              <option value="All">All Severities</option>
              {BUG_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          {(searchQuery || statusFilter !== 'All' || severityFilter !== 'All' || projectFilter !== 'All') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('All');
                setSeverityFilter('All');
                setProjectFilter('All');
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* 5. TAB CONTENT */}

      {/* ── TAB 1: SUBMITTED WORK AWAITING TESTING ── */}
      {activeTab === 'awaiting' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                <strong>Workflow Stage:</strong> Developers submit tasks for review. Testers inspect live demos and deliverables, execute tests, and either report bugs or approve work for Team Leader review.
              </span>
            </div>
            <span className="font-semibold text-purple-300 shrink-0 ml-3">
              {tasksAwaitingTesting.length} Awaiting Inspection
            </span>
          </div>

          {tasksAwaitingTesting.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-12 text-center flex flex-col items-center justify-center min-h-[260px]">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
                <CheckCheck className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-white">No tasks currently awaiting testing</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                When developers complete tasks and submit them for review, they will appear here for QA testing and verification.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tasksAwaitingTesting.map((task) => {
                const project = projectMap.get(task.projectId);
                const taskBugs = bugs.filter((b) => b.taskId === task.id);
                const openBugs = taskBugs.filter((b) => b.status !== 'Verified');
                const subtasks = task.subtasks || [];
                const completedSubtasks = subtasks.filter((s) => s.completed).length;

                return (
                  <div
                    key={task.id}
                    className="p-5 rounded-2xl bg-[#0f173b]/90 border border-slate-700/80 hover:border-purple-500/40 shadow-xl transition-all space-y-4"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono text-purple-300 font-bold px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30">
                            {task.id}
                          </span>
                          <span className="text-xs text-slate-400 truncate max-w-[200px]">
                            {project?.name || 'Project'}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white leading-tight">
                          {task.title}
                        </h4>
                      </div>

                      {/* Status / Open Bugs Indicator */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Awaiting QA
                        </span>
                        {openBugs.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            {openBugs.length} Open Bug{openBugs.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Developer Assignment & Deadline */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 py-2 border-y border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-purple-400" />
                        <span>Developer: <strong>{task.assignedTo || 'Unassigned'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Due: {task.deadline || 'No deadline'}</span>
                      </div>
                    </div>

                    {/* Subtasks Progress */}
                    {subtasks.length > 0 && (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-slate-300 text-[11px]">
                          <span>Subtasks Checklist</span>
                          <span className="font-semibold text-purple-300">
                            {completedSubtasks} of {subtasks.length} completed
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all"
                            style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Submission Evidence / Notes */}
                    {task.demoSubmission ? (
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                            Live Demo URL:
                          </span>
                          <a
                            href={task.demoSubmission.demoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 underline font-mono text-[11px] truncate max-w-[200px]"
                          >
                            {task.demoSubmission.demoUrl}
                          </a>
                        </div>
                        <p className="text-slate-400 text-[11px] italic">
                          "{task.demoSubmission.description}"
                        </p>
                      </div>
                    ) : task.reviewFeedback ? (
                      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                        <span className="text-slate-300 font-semibold">Latest Note: </span>
                        {task.reviewFeedback}
                      </div>
                    ) : null}

                    {/* Tester Action Buttons */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenReportModal(task)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition-all cursor-pointer"
                      >
                        <Bug className="w-3.5 h-3.5" />
                        <span>Report Bug</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {/* Fail Review Button */}
                        <button
                          type="button"
                          onClick={() => setTaskToFailReview(task)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Fail / Return</span>
                        </button>

                        {/* Pass QA Testing Button */}
                        <button
                          type="button"
                          onClick={() => handlePassTesting(task)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Pass QA</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: BUG TRACKING REGISTRY ── */}
      {activeTab === 'bugs' && (
        <div className="space-y-4">
          {filteredBugs.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-12 text-center flex flex-col items-center justify-center min-h-[260px]">
              <div className="w-14 h-14 rounded-2xl bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
                <Bug className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-white">No bugs matching current filters</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                Click "Report Bug" to register defects linked to any task and route them to developers.
              </p>
              <button
                type="button"
                onClick={() => handleOpenReportModal()}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 transition-colors"
              >
                Report a Bug
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBugs.map((bug) => {
                const task = taskMap.get(bug.taskId);
                const project = projectMap.get(bug.projectId);

                return (
                  <div
                    key={bug.id}
                    className="p-4 rounded-2xl bg-[#0f173b]/90 border border-slate-700/80 hover:border-amber-500/40 shadow-xl transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      {/* Top Bar: Severity & Status Badges */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        {getSeverityBadge(bug.severity)}
                        {getBugStatusBadge(bug.status)}
                      </div>

                      {/* Bug Title & ID */}
                      <div className="mb-1.5">
                        <span className="text-[10px] font-mono text-amber-300 font-bold block mb-0.5">
                          {bug.id}
                        </span>
                        <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
                          {bug.title}
                        </h4>
                      </div>

                      {/* Linked Task & Project */}
                      <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-300 mb-2">
                        <div className="text-slate-400 truncate">
                          Task: <span className="text-white font-medium">{task?.title || bug.taskId}</span>
                        </div>
                        {project && (
                          <div className="text-purple-300/80 text-[10px] truncate mt-0.5">
                            Project: {project.name}
                          </div>
                        )}
                      </div>

                      {/* Description excerpt */}
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {bug.description}
                      </p>
                    </div>

                    {/* Footer Info: Developer Assignee & Action Buttons */}
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 truncate">
                          <User className="w-3 h-3 text-purple-400 shrink-0" />
                          <span className="truncate">Dev: <strong className="text-slate-200">{bug.assignedTo || 'Unassigned'}</strong></span>
                        </span>
                        <span className="shrink-0 text-[10px]">{bug.reportedAt.split(',')[0]}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedBugForDetail(bug)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-purple-400" />
                          <span>Inspect</span>
                        </button>

                        {/* Developer quick action */}
                        {bug.status === 'Open' || bug.status === 'Assigned' ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateBugStatus(bug, 'In Progress')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                          >
                            Start Fix
                          </button>
                        ) : bug.status === 'In Progress' ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateBugStatus(bug, 'Fixed')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-colors cursor-pointer"
                          >
                            Mark Fixed
                          </button>
                        ) : bug.status === 'Fixed' ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateBugStatus(bug, 'Retesting')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
                          >
                            Send to Retest
                          </button>
                        ) : bug.status === 'Retesting' ? (
                          <button
                            type="button"
                            onClick={() => setSelectedBugForDetail(bug)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 text-slate-900 font-bold transition-colors cursor-pointer"
                          >
                            Retest Now
                          </button>
                        ) : bug.status === 'Reopened' ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateBugStatus(bug, 'In Progress')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                          >
                            Refix
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: RETESTING QUEUE ── */}
      {activeTab === 'retesting' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Verification Stage:</strong> Developers have marked these bugs as Fixed. Testers retest fixes against reproduction steps and either Verify (close) or Reopen the bug.
              </span>
            </div>
            <span className="font-semibold text-amber-300 shrink-0 ml-3">
              {retestingBugs.length} Pending Retest
            </span>
          </div>

          {retestingBugs.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-12 text-center flex flex-col items-center justify-center min-h-[260px]">
              <div className="w-14 h-14 rounded-2xl bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
                <CheckCheck className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-white">Retesting queue is clear</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                No bugs are currently awaiting verification. When developers finish bug fixes and submit for retest, they will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {retestingBugs.map((bug) => {
                const task = taskMap.get(bug.taskId);
                const project = projectMap.get(bug.projectId);

                return (
                  <div
                    key={bug.id}
                    className="p-4 sm:p-5 rounded-2xl bg-[#0f173b]/90 border border-amber-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                          {bug.id}
                        </span>
                        {getSeverityBadge(bug.severity)}
                        <span className="text-xs text-slate-400">
                          {project?.name || 'Project'} • Task: <strong>{task?.title || bug.taskId}</strong>
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-white">
                        {bug.title}
                      </h4>

                      <p className="text-xs text-slate-300 line-clamp-2">
                        {bug.description}
                      </p>

                      {bug.resolutionNotes && (
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-emerald-300">
                          <span className="font-semibold text-white">Developer Fix Notes: </span>
                          {bug.resolutionNotes}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span>Assigned Developer: <strong className="text-white">{bug.assignedTo || 'Unassigned'}</strong></span>
                        <span>Reported by: <strong className="text-white">{bug.reportedBy}</strong></span>
                      </div>
                    </div>

                    {/* Retesting Action Buttons */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedBugForDetail(bug)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:text-white transition-colors cursor-pointer"
                      >
                        Inspect Details
                      </button>

                      {/* Reopen Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const reason = prompt('Please provide a reason for reopening this bug:');
                          if (reason !== null) {
                            handleUpdateBugStatus(
                              bug,
                              'Reopened',
                              `[Reopened during QA Retest by ${currentUserName}]: ${reason.trim() || 'Fix verification failed.'}`
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Fail Retest (Reopen)</span>
                      </button>

                      {/* Verify Button */}
                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateBugStatus(
                            bug,
                            'Verified',
                            `[QA Verified by ${currentUserName}]: Fix confirmed and passed all retest criteria.`
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/25 transition-colors cursor-pointer"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Verify & Pass</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL 1: REPORT BUG MODAL ── */}
      {isReportBugModalOpen && (
        <ReportBugModal
          tasks={tasks}
          projects={projects}
          teamMembers={teamMembers}
          targetTask={targetTaskForBug}
          currentUserName={currentUserName}
          onClose={() => {
            setIsReportBugModalOpen(false);
            setTargetTaskForBug(null);
          }}
          onSubmitBug={(newBug) => {
            onAddBug(newBug);
            setIsReportBugModalOpen(false);
            setTargetTaskForBug(null);
          }}
        />
      )}

      {/* ── MODAL 2: BUG DETAIL & WORKFLOW MODAL ── */}
      {selectedBugForDetail && (
        <BugDetailModal
          bug={selectedBugForDetail}
          task={taskMap.get(selectedBugForDetail.taskId)}
          project={projectMap.get(selectedBugForDetail.projectId)}
          teamMembers={teamMembers}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onClose={() => setSelectedBugForDetail(null)}
          onUpdateBug={handleUpdateBugStatus}
          onReassignBug={(bug, newDev) => {
            const updated: BugType = {
              ...bug,
              assignedTo: newDev,
              status: bug.status === 'Open' ? 'Assigned' : bug.status,
              updatedAt: new Date().toLocaleString(),
            };
            onUpdateBug(updated);
            setSelectedBugForDetail(updated);
          }}
        />
      )}

      {/* ── MODAL 3: FAIL REVIEW / RETURN CONFIRMATION ── */}
      {taskToFailReview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f173b] border border-amber-500/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Fail QA Testing</h3>
                  <p className="text-xs text-slate-400">Return task to developer for revision</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTaskToFailReview(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Returning <strong>"{taskToFailReview.title}"</strong> will set its status to <strong>In Progress (Revision Required)</strong> and notify the assigned developer ({taskToFailReview.assignedTo || 'Developer'}).
            </p>

            <div>
              <label htmlFor="failReason" className="block text-xs font-semibold text-slate-200 mb-1">
                Reason / Failure Notes *
              </label>
              <textarea
                id="failReason"
                rows={3}
                value={failReasonText}
                onChange={(e) => setFailReasonText(e.target.value)}
                placeholder="Explain what failed test verification or which bugs need addressing..."
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/80"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskToFailReview(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFailTestingConfirm}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 shadow-md transition-colors"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT BUG MODAL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ReportBugModalProps {
  tasks: Task[];
  projects: Project[];
  teamMembers: TeamMember[];
  targetTask: Task | null;
  currentUserName: string;
  onClose: () => void;
  onSubmitBug: (bug: BugType) => void;
}

function ReportBugModal({
  tasks,
  projects,
  teamMembers,
  targetTask,
  currentUserName,
  onClose,
  onSubmitBug,
}: ReportBugModalProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    targetTask ? targetTask.id : tasks.length > 0 ? tasks[0].id : ''
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugType['severity']>('Medium');
  const [reproductionSteps, setReproductionSteps] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [evidenceAttachments, setEvidenceAttachments] = useState<TaskAttachment[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // When selected task changes, auto-fill assigned developer
  const activeTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId);
  }, [tasks, selectedTaskId]);

  React.useEffect(() => {
    if (activeTask?.assignedTo) {
      setAssignedTo(activeTask.assignedTo);
    } else {
      setAssignedTo('');
    }
  }, [activeTask]);

  // Handle evidence file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: TaskAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 15 * 1024 * 1024) {
        setErrorMsg(`File "${f.name}" exceeds 15MB size limit.`);
        return;
      }
      newItems.push({
        id: `bug-att-${Date.now()}-${i}`,
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
        fileUrl: URL.createObjectURL(f),
        uploadedBy: currentUserName,
        uploadedAt: new Date().toLocaleString(),
      });
    }
    setEvidenceAttachments((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveAttachment = (attId: string) => {
    setEvidenceAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedTaskId) {
      setErrorMsg('Please select a task to link this bug to.');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Please enter a bug title.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please enter a bug description.');
      return;
    }
    if (!reproductionSteps.trim()) {
      setErrorMsg('Please specify reproduction steps so the developer can reproduce the issue.');
      return;
    }

    const linkedTask = tasks.find((t) => t.id === selectedTaskId);
    const projectId = linkedTask ? linkedTask.projectId : projects[0]?.id || 'p-default';
    const timestamp = new Date().toLocaleString();

    const newBug: BugType = {
      id: `BUG-${Date.now().toString().slice(-4)}`,
      taskId: selectedTaskId,
      projectId,
      title: title.trim(),
      description: description.trim(),
      severity,
      reproductionSteps: reproductionSteps.trim(),
      evidence: evidenceAttachments,
      assignedTo: assignedTo.trim() || linkedTask?.assignedTo || undefined,
      reportedBy: currentUserName,
      reportedAt: timestamp,
      status: assignedTo.trim() || linkedTask?.assignedTo ? 'Assigned' : 'Open',
    };

    onSubmitBug(newBug);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0f173b] border border-slate-700/80 rounded-2xl shadow-2xl my-6 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-800 bg-[#0b112c]/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Report New Defect</h3>
              <p className="text-xs text-slate-400">Capture bug details and route to responsible developer</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 flex items-start gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Linked Task & Severity Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="linkedTask" className="block font-semibold text-slate-200 mb-1">
                Linked Task *
              </label>
              <select
                id="linkedTask"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.id}] {t.title} {t.assignedTo ? `(${t.assignedTo})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="bugSeverity" className="block font-semibold text-slate-200 mb-1">
                Severity *
              </label>
              <select
                id="bugSeverity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as BugType['severity'])}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/80"
              >
                <option value="Critical">Critical (System Blocker / Crash)</option>
                <option value="High">High (Core Feature Broken)</option>
                <option value="Medium">Medium (Functional Bug with Workaround)</option>
                <option value="Low">Low (Cosmetic / Minor Glitch)</option>
              </select>
            </div>
          </div>

          {/* Bug Title */}
          <div>
            <label htmlFor="bugTitle" className="block font-semibold text-slate-200 mb-1">
              Bug Title *
            </label>
            <input
              id="bugTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Navigation dropdown crashes on mobile Safari when toggling views"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
            />
          </div>

          {/* Developer Routing / Assignment */}
          <div>
            <label htmlFor="assignedDeveloper" className="block font-semibold text-slate-200 mb-1">
              Assign to Developer
            </label>
            <div className="flex items-center gap-2">
              <input
                id="assignedDeveloper"
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Developer name (prefilled from task)"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
              />
              {teamMembers.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) setAssignedTo(e.target.value);
                  }}
                  className="px-2 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs"
                >
                  <option value="">Quick select member...</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Automatically routed to the task's assigned developer with notification upon report.
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="bugDescription" className="block font-semibold text-slate-200 mb-1">
              Description *
            </label>
            <textarea
              id="bugDescription"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what occurs and why it violates acceptance criteria..."
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
            />
          </div>

          {/* Steps to Reproduce */}
          <div>
            <label htmlFor="bugSteps" className="block font-semibold text-slate-200 mb-1">
              Steps to Reproduce *
            </label>
            <textarea
              id="bugSteps"
              rows={3}
              value={reproductionSteps}
              onChange={(e) => setReproductionSteps(e.target.value)}
              placeholder="1. Open Tasks Page&#10;2. Switch to Board View&#10;3. Drag task to In Review&#10;Expected: Status updates&#10;Actual: Console error thrown"
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80 font-mono text-[11px]"
            />
          </div>

          {/* Evidence Attachments */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-slate-200">Evidence / Attachments (Optional)</span>
              <label className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300 font-semibold cursor-pointer">
                <Paperclip className="w-3.5 h-3.5" />
                <span>Upload Screenshot / File</span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {evidenceAttachments.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {evidenceAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <AttachmentIcon type={att.type} name={att.name} />
                      <span className="truncate text-slate-300">{att.name}</span>
                      <span className="text-[10px] text-slate-500">
                        ({(att.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-slate-400 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 shadow-md shadow-amber-600/20"
            >
              File Defect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG DETAIL & WORKFLOW MODAL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface BugDetailModalProps {
  bug: BugType;
  task?: Task;
  project?: Project;
  teamMembers: TeamMember[];
  currentUserRole: UserRole;
  currentUserName: string;
  onClose: () => void;
  onUpdateBug: (bug: BugType, nextStatus: BugType['status'], resolutionNotes?: string) => void;
  onReassignBug: (bug: BugType, newDev: string) => void;
}

function BugDetailModal({
  bug,
  task,
  project,
  teamMembers,
  currentUserRole: _currentUserRole,
  currentUserName,
  onClose,
  onUpdateBug,
  onReassignBug,
}: BugDetailModalProps) {
  const [resolutionNoteInput, setResolutionNoteInput] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignDevName, setReassignDevName] = useState(bug.assignedTo || '');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0f173b] border border-slate-700/80 rounded-2xl shadow-2xl my-6 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-800 bg-[#0b112c]/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                  {bug.id}
                </span>
                {getSeverityBadge(bug.severity)}
                {getBugStatusBadge(bug.status)}
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">
                {bug.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>Project: <strong className="text-white">{project?.name || 'Project'}</strong></span>
            <span>•</span>
            <span>Linked Task: <strong className="text-white">{task?.title || bug.taskId}</strong></span>
            <span>•</span>
            <span>Reported by: <strong className="text-white">{bug.reportedBy}</strong></span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Developer Routing Banner */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-purple-400" />
              <span>
                Assigned Developer: <strong className="text-white">{bug.assignedTo || 'Unassigned'}</strong>
              </span>
            </div>

            {/* Reassign Button */}
            {!isReassigning ? (
              <button
                type="button"
                onClick={() => setIsReassigning(true)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30 transition-colors cursor-pointer"
              >
                Reassign
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <select
                  value={reassignDevName}
                  onChange={(e) => setReassignDevName(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                >
                  <option value="">Select member...</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (reassignDevName.trim()) {
                      onReassignBug(bug, reassignDevName.trim());
                    }
                    setIsReassigning(false);
                  }}
                  className="px-2 py-1 rounded-lg text-[11px] bg-purple-600 text-white font-semibold"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsReassigning(false)}
                  className="px-2 py-1 rounded-lg text-[11px] bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Bug Description */}
          <div>
            <h4 className="font-semibold text-slate-300 mb-1">Issue Description</h4>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-200 leading-relaxed whitespace-pre-wrap">
              {bug.description}
            </div>
          </div>

          {/* Reproduction Steps */}
          <div>
            <h4 className="font-semibold text-slate-300 mb-1">Steps to Reproduce</h4>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 font-mono text-[11px] text-purple-200/90 leading-relaxed whitespace-pre-wrap">
              {bug.reproductionSteps}
            </div>
          </div>

          {/* Evidence Attachments */}
          {bug.evidence && bug.evidence.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-300 mb-1">Evidence & Screenshots ({bug.evidence.length})</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {bug.evidence.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <AttachmentIcon type={att.type} name={att.name} />
                      <span className="truncate text-slate-300 font-medium">{att.name}</span>
                    </div>
                    {att.fileUrl && (
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 p-1"
                        title="Open file"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolution / Fix Notes History */}
          {bug.resolutionNotes && (
            <div>
              <h4 className="font-semibold text-emerald-400 mb-1">Resolution & QA Notes</h4>
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 leading-relaxed whitespace-pre-wrap">
                {bug.resolutionNotes}
              </div>
            </div>
          )}

          {/* Developer / Tester Action Box */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <h4 className="font-semibold text-slate-200">Lifecycle State Transition</h4>

            <div>
              <label htmlFor="resNotes" className="block text-[11px] text-slate-400 mb-1">
                Add Resolution or Retest Notes (optional)
              </label>
              <textarea
                id="resNotes"
                rows={2}
                value={resolutionNoteInput}
                onChange={(e) => setResolutionNoteInput(e.target.value)}
                placeholder="Detail fix commits, configuration changes, or verification findings..."
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Transition Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* If Open or Assigned -> Start Fix */}
              {(bug.status === 'Open' || bug.status === 'Assigned') && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateBug(
                      bug,
                      'In Progress',
                      resolutionNoteInput.trim() || undefined
                    )
                  }
                  className="px-3.5 py-2 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  Move to In Progress
                </button>
              )}

              {/* If In Progress or Reopened -> Mark Fixed */}
              {(bug.status === 'In Progress' || bug.status === 'Reopened') && (
                <button
                  type="button"
                  onClick={() => {
                    const notes =
                      resolutionNoteInput.trim() ||
                      `[Fixed by ${currentUserName}]: Fix committed and ready for QA retest.`;
                    onUpdateBug(bug, 'Fixed', notes);
                  }}
                  className="px-3.5 py-2 rounded-xl font-semibold text-white bg-teal-600 hover:bg-teal-500 transition-colors cursor-pointer"
                >
                  Mark as Fixed
                </button>
              )}

              {/* If Fixed -> Submit to Retesting */}
              {bug.status === 'Fixed' && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateBug(
                      bug,
                      'Retesting',
                      resolutionNoteInput.trim() ||
                        `[Retesting Requested by ${currentUserName}]: Ready for QA test verification.`
                    )
                  }
                  className="px-3.5 py-2 rounded-xl font-semibold text-white bg-amber-600 hover:bg-amber-500 transition-colors cursor-pointer"
                >
                  Submit for Retesting
                </button>
              )}

              {/* If Retesting or Fixed -> Tester can Verify or Reopen */}
              {(bug.status === 'Retesting' || bug.status === 'Fixed') && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const notes =
                        resolutionNoteInput.trim() ||
                        `[QA Verified by ${currentUserName}]: Fix confirmed and verified.`;
                      onUpdateBug(bug, 'Verified', notes);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition-colors cursor-pointer"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Verify (Pass)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const notes =
                        resolutionNoteInput.trim() ||
                        `[Reopened by ${currentUserName}]: Retest failed. Defect still reproduces.`;
                      onUpdateBug(bug, 'Reopened', notes);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reopen (Failed)</span>
                  </button>
                </>
              )}

              {/* If Verified -> Can reopen if defect regressed */}
              {bug.status === 'Verified' && (
                <button
                  type="button"
                  onClick={() => {
                    const notes =
                      resolutionNoteInput.trim() ||
                      `[Regression Reopen by ${currentUserName}]: Defect reoccurred.`;
                    onUpdateBug(bug, 'Reopened', notes);
                  }}
                  className="px-3 py-2 rounded-xl text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 transition-colors"
                >
                  Reopen Defect
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0b112c]/40 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
