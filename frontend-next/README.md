# React / Next.js Candidate App (`frontend-next`)

The candidate-facing web portal for the Seekers platform, providing job discovery, full-text search, profile management, and candidate workspace tracking.

> **Role in Seekers Platform:** Serves as the primary public interface for job seekers. Built with Next.js 16.3 and React 19, adhering to the responsive Seekers Design System.

---

## 1. Primary Technology Stack

- **Framework:** Next.js 16.3.0 (App Router architecture, Turbopack)
- **UI Library:** React 19.2.8 with TypeScript 5.x
- **Styling:** Vanilla CSS design tokens & Tailwind CSS v4 (`app/globals.css`, adhering to `docs/DESIGN_SYSTEM.md`)
- **Typography:** Sora (Headings), Plus Jakarta Sans (Body), JetBrains Mono (Code/Metadata)
- **Identity:** Firebase Client SDK (configured for P05 auth lifecycle)

---

## 2. Architecture & Component Structure

```
                  +--------------------------------------+
                  |   Seekers Candidate Web App          |
                  |   (Next.js App Router :3000)         |
                  +-------------------+------------------+
                                      |
         +----------------------------+----------------------------+
         | (Candidate Navigation & Interactive Workspaces)         | (Preview & Gateway)
         v                                                         v
  +---------------+ +---------------+ +---------------+     +--------------+
  | Discover Feed | | Job Detail    | | Applications  |     | Synthetic BD |
  | (Filters Bar) | | Drawer/Modal  | | Tracker Kanban|     | Tech Fixtures|
  +-------+-------+ +-------+-------+ +-------+-------+     +--------------+
          |                 |                 |
          v                 v                 v
  +---------------+ +---------------+ +---------------+
  | Mobile Sheet  | | Alerts Center | | Profile Cloud |
  | (<768px touch)| | (Cadence sub) | | (Skills Tags) |
  +---------------+ +---------------+ +---------------+
```

### Key Components

- **`JobCard.tsx`:** Dense, scannable job card with salary display, seniority, remote eligibility pill, freshness tag, source attribution, and bookmark toggle.
- **`JobDetailDrawer.tsx`:** Accessible slide-in detail panel with focus trap, Escape key handling, outbound application button, non-ATS disclaimer notice, and local application tracking.
- **`MobileFilterSheet.tsx`:** Bottom-sheet modal for viewports `<768px` featuring touch targets $\ge 44$px, focus containment, reset action, and filter counter.
- **`ApplicationsWorkspace.tsx`:** Candidate-managed Kanban/pipeline tracker (`APPLIED`, `INTERVIEWING`, `OFFERED`, `REJECTED`, `WITHDRAWN`) with inline notes editing and date stamps.
- **`AlertsWorkspace.tsx`:** Simulated email alert subscription management with frequency selector (`IMMEDIATE`, `DAILY`, `WEEKLY`).
- **`ProfileWorkspace.tsx`:** Candidate persona summary with interactive skills tag cloud (add/remove tokens) and digital resume status.
- **`AuthModal.tsx` & `FeedbackModal.tsx` & `DataControlModal.tsx`:** Truthfully prototyped dialogs for authentication validation, listing issue reporting, GDPR data export, and account deletion requests.

---

## 3. Design System & Accessibility

- **Theme & Colors:** Deep charcoal base (`#090d16`), elevated slate panels (`#0f172a`), and restrained amber accents (`#f59e0b`).
- **Contrast Ratios:** WCAG 2.1 AA compliant across all text elements (minimum 7:1 contrast on primary text).
- **Responsive Viewports:** Tested and validated with zero horizontal overflow across:
  - `320px` (min compact phone)
  - `360px` / `390px` (standard Android & iOS)
  - `768px` (tablet portrait)
  - `1024px` / `1280px+` (desktop)
- **Keyboard Access:** Full Tab navigation, `:focus-visible` amber outline, Escape key dismissal on all modals and drawers.

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x or 22.x
- npm 10.x+

### Running the Candidate Prototype

```bash
cd frontend-next
npm install

# Start development server:
npm run dev

# Or build and run standalone production bundle:
npm run build
node .next/standalone/server.js
# Open http://localhost:3000
```

### Running Validation Checks

```bash
npm run lint
npm run build
```

---

## 5. Live Authentication & Demo Boundary (Phase P05 Verified)

The candidate web application supports both real Firebase authentication and isolated portfolio demonstration mode:

- **Live Firebase Authentication:** Real user registration, login, email verification status, password reset, session refresh, and logout via Firebase Auth (emulator or production).
- **Relational Profile Persistence:** Authenticated candidates automatically synchronize with `service-user` PostgreSQL backend (`POST /api/v1/users/sync`), enabling persistent profile editing (`PUT /api/v1/users/profile`), skills cloud customization, and privacy controls (`POST /api/v1/users/account/export`, `POST /api/v1/users/account/delete`).
- **Portfolio Demonstration Mode:** When users click "Explore Portfolio Demo", the app enters isolated demo mode (`DEMO_MODE`), granting immediate read-only access to synthetic candidate personas without contaminating or syncing to live PostgreSQL databases.
- **Responsive Viewport Verification:**
  - `320px` (min compact phone): Verified zero horizontal overflow (`scrollWidth <= innerWidth`)
  - `360px` / `390px` (mobile viewport): Responsive navbar, bottom sheets, mobile modals
  - `768px` (tablet portrait): Reflowed 2-column grid and clean slide-in drawers
  - `1280px+` (desktop): Dense 3-column scannable workspace layout
- **Outbound Aggregator Notice:** Clearly states that an outbound click is not a completed job application; applications are managed externally by original employer job boards.
