# Phase 20: Next.js Portal (Resume Upload)

## Overview
In this phase, we implemented the critical resume upload component for the Next.js candidate portal. This feature allows authenticated users to submit their PDF resumes, which are securely passed through the API gateway to our NestJS service, and subsequently processed by the FastAPI NLP engine via gRPC. 

## Implementation Details

1. **Resume Upload Component (`ResumeUpload.tsx`):**
   - Developed a client-side React component utilizing `useState` to manage the selected file, upload state, and returned NLP skills array.
   - Built an interactive multipart form accepting `application/pdf` inputs.
   - Integrated Firebase Auth (`auth.currentUser.getIdToken()`) to retrieve and attach the secure JWT to the upload request headers.
   - Utilized native `FormData` for multipart transmission. The browser seamlessly computes the boundary and `Content-Type`, preventing manual header collision issues.
   - Configured the frontend to securely route the payload through Nginx (`POST http://localhost/api/users/profile/resume`) directly to our NestJS backend pipeline.

2. **UI Integration (`app/page.tsx`):**
   - Restructured the default Next.js homepage into a clean, Tailwind-styled landing page.
   - Imported and arranged both `AuthComponent` (Phase 19) and `ResumeUpload` side-by-side for a complete end-to-end testing surface.
   - Implemented dynamic rendering of the extracted AI skills as responsive, green Tailwind pills immediately upon a successful response from our NLP pipeline.

## Impact
Candidates can now log in and upload their resumes seamlessly. The Next.js frontend securely orchestrates the data flow, handing the binary file and authentication token off to the backend ecosystem. The parsed intelligence (Skills) is displayed directly back to the user, proving our complex multi-service architecture (Next.js -> Nginx -> NestJS -> FastAPI -> spaCy) functions cohesively in real-time.
