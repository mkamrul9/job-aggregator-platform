# Seekers Mobile Platform Decision Record (Phase 18A)

**Status:** PROVISIONAL ARCHITECTURAL DECISION RECORD (Awaiting User Acceptance)  
**Evaluation Gate:** Phase 18A Repair & Qualification  
**Target Milestone:** Phase 18B (Native Mobile Implementation)  
**Evaluated Platforms:**
1. **Kotlin 2.0 with Jetpack Compose** (Android Native Toolkit, Material 3, Coroutines/StateFlow)
2. **React Native 0.76** (Hermes Engine, New Architecture / JSI, TypeScript)

---

## 1. Executive Summary & Provisional Recommendation

### Provisional Recommendation
Based on architecture analysis, platform requirements, and the thin-slice prototypes evaluated against Seekers OpenAPI 3.1 backend services:

> **PROVISIONAL RECOMMENDATION: KOTLIN WITH JETPACK COMPOSE (Android-First Native)**  
> **Conditional Alternative:** Select **React Native** if immediate cross-platform iOS parity is a mandatory commercial requirement.

> [!IMPORTANT]
> **This recommendation is PROVISIONAL.** In strict adherence to Phase 18A governance, full mobile development in Phase 18B will **NOT** begin until the user explicitly reviews and accepts the platform choice.

### Key Justification Points
1. **Target Market Realities:** The initial target user base (South Asia / Bangladesh regional market) heavily skews toward mid-to-budget Android devices (Android 10–15, 2–4 GB RAM). Native Kotlin/Compose provides direct execution on Android's RenderThread without the memory footprint or garbage collection pauses of a secondary JavaScript VM (Hermes).
2. **Background Sync & File Resilience:** Native Android platform APIs (`WorkManager`, `NotificationManager`, `EncryptedSharedPreferences`, and native `HttpURLConnection`/`OkHttp`) offer deterministic lifecycle handling for resume PDF uploads and backoff polling during network dropouts, without relying on third-party bridge wrappers.
3. **Toolchain & Verification Realities:** The current development and CI environment is Windows 11 Enterprise with JDK 17 and Android SDK 35. Windows hosts cannot compile, sign, or benchmark iOS applications without macOS hardware and Xcode.
4. **Maintenance & Stability:** Jetpack Compose is Google's standard modern UI toolkit for Android, eliminating the ongoing maintenance overhead of React Native version upgrades, native bridge deprecations, and native module linking friction.

---

## 2. Requirements & Host Environment Inventory

### Product Requirements Matrix
- **Target Audience:** Job seekers discovering tech, engineering, and remote roles.
- **Device Fleet Target:** Android 10 (API 29) to Android 15 (API 35); budget to mid-range devices (2–4 GB RAM, 60–90 Hz refresh).
- **Network Constraints:** 3G/4G cellular and intermittent Wi-Fi; requires optimistic state updates, resilient retry backoff, and offline caching.
- **Core User Journeys (Evaluation Thin Slice):**
  1. *Discovery & Search:* Cursor-paginated job list (`GET /api/v1/jobs`), remote eligibility filter, search queries.
  2. *Job Details & Outbound:* Structured description, salary ranges, skills tags, authenticated outbound application redirects (`GET /api/v1/jobs/:id/outbound`).
  3. *Saved Workspace:* Bookmark toggle with optimistic state management and rollback on failure (`POST`/`DELETE /api/v1/users/saved-jobs/:jobId`).
  4. *Resume Parsing:* Multipart PDF upload (`POST /api/v1/users/resume/upload`) and backoff status polling (`GET /api/v1/users/resume/status/:id`) to extract NLP skills.
  5. *Deep Linking:* Inbound deep link routing (`seekers://jobs/:id` and `seekers://resume`).
  6. *Accessibility (a11y):* Minimum 48dp touch targets, TalkBack landmark semantics, high-contrast palette.

### Verified Local Host Environment (P18A Inventory)
- **Host OS:** Windows 11 Enterprise x64 (Build 10.0.26200)
- **Java Development Kit:** OpenJDK 17.0.20.1 (Temurin-17.0.20.1+1)
- **Android SDK:** Installed at `C:\Users\Lenovo\AppData\Local\Android\Sdk` (Platforms 34, 35, 36; Build-tools 34, 35, 36; platform-tools 37.0.1)
- **Node.js Runtime:** v24.11.1
- **Attached Physical Devices:** 0 attached devices (verified via `adb devices`)
- **iOS Toolchain:** Unavailable (Windows host limitation; requires macOS/Xcode)

---

## 3. Measured Prototype Evaluation & Comparison

Both vertical slices were implemented and tested against identical OpenAPI 3.1 contracts (`contracts/openapi/seekers-api-v1.yaml`) via `scripts/measure-mobile-slices.js`:

| Dimension / Criterion | React Native 0.76 (Hermes) | Kotlin 2.0 / Jetpack Compose | Measurement Status | Verdict |
|---|---|---|---|---|
| **API Contract Conformance** | Fully conforms to OpenAPI 3.1 (cursor pagination, `/users/saved-jobs/:jobId`) | Fully conforms to OpenAPI 3.1 (OkHttp, cursor pagination, UUID routes) | **VERIFIED** | **Parity** |
| **Touch Target Budget (WCAG 2.2)** | Minimum 48dp on all interactives (`minHeight: 48, minWidth: 48`) | Minimum 48dp on all interactives (`Modifier.defaultMinSize(48.dp)`) | **VERIFIED** | **Parity** |
| **Accessibility Semantics** | `accessibilityRole`, `accessibilityLabel` on all actionable views | `Modifier.semantics { role = Role.Button; contentDescription = ... }` | **VERIFIED** | **Parity** |
| **Optimistic State & Rollback** | Verified; state reverts on simulated network failure | Verified; StateFlow rolls back `savedJobIds` on failure | **VERIFIED** | **Parity** |
| **Deep Link Routing Latency** | Measured in-process router: **< 0.1 ms** | Measured in-process router: **< 0.1 ms** | **VERIFIED** | **Parity** |
| **Code Sharing with Web** | High (~65–75% TypeScript contracts, validation schemas, HTTP client types shared with Next.js) | Zero (Independent Kotlin data layer; requires dual maintenance) | **ARCHITECTURAL ANALYSIS** | **React Native** |
| **Multiplatform iOS Readiness** | High (Codebase is cross-platform; build requires macOS host) | None (Android native only; Compose Multiplatform for iOS is a separate experimental stack) | **ARCHITECTURAL ANALYSIS** | **React Native** |
| **Release APK Binary Size** | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | **NOT MEASURED** (Transparent) | *Unmeasured* |
| **Cold Startup Latency (TTI)** | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | **NOT MEASURED** (Transparent) | *Unmeasured* |
| **Warm Startup Latency** | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | **NOT MEASURED** (Transparent) | *Unmeasured* |
| **List Scroll Frame Drops / Jank** | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | **NOT MEASURED** (Transparent) | *Unmeasured* |
| **Peak Memory Footprint (PSS)** | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | *NOT_MEASURED_NO_PHYSICAL_DEVICE* | **NOT MEASURED** (Transparent) | *Unmeasured* |

> [!NOTE]
> In accordance with the Phase 18A repair directive, all hardware-dependent metrics that require connected physical devices (APK footprint, cold/warm launch timing, Choreographer frame drops, dumpsys PSS memory) or a macOS host (iOS build/runtime) are explicitly recorded as `NOT_MEASURED_NO_PHYSICAL_DEVICE` and `NOT_MEASURED_WINDOWS_HOST_LIMITATION`. No simulated numbers or fabricated benchmarks are used.

---

## 4. Tradeoff Analysis

### Option A: Kotlin with Jetpack Compose (Provisional Recommendation)
- **Strengths:**
  - Direct RenderThread UI execution with zero JavaScript bridge or Hermes VM runtime overhead.
  - First-party Android lifecycle awareness, predictive back gestures, and deep system integration (`Room`, `WorkManager`, `EncryptedSharedPreferences`).
  - Native TalkBack screen reader support with idiomatic Compose accessibility semantics.
  - No risk of third-party React Native library abandonment or native bridge upgrade incompatibilities.
- **Risks & Tradeoffs:**
  - Zero code sharing with the Next.js web application (`frontend-next/`).
  - Android-only: targeting iOS in the future will require either a separate Swift/SwiftUI application or migrating to Compose Multiplatform.

### Option B: React Native (Cross-Platform Alternative)
- **Strengths:**
  - High developer velocity and code reuse (~65–75% of types, API mapping, and validation logic can be shared with `frontend-next/`).
  - Unified TypeScript/JavaScript language stack across web, backend services, and mobile.
  - Multiplatform codebase ready for iOS whenever macOS build hardware is provisioned.
- **Risks & Tradeoffs:**
  - Additional memory overhead and garbage collection pauses on low-end Android devices (2 GB RAM).
  - Third-party library reliance for file system access, background work, and secure keystore storage.
  - Cannot build, run, or verify iOS builds on the current Windows host.

---

## 5. Scope Boundaries for Phase 18B (Implementation)

Upon explicit human acceptance of the platform choice:
- **Phase 18B Scope (Native Candidate Application):**
  - Implement full mobile candidate workflows on the **accepted platform only**:
    1. Candidate authentication & secure session persistence (Android KeyStore / EncryptedSharedPreferences).
    2. Real-time search, multi-facet filtering, and cursor pagination against `/api/v1/jobs`.
    3. Offline-first saved jobs cache with local SQLite/Room database and background synchronization.
    4. Resilient resume PDF upload with retry handling and status polling against `/api/v1/users/resume/*`.
    5. Native accessibility compliance (minimum 48dp touch targets, TalkBack semantics, high-contrast UI).
    6. System push notifications & deep link handling (`seekers://jobs/{id}`).
- **Phase 18C Scope (Deferred to Future Phase):**
  - Production release packaging, Google Play Store compliance, release signing, crash reporting, store listing metadata.

---

## 6. Decision Acceptance Gate

```
================================================================================
GATE STATUS: PENDING USER PLATFORM ACCEPTANCE
================================================================================
Full mobile application development in Phase 18B will NOT proceed until the user
explicitly accepts one of the following decisions:

  [1] ACCEPT KOTLIN / JETPACK COMPOSE (Android-First Native, Recommended)
  [2] ACCEPT REACT NATIVE (Cross-Platform TypeScript, Conditional Alternative)
  [3] REQUEST ADDITIONAL EVALUATION / CUSTOM SCOPE
================================================================================
```
