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
    'ngrok-skip-browser-warning': 'true',
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
  statuses?: { name: string; color?: string | null; sortOrder?: number; isCompletionStatus?: boolean }[];
  /** Project key (optional - will be generated if not provided) */
  projectKey?: string;
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

export interface ProjectStatus {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isSystem: boolean;
  isCompletionStatus: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectStatusData {
  name: string;
  color?: string | null;
  sortOrder?: number;
}

export interface UpdateProjectStatusData {
  name?: string;
  color?: string | null;
  sortOrder?: number;
}

export interface ProjectStatusResponse {
  success: boolean;
  count: number;
  statuses: ProjectStatus[];
}

export interface ProjectStatusResult {
  success: boolean;
  message: string;
  status: ProjectStatus;
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
    status: string;
    statusId: string | null;
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
      status: string;
      statusId: string | null;
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
    status?: string;
    statusId?: string | number | null;
  }
): Promise<{
  success: boolean;
  message: string;
  task: {
    id: string;
    projectId: string;
    title: string;
    description: string;
    status: string;
    statusId: string | null;
    priority: 'High' | 'Medium' | 'Low' | 'Urgent';
    assignedToId: string | null;
    deadline: string | null;
    createdAt?: string;
    taskNumber?: number;
    taskKey?: string;
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
      status: string;
      statusId: string | null;
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
      status: taskData.status || undefined,
      statusId: taskData.statusId || undefined,
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
// Project Task Status Endpoints
// =========================================================================

export async function getProjectStatuses(
  projectId: string | number
): Promise<ProjectStatusResponse> {
  return request<ProjectStatusResponse>(`/projects/${projectId}/statuses`, {
    method: 'GET',
  });
}

export async function createProjectStatus(
  projectId: string | number,
  data: CreateProjectStatusData
): Promise<ProjectStatusResult> {
  return request<ProjectStatusResult>(`/projects/${projectId}/statuses`, {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      color: data.color ?? null,
      sortOrder: data.sortOrder ?? 0,
    }),
  });
}

export async function updateProjectStatus(
  projectId: string | number,
  statusId: string | number,
  data: UpdateProjectStatusData
): Promise<ProjectStatusResult> {
  return request<ProjectStatusResult>(`/projects/${projectId}/statuses/${statusId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: data.name,
      color: data.color ?? null,
      sortOrder: data.sortOrder ?? 0,
    }),
  });
}

export async function deleteProjectStatus(
  projectId: string | number,
  statusId: string | number,
  replacementStatusId?: string | number
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `/projects/${projectId}/statuses/${statusId}`,
    {
      method: 'DELETE',
      body: replacementStatusId !== undefined
        ? JSON.stringify({ replacementStatusId })
        : undefined,
    }
  );
}

export async function designateCompletionStatus(
  projectId: string | number,
  statusId: string | number
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `/projects/${projectId}/statuses/${statusId}/completion`,
    {
      method: 'PATCH',
    }
  );
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
    headers: token ? { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } : { 'ngrok-skip-browser-warning': 'true' },
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
    headers: token ? { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } : { 'ngrok-skip-browser-warning': 'true' },
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


// =========================================================================
// Roles & Skills Catalog Endpoints (All authenticated users)
// =========================================================================

export interface RoleCatalog {
  id: number;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillCatalog {
  id: number;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function getRoles(): Promise<{ success: boolean; count: number; roles: RoleCatalog[] }> {
  return request<{ success: boolean; count: number; roles: RoleCatalog[] }>('/users/roles', {
    method: 'GET',
  });
}

export async function createRole(data: { name: string; description?: string }): Promise<{ success: boolean; message: string; role: RoleCatalog }> {
  return request<{ success: boolean; message: string; role: RoleCatalog }>('/users/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRole(id: number | string, data: { name: string; description?: string }): Promise<{ success: boolean; message: string; role: RoleCatalog }> {
  return request<{ success: boolean; message: string; role: RoleCatalog }>(`/users/roles/` + id, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getSkills(): Promise<{ success: boolean; count: number; skills: SkillCatalog[] }> {
  return request<{ success: boolean; count: number; skills: SkillCatalog[] }>('/users/skills', {
    method: 'GET',
  });
}

export async function createSkill(data: { name: string; description?: string }): Promise<{ success: boolean; message: string; skill: SkillCatalog }> {
  return request<{ success: boolean; message: string; skill: SkillCatalog }>('/users/skills', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSkill(id: number | string, data: { name: string; description?: string }): Promise<{ success: boolean; message: string; skill: SkillCatalog }> {
  return request<{ success: boolean; message: string; skill: SkillCatalog }>(`/users/skills/` + id, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// =========================================================================
// GitHub Integration Endpoints (PM Only)
// =========================================================================

export interface GitHubInstallation {
  installationId: string;
  isActive: boolean;
}

export interface GitHubInstallationsResponse {
  success: boolean;
  count: number;
  installations: GitHubInstallation[];
  error?: string;
}

export interface GitHubRepository {
  id: string;
  installation_id: string;
  github_repo_id: string;
  name: string;
  full_name: string;
  owner_login: string | null;
  private: boolean;
  default_branch: string | null;
  html_url: string | null;
  description: string | null;
  archived: boolean;
  github_created_at: string | null;
  github_updated_at: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface GitHubRepositoriesResponse {
  success: boolean;
  installationId: string;
  count: number;
  repositories: GitHubRepository[];
  error?: string;
}

export interface GitHubSyncSummary {
  installationId: string;
  fetched: number;
  upserted: number;
  failed: number;
  truncated: boolean;
  complete: boolean;
  errors: string[];
}

export interface GitHubSyncResponse {
  success: boolean;
  message: string;
  summary: GitHubSyncSummary;
  error?: string;
}

export interface GitHubBranch {
  id: string;
  installation_id: string;
  repository_id: string;
  branch_name: string;
  commit_sha: string;
  protected: boolean;
  last_synced_at: string;
  updated_at: string;
  is_deleted: boolean;
  sync_run_id: string;
}

export interface GitHubBranchesResponse {
  success: boolean;
  installationId: string;
  count: number;
  branches: GitHubBranch[];
  error?: string;
}

export interface GitHubPullRequest {
  id: string;
  installation_id: string;
  repository_id: string;
  github_pr_id: string;
  pr_number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  head_branch: string | null;
  base_branch: string | null;
  head_sha: string | null;
  base_sha: string | null;
  author_github_id: string | null;
  author_login: string | null;
  created_at_github: string;
  updated_at_github: string;
  closed_at_github: string | null;
  merged_at_github: string | null;
  html_url: string;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
  sync_run_id: string;
}

export interface GitHubPullRequestsResponse {
  success: boolean;
  installationId: string;
  repositoryId: string;
  count: number;
  totalCount: number;
  page: number;
  per_page: number;
  totalPages: number;
  pullRequests: GitHubPullRequest[];
  error?: string;
}

export async function getGitHubInstallations(): Promise<GitHubInstallationsResponse> {
  return request<GitHubInstallationsResponse>('/github/installation', {
    method: 'GET',
  });
}

export interface GitHubInstallationStateResponse {
  success: boolean;
  state: string;
  installationId: string | null;
  expiresInSeconds: number;
  error?: string;
}

export async function getGitHubInstallationState(): Promise<GitHubInstallationStateResponse> {
  return request<GitHubInstallationStateResponse>('/github/installation/state', {
    method: 'GET',
  });
}

export async function getGitHubRepositories(installationId: string): Promise<GitHubRepositoriesResponse> {
  return request<GitHubRepositoriesResponse>(`/github/installation/${installationId}/repositories`, {
    method: 'GET',
  });
}

export async function syncGitHubRepositories(installationId: string): Promise<GitHubSyncResponse> {
  return request<GitHubSyncResponse>(`/github/installation/${installationId}/repositories/sync`, {
    method: 'POST',
  });
}

export async function getGitHubBranches(installationId: string): Promise<GitHubBranchesResponse> {
  return request<GitHubBranchesResponse>(`/github/installation/${installationId}/branches`, {
    method: 'GET',
  });
}

export async function syncGitHubBranches(installationId: string): Promise<GitHubSyncResponse> {
  return request<GitHubSyncResponse>(`/github/installation/${installationId}/branches/sync`, {
    method: 'POST',
  });
}

export async function getGitHubPullRequests(
  installationId: string,
  repositoryId: string,
  page?: number,
  perPage?: number
): Promise<GitHubPullRequestsResponse> {
  const query = new URLSearchParams();
  if (page != null) query.append('page', String(page));
  if (perPage != null) query.append('per_page', String(perPage));
  const qs = query.toString();
  return request<GitHubPullRequestsResponse>(
    `/github/installation/${installationId}/repositories/${repositoryId}/pull-requests${qs ? `?${qs}` : ''}`,
    {
      method: 'GET',
    }
  );
}

export async function syncGitHubPullRequests(
  installationId: string,
  repositoryId: string
): Promise<GitHubSyncResponse> {
  return request<GitHubSyncResponse>(
    `/github/installation/${installationId}/repositories/${repositoryId}/pull-requests/sync`,
    {
      method: 'POST',
    }
  );
}

export interface GitHubCommit {
  id: string;
  installation_id: string;
  repository_id: string;
  commit_sha: string;
  message: string | null;
  html_url: string | null;
  author_name: string | null;
  author_email: string | null;
  author_date: string | null;
  committer_name: string | null;
  committer_email: string | null;
  committer_date: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface GitHubCommitsResponse {
  success: boolean;
  installationId: string;
  count: number;
  commits: GitHubCommit[];
  error?: string;
}

export interface GitHubCommitSyncSummary {
  installationId: string;
  fetched: number;
  upserted: number;
  failed: number;
  truncated: boolean;
  complete: boolean;
  ownershipLost: boolean;
  errors: string[];
  branchResults?: unknown[];
}

export interface GitHubCommitSyncResponse {
  success: boolean;
  message: string;
  summary: GitHubCommitSyncSummary;
  error?: string;
}

export async function getGitHubCommits(installationId: string, branch?: string): Promise<GitHubCommitsResponse> {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return request<GitHubCommitsResponse>(`/github/installation/${installationId}/commits${query}`, {
    method: 'GET',
  });
}

export async function syncGitHubCommits(installationId: string): Promise<GitHubCommitSyncResponse> {
  return request<GitHubCommitSyncResponse>(`/github/installation/${installationId}/commits/sync`, {
    method: 'POST',
  });
}

// =========================================================================
// Project-Level GitHub Repository Connection Endpoints (PM Only)
// =========================================================================

export interface ProjectGitHubRepository {
  githubRepoId: string;
  fullName: string;
  name: string;
  ownerLogin: string | null;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
  description: string | null;
  archived: boolean;
  githubUpdatedAt: string | null;
  installationId: string;
  connectedAt: string;
  isActive: boolean;
  autoSyncEnabled: boolean;
}

export interface ProjectGitHubRepositoriesResponse {
  success: boolean;
  count: number;
  repositories: ProjectGitHubRepository[];
  error?: string;
}

export interface ConnectProjectGitHubRepoResponse {
  success: boolean;
  message: string;
  repository?: ProjectGitHubRepository;
}

export async function getProjectGitHubRepositories(
  projectId: string | number
): Promise<ProjectGitHubRepositoriesResponse> {
  return request<ProjectGitHubRepositoriesResponse>(
    `/projects/${projectId}/github/repositories`,
    { method: 'GET' }
  );
}

export async function connectProjectGitHubRepo(
  projectId: string | number,
  githubRepoId: string | number
): Promise<ConnectProjectGitHubRepoResponse> {
  return request<ConnectProjectGitHubRepoResponse>(
    `/projects/${projectId}/github/repositories/connect`,
    {
      method: 'POST',
      body: JSON.stringify({ githubRepoId }),
    }
  );
}

export async function disconnectProjectGitHubRepo(
  projectId: string | number,
  githubRepoId: string | number
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `/projects/${projectId}/github/repositories/${githubRepoId}/disconnect`,
    { method: 'DELETE' }
  );
}


