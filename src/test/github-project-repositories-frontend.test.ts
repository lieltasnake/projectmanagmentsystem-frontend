// No-database static tests for project-level GitHub repository connection frontend (Priority 1).
// Reads source files only. Does not connect to PostgreSQL, execute SQL/migrations, or call GitHub APIs.

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

let passed = 0;
let failed = 0;

async function run(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`FAIL: ${name}\n  ${err?.stack || err?.message || err}`);
  }
}

async function main(): Promise<void> {
  const api = readSource('src/services/api.ts');
  const page = readSource('src/components/ProjectDetailsPage.tsx');

  // ---------- 1. API functions exist ----------
  async function testApiFunctionsExist() {
    assert.ok(
      api.includes('export async function getProjectGitHubRepositories('),
      'getProjectGitHubRepositories function not found in api.ts'
    );
    assert.ok(
      api.includes('export async function connectProjectGitHubRepo('),
      'connectProjectGitHubRepo function not found in api.ts'
    );
    assert.ok(
      api.includes('export async function disconnectProjectGitHubRepo('),
      'disconnectProjectGitHubRepo function not found in api.ts'
    );
  }

  // ---------- 2. API types exist ----------
  async function testApiTypesExist() {
    assert.ok(
      api.includes('export interface ProjectGitHubRepository'),
      'ProjectGitHubRepository interface not found in api.ts'
    );
    assert.ok(
      api.includes('export interface ProjectGitHubRepositoriesResponse'),
      'ProjectGitHubRepositoriesResponse interface not found in api.ts'
    );
    assert.ok(
      api.includes('export interface ConnectProjectGitHubRepoResponse'),
      'ConnectProjectGitHubRepoResponse interface not found in api.ts'
    );
  }

  // ---------- 3. API endpoints are correct ----------
  async function testApiEndpoints() {
    assert.ok(
      api.includes("/projects/${projectId}/github/repositories"),
      'GET /projects/:projectId/github/repositories endpoint not found'
    );
    assert.ok(
      api.includes("/projects/${projectId}/github/repositories/connect"),
      'POST /projects/:projectId/github/repositories/connect endpoint not found'
    );
    assert.ok(
      api.includes("/projects/${projectId}/github/repositories/${githubRepoId}/disconnect"),
      'DELETE /projects/:projectId/github/repositories/:githubRepoId/disconnect endpoint not found'
    );
  }

  // ---------- 4. GitHub tab exists in ProjectDetailsPage ----------
  async function testGithubTabExists() {
    assert.ok(
      page.includes("type TabId = 'overview' | 'tasks' | 'team' | 'github'"),
      'GitHub tab id not added to TabId type'
    );
    assert.ok(
      page.includes("{ id: 'github', label: 'GitHub', icon: GitBranch }"),
      'GitHub tab not added to tabs array'
    );
  }

  // ---------- 5. GitHub state management exists ----------
  async function testGithubStateExists() {
    assert.ok(
      page.includes("useState<ProjectGitHubRepository[]>([])"),
      'githubConnectedRepos state not found'
    );
    assert.ok(
      page.includes("useState<GitHubRepository[]>([])"),
      'githubAvailableRepos state not found'
    );
    assert.ok(
      page.includes("useState<GitHubInstallation[]>([])"),
      'githubInstallations state not found'
    );
  }

  // ---------- 6. GitHub functions exist ----------
  async function testGithubFunctionsExist() {
    assert.ok(
      page.includes('const fetchGithubInstallations = useCallback'),
      'fetchGithubInstallations function not found'
    );
    assert.ok(
      page.includes('const fetchInstallationRepositories = useCallback'),
      'fetchInstallationRepositories function not found'
    );
    assert.ok(
      page.includes('const fetchProjectGithubRepos = useCallback'),
      'fetchProjectGithubRepos function not found'
    );
    assert.ok(
      page.includes('const handleConnectRepo = async'),
      'handleConnectRepo function not found'
    );
    assert.ok(
      page.includes('const handleDisconnectRepo = ('),
      'handleDisconnectRepo function not found'
    );
    assert.ok(
      page.includes('const handleConfirmDisconnect = async'),
      'handleConfirmDisconnect function not found'
    );
  }

  // ---------- 7. Connect logic ----------
  async function testConnectLogic() {
    assert.ok(
      page.includes('await connectProjectGitHubRepo(project.id, githubRepoToConnect.github_repo_id)'),
      'connectProjectGitHubRepo API call not found'
    );
    assert.ok(
      page.includes('setConnectDialogOpen(false)'),
      'connect dialog close not found'
    );
    assert.ok(
      page.includes('await fetchProjectGithubRepos()'),
      'refresh connect repos list not found'
    );
  }

  // ---------- 8. Disconnect logic ----------
  async function testDisconnectLogic() {
    assert.ok(
      page.includes('disconnectProjectGitHubRepo(project.id, githubRepoToDisconnect.githubRepoId)'),
      'disconnectProjectGitHubRepo API call not found'
    );
    assert.ok(
      page.includes('setDisconnectDialogOpen(false)'),
      'disconnect dialog close not found'
    );
    assert.ok(
      page.includes('await fetchProjectGithubRepos()'),
      'refresh disconnect repos list not found'
    );
  }

  // ---------- 9. Filter inactive connections ----------
  async function testInactiveConnectionsFiltered() {
    const routes = readSource('server/src/routes/projects.ts');
    assert.ok(
      routes.includes("WHERE pgr.project_id = $1"),
      'backend list route queries by project_id'
    );
    assert.ok(
      routes.includes("AND pgr.is_active = TRUE"),
      'backend filters to active connections only'
    );
    assert.ok(
      page.includes('.filter((repo) => repo.is_active)'),
      'frontend filters to active connections only'
    );
  }

  // ---------- 10. Role-based access ----------
  async function testRoleBasedAccess() {
    assert.ok(
      page.includes('const isPM = currentUserRole === \'Project Manager\''),
      'isPM role check not found'
    );
    assert.ok(
      page.includes('{isPM && githubSelectedInstallationId && githubAvailableRepos.length > 0 && ('),
      'PM-only connect UI condition not found'
    );
    assert.ok(
      page.includes('{isPM ? ('),
      'PM-only disconnect button condition not found'
    );
    assert.ok(
      page.includes('{!isPM && ('),
      'read-only role notice condition not found'
    );
  }

  // ---------- 10. GitHub tab rendering ----------
  async function testGithubTabRendering() {
    assert.ok(
      page.includes("{activeTab === 'github' && ("),
      'GitHub tab content block not found'
    );
    assert.ok(
      page.includes('Connected Repositories'),
      'connected repositories heading not found'
    );
    assert.ok(
      page.includes('Connect Repository'),
      'connect repository section not found'
    );
    assert.ok(
      page.includes('No connected repositories'),
      'empty state not found'
    );
    assert.ok(
      page.includes('No GitHub installation'),
      'no installation notice not found'
    );
  }

  await run('API functions exist', testApiFunctionsExist);
  await run('API types exist', testApiTypesExist);
  await run('API endpoints are correct', testApiEndpoints);
  await run('GitHub tab exists in ProjectDetailsPage', testGithubTabExists);
  await run('GitHub state management exists', testGithubStateExists);
  await run('GitHub functions exist', testGithubFunctionsExist);
  await run('Connect logic exists', testConnectLogic);
  await run('Disconnect logic exists', testDisconnectLogic);
  await run('Inactive connections filtered', testInactiveConnectionsFiltered);
  await run('Role-based access exists', testRoleBasedAccess);
  await run('GitHub tab rendering exists', testGithubTabRendering);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
