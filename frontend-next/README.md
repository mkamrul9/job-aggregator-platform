# React / Next.js Candidate App (`frontend-next`)

The candidate-facing web portal for the Seekers platform, providing job discovery, full-text search, profile management, and resume upload workflows.

> **Role in Seekers Platform:** Serves as the primary public interface for job seekers. Talks to the platform through the Nginx API gateway for candidate authentication (`service-user`), resume parsing (`service-resume`), and search queries.

---

## 1. Primary Technology Stack

- **Framework:** Next.js 16.3.0 (App Router architecture)
- **UI Library:** React 19.2.8 with TypeScript 5.x
- **Styling:** Tailwind CSS & Vanilla CSS (Custom design system: Sora / Plus Jakarta Sans, charcoal & amber palette)
- **Identity:** Firebase Client SDK (Email/Password, Session state)
- **Search Client:** `@elastic/elasticsearch` (used in server-side `/api/jobs` route)

---

## 2. Architecture & Component Structure

```
                  +--------------------------------------+
                  |   Seekers Candidate Web App          |
                  |   (Next.js App Router :3000)         |
                  +-------------------+------------------+
                                      |
         +----------------------------+----------------------------+
         | (Candidate UI Components)                               | (Server Route)
         v                                                         v
  +---------------+ +---------------+ +---------------+     +--------------+
  | JobSearch     | | ResumeUpload  | | AuthComponent |     | GET /api/jobs|
  | (Feed/Filters)| | (Drag & Drop) | | (Sign in/up)  |     | (ES Direct)  |
  +-------+-------+ +-------+-------+ +-------+-------+     +-------+------+
          |                 |                 |                     |
          +-----------------+-----------------+                     |
                            | (Nginx Reverse Proxy :80)             v
                            v                               +---------------+
                   +------------------+                     | Elasticsearch |
                   | Backend Micro-   |                     | Node (:9200)  |
                   | services Fleet   |                     +---------------+
                   +------------------+
```

### Key Components

- **`JobSearch.tsx`:** Interactive search bar, keyword filters, and job card results list.
- **`ResumeUpload.tsx`:** Client-side PDF file picker, upload progress indicator, and extracted skill badges.
- **`AuthComponent.tsx`:** Inline candidate registration/login form and Firebase-to-NestJS sync request. Full session management is planned.
- **`Navbar.tsx`:** Brand header and feedback dialog. Feedback currently logs to the browser console; production submission and complete mobile navigation are planned.

---

## 3. Current Capabilities & Baseline Status

- **Component Implementation:** Complete visual foundation with responsive layout, custom typography, and branded theme.
- **Linting (`npm run lint`):** `[Observed-but-unverified]` — 6 ESLint errors recorded for remediation in Phase P02.
- **Production Build (`npm run build`):** `[Observed-but-unverified]` — Turbopack CSS subprocess compilation error diagnosed for P02 resolution.
- **Known Limitations:**
  - Public marketing statistics ("2.4M+ jobs", "180+ sources") are static strings to be replaced with real catalog metrics in P06.
  - Server-side route handler `/api/jobs` connects directly to Elasticsearch, duplicating `service-ingestion` query logic. Single search ownership will be finalized in P03.
  - Turbopack dev/build issue requires dependency and build configuration alignment in P02.

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x
- npm 10.x+

### Installation

```bash
cd frontend-next
npm install
```

### Configuration

Copy the example configuration:
```bash
cp .env.example .env.local
```
Key configuration settings (see `.env.example`):
- `ES_NODE`: Elasticsearch address for server-side search route (default: `http://localhost:9200`)
- `NEXT_PUBLIC_FIREBASE_API_KEY`: Firebase public web API key
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Firebase public project configuration. Client emulator wiring and configurable API base URLs are not implemented; adding an environment variable alone does not enable them.

### Running Locally

```bash
# Start Next.js development server:
npm run dev

# Open in browser: http://localhost:3000
```

### Running Lint Checks

```bash
npm run lint
```

---

## 5. Planned Standalone Demonstration (Phase P06)

In Phase P06, this candidate application will feature a standalone demonstration mode:
- **Mock Data Engine:** Switchable fixture layer allowing full exploration of the search interface, facet filters, and job detail views without requiring Elasticsearch or backend services.
- **Interactive Component Playground:** Visual demonstration of loading skeletons, empty search states, and error recovery banners.
- **Clear Demonstration Labelling:** Honest UI markers indicating simulated demo data to ensure zero unverified claims.
