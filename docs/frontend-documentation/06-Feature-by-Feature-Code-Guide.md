# Document 6: Feature-by-Feature Code and Workflow Guide

This document is a complete walkthrough of every page, modal, and feature in the **PMS Frontend**. It explains the source files, component logic, state interactions, limitations, and manual test steps.

---

## 1. Authentication and Sign-Out

### 1. Source Files
- `src/components/LoginPage.tsx`
- `src/App.tsx` (`handleLogin`, `handleLogout`)

### 2. Relevant Functions
- `handleLogin(signedInEmail: string)`
- `handleLogout()`
- `handleQuickRoleSelect(role, email)`

### 3. What the User Sees
A dark navy login screen featuring email/password input fields and three quick-role preset buttons:
- **Project Manager** (`alex.morgan@pmsworkspace.io`)
- **Team Leader** (`marcus.chen@pmsworkspace.io`)
- **Team Member** (`sofia.rodriguez@pmsworkspace.io`)

### 4. What Happens on User Action
- Clicking any role button fills the credentials and signs in automatically.
- Submitting the form calls `onLogin(email)`.
- In `App.tsx`, `handleLogin` finds the matching `TeamMember` by email, synchronizes `userProfile`, and sets `isAuthenticated(true)`.
- Clicking "Sign Out" in the dashboard profile menu calls `onLogout()`, setting `isAuthenticated(false)` and returning to `LoginPage`. In-memory projects and tasks are preserved.

### 5. Data Flow & Communication
- Reads `INITIAL_TEAM_MEMBERS` from `App.tsx`.
- Updates `isAuthenticated` and `userProfile` in `App.tsx`.

### 6. Limitations & Notes
- Authentication is purely client-side simulation. No backend token or hashed password is sent over the network.

### 7. How to Test Manually
1. Log out from the top-right profile dropdown.
2. Verify that `LoginPage` appears.
3. Click "Sign in as Team Leader". Verify the dashboard header reflects "Team Leader" and user name "Marcus Chen".

---

## 2. Dashboard Overview

### 1. Source Files
- `src/components/DashboardLayout.tsx` (lines 573–1250)

### 2. Relevant Functions
- `summaryStats`: Computes counts for total projects, total tasks, in-progress, completed, under-review, and overdue tasks.
- `realRecentActivities`: Computes activity items directly from `task.reviewHistory` and current task statuses.

### 3. What the User Sees
- Welcome banner with role badge.
- 6 Metric Cards: Total Projects, Total Tasks, In Progress, Completed Tasks, Under Review, Overdue Tasks.
- Quick Actions: "Create Project", "Add Task", "Invite Member".
- Recent Activity Feed: Real recorded events showing approvals, submissions, and correction requests.
- Active Projects Grid: Quick-access project cards.

### 4. What Happens on User Action
- Clicking "Create Project" or "Add Task" opens their respective creation modals.
- Clicking a project card opens `ProjectDetailsPage`.

### 5. Manual Test Steps
1. Navigate to Dashboard.
2. Note the "Completed Tasks" number.
3. Approve an Under Review task in `TaskReviewModal`.
4. Return to Dashboard; verify the "Completed Tasks" count has incremented by 1.

---

## 3. Projects Catalog (`ProjectsPage.tsx`)

### 1. Source Files
- `src/components/ProjectsPage.tsx`
- `src/App.tsx` (`handleAddProject`)

### 2. What the User Sees
- Project cards with status tags (*In Progress*, *Planning*, *Completed*), deadline dates, progress percentage bars, and manager avatar.
- Search input and status filter dropdown.
- "New Project" button.

### 3. What Happens on User Action
- Clicking "New Project" opens a modal requiring name, description, priority, deadline, and manager.
- Clicking "Create Project" invokes `onAddProject(newProject)`:
  ```typescript
  const handleAddProject = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
  };
  ```
- The new project appears at the top of the list immediately.
- Clicking any project card calls `onSelectProject(project)`, opening `ProjectDetailsPage`.

---

## 4. Project Details (`ProjectDetailsPage.tsx`)

### 1. Source Files
- `src/components/ProjectDetailsPage.tsx`

### 2. What the User Sees
- Detailed header for the selected project with back button (`← Back to Projects`).
- Project statistics (total tasks, completion percentage, deadline, priority).
- Filterable table of all tasks associated with this project (`projectId`).
- "Add Task" button scoped to this project.

### 3. What Happens on User Action
- Clicking "Add Task" opens a task creation modal with the project pre-selected.
- Clicking any task row opens `TaskReviewModal` for review and status progression.
- Clicking "Back to Projects" resets `selectedProject` in `DashboardLayout.tsx`.

---

## 5. Tasks Management (`TasksPage.tsx`)

### 1. Source Files
- `src/components/TasksPage.tsx`
- `src/App.tsx` (`handleAddTask`, `handleUpdateTask`)

### 2. What the User Sees
- Master task catalog displaying task title, associated project badge, assignee avatar/name, deadline, priority badge, and status badge (*Not Started*, *In Progress*, *Under Review*, *Completed*).
- Filter controls: Search by title, filter by Project, filter by Assignee, filter by Status, filter by Priority.
- "Add Task" button.

### 3. What Happens on User Action
- Clicking "Add Task" opens a modal to assign a team member, choose a project, set a deadline, and set priority.
- Submitting calls `onAddTask(newTask)`.
- Clicking any task card/row opens `TaskReviewModal` with complete audit history and role actions.

---

## 6. Team Directory (`TeamPage.tsx`)

### 1. Source Files
- `src/components/TeamPage.tsx`
- `src/App.tsx` (`handleAddMember`, `handleUpdateMember`, `handleRemoveMember`)

### 2. What the User Sees
- Cards for every team member showing avatar initials, name, role badge, department, email, and number of active tasks assigned.
- "Add Member" button.
- "Edit" and "Delete" buttons on each member card.

### 3. What Happens on User Action
- **Add Member**: Adds a new `TeamMember` object to `teamMembers` in `App.tsx`.
- **Edit Member**: Updates name, role, department, and recalculates avatar initials.
- **Delete Member**: Removes the member from `teamMembers`. If tasks were assigned to this member, the tasks remain intact with their existing assignment name.

---

## 7. Multi-Stage Review and Approval (`TaskReviewModal.tsx`)

### 1. Source Files
- `src/components/TaskReviewModal.tsx`

### 2. Four Modal Tabs
1. **Workflow Tab**:
   - Displays current task status, TL recommendation tag, review feedback, and action controls.
   - **Team Member Controls**: "Submit for Review" or "Submit Live Demo".
   - **Team Leader Controls**: "Request Corrections" (returns status to `In Progress`) or "Recommend Approval" (sets `tlRecommendation = 'recommended'`).
   - **Project Manager Controls**: "Request Corrections" or "Grant Final Approval" (sets status to `Completed`).
2. **Comments Tab**:
   - Threaded discussion log. Any role can post comments with timestamps and author initials.
3. **Attachments Tab**:
   - File uploader supporting documents, images, and archives.
   - Validates file size (≤ 15MB) and blocks executable extensions (`.exe`, `.bat`, `.cmd`, `.sh`, `.js`).
4. **History Tab**:
   - Chronological audit log showing every submission, recommendation, correction request, and approval with actor names and timestamps.

### 3. Strict Governance Enforcement
```typescript
// TaskReviewModal.tsx
if (actionType === 'final_approve') {
  if (!isProjectManager) {
    setActionNotice('Permission Denied: Only Project Managers can grant final approval and complete tasks.');
    return;
  }
  updatedStatus = 'Completed';
  // ...
}
```
Only a user with `currentUserRole === 'Project Manager'` can successfully complete a task.

---

## 8. Live Demo Submission (`TaskReviewModal.tsx`)

### 1. Source Files
- `src/components/TaskReviewModal.tsx` (`handleSubmitFormalDemo`)

### 2. Form Requirements
- **Live Demo URL**: Must be a valid URL starting with `http://` or `https://` (validated via `new URL()`).
- **Description**: Summary of completed deliverables.
- **Screenshots**: Image files (≤ 10MB each).
- **Video Walkthrough**: Supported video format (`.mp4`, `.webm`, `.mov`, ≤ 50MB).
- **Documentation**: Attached specs or test results (≤ 15MB each).

### 3. Submission Flow
Submitting transitions the task to `Under Review`, attaches the `DemoSubmission` object, and appends a `submit` entry to the task's `reviewHistory`.

---

## 9. Notifications Inbox (`NotificationsPage.tsx`)

### 1. Source Files
- `src/components/NotificationsPage.tsx`
- `src/components/DashboardLayout.tsx` (`computedNotifications`)

### 2. What the User Sees
- List of alert notifications categorized by severity (*info*, *success*, *warning*, *error*).
- Filter buttons: "All" vs. "Unread".
- Action buttons: "Mark as Read", "Mark as Unread", and "Mark All as Read".
- Top bar bell badge displays real unread counter.

---

## 10. Reports and Analytics (`ReportsPage.tsx`)

### 1. Source Files
- `src/components/ReportsPage.tsx`

### 2. What the User Sees
- **KPI Summary**: Overall Project Health, Average Progress Rate, Completed Deliverables, Overdue Warning.
- **Project Progress Comparison**: Visual progress bars comparing all active projects.
- **Task Status Distribution**: Visual ratio bars for Completed, Under Review, In Progress, and Not Started tasks.
- **Team Workload Breakdown**: Displays each team member's total assigned tasks, completed count, and pending tasks.

---

## 11. Settings & Profile Synchronization (`SettingsPage.tsx`)

### 1. Source Files
- `src/components/SettingsPage.tsx`
- `src/App.tsx` (`handleUpdateProfile`)

### 2. Three Settings Tabs
1. **User Profile**:
   - Edit Name, Email, and Department.
   - **Role Protection**: The Role dropdown is locked/disabled (`disabled`) so users cannot arbitrarily escalate their own privileges.
   - **Automatic Synchronization**: Saving updates `userProfile`, updates the matching member in `teamMembers`, and updates the assignee name across all matching tasks.
2. **Notification Preferences**:
   - Toggles for Task Deadlines, Review Updates, Correction Requests, and Task Completion.
3. **Appearance**:
   - Theme toggle: **Dark Mode** vs. **Light Mode**.
   - Accent color: Purple, Indigo, Emerald, or Blue.
   - Compact mode toggle.
