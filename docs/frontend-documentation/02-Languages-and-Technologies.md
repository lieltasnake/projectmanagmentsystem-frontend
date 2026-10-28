# Document 2: Languages and Technologies Guide

This document provides a comprehensive technical breakdown of every language, library, framework, and tool actually utilized in the **PMS Frontend** codebase. All versions and examples match `package.json` and the project files.

---

## 1. Technology Summary Matrix

| Technology | Category | Exact Version in Project | Primary Purpose in this Project |
| :--- | :--- | :--- | :--- |
| **HTML5** | Markup Language | Browser Native (`index.html`) | Defines the host container `#root` where the app mounts. |
| **CSS3** | Styling Language | Browser Native (`src/index.css`) | Provides global base resets, font styling, and theme overrides. |
| **JavaScript (ES Modules)** | Programming Language | Browser / Node.js standard | Underpins modern frontend execution and build scripts. |
| **TypeScript** | Typed Superset of JS | `~6.0.3` | Enforces static type safety for tasks, projects, roles, and props. |
| **React** | UI Component Library | `^19.3.1` | Manages state, component lifecycles, and Virtual DOM updates. |
| **React DOM** | DOM Renderer for React | `^19.3.1` | Mounts React components into the browser's real HTML document. |
| **JSX / TSX** | Syntax Extension | React / TS Standard | Allows writing HTML-like markup directly inside TypeScript files. |
| **Tailwind CSS** | Utility-First CSS Framework | `^3.4.17` | Supplies utility classes (`flex`, `p-4`, `bg-[#070b19]`) for rapid UI styling. |
| **PostCSS** | CSS Transformation Tool | `^8.5.31` | Processes Tailwind directives into standard CSS. |
| **Autoprefixer** | PostCSS Plugin | `^10.6.1` | Adds vendor prefixes (e.g., `-webkit-`) for browser compatibility. |
| **Vite** | Frontend Build Tool & Dev Server | `^8.3.4` | Offers fast local hot module reloading and builds production bundles. |
| **@vitejs/plugin-react** | Vite Plugin | `^6.1.2` | Enables Fast Refresh and JSX transformation for React 19. |
| **Lucide React** | Icon Library | `^1.61.0` | Supplies clean SVG icons (CheckSquare, Clock, ShieldCheck, etc.). |
| **Oxlint** | High-Speed Linter | `^1.88.0` | Analyzes code for syntax errors and unused variables. |
| **npm** | Package Manager | Node.js standard | Manages project dependencies and executes project scripts. |

---

## 2. Detailed Breakdown of Each Technology

### 1. HTML (HyperText Markup Language)
- **Category**: Markup Language
- **Why this project uses it**: Modern single-page applications (SPAs) require an initial entry document. `index.html` loads fonts, sets the page `<title>`, configures mobile viewports, and provides `<div id="root"></div>`.
- **Files using it**: `index.html`
- **Real Example from this project**:
  ```html
  <!-- index.html (Lines 8-12) -->
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
  ```
- **How it works with other technologies**: When the browser parses this HTML, it encounters `<script type="module" src="/src/main.tsx">`, handing execution over to the Vite and TypeScript runtime.

---

### 2. CSS & Tailwind CSS
- **Category**: Styling System / Utility Framework
- **Why this project uses it**: Tailwind CSS (`v3.4.17`) eliminates the need to write thousands of lines of custom CSS selectors by providing atomic utility classes directly inside your markup. `src/index.css` provides base overrides and the light theme color mapping.
- **Files using it**: `tailwind.config.js`, `postcss.config.js`, `src/index.css`, and all TSX components.
- **Real Example from this project**:
  ```tsx
  // src/components/DashboardLayout.tsx
  <div className="flex min-h-screen bg-[#070b19] text-slate-100">
    <aside className="w-64 bg-[#0b112c] border-r border-slate-800 flex flex-col">
  ```
- **Custom Theme Extensions in `tailwind.config.js`**:
  ```javascript
  // tailwind.config.js
  export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
      extend: {
        colors: {
          navy: {
            950: '#070b19',
            900: '#0b112c',
            850: '#0f173b',
            800: '#141e4b',
            700: '#1e2d6d',
          },
        },
      },
    },
    plugins: [],
  }
  ```

---

### 3. TypeScript
- **Category**: Programming Language (Typed superset of JavaScript)
- **Why this project uses it**: In a multi-role project with intricate workflows, accidental bugs like typos in status names (`"complted"` instead of `"Completed"`) or accessing non-existent object properties can cause silent failures. TypeScript checks all variables at compile-time.
- **Files using it**: `src/types/pms.ts`, `src/App.tsx`, and all components.
- **Real Example from this project**:
  ```typescript
  // src/types/pms.ts
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
  }
  ```
  If a developer tries to set `task.status = 'Finished'`, TypeScript immediately rejects the build with an error.

---

### 4. React (v19)
- **Category**: Frontend UI Framework / Library
- **Why this project uses it**: React divides complex web pages into small, reusable, isolated building blocks called **Components**. It allows data to flow downward via **props** and updates the UI automatically whenever state changes.
- **Files using it**: All files in `src/components/`, `src/App.tsx`, and `src/main.tsx`.
- **Real Example from this project**:
  ```tsx
  // src/main.tsx
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import './index.css'
  import App from './App.tsx'

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  ```

---

### 5. React Hooks
- **Category**: React State & Lifecycle API
- **Why this project uses it**: Hooks allow functional components to retain state and perform side calculations without writing legacy class components.
- **Hooks used in this project**:
  - `useState`: Holds reactive state (e.g., active page tab, modal visibility, tasks list).
  - `useMemo`: Caches calculated statistics (e.g., overdue tasks, completed tasks, activity items) so they are only recalculated when the tasks array changes.
- **Real Example from this project**:
  ```tsx
  // src/components/DashboardLayout.tsx
  const [activeItem, setActiveItem] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Compute overdue count efficiently using useMemo
  const overdueTasksCount = useMemo(() => {
    return tasks.filter(
      (t) => t.deadline && t.status !== 'Completed' && new Date(t.deadline) < todayDate
    ).length;
  }, [tasks, todayDate]);
  ```

---

### 6. Lucide React
- **Category**: Icon Component Library
- **Why this project uses it**: Displays lightweight, accessible SVG icons with zero layout shift. Icons can be colored and sized dynamically using Tailwind CSS classes.
- **Files using it**: `src/components/DashboardLayout.tsx`, `src/components/TaskReviewModal.tsx`, etc.
- **Real Example from this project**:
  ```tsx
  // src/components/TaskReviewModal.tsx
  import { ShieldCheck, CheckCircle2, Clock, RotateCcw, Send } from 'lucide-react';

  // Rendering inside a button
  <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg">
    <CheckCircle2 className="w-4 h-4" />
    <span>Grant Final Approval</span>
  </button>
  ```

---

### 7. Vite
- **Category**: Frontend Development & Build Tool
- **Why this project uses it**: Vite replaces older tools like Webpack. It uses native ES modules in development for instant startup (under 300ms) and uses Rollup under the hood to bundle production code into optimized JS and CSS bundles.
- **Configuration File**: `vite.config.ts`
- **Real Example from this project**:
  ```typescript
  // vite.config.ts
  import react from '@vitejs/plugin-react'
  import { defineConfig } from 'vite'

  export default defineConfig({
    plugins: [react()],
  })
  ```

---

### 8. npm and package.json
- **Category**: Package Manager & Project Descriptor
- **Why this project uses it**: Tracks external dependencies, metadata, and developer terminal scripts.
- **Scripts in `package.json`**:
  ```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  }
  ```

---

## 3. Libraries NOT Used (Important Clarifications)

To ensure clarity and prevent confusion, here are libraries that are **not** present in this project:
- **No React Router / Next.js Router**: The project does not use `react-router-dom` or Next.js file-system routing. Page navigation is handled via **conditional component rendering** driven by React state (`activeItem` in `DashboardLayout.tsx`).
- **No Redux / Zustand**: State is managed via React's built-in `useState` lifted to the parent `App.tsx` and passed down via props.
- **No Axios**: Any network calls will use native browser `fetch`.
- **No Chart.js / Recharts**: Reports in `ReportsPage.tsx` are built using pure HTML progress bars and Tailwind CSS grid/flex structures.
