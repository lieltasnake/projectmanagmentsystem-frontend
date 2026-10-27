import { useState } from 'react';
import LoginPage from './components/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import type {
  Project,
  Task,
  TeamMember,
  UserProfile,
  NotificationPreferences,
  AppearanceSettings,
} from './types/pms';

// Initial sample team members (Pixel Addis PMS workspace)
const INITIAL_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'tm-1',
    name: 'Alex Morgan',
    email: 'alex.morgan@pmsworkspace.io',
    role: 'Project Manager',
    department: 'Engineering & Delivery',
    avatarInitials: 'AM',
  },
  {
    id: 'tm-2',
    name: 'Marcus Chen',
    email: 'marcus.chen@pmsworkspace.io',
    role: 'Team Leader',
    department: 'Engineering & Delivery',
    avatarInitials: 'MC',
  },
  {
    id: 'tm-3',
    name: 'Sofia Rodriguez',
    email: 'sofia.rodriguez@pmsworkspace.io',
    role: 'Team Member',
    department: 'UI/UX & Product Design',
    avatarInitials: 'SR',
  },
  {
    id: 'tm-4',
    name: 'David Kim',
    email: 'david.kim@pmsworkspace.io',
    role: 'Team Member',
    department: 'Engineering & Delivery',
    avatarInitials: 'DK',
  },
  {
    id: 'tm-5',
    name: 'Elena Rostova',
    email: 'elena.rostova@pmsworkspace.io',
    role: 'Team Member',
    department: 'Quality Assurance & Testing',
    avatarInitials: 'ER',
  },
];

// Initial sample projects
const INITIAL_PROJECTS: Project[] = [
  {
    id: 'PRJ-001',
    name: 'Pixel Addis Core Platform',
    description: 'Enterprise multi-role project management and governance system with live demo verification.',
    manager: {
      name: 'Alex Morgan',
      role: 'Project Manager',
      avatarInitials: 'AM',
    },
    startDate: '2026-09-01',
    deadline: '2026-11-30',
    status: 'In Progress',
    progress: 68,
    priority: 'High',
    tasksCount: {
      completed: 1,
      total: 3,
    },
  },
  {
    id: 'PRJ-002',
    name: 'Client Portal & Dashboard Redesign',
    description: 'Modernized client analytics portal with real-time project metrics, milestone inspection, and exports.',
    manager: {
      name: 'Alex Morgan',
      role: 'Project Manager',
      avatarInitials: 'AM',
    },
    startDate: '2026-09-15',
    deadline: '2026-12-15',
    status: 'In Progress',
    progress: 40,
    priority: 'Medium',
    tasksCount: {
      completed: 0,
      total: 2,
    },
  },
  {
    id: 'PRJ-003',
    name: 'Mobile Application v2.0',
    description: 'Native companion mobile experience for on-the-go task status updates and approval notifications.',
    manager: {
      name: 'Alex Morgan',
      role: 'Project Manager',
      avatarInitials: 'AM',
    },
    startDate: '2026-10-01',
    deadline: '2027-01-31',
    status: 'Planning',
    progress: 15,
    priority: 'Low',
    tasksCount: {
      completed: 0,
      total: 1,
    },
  },
];

// Initial sample tasks
const INITIAL_TASKS: Task[] = [
  {
    id: 'TSK-101',
    title: 'Design High-Fidelity Dashboard Mockups',
    projectId: 'PRJ-001',
    assignedTo: 'Sofia Rodriguez',
    status: 'Completed',
    priority: 'High',
    deadline: '2026-10-15',
    reviewFeedback: 'Officially approved and completed by Project Manager (Alex Morgan).',
    reviewHistory: [
      {
        id: 'rev-1',
        authorRole: 'Project Manager',
        authorName: 'Alex Morgan',
        action: 'final_approve',
        comment: 'Outstanding visual fidelity and clean execution.',
        timestamp: '2026-10-14 16:30',
      },
    ],
  },
  {
    id: 'TSK-102',
    title: 'Implement Role-Based Access Control & Permissions',
    projectId: 'PRJ-001',
    assignedTo: 'David Kim',
    status: 'Under Review',
    priority: 'High',
    deadline: '2026-10-30',
    tlRecommendation: 'recommended',
    reviewFeedback: '[TL Recommendation (Marcus Chen)]: Recommended for PM approval. Live demo passes all permission tests.',
    demoSubmission: {
      id: 'demo-1',
      demoUrl: 'https://auth-preview.pmsworkspace.io/demo',
      description: 'RBAC fully wired with PM, TL, and TM matrix verified. Session token handling is complete.',
      submittedBy: 'David Kim',
      submittedRole: 'Team Member',
      submittedAt: '2026-10-25 14:15',
      screenshots: [],
      documents: [],
    },
    reviewHistory: [
      {
        id: 'rev-2',
        authorRole: 'Team Leader',
        authorName: 'Marcus Chen',
        action: 'recommend_approval',
        comment: 'Code review and demo verification passed. Ready for final PM sign-off.',
        timestamp: '2026-10-26 11:00',
      },
      {
        id: 'rev-3',
        authorRole: 'Team Member',
        authorName: 'David Kim',
        action: 'submit',
        comment: 'Demo deployed with live verification link.',
        timestamp: '2026-10-25 14:15',
      },
    ],
  },
  {
    id: 'TSK-103',
    title: 'Responsive Mobile Navigation & Drawer Fix',
    projectId: 'PRJ-001',
    assignedTo: 'Sofia Rodriguez',
    status: 'In Progress',
    priority: 'Medium',
    deadline: '2026-10-28',
    tlRecommendation: 'corrections_requested',
    reviewFeedback: '[Corrections requested by Team Leader (Marcus Chen)]: Mobile drawer backdrop needs smoother transition on iOS Safari.',
    reviewHistory: [
      {
        id: 'rev-4',
        authorRole: 'Team Leader',
        authorName: 'Marcus Chen',
        action: 'request_corrections',
        comment: 'Drawer backdrop needs smoother transition on iOS Safari before approval.',
        timestamp: '2026-10-26 09:20',
      },
    ],
  },
  {
    id: 'TSK-104',
    title: 'Automated End-to-End Test Suite for Task Reviews',
    projectId: 'PRJ-002',
    assignedTo: 'Elena Rostova',
    status: 'In Progress',
    priority: 'High',
    deadline: '2026-10-29',
  },
  {
    id: 'TSK-105',
    title: 'Database Query Optimization & Index Audit',
    projectId: 'PRJ-002',
    assignedTo: 'David Kim',
    status: 'Not Started',
    priority: 'Low',
    deadline: '2026-10-20',
  },
  {
    id: 'TSK-106',
    title: 'API Architecture Specification for Mobile v2',
    projectId: 'PRJ-003',
    assignedTo: 'Marcus Chen',
    status: 'Not Started',
    priority: 'Medium',
    deadline: '2026-11-10',
  },
];

export default function App() {
  // Session Authentication State (in-memory)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  // Core Data State (in-memory, shared across sign-out and sign-in)
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(INITIAL_TEAM_MEMBERS);

  // Settings State 1: User Profile (persists in React memory across sign-out and sign-in)
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Alex Morgan',
    email: 'alex.morgan@pmsworkspace.io',
    role: 'Project Manager',
    department: 'Engineering & Delivery',
  });

  // Settings State 2: Notification Preferences (persists in React memory across sign-out and sign-in)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    taskDeadlines: true,
    reviewUpdates: true,
    correctionRequests: true,
    taskCompletion: true,
  });

  // Settings State 3: Appearance Settings (persists in React memory across sign-out and sign-in)
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>({
    theme: 'dark',
    accentColor: 'purple',
    compactMode: false,
  });

  // Helper to compute initials
  const computeInitials = (name: string): string => {
    return (
      name
        .split(/[\s._-]+/)
        .slice(0, 2)
        .map((s) => s.charAt(0).toUpperCase())
        .join('') || 'U'
    );
  };

  /**
   * Profile Synchronization:
   * When the current user's name, email, or department is edited and saved:
   * 1. Updates the user profile in shared memory (role is governance-locked and cannot be modified by user).
   * 2. Synchronizes the corresponding team member record (name, email, department, avatarInitials).
   *    Preserves the member's existing role and ID. Unrelated team members are untouched.
   * 3. Synchronizes related task assignment labels (task.assignedTo) wherever appropriate.
   * 4. Synchronizes project manager names for projects managed by this user.
   */
  const handleUpdateProfile = (updated: UserProfile) => {
    const prevName = userProfile.name.trim();
    const prevEmail = userProfile.email.trim();
    const prevNameLower = prevName.toLowerCase();
    const prevEmailLower = prevEmail.toLowerCase();

    // Strict governance: do not allow users to change their own role
    const safeUpdatedProfile: UserProfile = {
      name: updated.name.trim(),
      email: updated.email.trim(),
      role: userProfile.role,
      department: updated.department.trim(),
    };

    setUserProfile(safeUpdatedProfile);

    const newInitials = computeInitials(safeUpdatedProfile.name);

    // 1. Update corresponding team member record only
    setTeamMembers((prevMembers) =>
      prevMembers.map((member) => {
        const matches =
          member.email.trim().toLowerCase() === prevEmailLower ||
          member.name.trim().toLowerCase() === prevNameLower;

        if (!matches) {
          return member; // Unrelated team members remain untouched
        }

        return {
          ...member,
          name: safeUpdatedProfile.name,
          email: safeUpdatedProfile.email,
          department: safeUpdatedProfile.department,
          avatarInitials: newInitials,
          // Retain role to prevent role escalation
          role: member.role,
        };
      })
    );

    // 2. Synchronize related task assignment labels
    setTasks((prevTasks) =>
      prevTasks.map((task) => {
        if (
          task.assignedTo &&
          (task.assignedTo.trim().toLowerCase() === prevNameLower ||
            task.assignedTo.trim().toLowerCase() === prevEmailLower)
        ) {
          return {
            ...task,
            assignedTo: safeUpdatedProfile.name,
          };
        }
        return task;
      })
    );

    // 3. Synchronize project manager labels
    setProjects((prevProjects) =>
      prevProjects.map((project) => {
        if (
          project.manager &&
          project.manager.name.trim().toLowerCase() === prevNameLower
        ) {
          return {
            ...project,
            manager: {
              ...project.manager,
              name: safeUpdatedProfile.name,
              avatarInitials: newInitials,
            },
          };
        }
        return project;
      })
    );
  };

  // Task Handlers
  const handleAddTask = (newTask: Task) => {
    setTasks((prev) => [newTask, ...prev]);
  };

  const handleUpdateTask = (updatedTask: Task) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
  };

  // Project Handlers
  const handleAddProject = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
  };

  // Team Member Handlers
  const handleAddMember = (newMember: TeamMember) => {
    setTeamMembers((prev) => [...prev, newMember]);
  };

  const handleUpdateMember = (updatedMember: TeamMember) => {
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === updatedMember.id ? updatedMember : m))
    );
  };

  const handleRemoveMember = (memberId: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  // Authentication Handlers
  const handleLogin = (signedInEmail: string) => {
    // If signed-in email matches a known member, synchronize display profile
    const matchingMember = teamMembers.find(
      (m) => m.email.toLowerCase() === signedInEmail.trim().toLowerCase()
    );
    if (matchingMember) {
      setUserProfile((prev) => ({
        ...prev,
        name: matchingMember.name,
        email: matchingMember.email,
        role: matchingMember.role,
        department: matchingMember.department || prev.department,
      }));
    }
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    // Sign out to LoginPage without destroying in-memory settings or workspace state
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <DashboardLayout
      userEmail={userProfile.email}
      userName={userProfile.name}
      userRole={userProfile.role}
      userProfile={userProfile}
      onUpdateProfile={handleUpdateProfile}
      notificationPreferences={notificationPreferences}
      onUpdateNotificationPreferences={setNotificationPreferences}
      appearanceSettings={appearanceSettings}
      onUpdateAppearance={setAppearanceSettings}
      projects={projects}
      tasks={tasks}
      teamMembers={teamMembers}
      onLogout={handleLogout}
      onAddProject={handleAddProject}
      onAddTask={handleAddTask}
      onUpdateTask={handleUpdateTask}
      onAddMember={handleAddMember}
      onUpdateMember={handleUpdateMember}
      onRemoveMember={handleRemoveMember}
    />
  );
}
