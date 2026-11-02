import { useEffect, useState } from 'react';
import { getProjectTeam } from '../services/api';

export interface ProjectTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  skills: string[];
  isActive: boolean;
  isTeamLeader: boolean;
  assignedAt?: string;
}

export interface UseProjectTeamResult {
  members: ProjectTeamMember[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useProjectTeam(projectId: string | number | null | undefined): UseProjectTeamResult {
  const [members, setMembers] = useState<ProjectTeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await getProjectTeam(projectId);
        if (cancelled) return;
        const raw = (res as any)?.teamMembers ?? [];
        setMembers(
          raw.map((m: any) => ({
            id: String(m.id),
            name: m.name,
            email: m.email,
            role: m.role,
            team: m.team || 'General',
            skills: Array.isArray(m.skills) ? m.skills : [],
            isActive: Boolean(m.isActive),
            isTeamLeader: Boolean(m.isTeamLeader),
            assignedAt: m.assignedAt,
          }))
        );
      } catch (err: any) {
        if (cancelled) return;
        setMembers([]);
        setError(err?.message || 'Failed to load project team.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, nonce]);

  return { members, loading, error, reload: () => setNonce((n) => n + 1) };
}
