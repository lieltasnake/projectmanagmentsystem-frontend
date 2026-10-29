export interface Project {
  id: string;
  name: string;
  description: string;
  manager: {
    name: string;
    role: string;
    avatarInitials: string;
  };
  startDate: string;
  deadline: string;
  status: 'In Progress' | 'Completed' | 'Planning' | 'On Hold';
  progress: number;
  priority: 'High' | 'Medium' | 'Low';
  tasksCount: {
    completed: number;
    total: number;
  };
  /** ID of the Team Leader assigned to this project */
  teamLeaderId?: string;
  /** IDs of Team Members assigned to this project */
  teamMemberIds?: string[];
}

export type UserRole = 'Project Manager' | 'Team Leader' | 'Team Member' | 'Tester';

export interface TaskReviewEntry {
  id: string;
  authorRole: UserRole;
  authorName: string;
  action: 'submit' | 'request_corrections' | 'recommend_approval' | 'final_approve' | 'fail_testing' | 'pass_testing';
  comment?: string;
  timestamp: string;
}

export interface TaskComment {
  id: string;
  authorName: string;
  authorRole: UserRole | string;
  authorInitials?: string;
  content: string;
  timestamp: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number; // in bytes
  type: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface DemoSubmission {
  id: string;
  demoUrl: string;
  description: string;
  submittedBy: string;
  submittedRole: string;
  submittedAt: string;
  screenshots: TaskAttachment[];
  video?: TaskAttachment;
  documents: TaskAttachment[];
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Bug {
  id: string;
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  reproductionSteps: string;
  evidence?: TaskAttachment[];
  assignedTo?: string; // Developer responsible for the task
  reportedBy: string;  // Tester name
  reportedAt: string;
  status: 'Open' | 'Assigned' | 'In Progress' | 'Fixed' | 'Retesting' | 'Verified' | 'Reopened';
  resolutionNotes?: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  projectId: string;
  assignedTo?: string;
  status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed';
  priority: 'High' | 'Medium' | 'Low';
  deadline: string;
  tlRecommendation?: 'recommended' | 'corrections_requested';
  reviewFeedback?: string;
  reviewHistory?: TaskReviewEntry[];
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
  demoSubmission?: DemoSubmission;
  subtasks?: Subtask[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  avatarInitials: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'error';
  taskId?: string;
  projectId?: string;
  bugId?: string;
}

export interface DashboardSummaryStats {
  totalProjects: number | null;
  totalTasks: number | null;
  inProgress: number | null;
  completedTasks: number | null;
  pendingReview?: number | null;
  overdueTasks?: number | null;
}

export interface UserProfile {
  name: string;
  email: string;
  role: UserRole;
  department: string;
}

export interface NotificationPreferences {
  taskDeadlines: boolean;
  reviewUpdates: boolean;
  correctionRequests: boolean;
  taskCompletion: boolean;
  bugAssignments?: boolean;
  bugStatusUpdates?: boolean;
}

export interface AppearanceSettings {
  theme: 'dark' | 'light';
  accentColor: 'purple' | 'indigo' | 'emerald' | 'blue';
  compactMode: boolean;
}


