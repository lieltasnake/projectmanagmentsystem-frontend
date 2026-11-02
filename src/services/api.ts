import type { Project, UserRole } from '../types/pms';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';
const TOKEN_KEY = 'pms_auth_token';

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: 'PM' | 'TL' | 'TM' | 'TESTER' | string;
  team: string;
  skills?: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  mustChangePassword: boolean;
  token: string;
  user: ApiUser;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    console.error('Failed to set auth token in localStorage', err);
  }
}

export function removeAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    console.error('Failed to remove auth token from localStorage', err);
  }
}

/**
 * Standard fetch wrapper with auth header and error handling
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = { error: await response.text() };
  }

  if (!response.ok) {
    const errorMsg = data?.error || data?.message || `Request failed with status ${response.status}`;
    const error = new Error(errorMsg);
    (error as any).status = response.status;
    (error as any).data = data;
    throw error;
  }

  return data as T;
}

// =========================================================================
// Authentication Endpoints
// =========================================================================

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.token) {
    setAuthToken(res.token);
  }
  return res;
}

export async function changeTemporaryPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string; token: string; user: ApiUser }> {
  const res = await request<{ success: boolean; message: string; token: string; user: ApiUser }>(
    '/auth/change-temporary-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }
  );
  if (res.token) {
    setAuthToken(res.token);
  }
  return res;
}

// =========================================================================
// Profile & Personal Account Endpoints
// =========================================================================

export async function getMe(): Promise<{ success: boolean; user: ApiUser }> {
  return request<{ success: boolean; user: ApiUser }>('/users/me', {
    method: 'GET',
  });
}

export async function updateMyProfile(profileData: {
  name?: string;
  email?: string;
}): Promise<{ success: boolean; message: string; user: ApiUser }> {
  return request<{ success: boolean; message: string; user: ApiUser }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(profileData),
  });
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>('/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// =========================================================================
// Project Manager User Management Endpoints (PM Only)
// =========================================================================

export async function getUsers(filters?: {
  search?: string;
  role?: string;
  team?: string;
  status?: string;
}): Promise<{ success: boolean; count: number; users: ApiUser[] }> {
  const query = new URLSearchParams();
  if (filters?.search) query.append('search', filters.search);
  if (filters?.role && filters.role !== 'All') query.append('role', filters.role);
  if (filters?.team && filters.team !== 'All') query.append('team', filters.team);
  if (filters?.status && filters.status !== 'All') query.append('status', filters.status);

  const qs = query.toString();
  return request<{ success: boolean; count: number; users: ApiUser[] }>(
    `/users${qs ? `?${qs}` : ''}`,
    {
      method: 'GET',
    }
  );
}

export async function createUser(userData: {
  name: string;
  email: string;
  password: string;
  role: string;
  team?: string;
  skills?: string[];
}): Promise<{ success: boolean; message: string; user: ApiUser }> {
  return request<{ success: boolean; message: string; user: ApiUser }>('/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

export async function updateUser(
  id: number | string,
  data: {
    name?: string;
    email?: string;
    role?: string;
    team?: string;
    skills?: string[];
  }
): Promise<{ success: boolean; message: string; user: ApiUser }> {
  return request<{ success: boolean; message: string; user: ApiUser }>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function updateUserStatus(
  id: number | string,
  isActive: boolean
): Promise<{ success: boolean; message: string; user: ApiUser }> {
  return request<{ success: boolean; message: string; user: ApiUser }>(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function resetUserPassword(
  id: number | string,
  temporaryPassword?: string
): Promise<{
  success: boolean;
  message: string;
  temporaryPassword: string;
  user: ApiUser;
}> {
  return request<{
    success: boolean;
    message: string;
    temporaryPassword: string;
    user: ApiUser;
  }>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ temporaryPassword }),
  });
}

// =========================================================================
// Project Endpoints
// =========================================================================

export interface ProjectFilters {
  search?: string;
  status?: string;
  teamLeader?: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  startDate?: string;
  deadline?: string;
  status?: string;
  priority?: string;
  teamLeaderId?: string;
  teamMemberIds?: string[];
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  startDate?: string;
  deadline?: string;
  status?: string;
  priority?: string;
  teamLeaderId?: string;
  teamMemberIds?: string[];
}

export interface ProjectTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  isActive: boolean;
  isTeamLeader: boolean;
  assignedAt?: string;
}

export interface ProjectTeamResponse {
  success: boolean;
  count: number;
  teamMembers: ProjectTeamMember[];
}

export async function getProjects(filters?: ProjectFilters): Promise<{
  success: boolean;
  count: number;
  projects: Project[];
}> {
  const query = new URLSearchParams();
  if (filters?.search) query.append('search', filters.search);
  if (filters?.status && filters.status !== 'All') query.append('status', filters.status);
  if (filters?.teamLeader) query.append('teamLeader', filters.teamLeader);

  const qs = query.toString();
  return request<{ success: boolean; count: number; projects: Project[] }>(
    `/projects${qs ? `?${qs}` : ''}`,
    {
      method: 'GET',
    }
  );
}

export async function createProject(data: CreateProjectData): Promise<{
  success: boolean;
  message: string;
  project: Project;
}> {
  return request<{ success: boolean; message: string; project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getProject(id: string | number): Promise<{
  success: boolean;
  project: Project;
}> {
  return request<{ success: boolean; project: Project }>(`/projects/${id}`, {
    method: 'GET',
  });
}

export async function updateProject(
  id: string | number,
  data: UpdateProjectData
): Promise<{
  success: boolean;
  message: string;
  project: Project;
}> {
  return request<{ success: boolean; message: string; project: Project }>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string | number): Promise<{
  success: boolean;
  message: string;
}> {
  return request<{ success: boolean; message: string }>(`/projects/${id}`, {
    method: 'DELETE',
  });
}

export async function getProjectTasks(projectId: string | number): Promise<{
  success: boolean;
  count: number;
  tasks: {
    id: string;
    projectId: string;
    title: string;
    description: string;
    status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed';
    priority: 'High' | 'Medium' | 'Low' | 'Urgent';
    assignedToId: string | null;
    deadline: string | null;
    createdAt?: string;
  }[];
}> {
  return request<{
    success: boolean;
    count: number;
    tasks: {
      id: string;
      projectId: string;
      title: string;
      description: string;
      status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed';
      priority: 'High' | 'Medium' | 'Low' | 'Urgent';
      assignedToId: string | null;
      deadline: string | null;
      createdAt?: string;
    }[];
  }>(`/projects/${projectId}/tasks`, {
    method: 'GET',
  });
}

export async function createProjectTask(
  projectId: string | number,
  taskData: {
    title: string;
    description?: string;
    assignedToId?: string | number | null;
    priority?: 'High' | 'Medium' | 'Low' | 'Urgent';
    deadline?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  task: {
    id: string;
    projectId: string;
    title: string;
    description: string;
    status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed';
    priority: 'High' | 'Medium' | 'Low' | 'Urgent';
    assignedToId: string | null;
    deadline: string | null;
    createdAt?: string;
  };
}> {
  const priorityMap: Record<string, string> = {
    High: 'HIGH',
    Medium: 'MEDIUM',
    Low: 'LOW',
    Urgent: 'URGENT',
  };
  const backendPriority = taskData.priority ? priorityMap[taskData.priority] || taskData.priority : undefined;

  return request<{
    success: boolean;
    message: string;
    task: {
      id: string;
      projectId: string;
      title: string;
      description: string;
      status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed';
      priority: 'High' | 'Medium' | 'Low' | 'Urgent';
      assignedToId: string | null;
      deadline: string | null;
      createdAt?: string;
    };
  }>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: taskData.title,
      description: taskData.description,
      assignedToId: taskData.assignedToId || undefined,
      priority: backendPriority,
      deadline: taskData.deadline || undefined,
    }),
  });
}

export async function getProjectTeam(id: string | number): Promise<ProjectTeamResponse> {
  return request<ProjectTeamResponse>(`/projects/${id}/team`, {
    method: 'GET',
  });
}

export async function addProjectTeamMember(
  id: string | number,
  userIds: string[],
  teamLeaderId?: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request<{ success: boolean; message: string }>(`/projects/${id}/team`, {
    method: 'POST',
    body: JSON.stringify({ userIds, teamLeaderId }),
  });
}

export async function removeProjectTeamMember(
  id: string | number,
  userId: string | number
): Promise<{
  success: boolean;
  message: string;
}> {
  return request<{ success: boolean; message: string }>(`/projects/${id}/team/${userId}`, {
    method: 'DELETE',
  });
}

// =========================================================================
// Role Helper Utilities
// =========================================================================

export function dbRoleToDisplayRole(role: string): UserRole {
  switch (role?.toUpperCase()) {
    case 'PM':
      return 'Project Manager';
    case 'TL':
      return 'Team Leader';
    case 'TM':
      return 'Team Member';
    case 'TESTER':
      return 'Tester';
    default:
      return 'Team Member';
  }
}

export function displayRoleToDbRole(role: UserRole | string): string {
  switch (role) {
    case 'Project Manager':
      return 'PM';
    case 'Team Leader':
      return 'TL';
    case 'Team Member':
      return 'TM';
    case 'Tester':
      return 'TESTER';
    default:
      return (role || 'TM').toUpperCase();
  }
}

// =========================================================================
// Task Workflow Endpoints
// =========================================================================

export async function getTask(id: string | number): Promise<{ success: boolean; task: any }> {
  return request<{ success: boolean; task: any }>(`/tasks/${id}`, { method: 'GET' });
}

export async function updateTask(
  id: string | number,
  data: { title?: string; description?: string; priority?: string; deadline?: string | null }
): Promise<{ success: boolean; message: string; task: any }> {
  return request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function startTask(id: string | number): Promise<{ success: boolean; message: string; status: string }> {
  return request<{ success: boolean; message: string; status: string }>(`/tasks/${id}/start`, { method: 'PATCH' });
}

export async function putTaskOnHold(id: string | number, reason: string): Promise<{ success: boolean; message: string; status: string }> {
  return request(`/tasks/${id}/on-hold`, { method: 'PATCH', body: JSON.stringify({ reason }) });
}

export async function resumeTask(id: string | number): Promise<{ success: boolean; message: string; status: string }> {
  return request(`/tasks/${id}/resume`, { method: 'PATCH' });
}

export async function submitTask(
  id: string | number,
  data: { demoUrl?: string; description?: string }
): Promise<{ success: boolean; message: string; submission: { id: string; version: number }; status: string }> {
  return request(`/tasks/${id}/submit`, { method: 'POST', body: JSON.stringify(data) });
}

export async function uploadDemoZip(
  id: string | number,
  file: File
): Promise<{ success: boolean; message: string; submission: { id: string; version: number }; demoUrl: string; status: string }> {
  const token = getAuthToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/tasks/${id}/demo/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || 'ZIP upload failed');
  return data;
}

export async function resubmitTask(
  id: string | number,
  data: { demoUrl?: string; description?: string }
): Promise<{ success: boolean; message: string; submission: { id: string; version: number }; status: string }> {
  return request(`/tasks/${id}/resubmit`, { method: 'POST', body: JSON.stringify(data) });
}

export async function requestTaskCorrections(
  id: string | number,
  feedback: string
): Promise<{ success: boolean; message: string; status: string }> {
  return request(`/tasks/${id}/request-corrections`, { method: 'PATCH', body: JSON.stringify({ feedback }) });
}

export async function recommendTaskApproval(
  id: string | number,
  comment?: string
): Promise<{ success: boolean; message: string; status: string }> {
  return request(`/tasks/${id}/recommend`, { method: 'PATCH', body: JSON.stringify({ comment }) });
}

export async function approveTask(
  id: string | number,
  feedback?: string
): Promise<{ success: boolean; message: string; status: string }> {
  return request(`/tasks/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ feedback }) });
}

export async function getTaskSubmissions(id: string | number): Promise<{ success: boolean; count: number; submissions: any[] }> {
  return request(`/tasks/${id}/submissions`, { method: 'GET' });
}

export async function getTaskBugs(id: string | number): Promise<{ success: boolean; count: number; bugs: any[] }> {
  return request(`/tasks/${id}/bugs`, { method: 'GET' });
}

export async function reportBug(
  id: string | number,
  data: { title: string; description: string; severity?: string; reproductionSteps?: string }
): Promise<{ success: boolean; message: string; bug: { id: string; title: string; status: string; createdAt: string }; taskStatus: string }> {
  return request(`/tasks/${id}/report-bug`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function verifyBug(
  id: string | number,
  data: { bugId: string | number; verified: boolean; verificationNotes?: string }
): Promise<{ success: boolean; message: string; bugStatus: string; taskStatus: string }> {
  return request(`/tasks/${id}/verify-bug`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function requestFinalCorrections(
  id: string | number,
  feedback: string
): Promise<{ success: boolean; message: string; taskStatus: string }> {
  return request(`/tasks/${id}/request-final-corrections`, { method: 'PATCH', body: JSON.stringify({ feedback }) });
}

export async function getNotifications(unreadOnly?: boolean): Promise<{ success: boolean; count: number; notifications: any[] }> {
  const query = unreadOnly ? '?unreadOnly=true' : '';
  return request(`/tasks/notifications${query}`, { method: 'GET' });
}

export async function markNotificationRead(notificationId: string | number): Promise<{ success: boolean; message: string }> {
  return request(`/tasks/notifications/${notificationId}/read`, { method: 'PATCH' });
}

export async function createSubtask(taskId: string | number, title: string): Promise<{ success: boolean; subtask: any }> {
  return request(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) });
}

export async function updateSubtask(
  taskId: string | number,
  subtaskId: string | number,
  data: { title?: string; completed?: boolean }
): Promise<{ success: boolean; message: string }> {
  return request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSubtask(taskId: string | number, subtaskId: string | number): Promise<{ success: boolean; message: string }> {
  return request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' });
}

export async function addTaskComment(taskId: string | number, content: string): Promise<{ success: boolean; comment: any }> {
  return request(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
}

export async function uploadTaskAttachment(taskId: string | number, file: File): Promise<{ success: boolean; attachment: any }> {
  const token = getAuthToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || 'Upload failed');
  return data;
}

export async function deleteTaskAttachment(taskId: string | number, attachmentId: string | number): Promise<{ success: boolean; message: string }> {
  return request(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' });
}

export function getTaskAttachmentDownloadUrl(taskId: string | number, attachmentId: string | number): string {
  return `${API_BASE_URL}/tasks/${taskId}/attachments/${attachmentId}/download`;
}

