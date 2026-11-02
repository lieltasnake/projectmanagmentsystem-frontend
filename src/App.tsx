import { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import { getAuthToken, removeAuthToken, getMe, dbRoleToDisplayRole, getProjects, getProjectTasks, createProjectTask, updateTask, getProjectTeam, getNotifications } from './services/api';
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
  // Core Data State
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
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

  // Backend Notification State
  const [backendNotifications, setBackendNotifications] = useState<any[]>([]);

  // Session Authentication State verified via JWT
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAuthToken());

  // Check and restore active user session on mount
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      getMe()
        .then((res) => {
          setIsAuthenticated(true);
          setUserProfile((prev) => ({
            ...prev,
            name: res.user.name,
            email: res.user.email,
            role: dbRoleToDisplayRole(res.user.role),
            department: res.user.team || prev.department,
          }));
        })
        .catch(() => {
          removeAuthToken();
          setIsAuthenticated(false);
        });
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  // Fetch backend notifications on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    getNotifications(true)
      .then((res) => {
        setBackendNotifications(res.notifications || []);
      })
      .catch(() => {
        // ignore - notifications are optional
      });
  }, [isAuthenticated]);

  // Load projects and tasks from backend after authentication
  useEffect(() => {
    if (!isAuthenticated) return;

    setProjects([]);
    setTasks([]);

    getProjects()
      .then(async (res) => {
        const projs = res.projects || [];
        setProjects(projs);
        // setProjectsLoading(false);

        // Populate team members from backend for reliable assignee name<->id resolution.
        const allMembers: TeamMember[] = [];
        for (const p of projs) {
          try {
            const tRes = await getProjectTeam(p.id);
            for (const m of (tRes.teamMembers || [])) {
              if (!allMembers.some((x) => x.id === String(m.id))) {
                allMembers.push({
                  id: String(m.id),
                  name: m.name,
                  email: m.email,
                  role: m.role as UserRole,
                  avatarInitials: computeInitials(m.name),
                });
              }
            }
          } catch { /* ignore per-project errors */ }
        }
        setTeamMembers(allMembers);

        // Load tasks for all projects
        const allTasks: Task[] = [];
        for (const p of projs) {
          try {
            const tRes = await getProjectTasks(p.id);
            const mapped = (tRes.tasks || []).map((t: any) => {
              const member = teamMembers.find((m) => m.id === String(t.assignedToId));
              return {
                id: String(t.id),
                projectId: String(t.projectId),
                title: t.title,
                description: t.description || '',
                status: t.status,
                priority: t.priority,
                assignedTo: t.assignedTo ?? member?.name,
                assignedToId: t.assignedToId,
                deadline: t.deadline || '',
                createdAt: t.createdAt,
                subtasks: [],
                comments: [],
                attachments: [],
              } as Task;
            });
            allTasks.push(...mapped);
          } catch {
            // ignore per-project errors
          }
        }
        setTasks(allTasks);
      })
      .catch(() => {
        // ignore
      });
  }, [isAuthenticated]);

  // Synchronize state changes to localStorage (projects/bugs/etc not tasks)

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
  const handleAddTask = async (newTask: Task) => {
    try {
      const member = teamMembers.find((m) => m.name === newTask.assignedTo);
      await createProjectTask(newTask.projectId, {
        title: newTask.title,
        description: newTask.description,
        assignedToId: member?.id,
        priority: newTask.priority,
        deadline: newTask.deadline || undefined,
      });
      // refresh tasks
      const allTasks: Task[] = [];
      const projs = projects;
      for (const p of projs) {
        try {
          const tRes = await getProjectTasks(p.id);
          const mapped = (tRes.tasks || []).map((t: any) => {
            const mem = teamMembers.find((m) => m.id === String(t.assignedToId));
            return {
              id: String(t.id),
              projectId: String(t.projectId),
              title: t.title,
              description: t.description || '',
              status: t.status,
              priority: t.priority,
              assignedTo: mem?.name,
              assignedToId: t.assignedToId,
              deadline: t.deadline || '',
              createdAt: t.createdAt,
              subtasks: [],
              comments: [],
              attachments: [],
            } as Task;
          });
          allTasks.push(...mapped);
        } catch {}
      }
      setTasks(allTasks);
    } catch (err) {
      console.error('Failed to create task', err);
    }
  };

  const handleUpdateTask = async (updatedTask: Task) => {
    try {
      await updateTask(updatedTask.id, {
        title: updatedTask.title,
        description: updatedTask.description,
        priority: updatedTask.priority,
        deadline: updatedTask.deadline || null,
      });
      // also handle assignment if changed? backend assign endpoint separate; skip for now
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    } catch (err) {
      console.error('Failed to update task', err);
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    }
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

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
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
    // The role always comes from the authenticated backend session (real
    // PostgreSQL role). Never hardcode PM as the default role, and never trust
    // a potentially stale localStorage team-member record for the role.
    const resolvedRole: UserRole = (role ?? 'Project Manager') as UserRole;

    // Synchronize display name/email from a known member record if present,
    // but keep the role sourced from the backend login response.
    const matchingMember = teamMembers.find(
      (m) => m.email.toLowerCase() === trimmedEmail.toLowerCase()
    );

    const derivedName =
      name?.trim() ||
      (matchingMember?.name.trim()) ||
      (trimmedEmail
        ? trimmedEmail
            .split('@')[0]
            .replace(/[._-]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Workspace User');

    const newProfile: UserProfile = {
      name: derivedName,
      email: matchingMember?.email.trim() || trimmedEmail || 'user@workspace.local',
      role: resolvedRole,
      department: matchingMember?.department || 'Operations',
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
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    // Clear JWT authentication session
    removeAuthToken();
    setProjects([]);
    setTasks([]);
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
      notifications={backendNotifications}
      onLogout={handleLogout}
      onAddProject={handleAddProject}
      onUpdateProject={handleUpdateProject}
      onEditProject={handleUpdateProject}
      onDeleteProject={handleDeleteProject}
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
