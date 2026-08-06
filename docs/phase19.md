# Phase 19: Next.js Portal (Setup & Auth)

## Overview
In this phase, we initialized the user-facing frontend of our platform using **Next.js** with the modern **App Router**. This provides a robust React architecture with built-in Server-Side Rendering (SSR) for superior SEO and performance. We integrated the **Firebase Client SDK** to enable secure user authentication directly from the browser, syncing the generated JWTs with our NestJS backend.

## Implementation Details

1. **Next.js Initialization:**
   - Scaffolded a fresh application (`frontend-next`) using `create-next-app` configured with TypeScript and Tailwind CSS.
   - The App Router is utilized to maintain the latest standard in Next.js routing paradigms.

2. **Firebase Client Integration:**
   - Installed the `firebase` npm package to provide frontend authentication mechanisms.
   - Initialized the Firebase application in `lib/firebase.ts` leveraging environment variables (`NEXT_PUBLIC_FIREBASE_*`).
   - Guarded the Firebase initialization against hot-reload duplication errors using `getApps().length`.

3. **Authentication & Synchronization (`AuthComponent.tsx`):**
   - Developed a client-side component using standard React hooks (`useState`).
   - Integrated Firebase's `createUserWithEmailAndPassword` and `signInWithEmailAndPassword` methods.
   - Upon successful authentication, the frontend retrieves a secure JWT via `getIdToken()`.
   - Built a robust synchronization function that instantly posts this JWT to our Nginx API Gateway (`http://localhost/api/users/sync`). Nginx securely forwards this to the NestJS User Service, which in turn leverages the Firebase Admin SDK to decode the token and upsert the user into PostgreSQL.

## Impact
Our monolithic authentication strategy is now fully bridged across the frontend and backend. Candidates can sign up directly from their browser, their identity is secured by Google's Firebase infrastructure, and their relational data profile is deterministically generated in our PostgreSQL database.
