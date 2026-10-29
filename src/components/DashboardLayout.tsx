import { useState, useMemo } from 'react';
import ProjectsPage from './ProjectsPage';
import ProjectDetailsPage from './ProjectDetailsPage';
import TasksPage from './TasksPage';
import TeamPage from './TeamPage';
import NotificationsPage from './NotificationsPage';
import ReportsPage from './ReportsPage';
import SettingsPage from './SettingsPage';
import TestingDashboardPage from './TestingDashboardPage';
import type {
  Project,
  Task,
  TeamMember,
  AppNotification,
  DashboardSummaryStats,
  UserProfile,
  UserRole,
  Bug,
  NotificationPreferences,
  AppearanceSettings,
} from '../types/pms';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  Bell,
  BarChart3,
  Settings,
  ShieldCheck,
  Menu,
  X,
  Search,
  ChevronDown,
  LogOut,
  User,
  Sparkles,
  Clock,
  CheckCircle,
  TrendingUp,
  AlertCircle,
  Inbox,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Activity,
  CheckCircle2,
  Bug as BugIcon,
} from 'lucide-react';

interface SidebarItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

interface DashboardLayoutProps {
  userEmail?: string;
  userRole?: string;
  userName?: string;
  projects?: Project[];
  tasks?: Task[];
  teamMembers?: TeamMember[];
  notifications?: AppNotification[];
  stats?: DashboardSummaryStats;
  userProfile?: UserProfile;
  onUpdateProfile?: (updated: UserProfile) => void;
  notificationPreferences?: NotificationPreferences;
  onUpdateNotificationPreferences?: (updated: NotificationPreferences) => void;
  appearanceSettings?: AppearanceSettings;
  onUpdateAppearance?: (updated: AppearanceSettings) => void;
  bugs?: Bug[];
  onLogout?: () => void;
  onAddProject?: (project: Project) => void;
  onUpdateProject?: (project: Project) => void;
  onAddTask?: (task: Task) => void;
  onUpdateTask?: (task: Task) => void;
  onAddMember?: (member: TeamMember) => void;
  onUpdateMember?: (member: TeamMember) => void;
  onRemoveMember?: (memberId: string) => void;
  onAddBug?: (bug: Bug) => void;
  onUpdateBug?: (bug: Bug) => void;
  onDeleteBug?: (bugId: string) => void;
}

export default function DashboardLayout({
  userEmail,
  userRole = 'PMS User',
  userName,
  projects = [],
  tasks = [],
  teamMembers = [],
  notifications: _propNotifications = [],
  stats,
  userProfile: propUserProfile,
  onUpdateProfile: propOnUpdateProfile,
  notificationPreferences: propNotifPreferences,
  onUpdateNotificationPreferences: propOnUpdateNotifPreferences,
  appearanceSettings: propAppearanceSettings,
  onUpdateAppearance: propOnUpdateAppearance,
  bugs = [],
  onLogout,
  onAddProject,
  onUpdateProject: _onUpdateProject,
  onAddTask,
  onUpdateTask,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
  onAddBug,
  onUpdateBug,
  onDeleteBug,
}: DashboardLayoutProps = {}) {
  const [activeItem, setActiveItem] = useState(userRole === 'Tester' ? 'testing' : 'dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    if (userRole === 'Team Leader' || userRole === 'Team Member' || userRole === 'Tester') {
      return userRole;
    }
    return 'Project Manager';
  });

  // User Profile state (uses shared props when provided, with in-memory fallback)
  const [internalUserProfile, setInternalUserProfile] = useState<UserProfile>(() => {
    const defaultName = userName || (userEmail ? userEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Workspace User');
    return {
      name: defaultName,
      email: userEmail || 'user@workspace.local',
      role: userRole === 'Team Leader' || userRole === 'Team Member' ? userRole : 'Project Manager',
      department: 'Operations',
    };
  });

  const userProfile = propUserProfile || internalUserProfile;
  const setUserProfile = propOnUpdateProfile || setInternalUserProfile;

  // Notification preferences state (uses shared props when provided, with in-memory fallback)
  const [internalNotifPreferences, setInternalNotifPreferences] = useState<NotificationPreferences>({
    taskDeadlines: true,
    reviewUpdates: true,
    correctionRequests: true,
    taskCompletion: true,
  });

  const notificationPreferences = propNotifPreferences || internalNotifPreferences;
  const setNotificationPreferences = propOnUpdateNotifPreferences || setInternalNotifPreferences;

  // Appearance settings state (uses shared props when provided, with in-memory fallback)
  const [internalAppearanceSettings, setInternalAppearanceSettings] = useState<AppearanceSettings>({
    theme: 'dark',
    accentColor: 'purple',
    compactMode: false,
  });

  const appearanceSettings = propAppearanceSettings || internalAppearanceSettings;
  const setAppearanceSettings = propOnUpdateAppearance || setInternalAppearanceSettings;

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setActiveItem('projects');
  };

  // ── Role-based project visibility ──
  // PM sees all projects; TL sees projects where they are the assigned TL;
  // TM sees projects where they are in the assigned team member list.
  const currentMember = useMemo(
    () => teamMembers.find(
      (m) => m.email.toLowerCase() === (userProfile.email || '').toLowerCase()
            || m.name.toLowerCase() === (userProfile.name || '').toLowerCase()
    ),
    [teamMembers, userProfile.email, userProfile.name]
  );

  const visibleProjects = useMemo(() => {
    if (activeRole === 'Project Manager' || activeRole === 'Tester') return projects;
    if (!currentMember) return [];
    return projects.filter((p) => {
      if (activeRole === 'Team Leader') {
        return p.teamLeaderId === currentMember.id;
      }
      // Team Member
      return p.teamMemberIds?.includes(currentMember.id) ?? false;
    });
  }, [projects, activeRole, currentMember]);

  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map((p) => p.id)),
    [visibleProjects]
  );

  const visibleTasks = useMemo(() => {
    if (activeRole === 'Project Manager') return tasks;
    return tasks.filter((t) => visibleProjectIds.has(t.projectId));
  }, [tasks, activeRole, visibleProjectIds]);

  // Compute stats dynamically from real data: display 0 when count is 0, never '—'
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayDate = useMemo(() => new Date(todayStr), [todayStr]);

  const overdueTasksCount = useMemo(() => {
    return tasks.filter((t) => t.deadline && t.status !== 'Completed' && new Date(t.deadline) < todayDate).length;
  }, [tasks, todayDate]);

  const pendingReviewCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'Under Review').length;
  }, [tasks]);

  const inProgressCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'In Progress').length;
  }, [tasks]);

  const completedCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'Completed').length;
  }, [tasks]);

  const summaryStats = {
    totalProjects: stats?.totalProjects !== undefined && stats?.totalProjects !== null ? stats.totalProjects : projects.length,
    totalTasks: stats?.totalTasks !== undefined && stats?.totalTasks !== null ? stats.totalTasks : tasks.length,
    inProgress: stats?.inProgress !== undefined && stats?.inProgress !== null ? stats.inProgress : inProgressCount,
    completedTasks: stats?.completedTasks !== undefined && stats?.completedTasks !== null ? stats.completedTasks : completedCount,
    pendingReview: stats?.pendingReview !== undefined && stats?.pendingReview !== null ? stats.pendingReview : pendingReviewCount,
    overdueTasks: stats?.overdueTasks !== undefined && stats?.overdueTasks !== null ? stats.overdueTasks : overdueTasksCount,
  };

  // ── Real Recorded Activity from real task review history & workflow events ──
  const realRecentActivities = useMemo(() => {
    const projectMap: Record<string, string> = {};
    projects.forEach((p) => { projectMap[p.id] = p.name; });

    interface ActivityItem {
      id: string;
      title: string;
      description: string;
      timestamp: string;
      type: 'approval' | 'submit' | 'correction' | 'general';
      projectName: string;
    }

    const items: ActivityItem[] = [];

    tasks.forEach((task) => {
      const projectName = projectMap[task.projectId] || 'Project';

      if (task.reviewHistory && task.reviewHistory.length > 0) {
        task.reviewHistory.forEach((entry) => {
          let type: ActivityItem['type'] = 'general';
          let actTitle = `${entry.authorRole} Action`;

          if (entry.action === 'final_approve') {
            type = 'approval';
            actTitle = `Final Approval by ${entry.authorName} (${entry.authorRole})`;
          } else if (entry.action === 'recommend_approval') {
            type = 'approval';
            actTitle = `Approval Recommended by ${entry.authorName} (${entry.authorRole})`;
          } else if (entry.action === 'request_corrections') {
            type = 'correction';
            actTitle = `Corrections Requested by ${entry.authorName} (${entry.authorRole})`;
          } else if (entry.action === 'submit') {
            type = 'submit';
            actTitle = `Submitted for Review by ${entry.authorName}`;
          }

          items.push({
            id: entry.id,
            title: actTitle,
            description: entry.comment ? `"${task.title}": ${entry.comment}` : `Task "${task.title}" updated`,
            timestamp: entry.timestamp,
            type,
            projectName,
          });
        });
      } else {
        // If task has review feedback or specific status without history array
        if (task.status === 'Completed' || task.status === 'Under Review' || task.tlRecommendation) {
          items.push({
            id: `task-act-${task.id}`,
            title: task.status === 'Completed' ? `Task Completed` : task.status === 'Under Review' ? `Task Submitted for Review` : `Task Status: ${task.status}`,
            description: task.reviewFeedback || `Task "${task.title}" in ${projectName}`,
            timestamp: todayStr,
            type: task.status === 'Completed' ? 'approval' : task.tlRecommendation === 'corrections_requested' ? 'correction' : 'submit',
            projectName,
          });
        }
      }
    });

    return items;
  }, [tasks, projects, todayStr]);

  // ── Upcoming Deadlines & Overdue Tasks ──
  const upcomingAndOverdueTasks = useMemo(() => {
    const projectMap: Record<string, string> = {};
    projects.forEach((p) => { projectMap[p.id] = p.name; });

    return tasks
      .filter((t) => t.deadline)
      .map((t) => {
        const d = new Date(t.deadline);
        const isOverdue = t.status !== 'Completed' && d < todayDate;
        return {
          ...t,
          projectName: projectMap[t.projectId] || 'Project',
          isOverdue,
        };
      })
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  }, [tasks, projects, todayDate]);

  // ── Notification read state (Set of notification IDs that have been read) ──
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(new Set());

  const handleMarkRead = (id: string) => {
    setReadNotifIds((prev) => new Set([...prev, id]));
  };

  const handleMarkUnread = (id: string) => {
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleMarkAllRead = (ids: string[]) => {
    setReadNotifIds((prev) => new Set([...prev, ...ids]));
  };

  // ── Derive notifications from tasks (stable IDs prevent duplicate-on-render) ──
  const derivedNotifications = useMemo((): AppNotification[] => {
    if (tasks.length === 0) return [];

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const today = new Date(todayStr);
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const projectMap: Record<string, string> = {};
    projects.forEach((p) => { projectMap[p.id] = p.name; });

    const notifs: AppNotification[] = [];

    tasks.forEach((task) => {
      const projectName = projectMap[task.projectId] || 'Unknown Project';
      const lastEntry = task.reviewHistory?.[0]; // newest first
      const lastTimestamp = lastEntry?.timestamp ?? todayStr;

      // 1. Task submitted for review (or formal demo submitted)
      if (notificationPreferences.reviewUpdates && task.status === 'Under Review' && (!task.tlRecommendation || task.tlRecommendation === 'recommended')) {
        notifs.push({
          id: `notif-review-${task.id}`,
          title: task.demoSubmission ? 'Formal Demo Submitted' : 'Task Submitted for Review',
          message: `"${task.title}" in ${projectName} has been submitted for review${
            task.assignedTo ? ` by ${task.assignedTo}` : ''
          }.${task.demoSubmission ? ' Live demo & evidence attached.' : ''}`,
          timestamp: lastTimestamp,
          read: false,
          type: 'info',
          taskId: task.id,
          projectId: task.projectId,
        });
      }

      // 2. TL recommended for PM approval (distinct from just-submitted)
      if (notificationPreferences.reviewUpdates && task.status === 'Under Review' && task.tlRecommendation === 'recommended') {
        notifs.push({
          id: `notif-tl-recommended-${task.id}`,
          title: 'Team Leader Recommended Approval',
          message: `"${task.title}" in ${projectName} has been reviewed and recommended for final PM approval.`,
          timestamp: lastTimestamp,
          read: false,
          type: 'success',
          taskId: task.id,
          projectId: task.projectId,
        });
      }

      // 3. Corrections requested (task returned for revision)
      if (notificationPreferences.correctionRequests && task.tlRecommendation === 'corrections_requested') {
        notifs.push({
          id: `notif-corrections-${task.id}`,
          title: 'Corrections Requested',
          message: `"${task.title}" in ${projectName} has been returned for revision.${
            task.reviewFeedback ? ` Feedback: ${task.reviewFeedback.slice(0, 80)}…` : ''
          }`,
          timestamp: lastTimestamp,
          read: false,
          type: 'warning',
          taskId: task.id,
          projectId: task.projectId,
        });
      }

      // 4. Task completed (PM approved)
      if (notificationPreferences.taskCompletion && task.status === 'Completed') {
        notifs.push({
          id: `notif-completed-${task.id}`,
          title: 'Task Approved & Completed',
          message: `"${task.title}" in ${projectName} has received final PM approval and is now officially completed.`,
          timestamp: lastTimestamp,
          read: false,
          type: 'success',
          taskId: task.id,
          projectId: task.projectId,
        });
      }

      // 5. Deadline: Overdue (not completed, deadline < today)
      if (notificationPreferences.taskDeadlines && task.deadline && task.status !== 'Completed') {
        const deadlineDate = new Date(task.deadline);
        if (deadlineDate < today) {
          notifs.push({
            id: `notif-overdue-${task.id}`,
            title: 'Task Overdue',
            message: `"${task.title}" in ${projectName} was due on ${task.deadline} and has not been completed.`,
            timestamp: task.deadline,
            read: false,
            type: 'error',
            taskId: task.id,
            projectId: task.projectId,
          });
        } else if (deadlineDate <= in3Days) {
          // 6. Deadline: Approaching within 3 days
          const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          notifs.push({
            id: `notif-due-soon-${task.id}`,
            title: 'Deadline Approaching',
            message: `"${task.title}" in ${projectName} is due in ${daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`} (${task.deadline}).`,
            timestamp: task.deadline,
            read: false,
            type: 'warning',
            taskId: task.id,
            projectId: task.projectId,
          });
        }
      }
    });

    // 7. Bug Notifications (Routing, Retesting, Reopening, Verification)
    bugs.forEach((bug) => {
      const task = tasks.find((t) => t.id === bug.taskId);
      const taskTitle = task?.title || bug.taskId;

      // New / Assigned Bug Notification
      if (bug.status === 'Open' || bug.status === 'Assigned') {
        notifs.push({
          id: `notif-bug-assigned-${bug.id}`,
          title: `Defect Assigned (${bug.severity})`,
          message: `"${bug.title}" linked to "${taskTitle}" assigned to ${bug.assignedTo || 'developer'} (reported by ${bug.reportedBy}).`,
          timestamp: bug.reportedAt || todayStr,
          read: false,
          type: bug.severity === 'Critical' ? 'error' : 'warning',
          taskId: bug.taskId,
          projectId: bug.projectId,
          bugId: bug.id,
        });
      }

      // Bug ready for retesting
      if (bug.status === 'Retesting') {
        notifs.push({
          id: `notif-bug-retest-${bug.id}`,
          title: 'Defect Ready for Retest',
          message: `"${bug.title}" on "${taskTitle}" has been marked Fixed and is awaiting QA verification.`,
          timestamp: bug.updatedAt || todayStr,
          read: false,
          type: 'info',
          taskId: bug.taskId,
          projectId: bug.projectId,
          bugId: bug.id,
        });
      }

      // Bug reopened
      if (bug.status === 'Reopened') {
        notifs.push({
          id: `notif-bug-reopened-${bug.id}`,
          title: 'Defect Reopened',
          message: `"${bug.title}" on "${taskTitle}" failed retesting and has been reopened for rework.`,
          timestamp: bug.updatedAt || todayStr,
          read: false,
          type: 'error',
          taskId: bug.taskId,
          projectId: bug.projectId,
          bugId: bug.id,
        });
      }

      // Bug verified
      if (bug.status === 'Verified') {
        notifs.push({
          id: `notif-bug-verified-${bug.id}`,
          title: 'Defect Verified by QA',
          message: `"${bug.title}" on "${taskTitle}" passed all retest verification criteria.`,
          timestamp: bug.updatedAt || todayStr,
          read: false,
          type: 'success',
          taskId: bug.taskId,
          projectId: bug.projectId,
          bugId: bug.id,
        });
      }
    });

    // Sort: unread first, then by timestamp descending
    return notifs.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  }, [tasks, projects, bugs, notificationPreferences]);

  // Merge read state into computed notifications
  const computedNotifications: AppNotification[] = useMemo(
    () => derivedNotifications.map((n) => ({ ...n, read: readNotifIds.has(n.id) })),
    [derivedNotifications, readNotifIds]
  );

  const unreadCount = computedNotifications.filter((n) => !n.read).length;

    const awaitingTestingCount = tasks.filter((t) => t.status === 'Under Review').length;
    const retestBugsCount = bugs.filter((b) => b.status === 'Retesting').length;
    const testingBadgeCount = awaitingTestingCount + retestBugsCount;

    // Nav badges only display when real data exists (no hardcoded fake badges)
    const navItems: SidebarItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      {
        id: 'projects',
        label: 'Projects',
        icon: FolderKanban,
        badge: projects.length > 0 ? String(projects.length) : undefined,
      },
      {
        id: 'tasks',
        label: 'Tasks',
        icon: CheckSquare,
        badge: tasks.length > 0 ? String(tasks.length) : undefined,
      },
      {
        id: 'testing',
        label: 'Testing & QA',
        icon: BugIcon,
        badge: testingBadgeCount > 0 ? String(testingBadgeCount) : undefined,
      },
      {
        id: 'team',
        label: 'Team',
        icon: Users,
        badge: teamMembers.length > 0 ? String(teamMembers.length) : undefined,
      },
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Bell,
        badge: unreadCount > 0 ? String(unreadCount) : undefined,
      },
      {
        id: 'reports',
        label: 'Reports',
        icon: BarChart3,
      },
      { id: 'settings', label: 'Settings', icon: Settings },
    ];

  // Derive display user initials and display name from userProfile state
  const displayName = userProfile.name || userName || (userEmail ? userEmail.split('@')[0] : 'Workspace Member');
  const displayEmail = userProfile.email || userEmail || 'Not configured';
  const avatarInitials = displayName
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('') || 'U';

  const renderActiveContent = () => {
    switch (activeItem) {
      case 'projects':
        if (selectedProject) {
          const currentProject = projects.find((p) => p.id === selectedProject.id) || selectedProject;
          return (
            <ProjectDetailsPage
              project={currentProject}
              tasks={tasks}
              teamMembers={teamMembers}
              currentUserRole={activeRole}
              currentUserName={displayName}
              onBack={() => setSelectedProject(null)}
              onAddTask={onAddTask}
              onUpdateTask={onUpdateTask}
              bugs={bugs}
              onAddBug={onAddBug}
              onUpdateBug={onUpdateBug}
            />
          );
        }
        return (
          <ProjectsPage
            projects={visibleProjects}
            teamMembers={teamMembers}
            currentUserRole={activeRole}
            currentUserName={displayName}
            onAddProject={onAddProject}
            onSelectProject={handleSelectProject}
          />
        );
      case 'tasks':
        return (
          <TasksPage
            tasks={visibleTasks}
            projects={visibleProjects}
            teamMembers={teamMembers}
            currentUserRole={activeRole}
            currentUserName={displayName}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask}
            onSelectProject={handleSelectProject}
            bugs={bugs}
            onAddBug={onAddBug}
            onUpdateBug={onUpdateBug}
          />
        );
      case 'testing':
        return (
          <TestingDashboardPage
            tasks={visibleTasks}
            projects={visibleProjects}
            teamMembers={teamMembers}
            bugs={bugs}
            currentUserRole={activeRole}
            currentUserName={displayName}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask || (() => {})}
            onAddBug={onAddBug || (() => {})}
            onUpdateBug={onUpdateBug || (() => {})}
            onDeleteBug={onDeleteBug}
            onSelectProject={handleSelectProject}
          />
        );
      case 'team':
        return (
          <TeamPage
            members={teamMembers}
            tasks={tasks}
            onAddMember={onAddMember}
            onUpdateMember={onUpdateMember}
            onRemoveMember={onRemoveMember}
          />
        );
      case 'notifications':
        return (
          <NotificationsPage
            notifications={computedNotifications}
            onMarkRead={handleMarkRead}
            onMarkUnread={handleMarkUnread}
            onMarkAllRead={handleMarkAllRead}
          />
        );
      case 'reports':
        return <ReportsPage projects={projects} tasks={tasks} bugs={bugs} />;
      case 'settings':
        return (
          <SettingsPage
            userProfile={userProfile}
            currentUserRole={activeRole}
            notificationPreferences={notificationPreferences}
            appearanceSettings={appearanceSettings}
            tasks={tasks}
            projects={projects}
            onUpdateProfile={(updated) => {
              const prevNameLower = userProfile.name.trim().toLowerCase();
              const prevEmailLower = userProfile.email.trim().toLowerCase();

              // Governance rule: users cannot change their own role
              const safeUpdated: UserProfile = {
                ...updated,
                role: userProfile.role,
              };

              setUserProfile(safeUpdated);

              // 1. Synchronize corresponding team member record
              if (onUpdateMember) {
                const matchingMember = teamMembers.find(
                  (m) =>
                    m.email.toLowerCase() === prevEmailLower ||
                    m.name.toLowerCase() === prevNameLower ||
                    m.email.toLowerCase() === safeUpdated.email.toLowerCase() ||
                    m.name.toLowerCase() === safeUpdated.name.toLowerCase()
                );
                if (matchingMember) {
                  onUpdateMember({
                    ...matchingMember,
                    name: safeUpdated.name,
                    email: safeUpdated.email,
                    department: safeUpdated.department,
                    avatarInitials:
                      safeUpdated.name
                        .split(/[\s._-]+/)
                        .slice(0, 2)
                        .map((s) => s.charAt(0).toUpperCase())
                        .join('') || 'U',
                    role: matchingMember.role,
                  });
                }
              }

              // 2. Synchronize related task assignment labels
              if (onUpdateTask) {
                tasks.forEach((t) => {
                  if (
                    t.assignedTo &&
                    (t.assignedTo.toLowerCase() === prevNameLower ||
                      t.assignedTo.toLowerCase() === prevEmailLower)
                  ) {
                    onUpdateTask({
                      ...t,
                      assignedTo: safeUpdated.name,
                    });
                  }
                });
              }
            }}
            onUpdateNotificationPreferences={setNotificationPreferences}
            onUpdateAppearance={setAppearanceSettings}
          />
        );
      case 'dashboard':
      default:
        return (
          <>
            {/* Welcome Heading Banner */}
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <span>Welcome to your PMS Workspace</span>
                <Sparkles className="w-6 h-6 text-purple-400" />
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Overview and tracking portal for Project Managers, Team Leaders, and Members.
              </p>
            </div>

            {/* Six Metric Summary Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-5 mb-8">
              {/* Card 1: Total Projects */}
              <div className="relative overflow-hidden rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl transition-all duration-300 hover:border-purple-500/50 hover:shadow-purple-500/10 group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Total Projects
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {summaryStats.totalProjects}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-purple-300">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {summaryStats.totalProjects > 0
                        ? `${summaryStats.totalProjects} active`
                        : 'No active projects'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Total Tasks */}
              <div className="relative overflow-hidden rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl transition-all duration-300 hover:border-indigo-500/50 hover:shadow-indigo-500/10 group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Total Tasks
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {summaryStats.totalTasks}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-300">
                    <span>
                      {summaryStats.totalTasks > 0
                        ? `${summaryStats.totalTasks} tasks created`
                        : 'No tasks created yet'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: In Progress */}
              <div className="relative overflow-hidden rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl transition-all duration-300 hover:border-amber-500/50 hover:shadow-amber-500/10 group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    In Progress
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {summaryStats.inProgress}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-300">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {summaryStats.inProgress > 0
                        ? `${summaryStats.inProgress} in progress`
                        : 'No active tasks'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Completed Tasks (PM Approved) */}
              <div className="relative overflow-hidden rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl transition-all duration-300 hover:border-emerald-500/50 hover:shadow-emerald-500/10 group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Completed Tasks
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {summaryStats.completedTasks}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">PM Final Approval</span>
                  </div>
                </div>
              </div>

              {/* Card 5: Pending Review */}
              <div className="relative overflow-hidden rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl transition-all duration-300 hover:border-purple-500/50 hover:shadow-purple-500/10 group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Pending Review
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {summaryStats.pendingReview}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-purple-300">
                    <span>
                      {summaryStats.pendingReview > 0
                        ? `${summaryStats.pendingReview} awaiting review`
                        : 'No pending reviews'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 6: Overdue Tasks */}
              <div className="relative overflow-hidden rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl transition-all duration-300 hover:border-rose-500/50 hover:shadow-rose-500/10 group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Overdue Tasks
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {summaryStats.overdueTasks}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="truncate">
                      {summaryStats.overdueTasks > 0 ? 'Requires attention' : 'None overdue'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Note on Completed Tasks */}
            <div className="mb-8 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                <strong>Note on Completed Tasks:</strong> A task is officially counted as <strong>Completed</strong> only after final review and approval by the <strong>Project Manager (PM)</strong>.
              </span>
            </div>

            {/* Section 2: Project Progress & Deadlines Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Project Progress */}
              <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                      <FolderKanban className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Project Progress</h3>
                      <p className="text-[11px] text-slate-400">Based on completed tasks and project status</p>
                    </div>
                  </div>
                  {projects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveItem('projects')}
                      className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>View all</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {projects.length === 0 ? (
                  <div className="flex-1 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center flex flex-col items-center justify-center min-h-[200px]">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-2.5">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200">No active projects</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      When projects are created, real completion percentages will be displayed here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 flex-1">
                    {projects.map((project) => {
                      const pTasks = tasks.filter((t) => t.projectId === project.id);
                      const completedPTasks = pTasks.filter((t) => t.status === 'Completed').length;
                      const calculatedProgress = pTasks.length > 0
                        ? Math.round((completedPTasks / pTasks.length) * 100)
                        : project.progress;

                      return (
                        <div
                          key={project.id}
                          onClick={() => handleSelectProject(project)}
                          className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-purple-500/40 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="min-w-0 pr-2">
                              <span className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors truncate block">
                                {project.name}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                <span>{project.manager.name}</span>
                                <span>•</span>
                                <span>{pTasks.length > 0 ? `${completedPTasks}/${pTasks.length} tasks` : `${project.status}`}</span>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-purple-300 shrink-0">
                              {calculatedProgress}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                calculatedProgress === 100
                                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                  : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                              }`}
                              style={{ width: `${calculatedProgress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Upcoming Deadlines & Overdue Tasks */}
              <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Deadlines & Overdue Tasks</h3>
                      <p className="text-[11px] text-slate-400">Task schedules and due dates</p>
                    </div>
                  </div>
                  {upcomingAndOverdueTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveItem('tasks')}
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>View tasks</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {upcomingAndOverdueTasks.length === 0 ? (
                  <div className="flex-1 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center flex flex-col items-center justify-center min-h-[200px]">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-2.5">
                      <Clock className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-200">No scheduled task deadlines</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Tasks created with due dates will appear here with overdue highlights.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[360px] pr-1">
                    {upcomingAndOverdueTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-3 rounded-xl border transition-all ${
                          task.isOverdue
                            ? 'bg-rose-950/25 border-rose-500/30 hover:border-rose-500/50'
                            : 'bg-slate-900/60 border-slate-800/80 hover:border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white truncate block">
                                {task.title}
                              </span>
                              {task.isOverdue ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                                  <AlertCircle className="w-3 h-3" />
                                  Overdue
                                </span>
                              ) : task.status === 'Completed' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                  <CheckCircle className="w-3 h-3" />
                                  Completed
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 shrink-0">
                                  {task.status}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                              <span>{task.projectName}</span>
                              {task.assignedTo && <span> • {task.assignedTo}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-xs font-medium flex items-center gap-1 ${task.isOverdue ? 'text-rose-300 font-bold' : 'text-slate-300'}`}>
                              <Calendar className="w-3 h-3" />
                              <span>{task.deadline}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Recent Activity (Real Events Only) */}
            <div className="rounded-2xl bg-[#0f173b]/90 border border-slate-700/60 p-5 shadow-xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Recent Activity</h3>
                    <p className="text-[11px] text-slate-400">Real workflow actions, reviews, and decisions recorded in workspace</p>
                  </div>
                </div>
              </div>

              {realRecentActivities.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 sm:p-14 text-center flex flex-col items-center justify-center min-h-[220px]">
                  <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm sm:text-base font-semibold text-white">
                    No recent workspace activity
                  </h4>
                  <p className="mt-1.5 text-xs text-slate-400 max-w-md">
                    Recent review submissions, approvals, and workflow decisions will appear here as team members take action.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {realRecentActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 hover:border-purple-500/40 transition-colors"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          act.type === 'approval'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : act.type === 'correction'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : act.type === 'submit'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {act.type === 'approval' ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : act.type === 'correction' ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : act.type === 'submit' ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : (
                          <Activity className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-white truncate">{act.title}</p>
                          <span className="text-[10px] text-slate-400 shrink-0">{act.timestamp}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 break-words">{act.description}</p>
                        <span className="inline-block mt-1 text-[10px] text-purple-300/80 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          {act.projectName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );
    }
  };

  return (
    <div
      className={`min-h-screen ${
        appearanceSettings.theme === 'light'
          ? 'theme-light bg-slate-50 text-slate-800'
          : 'bg-[#070b19] text-slate-100'
      } flex overflow-hidden transition-colors duration-200`}
    >
      {/* Background Decorative Ambient Glows matching Login aesthetic */}
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Mobile Backdrop Overlay */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* 1. LEFT SIDEBAR */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0b112c]/95 lg:bg-[#0b112c]/80 backdrop-blur-xl border-r border-slate-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* PMS Branding Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-500/25 ring-2 ring-purple-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white leading-tight">
                PMS Portal
              </div>
              <div className="text-[10px] text-purple-300 font-medium">
                Workspace
              </div>
            </div>
          </div>

          {/* Close button for mobile screen */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveItem(item.id);
                  setSelectedProject(null);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-purple-300 border border-purple-500/20'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Info Card */}
        <div className="p-3 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div className="text-xs">
              <p className="font-medium text-slate-200">System Online</p>
              <p className="text-[11px] text-slate-400">PM • TL • TM • QA Shared</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN BODY AREA */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* TOP HEADER */}
        <header className="h-16 sticky top-0 z-30 bg-[#0b112c]/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Left section: Mobile menu button + Page title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white capitalize tracking-tight">
                {activeItem}
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Project Management System (PMS)
              </p>
            </div>
          </div>

          {/* Right section: Search, Notification icon, User avatar & profile dropdown */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Quick search input */}
            <div className="relative hidden md:block w-52 lg:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search workspace..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-700/60 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Notification Bell Button */}
            <button
              type="button"
              onClick={() => setActiveItem('notifications')}
              className="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500 ring-2 ring-[#0b112c]" />
              )}
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                {/* Avatar with purple gradient border */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-semibold text-xs shadow-md shadow-purple-500/20">
                  {avatarInitials}
                </div>
                <div className="text-left hidden sm:block leading-tight">
                  <div className="text-xs font-semibold text-white">{displayName}</div>
                  <div className="text-[10px] text-purple-300 font-medium">{activeRole}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#0f173b] border border-slate-700/80 shadow-2xl py-1 z-50">
                  <div className="px-3 py-2 border-b border-slate-800">
                    <p className="text-xs font-medium text-white">{displayName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{displayEmail}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        {activeRole}
                      </span>
                    </div>
                  </div>

                  {/* Role Switcher for Frontend Workflow Testing */}
                  <div className="px-3 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Switch Role (Workflow Testing)
                    </p>
                    <div className="space-y-1">
                      {(['Project Manager', 'Team Leader', 'Team Member', 'Tester'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            setActiveRole(r);
                            setUserProfile({ ...userProfile, role: r });
                            setIsProfileMenuOpen(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            activeRole === r
                              ? 'bg-purple-600 text-white font-semibold'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                          }`}
                        >
                          <span>{r}</span>
                          {activeRole === r && <CheckCircle className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setActiveItem('settings');
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2"
                  >
                    <User className="w-4 h-4 text-purple-400" />
                    <span>My Profile</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setActiveItem('settings');
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4 text-purple-400" />
                    <span>Account Settings</span>
                  </button>

                  <div className="border-t border-slate-800 my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      if (onLogout) onLogout();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-slate-800/60 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 3. MAIN CONTENT AREA */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderActiveContent()}
        </main>
      </div>
    </div>
  );
}
