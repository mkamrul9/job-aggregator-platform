# Phase 31: Seekers — Brand Redesign & Industry-Grade UI

## Overview
Phase 31 was a complete rebrand and visual overhaul of the Candidate Portal. The platform was renamed from its generic working title to **Seekers** and received an entirely new design system built to industry-grade standards.

## 1. Brand Identity: Seekers

### Naming
- The platform is now officially named **Seekers** — a direct, memorable name for a job aggregation platform.
- The brand is applied consistently across all touchpoints: browser tab title, SEO metadata, navbar wordmark, hero section, and all component headers.
- The navbar logo uses a search-icon mark paired with the `seekers` wordmark where the `ers` is highlighted in amber gold.

### Tagline
*"Find your next opportunity."*

## 2. Design System v2

The previous Vanilla CSS design system was replaced in its entirety. The new system adopts a **dark charcoal + warm amber gold** palette — a deliberate departure from the generic blue/purple/green palettes common to SaaS dashboards.

### Color Philosophy
| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#0c0e12` | Page background |
| `--bg-elevated` | `#131720` | Card surfaces |
| `--bg-surface` | `#1b2031` | Input / upload zone backgrounds |
| `--amber` | `#f59e0b` | Primary accent — CTAs, logo, highlights |
| `--amber-dim` | `rgba(245,158,11,0.12)` | Hover fills, badge backgrounds |
| `--text-primary` | `#f0f2f8` | Headings, body copy |
| `--text-secondary` | `#8a94b0` | Labels, secondary content |
| `--success` | `#22c55e` | Skill tags, file-ready state |

### Typography
- **Headings**: `Sora` — geometric, modern, high personality
- **Body / UI**: `Plus Jakarta Sans` — clean and professional at all sizes
- Both sourced from Google Fonts with optimized `display=swap`

### Key Components
- **Sticky glass navbar** — `backdrop-filter: blur(20px)` with subtle border
- **Hero section** — animated badge pill, large display type, live stats row (2.4M+ roles, 180+ sources)
- **Card system** — layered elevation with `inset 0 1px 0 rgba(255,255,255,0.04)` inner highlight
- **Job cards** — amber left-border reveals on hover with `translateX(4px)` slide
- **Drag-and-drop upload zone** — three visual states: idle, dragging, file-loaded
- **Modals** — blurred overlay with `rgba(0,0,0,0.7)` backdrop
- **Custom scrollbar** — 6px, matches surface palette
- **Animations** — `fadeUp` keyframes with staggered delays (0.08s increments)

## 3. Files Changed

| File | Change |
|---|---|
| `app/globals.css` | Entire design system rewritten — 400+ lines of structured Vanilla CSS |
| `app/layout.tsx` | Metadata updated to "Seekers — Find Your Next Role" |
| `app/page.tsx` | Hero section added with animated badge, title, stats, and grid layout |
| `components/Navbar.tsx` | Rewritten with new brand, glassmorphism styling, redesigned feedback modal |
| `components/AuthComponent.tsx` | Inline error/success feedback, new form layout |
| `components/JobSearch.tsx` | Premium job cards, empty states, loading states |
| `components/ResumeUpload.tsx` | Drag-and-drop zone with idle/active/success states |

## 4. Design Standard
This design system is the **canonical baseline** for all future UI work across the platform. Every new feature, page, or component added to Seekers must adhere to these tokens, typography choices, and component patterns.
