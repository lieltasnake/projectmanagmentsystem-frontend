# Document 11: Frontend Manual Testing and Quality Assurance Guide

This document provides a systematic test matrix and manual test checklist covering every workflow, page, and security boundary in the **PMS Frontend**.

---

## 1. Automated Verification Checks

Both automated build verification commands have been executed in this workspace:

- [x] **TypeScript Strict Compilation Check (`npx tsc --noEmit`)**:
  - **Result**: Passed with Exit Code `0`. Zero type errors.
- [x] **Production Bundle Build (`npm run build`)**:
  - **Result**: Passed with Exit Code `0`. Vite generated optimized production assets in `dist/` in 4.12s.

---

## 2. Comprehensive Test Checklist

### Category 1: Authentication and Session State

- [x] **Test 1.1: Quick-Role Switcher on Login Page**
  - **Steps**:
    1. Navigate to login screen (`onLogout()`).
    2. Click the "Project Manager" card.
  - **Expected Result**: Logs in immediately as Alex Morgan (Project Manager).
  - **Actual Behavior**: Passed.

- [x] **Test 1.2: Session Persistence Across Sign-Out**
  - **Steps**:
    1. Create a new task or project.
    2. Click the user profile dropdown in the top header and click "Sign Out".
    3. Sign back in using any role.
  - **Expected Result**: Created tasks/projects remain present in memory.
  - **Actual Behavior**: Passed. State in `src/App.tsx` remains mounted during sign-out.

- [ ] **Test 1.3: Browser Refresh Reset Behavior**
  - **Steps**:
    1. Create a task or modify a profile name.
    2. Press `F5` or `Ctrl + R` to reload the page.
  - **Expected Result**: Page resets to initial sample constants (`INITIAL_PROJECTS`, `INITIAL_TASKS`).
  - **Limitation**: In-memory state does not persist to a database or local storage.

---

### Category 2: Navigation and Layout

- [x] **Test 2.1: Sidebar Tab Navigation**
  - **Steps**:
    1. Click each sidebar item: *Dashboard*, *Projects*, *Tasks*, *Team*, *Notifications*, *Reports*, *Settings*.
  - **Expected Result**: Content area switches to the corresponding page without full-page reloads. Active tab displays purple highlight.
  - **Actual Behavior**: Passed.

- [x] **Test 2.2: Project Drill-Down and Back Navigation**
  - **Steps**:
    1. Navigate to *Projects*.
    2. Click on "Pixel Addis Core Platform".
  - **Expected Result**: `ProjectDetailsPage` renders with specific tasks for that project.
  - **Steps**:
    3. Click "← Back to Projects".
  - **Expected Result**: Returns to the main `ProjectsPage` grid.
  - **Actual Behavior**: Passed.

- [x] **Test 2.3: Mobile Navigation Drawer**
  - **Steps**:
    1. Resize browser window to mobile width (<768px).
    2. Click hamburger menu icon (`Menu`).
  - **Expected Result**: Sidebar slides open. Clicking a navigation link switches views and closes the drawer.
  - **Actual Behavior**: Passed.

---

### Category 3: Task Review, Recommendation, and Approval Workflow

- [x] **Test 3.1: Team Member Submits Task Deliverable**
  - **Steps**:
    1. Switch active role to **Team Member** (via login or role selector).
    2. Open a task with status `Not Started` or `In Progress`.
    3. Click "Submit for Review".
  - **Expected Result**: Task status transitions to `Under Review`. `tlRecommendation` is cleared. A new entry appears in the History tab.
  - **Actual Behavior**: Passed.

- [x] **Test 3.2: Formal Live Demo Submission with URL Validation**
  - **Steps**:
    1. In `TaskReviewModal` (as Team Member), click "Submit Live Demo".
    2. Try submitting with an empty URL.
    3. Try submitting with an invalid string (e.g. `ftp://` or `just-text`).
    4. Enter `https://preview.pmsworkspace.io/demo` and a description, then submit.
  - **Expected Result**:
    - Empty/invalid strings show an inline validation error.
    - Valid URL transitions task to `Under Review` and saves `demoSubmission`.
  - **Actual Behavior**: Passed.

- [x] **Test 3.3: Team Leader Requests Corrections**
  - **Steps**:
    1. Switch active role to **Team Leader**.
    2. Open an `Under Review` task.
    3. Type feedback (e.g. "Fix navigation drawer") and click "Request Corrections".
  - **Expected Result**: Task status returns to `In Progress`. `tlRecommendation` is set to `corrections_requested`.
  - **Actual Behavior**: Passed.

- [x] **Test 3.4: Team Leader Recommends Approval**
  - **Steps**:
    1. As **Team Leader**, open an `Under Review` task.
    2. Click "Recommend Approval".
  - **Expected Result**: Task remains `Under Review`. `tlRecommendation` is set to `recommended`. Team Leader cannot mark the task as `Completed`.
  - **Actual Behavior**: Passed.

- [x] **Test 3.5: Project Manager Final Approval (Strict Governance)**
  - **Steps**:
    1. Switch active role to **Project Manager**.
    2. Open a task recommended by Team Leader.
    3. Click "Grant Final Approval".
  - **Expected Result**: Task status changes to `Completed`.
  - **Actual Behavior**: Passed.

- [x] **Test 3.6: Unauthorized Approval Prevention**
  - **Steps**:
    1. As **Team Member** or **Team Leader**, open an `Under Review` task.
  - **Expected Result**: The "Grant Final Approval" button is physically not rendered. If forced via code, the action handler rejects with "Permission Denied: Only Project Managers can grant final approval".
  - **Actual Behavior**: Passed.

---

### Category 4: Comments and Attachments

- [x] **Test 4.1: Threaded Comments**
  - **Steps**:
    1. Open any task in `TaskReviewModal` and switch to the **Comments** tab.
    2. Type "Design review scheduled for 2 PM" and click Send.
  - **Expected Result**: Comment appears immediately with author name, role tag, and current timestamp.
  - **Actual Behavior**: Passed.

- [x] **Test 4.2: File Upload and Executable Security Filter**
  - **Steps**:
    1. Switch to the **Attachments** tab.
    2. Attempt to upload an executable script (e.g. `script.bat` or `payload.exe`).
    3. Upload a standard image (`screenshot.png`) or PDF document.
  - **Expected Result**:
    - Executable files trigger a security alert: *"Executable script files are not permitted"*.
    - Standard documents generate a local blob URL and appear in the attachments list.
  - **Actual Behavior**: Passed.

---

### Category 5: Notifications, Reports, and Settings

- [x] **Test 5.1: Notifications Unread Filter and Read Toggles**
  - **Steps**:
    1. Navigate to *Notifications*.
    2. Click "Unread" tab.
    3. Click "Mark All as Read".
  - **Expected Result**: Unread list becomes empty. Bell badge counter updates to 0.
  - **Actual Behavior**: Passed.

- [x] **Test 5.2: Profile Synchronization Across Workspace**
  - **Steps**:
    1. Navigate to *Settings* → *Profile*.
    2. Change Name to "Alexandra Morgan" and save.
    3. Navigate to *Team* and *Tasks*.
  - **Expected Result**: Team member card and assigned task labels display "Alexandra Morgan". Avatar initials update to "AM".
  - **Actual Behavior**: Passed.

- [x] **Test 5.3: Dark vs. Light Mode Theme Switching**
  - **Steps**:
    1. In *Settings* → *Appearance*, switch Theme from "Dark" to "Light".
  - **Expected Result**: Body background changes to light slate (`#f8fafc`), cards change to white (`#ffffff`), and text changes to dark slate (`#0f172a`) with high contrast.
  - **Actual Behavior**: Passed.

---

## 3. Current Limitations Summary

1. **No Backend Persistence**: All created tasks, comments, and member edits will reset upon refreshing the browser (F5).
2. **Local Blob File URLs**: Files uploaded via `URL.createObjectURL` are held in browser memory and cannot be downloaded by another user on a different computer.
3. **No Real Email Dispatch**: Notification toggles in Settings do not trigger actual SMTP email delivery.
