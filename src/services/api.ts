import type { UserRole } from '../types/pms';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';
const TOKEN_KEY = 'pms_auth_token';

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: 'PM' | 'TL' | 'TM' | 'TESTER' | string;
  team: string;
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

