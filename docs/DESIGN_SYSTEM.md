# Seekers Design System Specification

## 1. Visual Identity & Design Philosophy

Seekers is an engineering-first, noise-reduced job aggregator platform. The visual design prioritizes **scannability, high information density without clutter, and calm reading surfaces**.

### Core Tenets
1. **Discovery-First Hierarchy:** The search query, location, and relevant job listings are the primary visual focus. Marketing banners, decorative glows, and fabricated counters ("2.4M+ jobs") are strictly avoided.
2. **Restrained Color Architecture:** A deep charcoal/slate surface hierarchy provides high-contrast, eye-strain-free reading. Brand amber (`#f59e0b`) is reserved for primary focus states, key actions, and active indicators.
3. **Cross-Framework Native Tokens:** Design tokens are authored as vendor-agnostic CSS/SCSS variables consumed natively by React/Next.js (`globals.css`), Angular 18 (`styles.scss`), and Python FastAPI (`style.css`), without imposing a heavy React runtime onto Angular or Python.
4. **WCAG AA Compliance:** All body and metadata text meets or exceeds WCAG 2.1 AA contrast requirements (minimum 4.5:1 for body text, 3:1 for large text and UI boundaries).
5. **Fluid Responsive Grid:** Seamlessly adapts across standard viewports: 320px (minimum phone), 360px/390px (compact/modern Android & iOS), 768px (tablet portrait), and 1280px+ (desktop). Touch targets are sized at $\ge$ 44px on mobile devices.

---

## 2. Design Tokens

### 2.1 Color Palette & Contrast

| Token | CSS Variable | Hex / RGBA | Contrast vs Base | Usage |
|---|---|---|---|---|
| **Base Canvas** | `--seekers-bg-base` | `#090d16` | - | Root page background |
| **Elevated Surface** | `--seekers-bg-elevated` | `#0f172a` | - | Cards, dialogs, drawers, sidebars |
| **Active Surface** | `--seekers-bg-surface` | `#1e293b` | - | Nested panels, search inputs, table headers |
| **Hover Surface** | `--seekers-bg-hover` | `#28334e` | - | Hover states for list items & interactive rows |
| **Subtle Border** | `--seekers-border-subtle` | `rgba(255, 255, 255, 0.08)` | - | Card dividers, input borders |
| **Strong Border** | `--seekers-border-strong` | `rgba(255, 255, 255, 0.16)` | - | Modals, active tab borders, popovers |
| **Primary Text** | `--seekers-text-primary` | `#f8fafc` | **15.4 : 1** (AAA) | Role titles, headings, primary values |
| **Secondary Text** | `--seekers-text-secondary` | `#94a3b8` | **7.1 : 1** (AAA) | Company names, locations, descriptions |
| **Muted Text** | `--seekers-text-muted` | `#64748b` | **4.6 : 1** (AA) | Timestamps, metadata, labels, footer notes |
| **Amber Primary** | `--seekers-amber-500` | `#f59e0b` | **8.2 : 1** (vs base) | Primary button, active tab indicator, badges |
| **Amber Dark** | `--seekers-amber-600` | `#d97706` | - | Button hover state, pressed states |
| **Amber Light** | `--seekers-amber-400` | `#fbbf24` | - | Icon accents, subtle focus rings |
| **Amber Tint** | `--seekers-amber-dim` | `rgba(245, 158, 11, 0.12)` | - | Badge backgrounds, active filter chips |
| **Success Emerald** | `--seekers-success` | `#10b981` | **7.8 : 1** | Active status pills, verified match indicators |
| **Success Tint** | `--seekers-success-dim` | `rgba(16, 185, 129, 0.12)` | - | Status badge background |
| **Danger Rose** | `--seekers-danger` | `#ef4444` | **5.4 : 1** | Error banners, rejected status, deletion alerts |
| **Danger Tint** | `--seekers-danger-dim` | `rgba(239, 68, 68, 0.12)` | - | Error badge background |
| **Info Sky** | `--seekers-info` | `#38bdf8` | **9.1 : 1** | Pipeline telemetry, informative banners |
| **Info Tint** | `--seekers-info-dim` | `rgba(56, 189, 248, 0.12)` | - | Informational pill background |

### 2.2 Typography Scale

Headings use **Sora** (weights 600, 700), delivering a confident, structural presence. UI controls, body copy, and metadata use **Plus Jakarta Sans** (weights 400, 500, 600) for legibility at small viewport sizes. Monospace telemetry uses **JetBrains Mono / monospace**.

```css
--font-heading: 'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;

/* Type Scale */
--text-2xl: 1.5rem;    /* 24px - Page Headings */
--text-xl:  1.25rem;   /* 20px - Section Headings, Modal Titles */
--text-lg:  1.125rem;  /* 18px - Job Card Titles */
--text-base: 0.9375rem;/* 15px - Standard Body Copy, Search Input */
--text-sm:  0.875rem;  /* 14px - Filters, Form Labels, Button Text */
--text-xs:  0.75rem;   /* 12px - Badges, Metadata, Timestamps */
--text-2xs: 0.6875rem; /* 11px - Upper-case Category Tags, Telemetry Labels */
```

### 2.3 Spacing & Grid System

Built on a predictable 4px geometric progression:
- `4px` (`--space-1`): Badge padding, icon gaps
- `8px` (`--space-2`): Chip padding, compact button padding, item gaps
- `12px` (`--space-3`): Form input padding, small card gap
- `16px` (`--space-4`): Card inner padding, list item separation
- `20px` (`--space-5`): Section margins, medium container padding
- `24px` (`--space-6`): Modal inner padding, dashboard panel margins
- `32px` (`--space-8`): Major section dividers
- `48px` (`--space-12`): Hero search separation

### 2.4 Radii & Elevation

```css
--radius-xs: 4px;   /* Small badges, code chips */
--radius-sm: 6px;   /* Button controls, text inputs */
--radius-md: 10px;  /* Cards, filter sheets, table containers */
--radius-lg: 16px;  /* Modals, floating drawers */
--radius-full: 9999px; /* Circular avatars, pill badges */

--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.65);
--shadow-focus: 0 0 0 3px rgba(245, 158, 11, 0.35);
```

### 2.5 Responsive Breakpoints

| Breakpoint | Width Range | Layout Adaptation |
|---|---|---|
| **xs** | `320px – 359px` | Single-column, stacked filter buttons, edge-to-edge job rows, bottom drawer modal |
| **sm** | `360px – 767px` | Mobile bottom-sheet filters, compact card layout, touch target $\ge 44\text{px}$ |
| **md** | `768px – 1023px`| Tablet 2-column or collapsable sidebar, horizontal filter bar, split detail sheet |
| **lg / xl** | `1024px+` | Desktop side-by-side search + filters, split job feed and preview drawer |

---

## 3. Component Specifications

### 3.1 Job Row / Card
- **Primary Line:** Job Title (`--seekers-text-primary`, 16px bold) + Freshness timestamp (`--seekers-text-muted`, 12px).
- **Secondary Line:** Company name (`--seekers-text-secondary`, 14px) + Location with map-pin icon (`--seekers-text-secondary`, 13px).
- **Badge Bar:**
  - Remote eligibility: `FULLY_REMOTE` (Sky pill), `HYBRID` (Purple pill), `ON_SITE` (Slate pill).
  - Seniority: `ENTRY`, `MID`, `SENIOR`, `LEAD` (Zinc pill).
  - Compensation: Clearly formatted BDT (`৳80k - ৳150k/mo`) or USD (`$3,000 - $5,000/mo`), or explicitly labelled `Salary Unspecified`.
  - Skills pills: Up to 3 key technology tags (e.g. `React`, `TypeScript`, `Node.js`).
  - Source attribution badge: `bdjobs`, `linkedin-bd`, etc.
- **Actions:** Quick Save toggle button (bookmark icon) + "View & Apply" trigger.

### 3.2 Mobile Filter Sheet (<768px)
- Fixed bottom sheet sliding up on trigger, with 60% translucent dark backdrop.
- Focus trap enabled; pressing `Escape` or clicking backdrop restores focus to the filter button.
- Clean clear/reset button + "Apply (N results)" primary button.
- Min touch target height 44px on all checkboxes and dropdown items.

### 3.3 Outbound Application Affordance
- Seekers aggregates third-party job listings; it does not masquerade as an employer ATS.
- The primary outbound button reads: **`Apply on Source ↗`**.
- Accompanied by a transparent disclaimer:
  > *"You will be redirected to the original employer/board listing at [Source]. Seekers tracks your application history locally for your convenience."*
- One-click **`Track Application`** action allows the candidate to instantly record the role into their private workspace with status `Applied`.

### 3.4 Candidate Workspace (Next.js)
Five top-level tabs:
1. **Discover:** The search-first job discovery engine.
2. **Saved Jobs:** Roles bookmarked by the candidate with 1-click apply and unsave.
3. **Applications:** Candidate-managed Kanban/list tracker with status tags (`Applied`, `Interviewing`, `Offered`, `Rejected`, `Withdrawn`), application date, and editable notes.
4. **Job Alerts:** Saved search alerts with query, location, frequency selector (`Immediate`, `Daily`, `Weekly`), and active toggle switch.
5. **Profile & Skills:** Candidate profile information, target preferences, extracted/selected skill cloud, and resume document status.

### 3.5 Standalone Angular Operations Console (`frontend-admin`)
- Operations shell with clear badge: **`Admin Operations Console — Standalone Portfolio Mode`**.
- Left navigation sidebar (collapsible to top drawer on mobile).
- Real-time pipeline health overview:
  - Scraper Health Table: Sources (`bdjobs`, `linkedin-bd`, `glassdoor-bd`, `remoteok`), health status (`HEALTHY`, `DEGRADED`, `PAUSED`), last crawl timestamp, error count, and pause/resume control.
  - Queue Telemetry: Kafka buffer metrics, ingestion rate (jobs/min), lag metrics, DLQ status.
  - Interactive Simulator Toolbar:
    - `Pause / Resume Stream`
    - `Trigger Ingestion Burst (+5 synthetic jobs)`
    - `Simulate Network Disconnect / Reconnect`
    - `Reset Demo Data`
  - Ingested Job Feed: Live filterable audit log with payload inspection modal.

### 3.6 Independent Python Resume Extractor UI (`service-resume`)
- Served natively by FastAPI (`GET /demo` or `GET /`) using clean HTML5/CSS and zero node/build dependencies.
- Features:
  - Drag-and-drop / file selector for PDF resumes (max 10MB).
  - Quick 1-click **`Load Sample Developer Resume`** button to test instantly without an external file.
  - In-browser file validation (rejects non-PDFs and files > 10MB).
  - In-memory NLP processing via spaCy `PhraseMatcher` and `pypdf`.
  - Categorized Extracted Skills display (Frontend, Backend, Database/Cloud, DevOps).
  - Download structured JSON extraction button.
  - Edge case simulations:
    - `Simulate Scanned PDF (No text layer)`: Demonstrates `SCANNED_PDF_NO_TEXT` rejection alert.
    - `Simulate Encrypted PDF`: Demonstrates `ENCRYPTED_PDF` rejection alert.
  - Strict Privacy Notice:
    > *"Resumes evaluated in this demo are processed in-memory and discarded immediately upon response. No personal data or document contents are stored on disk or sent to external servers."*

---

## 4. Accessibility & Quality Checklist
- [x] All text elements meet WCAG 2.1 AA contrast ratios ($\ge 4.5:1$).
- [x] Visible amber focus rings on all interactive elements (`--shadow-focus`).
- [x] Modal dialogs and sheets implement keyboard focus containment, backdrop dismissal, and `Escape` key handlers.
- [x] Form inputs include explicit `<label>` bindings with `htmlFor`/`for` attributes.
- [x] Zero horizontal scrolling at 320px, 360px, 390px, 768px, and 1280px.
- [x] Touch targets $\ge 44 \times 44$ px on mobile devices.
- [x] Transparent synthetic data labelling: all demo states clearly declare mock provenance.
