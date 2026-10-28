# Document 9: Styling, Theme Engine, and Responsive Design

This document explains the styling architecture of the **PMS Frontend**, covering Tailwind CSS utility classes, responsive grid systems, and the dual Dark/Light mode theme engine.

---

## 1. Styling Architecture Overview

The styling system consists of three coordinated layers:

1. **Tailwind CSS Core** (`tailwind.config.js`): Generates on-demand utility classes for layout, flexbox, grid, margin, padding, borders, and typography.
2. **Global CSS & Theme Overrides** (`src/index.css`): Sets global HTML body defaults and defines comprehensive `.theme-light` CSS selector overrides.
3. **Component-Level TSX Markup**: Applies atomic Tailwind utility classes directly onto JSX elements.

---

## 2. Tailwind Configuration & Custom Colors

`tailwind.config.js` configures the scanning boundaries and adds a custom palette of deep navy surface colors:

```javascript
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070b19', // Deepest background canvas
          900: '#0b112c', // Primary card and sidebar surface
          850: '#0f173b', // Elevated modal surface
          800: '#141e4b', // Interactive button and border surface
          700: '#1e2d6d', // Accent borders and hover states
        },
      },
    },
  },
  plugins: [],
}
```

---

## 3. How the Dark and Light Mode System Works

The application defaults to a **Dark Theme** designed with modern glassmorphism and subtle border glows. When the user toggles to **Light Theme** in `SettingsPage.tsx`:

1. `appearanceSettings.theme` is updated to `'light'`.
2. `DashboardLayout.tsx` attaches the CSS class `.theme-light` to the root `<div>`:
   ```tsx
   <div className={`min-h-screen ${appearanceSettings.theme === 'light' ? 'theme-light' : ''}`}>
   ```
3. `src/index.css` contains specialized selector overrides that intercept dark background classes and remap them to light surfaces with crisp contrast:

```css
/* From src/index.css */
.theme-light {
  background-color: #f8fafc !important; /* Slate-50 canvas */
  color: #0f172a !important;            /* Slate-900 high-contrast text */
}

/* Structural Shell Surfaces */
.theme-light aside {
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
}

.theme-light header {
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
}

/* Background Color Class Overrides */
.theme-light [class*="bg-[#070b19]"] {
  background-color: #f8fafc !important;
}

.theme-light [class*="bg-[#0b112c]"] {
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
}

.theme-light [class*="bg-[#0f173b]"] {
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06) !important;
}

/* Modals & Dialogs */
.theme-light [class*="bg-[#090d21]"] {
  background-color: #f1f5f9 !important;
  border-color: #e2e8f0 !important;
}
```

### Why this design is effective:
Because the theme engine uses class-pattern selectors (`[class*="bg-[#0b112c]"]`), individual components don't need hundreds of verbose `dark:bg-... light:bg-...` conditional statements. Dark mode remains sleek and vibrant, while light mode renders clean white cards with crisp slate borders.

---

## 4. Responsive Design and Breakpoints

The application is fully responsive across mobile phones, tablets, and desktop displays using Tailwind's mobile-first responsive prefixes:

| Breakpoint Prefix | Minimum Width | Typical Target Device | Usage in PMS Project |
| :--- | :--- | :--- | :--- |
| *(default)* | `0px` | Mobile phones | Single-column cards, mobile drawer menu hidden behind hamburger icon. |
| `sm:` | `640px` | Large phones / Small tablets | 2-column grids for metric cards. |
| `md:` | `768px` | Tablets / Small laptops | Sidebar drawer toggle transitions to full navigation bar. |
| `lg:` | `1024px` | Desktop screens | Full 3-column team directory and multi-column report layouts. |
| `xl:` | `1280px` | Wide desktop monitors | Expansive project cards with side-by-side metric charts. |

### Real Example of Responsive Grid Layout (`src/components/TeamPage.tsx`):
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* On mobile: 1 column
      On tablets: 2 columns
      On desktops: 3 columns */}
</div>
```

---

## 5. Safe Styling Modification Rules (How Not to Break Other Pages)

When modifying colors or layouts in this project, follow these safety guidelines:

1. **Use Tailwind Classes, Not Inline Styles**: Avoid `style={{ color: 'red' }}`. Inline styles bypass Tailwind's purge engine and override light mode CSS rules.
2. **Never Hardcode White Text Without Considering Light Mode**:
   - Instead of writing `text-white` on container text, use semantic classes or ensure the container has a `.theme-light` override in `src/index.css`.
3. **Preserve Spacing Consistency**:
   - Page containers use `p-6` or `p-8`.
   - Card paddings use `p-4` or `p-5`.
   - Grid gaps use `gap-4` or `gap-6`.
4. **Modifying Status Badge Colors**:
   - Status badges use standardized background/text color combinations:
     - **Completed**: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`
     - **Under Review**: `bg-amber-500/10 text-amber-400 border border-amber-500/20`
     - **In Progress**: `bg-blue-500/10 text-blue-400 border border-blue-500/20`
     - **Not Started / Planning**: `bg-slate-500/10 text-slate-400 border border-slate-500/20`
