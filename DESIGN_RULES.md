# Design Rules — PMS Frontend

Target look: compact, clean, Jira/ClickUp-style. Styling and text only — no logic, data, routes, API calls, or backend changes.

## Tokens (CSS variables — `src/styles/theme.css`)

### Light theme
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-page` | `#F4F5F7` | Page canvas |
| `--bg-card` | `#FFFFFF` | Cards, top bar |
| `--border` | `#E5E7EB` | Borders, dividers, progress track |
| `--text-primary` | `#172B4D` | Body / headings |
| `--text-muted` | `#5B6472` | Labels, badges text, muted text |
| `--bg-sidebar` | `#1E293B` | Sidebar background |
| `--text-sidebar` | `#CBD5E1` | Sidebar text |
| `--accent` | `#2563EB` (default blue) | Primary buttons, active nav, progress, links |
| `--accent-hover` | `#1D4ED8` | Accent hover |
| `--accent-light` | `#DBEAFE` | Accent light fill |
| `--accent-soft` | `rgba(37, 99, 235, 0.15)` | Subtle accent tint |
| `--accent-text` | `#FFFFFF` | Text on accent |

### Dark theme (`data-theme="dark"`)
| Token | Value |
|-------|-------|
| `--bg-page` | `#0F172A` |
| `--bg-card` | `#162033` |
| `--border` | `#2A3650` |
| `--text-primary` | `#E5E7EB` |
| `--text-muted` | `#94A3B8` |
| `--bg-sidebar` | `#0B1220` |
| `--text-sidebar` | `#CBD5E1` |
| `--accent-soft` | `rgba(37, 99, 235, 0.15)` |

Accent comes **only** from accent variables. Default accent is blue `#2563EB`. Accent can be overridden via `data-accent="purple\|indigo\|emerald\|blue\|professional"`.

### Radii
| Token | Value |
|-------|-------|
| `--radius-card` | `8px` |
| `--radius-sidebar-item` | `6px` |
| `--radius-badge` | `10px` |

## Typography
- Font: **Inter** (Google Fonts), weights 400/500/600, base **14px**.
- Page title (top bar): **18px / 600**.
- Card titles: **15px / 600**.
- Labels, badges, muted text: **12px**.

## Colors (no glows, no gradients)
- Cards: radius 8px, 1px border, flat background. **No glows, no ambient background glows, no gradients.** Logo is a plain accent square (no gradient, no shadow).
- Page padding: `20px 24px`. Gap between blocks: `16px`.

## Sidebar
- Width: **220px**, padding `14px 10px`.
- Logo row: 28px rounded square in accent color + `"PMS Portal"` 600.
- Nav items: height **36px**, radius 6px, gap 10px, 16px stroke icons, 14px text.
- Active item = accent background with white text.
- Count badge on the right: 11px, radius 10px, padding `1px 7px`, subtle background (`#334155` light mode, `#E2E8F0` text).

## Top bar
- Height: **52px**, card color, 1px bottom border, padding `0 24px`.
- Left: page title 18px/600.
- Right: search box 260x32 (radius 6px, 1px border, 13px muted placeholder), notification bell, 28px circle avatar with soft accent tint and initials, then name and `"Project Manager"` in muted 12px.

## Rows (lists and tables)
- Height: **44px**, padding `0 16px`, 1px divider (`#F1F2F4` light mode).
- Row group header: 12px/600 muted text on a slightly darker background.
- Tables scroll inside their own container with a sticky header.

## Progress bar
- 6px high, radius 3px, track = border color, fill = accent.

## Badges
- 11px/600, radius 10px, padding `2px 8px`, tinted background + matching text.
- Example (light mode): overdue `#FEE2E2` bg, `#B91C1C` text. Use translucent tints in dark mode. Text contrast must stay readable.

## Avatars
- Soft tinted circle with initials, **never purple gradients**.

## Text hygiene
- Remove welcome messages, banners, notes, helper paragraphs, and redundant subtext.
- If something must be explained, shorten it and use an info-icon tooltip.
- Never truncate labels, overlap elements, or clip content.

## Modes
- Everything works in Dark and Light mode and with every accent color.
- No ambient glows or gradients in the layout.
