# Document 3: Project Folder and File Structure

This document outlines the complete directory layout and file inventory of the **PMS Frontend** workspace located at `C:\Users\j\Music\PMS frontend`.

---

## 1. Visual Folder Tree

```text
PMS frontend/
├── .oxlintrc.json              # Oxlint rules and linter configuration
├── index.html                  # Main HTML entry document for Vite
├── package.json                # Project dependencies, metadata, and scripts
├── package-lock.json           # Locked dependency version tree
├── postcss.config.js           # PostCSS plugin registration (Tailwind + Autoprefixer)
├── tailwind.config.js          # Tailwind CSS theme extensions and content paths
├── tsconfig.json               # Root TypeScript project reference configuration
├── tsconfig.app.json           # TypeScript rules for application code (src/)
├── tsconfig.node.json          # TypeScript rules for Vite build scripts
├── vite.config.ts              # Vite server and React plugin setup
├── public/                     # Static assets served directly without transformation
│   └── favicon.svg             # Application browser favicon
├── docs/                       # Project documentation
│   └── frontend-documentation/ # Full 12-document technical guide
└── src/                        # Core application source code
    ├── main.tsx                # Client entry point (mounts React into DOM)
    ├── App.tsx                 # Root component holding shared workspace state
    ├── App.css                 # Supplementary component styles
    ├── index.css               # Global stylesheet with Tailwind & light theme classes
    ├── types/
    │   └── pms.ts              # Central TypeScript definitions (interfaces & types)
    └── components/
        ├── LoginPage.tsx          # Authentication screen with demo role presets
        ├── DashboardLayout.tsx    # App shell (header, sidebar, activity, page switcher)
        ├── ProjectsPage.tsx       # Projects catalog grid and "New Project" modal
        ├── ProjectDetailsPage.tsx # Single project drill-down with nested task lists
        ├── TasksPage.tsx          # Master task board with multi-attribute filtering
        ├── TeamPage.tsx           # Team directory, role badges, add/edit/delete modals
        ├── NotificationsPage.tsx  # Dynamic alerts list with unread filtering & status toggles
        ├── ReportsPage.tsx        # Project completion, task distribution, team metrics
        ├── SettingsPage.tsx       # Profile editor, notification toggles, theme switcher
        └── TaskReviewModal.tsx    # Governance workflow modal (review, demo, comments, files)
```

---

## 2. Root Configuration Files

### `package.json`
- **Purpose**: Defines project metadata, npm scripts, and third-party dependencies.
- **What it contains**:
  - Scripts: `dev`, `build`, `lint`, `preview`.
  - Dependencies: `react`, `react-dom`, `lucide-react`.
  - DevDependencies: `typescript`, `vite`, `tailwindcss`, `postcss`, `autoprefixer`, `oxlint`.
- **What happens if changed incorrectly**: Mismatched version numbers or incorrect scripts can prevent `npm run dev` or `npm run build` from executing.

### `vite.config.ts`
- **Purpose**: Configures Vite's development server and bundling behavior.
- **What it contains**: Registers `@vitejs/plugin-react` so JSX/TSX syntax transforms smoothly into optimized JavaScript.
- **Used by**: The Vite CLI (`vite`, `vite build`).

### `tailwind.config.js` & `postcss.config.js`
- **Purpose**: Scans project files for Tailwind classes and injects custom color definitions.
- **What it contains**: Declares `content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]` and adds custom `navy` color codes (`#070b19`, `#0b112c`, etc.).
- **What happens if changed incorrectly**: If the `content` glob pattern is broken, Tailwind will not scan component files, causing all utility styling to disappear from the browser.

### `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- **Purpose**: Configures the TypeScript compiler (`tsc`).
- **What it contains**: Target ECMAScript version, module resolution rules, and strict type-checking flags (`"strict": true`).

### `index.html`
- **Purpose**: The physical HTML page delivered to the user's browser.
- **What it contains**: The `<div id="root"></div>` mount element and `<script type="module" src="/src/main.tsx"></script>`.

---

## 3. The `src/` Directory Architecture

### `src/main.tsx`
- **Role**: Application entry point.
- **Imports**: `StrictMode` from `react`, `createRoot` from `react-dom/client`, `src/index.css`, and `<App />`.
- **Function**: Queries `#root` in `index.html` and renders `<App />` inside it.

### `src/App.tsx`
- **Role**: Root state container and session controller.
- **Imports**: `INITIAL_PROJECTS`, `INITIAL_TASKS`, `INITIAL_TEAM_MEMBERS`, `LoginPage`, and `DashboardLayout`.
- **Key State Variables**:
  - `isAuthenticated`: Controls whether the user sees `LoginPage` or `DashboardLayout`.
  - `projects`: Array of all workspace projects.
  - `tasks`: Array of all tasks across all projects.
  - `teamMembers`: Roster of registered team members.
  - `userProfile`: Active user's name, email, department, and role.
  - `notificationPreferences`: Notification toggle states.
  - `appearanceSettings`: Theme (`dark` or `light`) and accent color.
- **Critical Function**: Houses the handlers (`onAddTask`, `onUpdateTask`, `onAddProject`, `onUpdateProfile`, etc.) that pass down state modification powers to child pages.

### `src/types/pms.ts`
- **Role**: Centralized type safety contract.
- **What it contains**:
  - `Project`: Project metadata, progress, deadlines, priority, task counts.
  - `Task`: Task properties, statuses, assignees, review feedback, review history entries.
  - `TeamMember`: Team member IDs, names, emails, roles, departments, avatar initials.
  - `TaskReviewEntry`: Audit trail items recording actions (`submit`, `request_corrections`, `recommend_approval`, `final_approve`).
  - `TaskComment`: Real-time commenting structure.
  - `TaskAttachment`: Metadata and URLs for uploaded documents and screenshots.
  - `DemoSubmission`: Detailed payload for live demo links, videos, and proof of work.
  - `UserProfile`, `NotificationPreferences`, `AppearanceSettings`.
- **Imported by**: Every page and modal component in the workspace.

---

## 4. Components Catalog (`src/components/`)

| File Name | Responsible Feature | Key Child Components / Modals Rendered |
| :--- | :--- | :--- |
| `LoginPage.tsx` | User login screen | Quick-role selector cards (PM, TL, TM presets). |
| `DashboardLayout.tsx` | App shell, navigation, global metrics | Top bar, Left navigation drawer, Quick Action shortcuts, Activity feed. |
| `ProjectsPage.tsx` | All Projects catalog | "New Project" creation modal. |
| `ProjectDetailsPage.tsx` | Drill-down view of a single project | Project task table, "Add Task" modal, opens `TaskReviewModal.tsx`. |
| `TasksPage.tsx` | Master cross-project task list | Search/filter controls, "Add Task" modal, opens `TaskReviewModal.tsx`. |
| `TeamPage.tsx` | Team roster and workload directory | "Add Team Member" modal, "Edit Member" modal, delete modal. |
| `NotificationsPage.tsx` | Notifications inbox | Filter tabs (All vs. Unread), Mark Read / Mark All Read actions. |
| `ReportsPage.tsx` | Real-time analytics and statistics | Project progress breakdown, task status donut bars, team workload metrics. |
| `SettingsPage.tsx` | Workspace and personal preferences | Profile tab, Notifications tab, Appearance tab (Light/Dark mode). |
| `TaskReviewModal.tsx` | Governance workflow modal | *Workflow* tab, *Comments* tab, *Attachments* tab, *History* tab. |

---

## 5. What Happens If Files Are Changed Incorrectly?

1. **Renaming or moving `src/main.tsx` without updating `index.html`**:
   - The browser fails with a `404 Not Found` for the script tag, displaying a completely blank white screen.
2. **Deleting or modifying types in `src/types/pms.ts`**:
   - TypeScript immediately produces build errors during `npx tsc --noEmit` wherever components expect those fields.
3. **Changing state update handlers in `src/App.tsx`**:
   - If an immutable array update (e.g., `setTasks(prev => prev.map(...))`) is accidentally replaced with a direct mutation (e.g., `tasks[0] = ...`), React will fail to detect the change and child components will not re-render.
4. **Deleting CSS rules in `src/index.css`**:
   - The `.theme-light` styling will break, leaving light mode with invisible white text on white backgrounds or dark navy panels.
