import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  GitBranch,
  Database,
  GitPullRequest,
  GitCommit,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowRight,
  Zap,
  ChevronDown,
  Search,
} from 'lucide-react';
import {
  getGitHubInstallations,
  getGitHubInstallationState,
  getGitHubRepositories,
  syncGitHubRepositories,
  getGitHubBranches,
  syncGitHubBranches,
  getGitHubPullRequests,
  syncGitHubPullRequests,
  getGitHubCommits,
  syncGitHubCommits,
  type GitHubCommit,
  type GitHubInstallation,
  type GitHubRepository,
  type GitHubBranch,
  type GitHubPullRequest,
  type GitHubSyncSummary,
} from '../services/api';

const GITHUB_APP_URL = import.meta.env.VITE_GITHUB_APP_URL;
const GITHUB_CALLBACK_URL = import.meta.env.VITE_GITHUB_CALLBACK_URL;

interface SyncState {
  loading: boolean;
  summary: GitHubSyncSummary | null;
  error: string | null;
  success: boolean;
}

type SectionId = 'repositories' | 'branches' | 'commits' | 'pull-requests' | null;

interface GitHubIntegrationPageProps {
  currentUserRole?: string;
}

export default function GitHubIntegrationPage({ currentUserRole = 'Project Manager' }: GitHubIntegrationPageProps) {
  const [installations, setInstallations] = useState<GitHubInstallation[]>([]);
  const [installationsLoading, setInstallationsLoading] = useState(true);
  const [installationsError, setInstallationsError] = useState<string | null>(null);

  const [installationStateLoading, setInstallationStateLoading] = useState(false);
  const [installationStateError, setInstallationStateError] = useState<string | null>(null);
  const [installationUrl, setInstallationUrl] = useState<string | null>(null);
  const [installReturnMessage, setInstallReturnMessage] = useState<string | null>(null);
  const [installReturnType, setInstallReturnType] = useState<'success' | 'error' | null>(null);

  const [connectInstallationId, setConnectInstallationId] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>(null);

  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [repositoriesLoading, setRepositoriesLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');

  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);

  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');

  const [pullRequests, setPullRequests] = useState<GitHubPullRequest[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitSync, setCommitSync] = useState<SyncState>({ loading: false, summary: null, error: null, success: false });
  const [pullRequestsLoading, setPullRequestsLoading] = useState(false);
  const [prPage, setPrPage] = useState(1);
  const [prTotalPages, setPrTotalPages] = useState(1);
  const [prTotalCount, setPrTotalCount] = useState(0);
  const [prSearch, setPrSearch] = useState('');
  const [commitSearch, setCommitSearch] = useState('');

  const [repoSync, setRepoSync] = useState<SyncState>({
    loading: false,
    summary: null,
    error: null,
    success: false,
  });
  const [branchSync, setBranchSync] = useState<SyncState>({
    loading: false,
    summary: null,
    error: null,
    success: false,
  });
  const [prSync, setPrSync] = useState<SyncState>({
    loading: false,
    summary: null,
    error: null,
    success: false,
  });

  const hasInstallation = installations.length > 0;
  const activeInstallation = installations.find((i) => i.installationId === selectedInstallationId);
  const isActive = activeInstallation?.isActive === true;
  const isPM = currentUserRole === 'Project Manager';

  // Filtered data based on search
  const filteredRepositories = useMemo(() => {
    const q = repoSearch.toLowerCase().trim();
    if (!q) return repositories;
    return repositories.filter((r) => r.full_name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [repositories, repoSearch]);

  const filteredBranches = useMemo(() => {
    const q = branchSearch.toLowerCase().trim();
    if (!q) return branches;
    return branches.filter((b) => b.branch_name.toLowerCase().includes(q));
  }, [branches, branchSearch]);

  const filteredCommits = useMemo(() => {
    const q = commitSearch.toLowerCase().trim();
    if (!q) return commits;
    return commits.filter((c) => (c.message || '').toLowerCase().includes(q) || c.commit_sha.toLowerCase().includes(q));
  }, [commits, commitSearch]);

  const filteredPullRequests = useMemo(() => {
    const q = prSearch.toLowerCase().trim();
    if (!q) return pullRequests;
    return pullRequests.filter((pr) => pr.title.toLowerCase().includes(q) || `#${pr.pr_number}`.includes(q));
  }, [pullRequests, prSearch]);

  const fetchCommits = useCallback(async (installationId: string) => {
    setCommitsLoading(true);
    try {
      const res = await getGitHubCommits(installationId);
      if (res.success) setCommits(res.commits);
    } catch {
      // ignored
    } finally {
      setCommitsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedInstallationId && hasInstallation && isActive) fetchCommits(selectedInstallationId);
  }, [selectedInstallationId, hasInstallation, isActive, fetchCommits]);

  const fetchInstallations = useCallback(async () => {
    setInstallationsLoading(true);
    setInstallationsError(null);
    try {
      const res = await getGitHubInstallations();
      if (res.success) {
        setInstallations(res.installations);
        if (res.installations.length > 0 && !selectedInstallationId) {
          setSelectedInstallationId(res.installations[0].installationId);
        }
      } else {
        setInstallationsError(res.error || 'Failed to load installations.');
      }
    } catch (err: any) {
      setInstallationsError(err.message || 'Failed to load installations.');
    } finally {
      setInstallationsLoading(false);
    }
  }, [selectedInstallationId]);

  useEffect(() => {
    fetchInstallations();
  }, [fetchInstallations]);

  // Handle return from GitHub App installation callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installed = params.get('installed');
    const error = params.get('error');

    if (installed === 'true') {
      setInstallReturnType('success');
      setInstallReturnMessage('GitHub App installation activated successfully.');
      fetchInstallations();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error) {
      setInstallReturnType('error');
      setInstallReturnMessage(decodeURIComponent(error));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchInstallations]);

  // Fetch signed state for GitHub App installation link
  useEffect(() => {
    if (!GITHUB_APP_URL || hasInstallation || isActive) return;

    let cancelled = false;
    (async () => {
      setInstallationStateLoading(true);
      setInstallationStateError(null);
      try {
        const res = await getGitHubInstallationState();
        if (res.success && res.state) {
          const url = new URL(GITHUB_APP_URL);
          url.searchParams.set('state', res.state);
          if (!cancelled) setInstallationUrl(url.toString());
        } else {
          if (!cancelled) setInstallationStateError(res.error || 'Failed to generate installation state.');
        }
      } catch (err: any) {
        if (!cancelled) setInstallationStateError(err.message || 'Failed to generate installation state.');
      } finally {
        if (!cancelled) setInstallationStateLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [GITHUB_APP_URL, hasInstallation, isActive]);

  const handleSyncRepositories = async () => {
    if (!selectedInstallationId) return;
    setRepoSync({ loading: true, summary: null, error: null, success: false });
    try {
      const res = await syncGitHubRepositories(selectedInstallationId);
      if (res.success) {
        setRepoSync({ loading: false, summary: res.summary, error: null, success: true });
        await fetchRepositories(selectedInstallationId);
      } else {
        setRepoSync({ loading: false, summary: res.summary, error: res.message || 'Sync failed.', success: false });
      }
    } catch (err: any) {
      setRepoSync({ loading: false, summary: null, error: err.message || 'Sync failed.', success: false });
    }
  };

  const fetchRepositories = useCallback(async (installationId: string) => {
    setRepositoriesLoading(true);
    try {
      const res = await getGitHubRepositories(installationId);
      if (res.success) {
        setRepositories(res.repositories);
      }
    } catch {
      // error handled by caller
    } finally {
      setRepositoriesLoading(false);
    }
  }, []);

  const handleSelectRepository = (repo: GitHubRepository) => {
    setSelectedRepositoryId(repo.github_repo_id);
    setBranches([]);
    setPullRequests([]);
    setPrPage(1);
    setPrTotalPages(1);
    setPrTotalCount(0);
    setCommits([]);
    setActiveSection('branches');
  };

  const handleSyncBranches = async () => {
    if (!selectedInstallationId) return;
    setBranchSync({ loading: true, summary: null, error: null, success: false });
    try {
      const res = await syncGitHubBranches(selectedInstallationId);
      if (res.success) {
        setBranchSync({ loading: false, summary: res.summary, error: null, success: true });
        await fetchBranches(selectedInstallationId);
      } else {
        setBranchSync({ loading: false, summary: res.summary, error: res.message || 'Sync failed.', success: false });
      }
    } catch (err: any) {
      setBranchSync({ loading: false, summary: null, error: err.message || 'Sync failed.', success: false });
    }
  };

  const fetchBranches = useCallback(async (installationId: string) => {
    setBranchesLoading(true);
    try {
      const res = await getGitHubBranches(installationId);
      if (res.success) {
        setBranches(res.branches);
      }
    } catch {
      // error handled by caller
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  const handleFetchPullRequests = async (page: number) => {
    if (!selectedInstallationId || !selectedRepositoryId) return;
    setPullRequestsLoading(true);
    try {
      const res = await getGitHubPullRequests(selectedInstallationId, selectedRepositoryId, page, 50);
      if (res.success) {
        setPullRequests(res.pullRequests);
        setPrPage(res.page);
        setPrTotalPages(res.totalPages);
        setPrTotalCount(res.totalCount);
      }
    } catch {
      // error handled by caller
    } finally {
      setPullRequestsLoading(false);
    }
  };

  const handleSyncCommits = async () => {
    if (!selectedInstallationId) return;
    setCommitSync({ loading: true, summary: null, error: null, success: false });
    try {
      const res = await syncGitHubCommits(selectedInstallationId);
      const incomplete = res.summary?.truncated || res.summary?.complete === false;
      setCommitSync({ loading: false, summary: res.summary, error: (res.summary?.errors?.length ? res.summary.errors.join('; ') : res.message) || null, success: !incomplete });
      await fetchCommits(selectedInstallationId);
    } catch (err: any) {
      setCommitSync({ loading: false, summary: null, error: err.message || 'Sync failed.', success: false });
    }
  };
  const handleSyncPullRequests = async () => {
    if (!selectedInstallationId || !selectedRepositoryId) return;
    setPrSync({ loading: true, summary: null, error: null, success: false });
    try {
      const res = await syncGitHubPullRequests(selectedInstallationId, selectedRepositoryId);
      if (res.success) {
        setPrSync({ loading: false, summary: res.summary, error: null, success: true });
        await handleFetchPullRequests(1);
       } else {
         setPrSync({ loading: false, summary: res.summary, error: (res.summary?.errors?.length ? res.summary.errors.join('; ') : res.message) || 'Sync failed.', success: false });
       }
    } catch (err: any) {
      setPrSync({ loading: false, summary: null, error: err.message || 'Sync failed.', success: false });
    }
  };

  const handleConnectInstallation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectInstallationId.trim()) {
      setConnectError('Installation ID is required.');
      return;
    }
    if (!GITHUB_CALLBACK_URL) {
      setConnectError('GitHub callback URL is not configured. Set VITE_GITHUB_CALLBACK_URL.');
      return;
    }
    let callbackUrl: URL;
    try {
      callbackUrl = new URL(GITHUB_CALLBACK_URL);
      if (callbackUrl.protocol !== 'http:' && callbackUrl.protocol !== 'https:') {
        throw new Error('Invalid protocol.');
      }
    } catch {
      setConnectError('GitHub callback URL is invalid. Check VITE_GITHUB_CALLBACK_URL.');
      return;
    }
    setConnectLoading(true);
    setConnectError(null);
    try {
      const res = await getGitHubInstallationState();
      if (res.success && res.state) {
        callbackUrl.searchParams.set('state', res.state);
        callbackUrl.searchParams.set('installation_id', connectInstallationId.trim());
        callbackUrl.searchParams.set('setup_action', 'install');
        window.location.href = callbackUrl.toString();
      } else {
        setConnectError(res.error || 'Failed to generate installation state.');
      }
    } catch (err: any) {
      setConnectError(err.message || 'Failed to generate installation state.');
    } finally {
      setConnectLoading(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Never';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Card definitions
  const cards = [
    {
      id: 'repositories' as const,
      title: 'Repositories',
      icon: Database,
      count: repositories.length,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      subtitle: 'Synced repository metadata',
    },
    {
      id: 'branches' as const,
      title: 'Branches',
      icon: GitBranch,
      count: branches.length,
      color: 'text-green-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      subtitle: 'Synced branch metadata',
    },
    {
      id: 'commits' as const,
      title: 'Commits',
      icon: GitCommit,
      count: commits.length,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      subtitle: 'Synced commit metadata',
    },
    {
      id: 'pull-requests' as const,
      title: 'Pull Requests',
      icon: GitPullRequest,
      count: pullRequests.length,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      subtitle: 'Synced pull request metadata',
    },
  ];

  const sectionActive = activeSection !== null;

  if (installationsLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              <ShieldCheck className="w-6 h-6 text-accent-light mr-2" />
              GitHub Integration
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Synchronize repositories, branches, commits, and pull requests from your GitHub App installation.
            </p>
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-[#0f173b]/60 border border-slate-800/80 flex items-center justify-center min-h-[200px]">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span>Loading installations...</span>
          </div>
        </div>
      </div>
    );
  }

  if (installationsError) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              <ShieldCheck className="w-6 h-6 text-accent-light mr-2" />
              GitHub Integration
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Synchronize repositories, branches, commits, and pull requests from your GitHub App installation.
            </p>
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Failed to load installations</h3>
              <p className="text-xs text-slate-400">{installationsError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-accent-light" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">GitHub</h1>
            <p className="text-sm text-slate-300 mt-1">
              Monitor repositories and development activities from your GitHub App installation directly within PMS.
            </p>
          </div>
        </div>

        {isPM && (
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
              isActive ? 'bg-accent/10 border-accent/50 text-accent-light' : 'bg-slate-800/40 border-slate-700/60 text-slate-300'
            }`}>
              <span className="text-xs font-medium">{isActive ? 'Connected' : 'Not Connected'}</span>
            </div>
            {isActive && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-700/60 text-slate-300">
                <span className="text-xs font-mono text-slate-400 mr-1">ID:</span>
                <span className="text-xs font-mono text-white truncate max-w-xs">{selectedInstallationId}</span>
              </div>
            )}
            <button
              type="button"
              onClick={fetchInstallations}
              disabled={installationsLoading}
              className="px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                installationsLoading
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-lg shadow-accent/25'
              } disabled:opacity-50"
            >
              {installationsLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-1">Refresh</span>
            </button>
          </div>
        )}
      </div>

      {/* Installation result message */}
      {installReturnMessage && (
        <div className="p-4 rounded-xl flex items-center gap-3">
          {installReturnType === 'success' ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl flex-1">
                <h4 className="text-xs font-bold text-emerald-300">Installation activated</h4>
                <p className="text-[10px] text-emerald-200 mt-0.5">{installReturnMessage}</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-rose-400" />
              <div className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl flex-1">
                <h4 className="text-xs font-bold text-rose-300">Installation failed</h4>
                <p className="text-[10px] text-rose-200 mt-0.5">{installReturnMessage}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Connection status notice */}
      {!hasInstallation || !isActive && isPM && (
        <div className="p-6 rounded-xl border-2 border-dashed border-slate-800/60 bg-slate-900/30 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">No GitHub installation found</h4>
          <p className="text-xs text-slate-400 mb-4">
            Your workspace does not have a connected GitHub App installation. A Project Manager must complete
            the GitHub App installation flow first.
          </p>
          {GITHUB_APP_URL ? (
            installationStateLoading ? (
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-400 cursor-not-allowed">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Preparing installation...</span>
              </div>
            ) : installationStateError ? (
              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30">
                <AlertCircle className="w-4 h-4 text-rose-400 mr-2" />
                <span className="text-xs text-rose-300">{installationStateError}</span>
              </div>
            ) : installationUrl ? (
              <a
                href={installationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-hover text-white text-xs font-bold transition-all hover:shadow-accent/25"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Open GitHub App Installation</span>
              </a>
            ) : (
              <a
                href={GITHUB_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-hover text-white text-xs font-bold transition-all hover:shadow-accent/25"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Open GitHub App Installation</span>
              </a>
            )
          ) : (
            <div className="p-3 rounded-xl bg-accent-soft/10 border border-accent/20">
              <Info className="w-4 h-4 text-accent-light mr-2" />
              <span className="text-xs text-accent-light">
                GitHub App installation URL not configured. Set {`VITE_GITHUB_APP_URL`} to enable the
                installation link, or complete the callback flow directly through GitHub.
              </span>
            </div>
          )}
          {isPM && (
            <div className="mt-6 p-6 rounded-xl border-2 border-dashed border-slate-800/60 bg-slate-900/30">
              <h4 className="text-sm font-bold text-white mb-4">
                <Zap className="w-4 h-4 mr-2" />
                Connect Existing GitHub App Installation
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                If you already installed the PMS GitHub App, enter your installation ID to connect it to this workspace.
              </p>
              <form onSubmit={handleConnectInstallation} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    GitHub Installation ID
                  </label>
                  <input
                    type="text"
                    value={connectInstallationId}
                    onChange={(e) => setConnectInstallationId(e.target.value)}
                    placeholder="e.g. 179588466"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-accent focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={connectLoading || !connectInstallationId.trim()}
                  className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-hover text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connectLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </span>
                  ) : (
                    'Connect Installation'
                  )}
                </button>
                {connectError && (
                  <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30">
                    <AlertCircle className="w-4 h-4 text-rose-400 mr-2" />
                    <span className="text-xs text-rose-300">{connectError}</span>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      )}

      {/* Four summary cards */}
      {hasInstallation && isActive && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const CardIcon = card.icon;
            const isSelected = activeSection === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveSection(card.id)}
                className={`group relative flex flex-col p-5 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'bg-accent/10 border-accent/50 shadow-lg shadow-accent/20'
                    : 'bg-[#0f173b]/40 border-slate-800/60 hover:border-slate-600 hover:bg-[#0f173b]/60'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                  isSelected
                    ? `bg-accent/20 border border-accent/30 ${card.color}`
                    : `${card.bg} ${card.border} text-slate-400 group-hover:text-slate-300 group-hover:border-slate-600`
                }`}>
                  <CardIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold mb-1 ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                    {card.title}
                  </h3>
                  <p className="text-2xl font-bold text-white">{card.count}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{card.subtitle}</p>
                </div>
                {isSelected && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent border-2 border-[#070b19]" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Dynamic content section */}
      {hasInstallation && isActive && sectionActive && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">{cards.find((c) => c.id === activeSection)?.title}</h2>
            {activeSection === 'repositories' && (
              <button
                type="button"
                onClick={handleSyncRepositories}
                disabled={repoSync.loading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  repoSync.loading
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-lg shadow-accent/25'
                } disabled:opacity-50"
              >
                {repoSync.loading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Zap className="w-3 h-3" />
                )}
                <span className="ml-1">{repoSync.loading ? 'Syncing...' : 'Sync Repositories'}</span>
              </button>
            )}
            {activeSection === 'branches' && (
              <button
                type="button"
                onClick={handleSyncBranches}
                disabled={branchSync.loading || !selectedInstallationId}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  branchSync.loading || !selectedInstallationId
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-lg shadow-accent/25'
                } disabled:opacity-50"
              >
                {branchSync.loading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Zap className="w-3 h-3" />
                )}
                <span className="ml-1">{branchSync.loading ? 'Syncing...' : 'Sync Branches'}</span>
              </button>
            )}
            {activeSection === 'commits' && (
              <button
                type="button"
                onClick={handleSyncCommits}
                disabled={commitSync.loading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  commitSync.loading
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-lg shadow-accent/25'
                } disabled:opacity-50"
              >
                {commitSync.loading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Zap className="w-3 h-3" />
                )}
                <span className="ml-1">{commitSync.loading ? 'Syncing...' : 'Sync Commits'}</span>
              </button>
            )}
            {activeSection === 'pull-requests' && (
              <button
                type="button"
                onClick={handleSyncPullRequests}
                disabled={prSync.loading || !selectedInstallationId || !selectedRepositoryId}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  prSync.loading || !selectedInstallationId || !selectedRepositoryId
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-lg shadow-accent/25'
                } disabled:opacity-50"
              >
                {prSync.loading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Zap className="w-3 h-3" />
                )}
                <span className="ml-1">{prSync.loading ? 'Syncing...' : 'Sync Pull Requests'}</span>
              </button>
            )}
          </div>

          {activeSection === 'repositories' && (
            <RepositoriesSection
              repositories={filteredRepositories}
              repositoriesLoading={repositoriesLoading}
              repoSearch={repoSearch}
              setRepoSearch={setRepoSearch}
              repoSync={repoSync}
              handleSelectRepository={handleSelectRepository}
              formatDate={formatDate}
            />
          )}

          {activeSection === 'branches' && (
            <BranchesSection
              branches={filteredBranches}
              branchesLoading={branchesLoading}
              branchSearch={branchSearch}
              setBranchSearch={setBranchSearch}
              branchSync={branchSync}
              formatDate={formatDate}
            />
          )}

          {activeSection === 'commits' && (
            <CommitsSection
              commits={filteredCommits}
              commitsLoading={commitsLoading}
              commitSearch={commitSearch}
              setCommitSearch={setCommitSearch}
              commitSync={commitSync}
            />
          )}

          {activeSection === 'pull-requests' && (
            <PullRequestsSection
              pullRequests={filteredPullRequests}
              pullRequestsLoading={pullRequestsLoading}
              prSearch={prSearch}
              setPrSearch={setPrSearch}
              prPage={prPage}
              prTotalPages={prTotalPages}
              prTotalCount={prTotalCount}
              prSync={prSync}
              handleFetchPullRequests={handleFetchPullRequests}
              formatDate={formatDate}
            />
          )}
        </>
      )}

      {/* Role notice */}
      {!isPM && (
        <div className="p-4 rounded-xl bg-accent-soft/10 border border-accent/20">
          <div className="flex items-center gap-2 text-xs text-accent-light">
            <Info className="w-3 h-3" />
            <span>
              GitHub synchronization actions are restricted to Project Manager role. Your current role is{" "}
              <span className="font-semibold">{currentUserRole}</span>.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Section Components
   ============================================================================ */

interface RepositoriesSectionProps {
  repositories: GitHubRepository[];
  repositoriesLoading: boolean;
  repoSearch: string;
  setRepoSearch: (val: string) => void;
  repoSync: SyncState;
  handleSelectRepository: (repo: GitHubRepository) => void;
  formatDate: (dateStr: string | null | undefined) => string;
}

function RepositoriesSection({
  repositories,
  repositoriesLoading,
  repoSearch,
  setRepoSearch,
  repoSync,
  handleSelectRepository,
  formatDate,
}: RepositoriesSectionProps) {
  return (
    <div className="space-y-4">
      {repoSync.error && (
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{repoSync.error}</span>
        </div>
      )}
      {repoSync.summary && repoSync.success && (
        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {repoSync.summary.upserted} repository{repoSync.summary.upserted !== 1 ? 'ies' : ''} synchronized
            {repoSync.summary.truncated ? ' (results truncated)' : ''}
          </span>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search repositories..."
          value={repoSearch}
          onChange={(e) => setRepoSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:border-accent focus:outline-none"
        />
      </div>

      {repositoriesLoading ? (
        <div className="h-32 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      ) : repositories.length === 0 ? (
        <div className="p-8 rounded-xl border-2 border-dashed border-slate-800/60 bg-slate-900/30 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Database className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">No repositories found</h4>
          <p className="text-xs text-slate-400">
            Click "Sync Repositories" to fetch repository metadata from GitHub.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Full Name</th>
                <th className="py-2.5 px-3">Visibility</th>
                <th className="py-2.5 px-3">Default Branch</th>
                <th className="py-2.5 px-3">Last Updated</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {repositories.map((repo) => (
                <tr
                  key={repo.github_repo_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRepository(repo);
                  }}
                  className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-3">
                    <span className="text-sm font-medium text-white truncate">{repo.name}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-400 truncate max-w-xs">
                    {repo.full_name}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                        repo.private
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {repo.private ? 'Private' : 'Public'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300 font-mono truncate max-w-xs">
                    {repo.default_branch || '—'}
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    {formatDate(repo.github_updated_at)}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectRepository(repo);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-accent-light hover:text-accent hover:bg-accent/10"
                    >
                      <ArrowRight className="w-3 h-3" />
                      <span className="ml-1">Select</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface BranchesSectionProps {
  branches: GitHubBranch[];
  branchesLoading: boolean;
  branchSearch: string;
  setBranchSearch: (val: string) => void;
  branchSync: SyncState;
  formatDate: (dateStr: string | null | undefined) => string;
}

function BranchesSection({
  branches,
  branchesLoading,
  branchSearch,
  setBranchSearch,
  branchSync,
  formatDate,
}: BranchesSectionProps) {
  return (
    <div className="space-y-4">
      {branchSync.error && (
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{branchSync.error}</span>
        </div>
      )}
      {branchSync.summary && branchSync.success && (
        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {branchSync.summary.upserted} branch{branchSync.summary.upserted !== 1 ? 'es' : ''} synchronized
            {branchSync.summary.truncated ? ' (results truncated)' : ''}
          </span>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search branches..."
          value={branchSearch}
          onChange={(e) => setBranchSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:border-accent focus:outline-none"
        />
      </div>

      {branchesLoading ? (
        <div className="h-32 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      ) : branches.length === 0 ? (
        <div className="p-8 rounded-xl border-2 border-dashed border-slate-800/60 bg-slate-900/30 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <GitBranch className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">No branches found</h4>
          <p className="text-xs text-slate-400">
            Click "Sync Branches" to fetch branch metadata from GitHub.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Branch Name</th>
                <th className="py-2.5 px-3">Commit SHA</th>
                <th className="py-2.5 px-3">Protected</th>
                <th className="py-2.5 px-3">Last Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {branches.map((branch) => (
                <tr key={`${branch.repository_id}-${branch.branch_name}`}>
                  <td className="py-3 px-3">
                    <span className="text-sm font-medium text-white truncate">{branch.branch_name}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-400 font-mono truncate">
                    {branch.commit_sha}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                        branch.protected
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {branch.protected ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    {formatDate(branch.last_synced_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface CommitsSectionProps {
  commits: GitHubCommit[];
  commitsLoading: boolean;
  commitSearch: string;
  setCommitSearch: (val: string) => void;
  commitSync: SyncState;
}

function CommitsSection({
  commits,
  commitsLoading,
  commitSearch,
  setCommitSearch,
  commitSync,
}: CommitsSectionProps) {
  return (
    <div className="space-y-4">
      {commitSync.error && (
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{commitSync.error}</span>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search commits..."
          value={commitSearch}
          onChange={(e) => setCommitSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:border-accent focus:outline-none"
        />
      </div>

      {commitsLoading ? (
        <div className="h-32 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      ) : commits.length === 0 ? (
        <div className="p-8 rounded-xl border-2 border-dashed border-slate-800/60 bg-slate-900/30 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <GitCommit className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">No commits found</h4>
          <p className="text-xs text-slate-400">
            Click "Sync Commits" to fetch commit metadata from GitHub.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">SHA</th>
                <th className="py-2.5 px-3">Message</th>
                <th className="py-2.5 px-3">Author</th>
                <th className="py-2.5 px-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {commits.map((c) => (
                <tr key={c.id || c.commit_sha}>
                  <td className="py-3 px-3 font-mono">
                    {c.commit_sha.slice(0, 7)}
                  </td>
                  <td className="py-3 px-3 truncate max-w-md">{c.message || '-'}</td>
                  <td className="py-3 px-3">{c.author_name || 'Unknown'}</td>
                  <td className="py-3 px-3">
                    {c.author_date ? new Date(c.author_date).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PullRequestsSectionProps {
  pullRequests: GitHubPullRequest[];
  pullRequestsLoading: boolean;
  prSearch: string;
  setPrSearch: (val: string) => void;
  prPage: number;
  prTotalPages: number;
  prTotalCount: number;
  prSync: SyncState;
  handleFetchPullRequests: (page: number) => void;
  formatDate: (dateStr: string | null | undefined) => string;
}

function PullRequestsSection({
  pullRequests,
  pullRequestsLoading,
  prSearch,
  setPrSearch,
  prPage,
  prTotalPages,
  prTotalCount,
  prSync,
  handleFetchPullRequests,
  formatDate,
}: PullRequestsSectionProps) {
  return (
    <div className="space-y-4">
      {prSync.error && (
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{prSync.error}</span>
        </div>
      )}
      {prSync.summary && prSync.success && (
        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {prSync.summary.upserted} pull request{prSync.summary.upserted !== 1 ? 's' : ''} synchronized
            {prSync.summary.truncated ? ' (results truncated)' : ''}
          </span>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search pull requests..."
          value={prSearch}
          onChange={(e) => setPrSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:border-accent focus:outline-none"
        />
      </div>

      {pullRequestsLoading ? (
        <div className="h-32 flex items-center justify-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      ) : pullRequests.length === 0 ? (
        <div className="p-8 rounded-xl border-2 border-dashed border-slate-800/60 bg-slate-900/30 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <GitPullRequest className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">No pull requests found</h4>
          <p className="text-xs text-slate-400">
            Click "Sync Pull Requests" to fetch PR metadata from GitHub.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">PR Number</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">State</th>
                  <th className="py-2.5 px-3">Author</th>
                  <th className="py-2.5 px-3 text-right">Last Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {pullRequests.map((pr) => (
                  <tr key={pr.github_pr_id}>
                    <td className="py-3 px-3">
                      <span className="text-sm font-medium text-white">#{pr.pr_number}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-300 truncate max-w-md">
                      <a
                        href={pr.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-light hover:text-accent underline underline-offset-2"
                      >
                        {pr.title}
                      </a>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          pr.state === 'open'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {pr.state}{pr.draft ? ' (draft)' : ''}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 truncate max-w-xs">
                      {pr.author_login || pr.author_github_id || 'Unknown'}
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-right">
                      {formatDate(pr.last_synced_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {prTotalCount > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Showing {pullRequests.length} of {prTotalCount} pull requests
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFetchPullRequests(Math.max(1, prPage - 1))}
                  disabled={prPage <= 1 || pullRequestsLoading}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3 h-3 rotate-180" />
                </button>
                <span className="px-2">Page {prPage} of {prTotalPages}</span>
                <button
                  type="button"
                  onClick={() => handleFetchPullRequests(Math.min(prTotalPages, prPage + 1))}
                  disabled={prPage >= prTotalPages || pullRequestsLoading}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
