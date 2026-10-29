import { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import type {
  Project,
  Task,
  TeamMember,
  UserProfile,
  UserRole,
  Bug,
  NotificationPreferences,
  AppearanceSettings,
} from './types/pms';

// Browser localStorage helper functions
function getStoredItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function setStoredItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to persist ${key} to localStorage:`, err);
  }
}

export default function App() {
  // Session Authentication State (in-memory)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  // Core Data State (persisted locally in browser localStorage, starts empty if no user records exist)
  const [projects, setProjects] = useState<Project[]>(() =>
    getStoredItem<Project[]>('pms_projects', [])
  );
  const [tasks, setTasks] = useState<Task[]>(() =>
    getStoredItem<Task[]>('pms_tasks', [])
  );
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() =>
    getStoredItem<TeamMember[]>('pms_team_members', [])
  );
  const [bugs, setBugs] = useState<Bug[]>(() =>
    getStoredItem<Bug[]>('pms_bugs', [])
  );

  // Settings State 1: User Profile
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    getStoredItem<UserProfile>('pms_user_profile', {
      name: 'Workspace User',
      email: 'user@workspace.local',
      role: 'Project Manager',
      department: 'Management',
    })
  );

  // Settings State 2: Notification Preferences
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(() =>
    getStoredItem<NotificationPreferences>('pms_notif_prefs', {
      taskDeadlines: true,
      reviewUpdates: true,
      correctionRequests: true,
      taskCompletion: true,
    })
  );

  // Settings State 3: Appearance Settings
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>(() =>
    getStoredItem<AppearanceSettings>('pms_appearance', {
      theme: 'dark',
      accentColor: 'purple',
      compactMode: false,
    })
  );

  // Synchronize state changes to localStorage
  useEffect(() => {
    setStoredItem('pms_projects', projects);
  }, [projects]);

  useEffect(() => {
    setStoredItem('pms_tasks', tasks);
  }, [tasks]);

  useEffect(() => {
    setStoredItem('pms_team_members', teamMembers);
  }, [teamMembers]);

  useEffect(() => {
    setStoredItem('pms_bugs', bugs);
  }, [bugs]);

  useEffect(() => {
    setStoredItem('pms_user_profile', userProfile);
  }, [userProfile]);

  useEffect(() => {
    setStoredItem('pms_notif_prefs', notificationPreferences);
  }, [notificationPreferences]);

  useEffect(() => {
    setStoredItem('pms_appearance', appearanceSettings);
  }, [appearanceSettings]);

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

  const handleUpdateProject = (updatedProject: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
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

  // Bug Handlers
  const handleAddBug = (newBug: Bug) => {
    setBugs((prev) => [newBug, ...prev]);
  };

  const handleUpdateBug = (updatedBug: Bug) => {
    setBugs((prev) =>
      prev.map((b) => (b.id === updatedBug.id ? updatedBug : b))
    );
  };

  const handleDeleteBug = (bugId: string) => {
    setBugs((prev) => prev.filter((b) => b.id !== bugId));
  };

  // Authentication Handlers
  const handleLogin = (
    signedInEmail: string,
    role?: UserRole,
    name?: string
  ) => {
    const trimmedEmail = signedInEmail.trim();
    // If signed-in email matches a known member, synchronize display profile
    const matchingMember = teamMembers.find(
      (m) => m.email.toLowerCase() === trimmedEmail.toLowerCase()
    );

    if (matchingMember) {
      setUserProfile((prev) => ({
        ...prev,
        name: matchingMember.name,
        email: matchingMember.email,
        role: matchingMember.role,
        department: matchingMember.department || prev.department,
      }));
    } else {
      const derivedName =
        name?.trim() ||
        (trimmedEmail
          ? trimmedEmail
              .split('@')[0]
              .replace(/[._-]/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : 'Workspace User');

      const selectedRole = role || 'Project Manager';
      const newProfile: UserProfile = {
        name: derivedName,
        email: trimmedEmail || 'user@workspace.local',
        role: selectedRole,
        department: 'Operations',
      };
      setUserProfile(newProfile);

      // If team members is currently empty, register this user so they appear in assignments
      if (teamMembers.length === 0) {
        const newMember: TeamMember = {
          id: `tm-${Date.now()}`,
          name: newProfile.name,
          email: newProfile.email,
          role: newProfile.role,
          department: newProfile.department,
          avatarInitials: computeInitials(newProfile.name),
        };
        setTeamMembers([newMember]);
      }
    }
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    // Sign out to LoginPage without destroying workspace state
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} teamMembers={teamMembers} />;
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
      bugs={bugs}
      onLogout={handleLogout}
      onAddProject={handleAddProject}
      onUpdateProject={handleUpdateProject}
      onAddTask={handleAddTask}
      onUpdateTask={handleUpdateTask}
      onAddMember={handleAddMember}
      onUpdateMember={handleUpdateMember}
      onRemoveMember={handleRemoveMember}
      onAddBug={handleAddBug}
      onUpdateBug={handleUpdateBug}
      onDeleteBug={handleDeleteBug}
    />
  );
}
