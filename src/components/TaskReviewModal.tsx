import React, { useState, useMemo } from 'react';
import {
  X,
  ShieldCheck,
  Send,
  RotateCcw,
  ThumbsUp,
  CheckCircle2,
  Clock,
  Layers,
  AlertCircle,
  MessageSquare,
  User,
  History,
  Lock,
  Paperclip,
  ExternalLink,
  Upload,
  FileText,
  Image as ImageIcon,
  Film,
  FileArchive,
  Download,
  Trash2,
  Eye,
  AlertTriangle,
  FileCheck,
  CheckSquare,
  Plus,
  Edit2,
  Check,
  Bug as BugIcon,
  AlertOctagon,
  CheckCheck,
} from 'lucide-react';
import type {
  Task,
  Project,
  TaskReviewEntry,
  TaskComment,
  TaskAttachment,
  DemoSubmission,
  Subtask,
  Bug,
  UserRole,
} from '../types/pms';

export type { UserRole };

interface TaskReviewModalProps {
  task: Task;
  project?: Project;
  currentUserRole: UserRole;
  currentUserName: string;
  bugs?: Bug[];
  onClose: () => void;
  onUpdateTask: (updatedTask: Task) => void;
  onAddBug?: (bug: Bug) => void;
  onUpdateBug?: (bug: Bug) => void;
}

// Helpers
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidHttpUrl(string: string): boolean {
  try {
    const url = new URL(string.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getFileIcon(type: string, name: string) {
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    return <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
  if (type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(name)) {
    return <Film className="w-4 h-4 text-purple-400 shrink-0" />;
  }
  if (type.includes('zip') || /\.(zip|rar|tar|gz|7z)$/i.test(name)) {
    return <FileArchive className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
}

export default function TaskReviewModal({
  task,
  project,
  currentUserRole,
  currentUserName,
  bugs = [],
  onClose,
  onUpdateTask,
  onAddBug,
  onUpdateBug,
}: TaskReviewModalProps) {
  const [activeTab, setActiveTab] = useState<'workflow' | 'subtasks' | 'bugs' | 'comments' | 'attachments' | 'history'>('workflow');
  const [commentText, setCommentText] = useState('');
  const [newCommentInput, setNewCommentInput] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Subtasks State
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [subtaskNotice, setSubtaskNotice] = useState<string | null>(null);

  // General Attachment Upload State
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Demo Submission Form State (for Team Member)
  const [demoUrl, setDemoUrl] = useState('');
  const [demoDescription, setDemoDescription] = useState('');
  const [demoScreenshots, setDemoScreenshots] = useState<TaskAttachment[]>([]);
  const [demoVideo, setDemoVideo] = useState<TaskAttachment | undefined>(undefined);
  const [demoDocs, setDemoDocs] = useState<TaskAttachment[]>([]);
  const [demoFormError, setDemoFormError] = useState<string | null>(null);
  const [showDemoForm, setShowDemoForm] = useState(false);

  // Image Preview Lightbox State
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Helpers to check role permissions
  const isTeamMember = currentUserRole === 'Team Member';
  const isTeamLeader = currentUserRole === 'Team Leader';
  const isProjectManager = currentUserRole === 'Project Manager';
  const isTester = currentUserRole === 'Tester';

  const canSubmitForReview = isTeamMember && task.status !== 'Completed' && task.status !== 'Under Review';
  const canTeamLeaderReview = isTeamLeader && task.status === 'Under Review';
  const canProjectManagerReview = isProjectManager && task.status !== 'Completed';
  const canTesterReview = isTester && task.status === 'Under Review';

  // Task bug metrics
  const taskBugs = useMemo(() => bugs.filter((b: Bug) => b.taskId === task.id), [bugs, task.id]);
  const openTaskBugs = useMemo(() => taskBugs.filter((b: Bug) => b.status !== 'Verified'), [taskBugs]);

  // Inline Bug Report form state
  const [showInlineBugForm, setShowInlineBugForm] = useState(false);
  const [inlineBugTitle, setInlineBugTitle] = useState('');
  const [inlineBugSeverity, setInlineBugSeverity] = useState<Bug['severity']>('Medium');
  const [inlineBugDesc, setInlineBugDesc] = useState('');
  const [inlineBugSteps, setInlineBugSteps] = useState('');

  // Subtask management authorization
  const isAssigned = Boolean(
    task.assignedTo &&
    task.assignedTo.trim().toLowerCase() === currentUserName.trim().toLowerCase()
  );

  const canManageSubtasks =
    task.status !== 'Completed' &&
    (isProjectManager ||
      isTeamLeader ||
      (isTeamMember && isAssigned));

  // Subtask metrics
  const subtasks = task.subtasks || [];
  const totalSubtasks = subtasks.length;
  const completedSubtasksCount = subtasks.filter((s) => s.completed).length;
  const subtaskProgressPercent =
    totalSubtasks > 0 ? Math.round((completedSubtasksCount / totalSubtasks) * 100) : 0;

  // ── Subtask Handlers ──
  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSubtasks) return;
    const title = newSubtaskTitle.trim();
    if (!title) return;

    const newSubtask: Subtask = {
      id: `subtask-${Date.now()}`,
      title,
      completed: false,
    };

    const updatedTask: Task = {
      ...task,
      subtasks: [...subtasks, newSubtask],
    };

    onUpdateTask(updatedTask);
    setNewSubtaskTitle('');
    setSubtaskNotice(`Subtask "${title}" added.`);
    setTimeout(() => setSubtaskNotice(null), 3000);
  };

  const handleToggleSubtask = (subtaskId: string) => {
    if (!canManageSubtasks) return;
    const updatedSubtasks = subtasks.map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );

    // CRITICAL: Completing every subtask must NEVER automatically change
    // the parent task status to 'Completed'. Parent status remains strictly unchanged.
    const updatedTask: Task = {
      ...task,
      subtasks: updatedSubtasks,
    };

    onUpdateTask(updatedTask);
  };

  const handleStartEditSubtask = (subtask: Subtask) => {
    if (!canManageSubtasks) return;
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskTitle(subtask.title);
  };

  const handleSaveSubtaskEdit = (subtaskId: string) => {
    if (!canManageSubtasks) return;
    const title = editingSubtaskTitle.trim();
    if (!title) return;

    const updatedSubtasks = subtasks.map((s) =>
      s.id === subtaskId ? { ...s, title } : s
    );

    const updatedTask: Task = {
      ...task,
      subtasks: updatedSubtasks,
    };

    onUpdateTask(updatedTask);
    setEditingSubtaskId(null);
    setEditingSubtaskTitle('');
  };

  const handleCancelSubtaskEdit = () => {
    setEditingSubtaskId(null);
    setEditingSubtaskTitle('');
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    if (!canManageSubtasks) return;
    const updatedSubtasks = subtasks.filter((s) => s.id !== subtaskId);

    const updatedTask: Task = {
      ...task,
      subtasks: updatedSubtasks,
    };

    onUpdateTask(updatedTask);
  };

  // ── Comment Handler ──
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    const content = newCommentInput.trim();
    if (!content) return;

    const initials = currentUserName
      .split(/[\s._-]+/)
      .slice(0, 2)
      .map((s) => s.charAt(0).toUpperCase())
      .join('') || 'U';

    const newComment: TaskComment = {
      id: `comment-${Date.now()}`,
      authorName: currentUserName,
      authorRole: currentUserRole,
      authorInitials: initials,
      content,
      timestamp: new Date().toLocaleString(),
    };

    const updatedTask: Task = {
      ...task,
      comments: [...(task.comments || []), newComment],
    };

    onUpdateTask(updatedTask);
    setNewCommentInput('');
  };

  // ── General Attachments Handler ──
  const handleGeneralFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: TaskAttachment[] = [];
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    const FORBIDDEN_EXTS = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.js'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (FORBIDDEN_EXTS.includes(ext)) {
        setAttachmentError(`Security Alert: Executable script files (${ext}) are not permitted.`);
        e.target.value = '';
        return;
      }

      if (file.size > MAX_SIZE) {
        setAttachmentError(`File "${file.name}" exceeds the maximum allowed size of 15MB.`);
        e.target.value = '';
        return;
      }

      const fileUrl = URL.createObjectURL(file);
      newAttachments.push({
        id: `att-${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        fileUrl,
        uploadedBy: currentUserName,
        uploadedAt: new Date().toLocaleString(),
      });
    }

    const updatedTask: Task = {
      ...task,
      attachments: [...(task.attachments || []), ...newAttachments],
    };

    onUpdateTask(updatedTask);
    e.target.value = '';
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    const updatedTask: Task = {
      ...task,
      attachments: (task.attachments || []).filter((a) => a.id !== attachmentId),
    };
    onUpdateTask(updatedTask);
  };

  // ── Demo Submission Upload Handlers ──
  const handleDemoScreenshotsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDemoFormError(null);
    const files = e.target.files;
    if (!files) return;

    const newScreenshots: TaskAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        setDemoFormError(`"${file.name}" is not a valid image format.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setDemoFormError(`Screenshot "${file.name}" exceeds 10MB.`);
        return;
      }
      newScreenshots.push({
        id: `demo-img-${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        type: file.type,
        fileUrl: URL.createObjectURL(file),
        uploadedBy: currentUserName,
        uploadedAt: new Date().toLocaleString(),
      });
    }
    setDemoScreenshots((prev) => [...prev, ...newScreenshots]);
    e.target.value = '';
  };

  const handleDemoVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDemoFormError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv)$/i.test(file.name)) {
      setDemoFormError(`"${file.name}" is not a supported video file.`);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setDemoFormError(`Demo video "${file.name}" exceeds 50MB limit.`);
      return;
    }

    setDemoVideo({
      id: `demo-vid-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type || 'video/mp4',
      fileUrl: URL.createObjectURL(file),
      uploadedBy: currentUserName,
      uploadedAt: new Date().toLocaleString(),
    });
    e.target.value = '';
  };

  const handleDemoDocsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDemoFormError(null);
    const files = e.target.files;
    if (!files) return;

    const newDocs: TaskAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 15 * 1024 * 1024) {
        setDemoFormError(`Document "${file.name}" exceeds 15MB limit.`);
        return;
      }
      newDocs.push({
        id: `demo-doc-${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        fileUrl: URL.createObjectURL(file),
        uploadedBy: currentUserName,
        uploadedAt: new Date().toLocaleString(),
      });
    }
    setDemoDocs((prev) => [...prev, ...newDocs]);
    e.target.value = '';
  };

  // Submit Formal Demo
  const handleSubmitFormalDemo = (e: React.FormEvent) => {
    e.preventDefault();
    setDemoFormError(null);

    // Validate live demo URL
    if (!demoUrl.trim()) {
      setDemoFormError('A Live Demo URL is required for formal completion submission.');
      return;
    }
    if (!isValidHttpUrl(demoUrl)) {
      setDemoFormError('Please enter a valid URL starting with http:// or https:// (e.g., https://demo.example.com)');
      return;
    }

    if (!demoDescription.trim()) {
      setDemoFormError('Please provide a short description of the completed work.');
      return;
    }

    const timestamp = new Date().toLocaleString();
    const submission: DemoSubmission = {
      id: `demo-sub-${Date.now()}`,
      demoUrl: demoUrl.trim(),
      description: demoDescription.trim(),
      submittedBy: currentUserName,
      submittedRole: currentUserRole,
      submittedAt: timestamp,
      screenshots: demoScreenshots,
      video: demoVideo,
      documents: demoDocs,
    };

    const newReviewEntry: TaskReviewEntry = {
      id: `rev-${Date.now()}`,
      authorRole: currentUserRole,
      authorName: currentUserName,
      action: 'submit',
      comment: `Formal Demo Submitted: ${demoDescription.trim()} (Demo URL: ${demoUrl.trim()})`,
      timestamp,
    };

    const updatedTask: Task = {
      ...task,
      status: 'Under Review',
      tlRecommendation: undefined,
      reviewFeedback: `[Formal Demo Submitted by ${currentUserName}]: ${demoDescription.trim()}`,
      demoSubmission: submission,
      reviewHistory: [newReviewEntry, ...(task.reviewHistory || [])],
    };

    onUpdateTask(updatedTask);
    setShowDemoForm(false);
  };

  // Standard Review Workflow Actions
  const handleWorkflowAction = (
    actionType: 'submit' | 'request_corrections' | 'recommend_approval' | 'final_approve'
  ) => {
    const timestamp = new Date().toLocaleString();
    const newEntry: TaskReviewEntry = {
      id: `rev-${Date.now()}`,
      authorRole: currentUserRole,
      authorName: currentUserName,
      action: actionType,
      comment: commentText.trim() || undefined,
      timestamp,
    };

    let updatedStatus: Task['status'] = task.status;
    let updatedRecommendation: Task['tlRecommendation'] = task.tlRecommendation;
    let updatedFeedback: string | undefined = task.reviewFeedback;

    if (actionType === 'submit') {
      updatedStatus = 'Under Review';
      updatedFeedback = commentText.trim()
        ? `[Submitted by ${currentUserName}]: ${commentText.trim()}`
        : `Task submitted for review by ${currentUserName}`;
      updatedRecommendation = undefined;
    } else if (actionType === 'request_corrections') {
      // Returned for revision -> back to In Progress
      updatedStatus = 'In Progress';
      updatedRecommendation = 'corrections_requested';
      updatedFeedback = commentText.trim()
        ? `[Corrections requested by ${currentUserRole} (${currentUserName})]: ${commentText.trim()}`
        : `Corrections requested by ${currentUserRole}. Revision required.`;
    } else if (actionType === 'recommend_approval') {
      // Recommended by TL, remains Under Review waiting for PM final approval
      updatedStatus = 'Under Review';
      updatedRecommendation = 'recommended';
      updatedFeedback = commentText.trim()
        ? `[TL Recommendation (${currentUserName})]: Recommended for PM approval. ${commentText.trim()}`
        : `Recommended for approval by Team Leader (${currentUserName}). Awaiting PM approval.`;
    } else if (actionType === 'final_approve') {
      if (!isProjectManager) {
        setActionNotice('Permission Denied: Only Project Managers can grant final approval and complete tasks.');
        return;
      }
      updatedStatus = 'Completed';
      updatedFeedback = commentText.trim()
        ? `[Final PM Approval by ${currentUserName}]: Approved & Completed. ${commentText.trim()}`
        : `Officially approved and completed by Project Manager (${currentUserName}).`;
    }

    const updatedTask: Task = {
      ...task,
      status: updatedStatus,
      tlRecommendation: updatedRecommendation,
      reviewFeedback: updatedFeedback,
      reviewHistory: [newEntry, ...(task.reviewHistory || [])],
    };

    onUpdateTask(updatedTask);
    onClose();
  };

  const commentsCount = task.comments?.length || 0;
  const attachmentsCount = task.attachments?.length || 0;
  const historyCount = task.reviewHistory?.length || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0f173b] border border-slate-700/80 rounded-2xl shadow-2xl my-6 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-800 bg-[#0b112c]/60">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-purple-300/90 px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 font-semibold">
                  {task.id}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {project ? project.name : 'Project Task'}
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">
                {task.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current User Role Context */}
          <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <User className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                Active User: <strong className="text-white">{currentUserName}</strong>
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
              {currentUserRole}
            </span>
          </div>

          {/* Tabs Navigation */}
          <div className="mt-3.5 flex items-center gap-1.5 border-b border-slate-800/80 pb-0.5 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('workflow')}
              className={`px-3 py-2 rounded-t-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === 'workflow'
                  ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Review & Demo</span>
              {task.demoSubmission && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" title="Demo Attached" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('subtasks')}
              className={`px-3 py-2 rounded-t-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === 'subtasks'
                  ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>Subtasks</span>
              {totalSubtasks > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-purple-300 border border-purple-500/30">
                  {completedSubtasksCount}/{totalSubtasks}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bugs')}
              className={`px-3 py-2 rounded-t-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === 'bugs'
                  ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <BugIcon className="w-4 h-4" />
              <span>Bugs</span>
              {taskBugs.length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    openTaskBugs.length > 0
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                      : 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {taskBugs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('comments')}
              className={`px-3 py-2 rounded-t-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === 'comments'
                  ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Comments</span>
              {commentsCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-purple-300 border border-purple-500/30">
                  {commentsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('attachments')}
              className={`px-3 py-2 rounded-t-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === 'attachments'
                  ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Paperclip className="w-4 h-4" />
              <span>Attachments</span>
              {attachmentsCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-purple-300 border border-purple-500/30">
                  {attachmentsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-2 rounded-t-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 ${
                activeTab === 'history'
                  ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <History className="w-4 h-4" />
              <span>History</span>
              {historyCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {historyCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {actionNotice && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{actionNotice}</span>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              TAB 1: WORKFLOW & DEMO SUBMISSION / REVIEW
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'workflow' && (
            <div className="space-y-4">
              {/* Status Header Banner */}
              <div className="p-3.5 rounded-xl bg-[#090d21] border border-slate-800/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Current Task Status:</span>
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    {task.status === 'Completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {task.status === 'Under Review' && <Clock className="w-4 h-4 text-amber-400" />}
                    {task.status === 'In Progress' && <Clock className="w-4 h-4 text-indigo-400" />}
                    {task.status === 'Not Started' && <Layers className="w-4 h-4 text-slate-400" />}
                    {task.status}
                  </span>
                </div>

                {task.tlRecommendation && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-slate-400">TL Recommendation:</span>
                    <span
                      className={`font-semibold ${
                        task.tlRecommendation === 'recommended' ? 'text-indigo-300' : 'text-amber-300'
                      }`}
                    >
                      {task.tlRecommendation === 'recommended'
                        ? 'Recommended for PM Approval'
                        : 'Corrections Requested'}
                    </span>
                  </div>
                )}

                {task.reviewFeedback && (
                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-slate-400 block mb-1">Latest Feedback / Note:</span>
                    <p className="text-slate-200 bg-slate-900/90 p-2.5 rounded-lg text-[11px] leading-relaxed border border-slate-800">
                      {task.reviewFeedback}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Subtask Review Inspection Summary ── */}
              {totalSubtasks > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-purple-400" />
                      Subtask Progress ({completedSubtasksCount} of {totalSubtasks} completed)
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('subtasks')}
                      className="text-[11px] text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
                    >
                      Manage Subtasks →
                    </button>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        completedSubtasksCount === totalSubtasks
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                      }`}
                      style={{ width: `${subtaskProgressPercent}%` }}
                    />
                  </div>
                  {/* Checklist preview */}
                  <div className="space-y-1 max-h-32 overflow-y-auto pt-1">
                    {subtasks.map((st) => (
                      <div key={st.id} className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          disabled={!canManageSubtasks}
                          onClick={() => handleToggleSubtask(st.id)}
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                            st.completed
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                              : 'border-slate-700 bg-slate-800 text-transparent hover:border-purple-500'
                          } ${canManageSubtasks ? 'cursor-pointer' : 'cursor-default'}`}
                          title={canManageSubtasks ? (st.completed ? 'Mark incomplete' : 'Mark complete') : 'Read only'}
                        >
                          {st.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </button>
                        <span className={`truncate ${st.completed ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                          {st.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Demo Submission Evidence Display (if submitted) ── */}
              {task.demoSubmission && (
                <div className="p-4 rounded-xl bg-gradient-to-b from-[#131b44] to-[#0d1435] border border-indigo-500/30 shadow-lg space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-emerald-400" />
                      <h4 className="text-sm font-bold text-white">Submitted Demo Evidence</h4>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {task.demoSubmission.submittedAt} by {task.demoSubmission.submittedBy} ({task.demoSubmission.submittedRole})
                    </span>
                  </div>

                  {/* Live Demo URL with Safe External Link */}
                  <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-purple-300 uppercase tracking-wider font-semibold block">
                        Live Demo URL
                      </span>
                      <p className="text-xs text-white font-mono truncate select-all">
                        {task.demoSubmission.demoUrl}
                      </p>
                    </div>
                    <a
                      href={task.demoSubmission.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 shadow-md shadow-purple-600/30 transition-all cursor-pointer shrink-0"
                    >
                      <span>Open Live Demo</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Description */}
                  {task.demoSubmission.description && (
                    <div className="text-xs space-y-1">
                      <span className="text-slate-400 font-medium">Completion Summary:</span>
                      <p className="text-slate-200 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                        {task.demoSubmission.description}
                      </p>
                    </div>
                  )}

                  {/* Screenshots Evidence */}
                  {task.demoSubmission.screenshots && task.demoSubmission.screenshots.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                        Screenshots ({task.demoSubmission.screenshots.length}):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {task.demoSubmission.screenshots.map((img) => (
                          <div
                            key={img.id}
                            className="group relative rounded-lg overflow-hidden border border-slate-700/80 bg-slate-900 aspect-video flex items-center justify-center cursor-pointer hover:border-purple-500 transition-colors"
                            onClick={() => setPreviewImage({ url: img.fileUrl, title: img.name })}
                          >
                            <img
                              src={img.fileUrl}
                              alt={img.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs gap-1.5 font-medium">
                              <Eye className="w-4 h-4" />
                              <span>View</span>
                            </div>
                            <span className="absolute bottom-1 left-1 right-1 bg-black/70 text-[9px] text-slate-300 px-1 py-0.5 rounded truncate">
                              {img.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Demo Video Evidence */}
                  {task.demoSubmission.video && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-purple-400" />
                        Demo Video: {task.demoSubmission.video.name} ({formatFileSize(task.demoSubmission.video.size)})
                      </span>
                      <div className="rounded-xl overflow-hidden bg-black border border-slate-800">
                        <video
                          controls
                          src={task.demoSubmission.video.fileUrl}
                          className="w-full max-h-52 object-contain"
                        >
                          Your browser does not support HTML5 video preview.
                        </video>
                      </div>
                    </div>
                  )}

                  {/* Supporting Documents Evidence */}
                  {task.demoSubmission.documents && task.demoSubmission.documents.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        Supporting Documents ({task.demoSubmission.documents.length}):
                      </span>
                      <div className="space-y-1.5">
                        {task.demoSubmission.documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              {getFileIcon(doc.type, doc.name)}
                              <span className="text-slate-200 font-medium truncate">{doc.name}</span>
                              <span className="text-[10px] text-slate-400">({formatFileSize(doc.size)})</span>
                            </div>
                            <a
                              href={doc.fileUrl}
                              download={doc.name}
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors shrink-0"
                              title="Download document"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Team Member Formal Demo Submission Form ── */}
              {canSubmitForReview && showDemoForm && (
                <form
                  onSubmit={handleSubmitFormalDemo}
                  className="p-4 rounded-xl bg-[#0d1435] border border-purple-500/40 shadow-xl space-y-3.5"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                      <Send className="w-4 h-4 text-purple-400" />
                      Submit Formal Demo & Evidence
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowDemoForm(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>

                  {demoFormError && (
                    <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{demoFormError}</span>
                    </div>
                  )}

                  {/* Demo URL Input */}
                  <div>
                    <label htmlFor="formalDemoUrl" className="block text-xs font-semibold text-slate-200 mb-1">
                      Live Demo URL <span className="text-purple-400">*</span>
                    </label>
                    <input
                      id="formalDemoUrl"
                      type="url"
                      required
                      value={demoUrl}
                      onChange={(e) => setDemoUrl(e.target.value)}
                      placeholder="https://preview.example.com or http://localhost:3000"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                    />
                  </div>

                  {/* Completion Description */}
                  <div>
                    <label htmlFor="formalDemoDesc" className="block text-xs font-semibold text-slate-200 mb-1">
                      Completion Summary / Description <span className="text-purple-400">*</span>
                    </label>
                    <textarea
                      id="formalDemoDesc"
                      required
                      rows={2}
                      value={demoDescription}
                      onChange={(e) => setDemoDescription(e.target.value)}
                      placeholder="Briefly describe what was implemented, key test steps, and verified deliverables..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                  </div>

                  {/* Screenshots Upload */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-200">
                        Screenshots (Images)
                      </label>
                      <span className="text-[10px] text-slate-400">Max 10MB each</span>
                    </div>
                    <label className="border border-dashed border-slate-700 hover:border-purple-500/60 rounded-xl p-3 flex flex-col items-center justify-center bg-slate-900/50 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-300">Click to attach screenshots</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleDemoScreenshotsUpload}
                        className="hidden"
                      />
                    </label>
                    {demoScreenshots.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {demoScreenshots.map((s, idx) => (
                          <div key={s.id} className="relative rounded-lg overflow-hidden border border-slate-700 aspect-video group">
                            <img src={s.fileUrl} alt={s.name} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setDemoScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 p-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded-full transition-colors"
                              title="Remove screenshot"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Demo Video Upload */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-200">Demo Video</label>
                      <span className="text-[10px] text-slate-400">MP4, WebM (Max 50MB)</span>
                    </div>
                    {demoVideo ? (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-700 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <Film className="w-4 h-4 text-purple-400 shrink-0" />
                          <span className="text-white truncate">{demoVideo.name}</span>
                          <span className="text-[10px] text-slate-400">({formatFileSize(demoVideo.size)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDemoVideo(undefined)}
                          className="p-1 text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="border border-dashed border-slate-700 hover:border-purple-500/60 rounded-xl p-3 flex flex-col items-center justify-center bg-slate-900/50 cursor-pointer transition-colors">
                        <Film className="w-4 h-4 text-slate-400 mb-1" />
                        <span className="text-xs text-slate-300">Click to upload demo video</span>
                        <input
                          type="file"
                          accept="video/*,.mp4,.webm,.mov"
                          onChange={handleDemoVideoUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Supporting Documents Upload */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-200">
                        Supporting Documents / Files
                      </label>
                      <span className="text-[10px] text-slate-400">PDF, DOCX, ZIP (Max 15MB)</span>
                    </div>
                    <label className="border border-dashed border-slate-700 hover:border-purple-500/60 rounded-xl p-3 flex flex-col items-center justify-center bg-slate-900/50 cursor-pointer transition-colors">
                      <FileText className="w-4 h-4 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-300">Click to attach supporting files</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.zip,.txt"
                        onChange={handleDemoDocsUpload}
                        className="hidden"
                      />
                    </label>
                    {demoDocs.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {demoDocs.map((doc, idx) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-700 text-xs"
                          >
                            <span className="text-white truncate">{doc.name} ({formatFileSize(doc.size)})</span>
                            <button
                              type="button"
                              onClick={() => setDemoDocs((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-rose-400 hover:text-rose-300"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Submit Demo for Formal Review</span>
                  </button>
                </form>
              )}

              {/* Reviewer Note / Feedback Input Area */}
              {(canTeamLeaderReview || canProjectManagerReview || (canSubmitForReview && !showDemoForm)) && (
                <div className="space-y-2">
                  <label htmlFor="workflowNotes" className="block text-xs font-medium text-slate-300">
                    {isTeamMember
                      ? 'Submission Note / Comment (Optional)'
                      : 'Reviewer Feedback / Correction Details'}
                  </label>
                  <textarea
                    id="workflowNotes"
                    rows={2}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={
                      isTeamMember
                        ? 'Add quick notes before submitting...'
                        : isTeamLeader
                        ? 'Detail requirements or specify reasons for recommendation...'
                        : 'Detail final approval notes or required revisions...'
                    }
                    className="w-full p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* Completed status check */}
                {task.status === 'Completed' && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>This task has received final Project Manager approval and is officially completed.</span>
                  </div>
                )}

                {/* Team Member Actions */}
                {canSubmitForReview && !showDemoForm && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDemoForm(true)}
                      className="py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Submit Formal Demo URL & Files</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWorkflowAction('submit')}
                      className="py-2.5 px-3 rounded-xl font-semibold text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Quick Submit for Review</span>
                    </button>
                  </div>
                )}

                {/* Quality Warning if Open Bugs Exist */}
                {openTaskBugs.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
                    <AlertOctagon className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-300">
                        {openTaskBugs.length} Unresolved Bug{openTaskBugs.length > 1 ? 's' : ''} Linked
                      </p>
                      <p className="mt-0.5 text-[11px] text-rose-300/80">
                        All reported defects must be Fixed by the developer and Verified by QA before this task can be approved. Completing subtasks or fixing bugs will not complete the task.
                      </p>
                    </div>
                  </div>
                )}

                {/* Tester Review Actions */}
                {canTesterReview && (
                  <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <BugIcon className="w-4 h-4" />
                        Tester QA Evaluation
                      </span>
                      <span className="text-[11px] text-slate-400">Step 2: QA Testing</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleWorkflowAction('request_corrections')}
                        className="py-2.5 px-3 rounded-xl font-semibold text-xs text-amber-200 bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                        <span>Fail QA (Return to In Progress)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (openTaskBugs.length > 0) {
                            setActionNotice(
                              `Cannot pass QA: There are ${openTaskBugs.length} unresolved bug(s). Please verify all fixes in the Bugs tab first.`
                            );
                            return;
                          }
                          handleWorkflowAction('recommend_approval');
                        }}
                        className="py-2.5 px-3 rounded-xl font-semibold text-xs text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Pass QA (Forward to TL/PM)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Team Leader Review Actions */}
                {canTeamLeaderReview && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleWorkflowAction('request_corrections')}
                      className="py-2.5 px-3 rounded-xl font-semibold text-xs text-amber-200 bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Request Corrections (Return to In Progress)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWorkflowAction('recommend_approval')}
                      className="py-2.5 px-3 rounded-xl font-semibold text-xs text-indigo-100 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>Recommend Approval to PM</span>
                    </button>
                  </div>
                )}

                {/* Project Manager Final Decision Actions */}
                {canProjectManagerReview && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleWorkflowAction('request_corrections')}
                      className="py-2.5 px-3 rounded-xl font-semibold text-xs text-amber-200 bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Request Corrections</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (openTaskBugs.length > 0) {
                          const confirmComplete = confirm(
                            `Warning: This task has ${openTaskBugs.length} unresolved bug(s). As Project Manager, are you sure you want to grant final approval and mark Completed?`
                          );
                          if (!confirmComplete) return;
                        }
                        handleWorkflowAction('final_approve');
                      }}
                      className="py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Final PM Approval (Mark Completed)</span>
                    </button>
                  </div>
                )}

                {/* Role Status Hints */}
                {isTeamMember && task.status === 'Under Review' && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Your submission is actively under review by Tester, Team Leader, and Project Manager.</span>
                  </div>
                )}
                {isTester && task.status !== 'Under Review' && task.status !== 'Completed' && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Task is currently in development ({task.status}). Testing starts when submitted for review.</span>
                  </div>
                )}
                {isTeamLeader && task.status !== 'Under Review' && task.status !== 'Completed' && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Waiting for task submission before Team Leader review can proceed.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              TAB: SUBTASKS (CHECKLIST & PROGRESS)
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'subtasks' && (
            <div className="space-y-4">
              {/* Progress Summary Card */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-purple-400" />
                    Subtasks Progress
                  </span>
                  <span className="font-semibold text-purple-300">
                    {totalSubtasks === 0
                      ? 'No subtasks created'
                      : `${completedSubtasksCount} of ${totalSubtasks} completed (${subtaskProgressPercent}%)`}
                  </span>
                </div>
                {totalSubtasks > 0 && (
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        completedSubtasksCount === totalSubtasks
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                      }`}
                      style={{ width: `${subtaskProgressPercent}%` }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-slate-400 pt-1">
                  Subtasks break down complex work into concrete items.
                  Note: Completing all subtasks does not automatically complete the parent task; final approval remains with the Project Manager.
                </p>
              </div>

              {subtaskNotice && (
                <div className="p-2.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{subtaskNotice}</span>
                </div>
              )}

              {/* Add Subtask Form */}
              {canManageSubtasks ? (
                <form onSubmit={handleAddSubtask} className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Enter a new subtask (e.g. Design wireframes, Review code)..."
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/80"
                  />
                  <button
                    type="submit"
                    disabled={!newSubtaskTitle.trim()}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-purple-600/25 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Subtask</span>
                  </button>
                </form>
              ) : (
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    {task.status === 'Completed'
                      ? 'This task has been completed and approved. Subtasks are in read-only mode.'
                      : 'Subtasks can be modified by the assigned team member, Team Leader, or Project Manager.'}
                  </span>
                </div>
              )}

              {/* Subtasks List */}
              {totalSubtasks === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center flex flex-col items-center justify-center">
                  <CheckSquare className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs font-medium text-slate-300">No subtasks added yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 max-w-xs">
                    {canManageSubtasks
                      ? 'Add subtasks above to track actionable steps towards completing this task.'
                      : 'No subtasks have been created for this task yet.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {subtasks.map((st) => {
                    const isEditing = editingSubtaskId === st.id;

                    return (
                      <div
                        key={st.id}
                        className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
                          st.completed
                            ? 'bg-slate-900/40 border-slate-800/80'
                            : 'bg-slate-900/90 border-slate-700/60 shadow-sm'
                        }`}
                      >
                        {/* Checkbox toggle */}
                        <button
                          type="button"
                          disabled={!canManageSubtasks}
                          onClick={() => handleToggleSubtask(st.id)}
                          title={canManageSubtasks ? (st.completed ? 'Mark incomplete' : 'Mark complete') : 'Read only'}
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                            canManageSubtasks ? 'cursor-pointer' : 'cursor-default'
                          } ${
                            st.completed
                              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                              : 'border-2 border-slate-600 hover:border-purple-500 bg-slate-800/60'
                          }`}
                        >
                          {st.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>

                        {/* Title or Edit Input */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingSubtaskTitle}
                                onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveSubtaskEdit(st.id);
                                  if (e.key === 'Escape') handleCancelSubtaskEdit();
                                }}
                                autoFocus
                                className="w-full px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-purple-500 text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveSubtaskEdit(st.id)}
                                className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 cursor-pointer"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelSubtaskEdit}
                                className="p-1 rounded text-slate-400 hover:text-slate-300 hover:bg-slate-800 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`text-xs block break-words ${
                                st.completed
                                  ? 'text-slate-400 line-through'
                                  : 'text-white font-medium'
                              }`}
                            >
                              {st.title}
                            </span>
                          )}
                        </div>

                        {/* Action buttons (Edit / Delete) */}
                        {canManageSubtasks && !isEditing && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditSubtask(st)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Edit subtask"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubtask(st.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete subtask"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              TAB: TASK BUGS & DEFECTS
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'bugs' && (
            <div className="space-y-4">
              {/* Top Banner & Report Button */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <BugIcon className="w-4 h-4 text-rose-400" />
                    <span>Defects Linked to Task</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {openTaskBugs.length} unresolved / {taskBugs.length} total defect{taskBugs.length === 1 ? '' : 's'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowInlineBugForm(!showInlineBugForm)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showInlineBugForm ? 'Close Form' : 'Report Bug'}</span>
                </button>
              </div>

              {/* Inline Bug Report Form */}
              {showInlineBugForm && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!inlineBugTitle.trim() || !inlineBugDesc.trim() || !inlineBugSteps.trim()) {
                      alert('Please provide a title, description, and reproduction steps.');
                      return;
                    }
                    if (onAddBug) {
                      const timestamp = new Date().toLocaleString();
                      const newBug: Bug = {
                        id: `BUG-${Date.now().toString().slice(-4)}`,
                        taskId: task.id,
                        projectId: task.projectId,
                        title: inlineBugTitle.trim(),
                        description: inlineBugDesc.trim(),
                        severity: inlineBugSeverity,
                        reproductionSteps: inlineBugSteps.trim(),
                        assignedTo: task.assignedTo,
                        reportedBy: currentUserName,
                        reportedAt: timestamp,
                        status: task.assignedTo ? 'Assigned' : 'Open',
                      };
                      onAddBug(newBug);
                      setInlineBugTitle('');
                      setInlineBugDesc('');
                      setInlineBugSteps('');
                      setShowInlineBugForm(false);
                    }
                  }}
                  className="p-4 rounded-xl bg-slate-900/90 border border-rose-500/40 space-y-3"
                >
                  <h5 className="text-xs font-bold text-rose-300">File Defect on Task "{task.title}"</h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Bug Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={inlineBugTitle}
                        onChange={(e) => setInlineBugTitle(e.target.value)}
                        placeholder="e.g. Button misaligned on mobile screens"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Severity *
                      </label>
                      <select
                        value={inlineBugSeverity}
                        onChange={(e) => setInlineBugSeverity(e.target.value as Bug['severity'])}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Description *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={inlineBugDesc}
                      onChange={(e) => setInlineBugDesc(e.target.value)}
                      placeholder="Describe what occurs and why it violates acceptance criteria..."
                      className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Steps to Reproduce *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={inlineBugSteps}
                      onChange={(e) => setInlineBugSteps(e.target.value)}
                      placeholder="1. Open modal... 2. Click submit... Expected: ..., Actual: ..."
                      className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono text-[11px]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowInlineBugForm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500"
                    >
                      Submit Defect
                    </button>
                  </div>
                </form>
              )}

              {/* Bugs List */}
              {taskBugs.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl space-y-1.5">
                  <BugIcon className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-medium text-slate-400">No bugs logged for this task.</p>
                  <p className="text-[11px] text-slate-500">
                    If defects or discrepancies are discovered during QA testing, report them here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {taskBugs.map((b: Bug) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                            {b.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              b.severity === 'Critical'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : b.severity === 'High'
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                : b.severity === 'Medium'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {b.severity}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              b.status === 'Verified'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : b.status === 'Fixed'
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                : b.status === 'Retesting'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-700/40 text-slate-300 border border-slate-600/50'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-500">{b.reportedAt}</span>
                      </div>

                      <h5 className="font-bold text-white text-xs">{b.title}</h5>
                      <p className="text-slate-300 text-xs">{b.description}</p>

                      <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80 font-mono text-[11px] text-slate-300">
                        <span className="text-slate-500 block mb-0.5">Reproduction:</span>
                        {b.reproductionSteps}
                      </div>

                      {b.resolutionNotes && (
                        <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-[11px]">
                          <strong>Fix/Retest Note:</strong> {b.resolutionNotes}
                        </div>
                      )}

                      {/* Quick Action Transitions */}
                      {onUpdateBug && (
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                          <span className="text-[11px] text-slate-400">
                            Assigned: <strong className="text-white">{b.assignedTo || 'Unassigned'}</strong>
                          </span>

                          <div className="flex items-center gap-1.5">
                            {(b.status === 'Open' || b.status === 'Assigned') && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateBug({
                                    ...b,
                                    status: 'In Progress',
                                    updatedAt: new Date().toLocaleString(),
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                              >
                                Start Fix
                              </button>
                            )}

                            {(b.status === 'In Progress' || b.status === 'Reopened') && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateBug({
                                    ...b,
                                    status: 'Fixed',
                                    resolutionNotes: `[Fixed by ${currentUserName}]`,
                                    updatedAt: new Date().toLocaleString(),
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-600 hover:bg-teal-500 text-white"
                              >
                                Mark Fixed
                              </button>
                            )}

                            {b.status === 'Fixed' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateBug({
                                    ...b,
                                    status: 'Retesting',
                                    resolutionNotes: `[Retest Requested by ${currentUserName}]`,
                                    updatedAt: new Date().toLocaleString(),
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white"
                              >
                                Send Retest
                              </button>
                            )}

                            {(b.status === 'Retesting' || b.status === 'Fixed') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateBug({
                                      ...b,
                                      status: 'Verified',
                                      resolutionNotes: `[Verified by ${currentUserName}]`,
                                      updatedAt: new Date().toLocaleString(),
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                  Verify Fix
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateBug({
                                      ...b,
                                      status: 'Reopened',
                                      resolutionNotes: `[Reopened by ${currentUserName}]`,
                                      updatedAt: new Date().toLocaleString(),
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                                >
                                  Reopen
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              TAB 2: TASK COMMENTS (DISCUSSION)
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              {/* Add Comment Form */}
              <form onSubmit={handleAddComment} className="space-y-2">
                <label htmlFor="newCommentField" className="block text-xs font-semibold text-slate-200">
                  Discuss Task / Add Comment
                </label>
                <div className="relative">
                  <textarea
                    id="newCommentField"
                    required
                    rows={3}
                    value={newCommentInput}
                    onChange={(e) => setNewCommentInput(e.target.value)}
                    placeholder={`Comment as ${currentUserName} (${currentUserRole})...`}
                    className="w-full p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none pr-24"
                  />
                  <button
                    type="submit"
                    className="absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <span>Post</span>
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </form>

              {/* Comments Timeline */}
              <div className="space-y-3 pt-2">
                {(!task.comments || task.comments.length === 0) ? (
                  <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl space-y-1.5">
                    <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-medium text-slate-400">No comments on this task yet.</p>
                    <p className="text-[11px] text-slate-500">
                      Team members and reviewers can discuss progress, blockers, or requirements here.
                    </p>
                  </div>
                ) : (
                  task.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-slate-400">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-[9px] flex items-center justify-center">
                            {comment.authorInitials || 'U'}
                          </div>
                          <span className="font-semibold text-white">{comment.authorName}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {comment.authorRole}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500">{comment.timestamp}</span>
                      </div>
                      <p className="text-slate-200 text-xs pl-8 leading-relaxed whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              TAB 3: GENERAL TASK FILE ATTACHMENTS
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'attachments' && (
            <div className="space-y-4">
              {/* Attachment Upload Area */}
              <div>
                <label className="border-2 border-dashed border-slate-700 hover:border-purple-500/70 rounded-xl p-5 flex flex-col items-center justify-center bg-slate-900/50 cursor-pointer transition-colors group">
                  <Upload className="w-6 h-6 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-white">Click to Select & Attach Files</span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Supports Documents (PDF, DOCX, TXT), Images (PNG, JPG), and Archives (ZIP) up to 15MB
                  </span>
                  <input
                    type="file"
                    multiple
                    onChange={handleGeneralFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {attachmentError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{attachmentError}</span>
                </div>
              )}

              {/* Attachments List */}
              <div className="space-y-2 pt-1">
                {(!task.attachments || task.attachments.length === 0) ? (
                  <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl space-y-1.5">
                    <Paperclip className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-medium text-slate-400">No attachments on this task yet.</p>
                    <p className="text-[11px] text-slate-500">
                      Upload specifications, design drafts, or logs for this task.
                    </p>
                  </div>
                ) : (
                  task.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 shrink-0">
                          {getFileIcon(file.type, file.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {formatFileSize(file.size)} · Uploaded by {file.uploadedBy} on {file.uploadedAt}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {file.type.startsWith('image/') ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: file.fileUrl, title: file.name })}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Preview image"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        ) : null}
                        <a
                          href={file.fileUrl}
                          download={file.name}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Download file"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(file.id)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Remove attachment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              TAB 4: REVIEW HISTORY TIMELINE
          ═══════════════════════════════════════════════════ */}
          {activeTab === 'history' && (
            <div className="space-y-2">
              {(!task.reviewHistory || task.reviewHistory.length === 0) ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl space-y-1.5">
                  <History className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-500">No review events recorded yet.</p>
                </div>
              ) : (
                task.reviewHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span className="font-semibold text-purple-300">
                        {item.authorName} ({item.authorRole})
                      </span>
                      <span>{item.timestamp}</span>
                    </div>
                    <div className="font-medium text-white flex items-center gap-1.5">
                      {item.action === 'submit' && (
                        <span className="text-indigo-300 flex items-center gap-1">
                          <Send className="w-3.5 h-3.5" /> Submitted for Review
                        </span>
                      )}
                      {item.action === 'request_corrections' && (
                        <span className="text-amber-300 flex items-center gap-1">
                          <RotateCcw className="w-3.5 h-3.5" /> Requested Corrections (Revision Required)
                        </span>
                      )}
                      {item.action === 'recommend_approval' && (
                        <span className="text-purple-300 flex items-center gap-1">
                          <ThumbsUp className="w-3.5 h-3.5" /> Recommended Approval to PM
                        </span>
                      )}
                      {item.action === 'final_approve' && (
                        <span className="text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Final PM Approval Granted
                        </span>
                      )}
                    </div>
                    {item.comment && (
                      <p className="text-slate-300 text-[11px] bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 mt-1 whitespace-pre-wrap">
                        "{item.comment}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0b112c]/60 flex items-center justify-between">
          <div className="text-[10px] text-slate-500 hidden sm:block">
            Workflow: Team Member Submit → TL Review/Recommend → PM Final Approval
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-auto"
          >
            Close
          </button>
        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/90 flex flex-col items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] p-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 text-xs text-white">
              <span className="font-semibold truncate">{previewImage.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewImage.url}
              alt={previewImage.title}
              className="max-w-full max-h-[75vh] object-contain rounded-lg border border-slate-700 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
