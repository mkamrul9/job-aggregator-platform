// Seekers Platform — High-fidelity Synthetic Data Fixtures
// Built strictly against contracts/openapi/seekers-api-v1.yaml
// Market Scope: Regional South Asia / Bangladesh Tech Ecosystem (Dhaka, Chattogram, Regional Remote)

export interface JobSalary {
  currency: 'BDT' | 'USD';
  min?: number;
  max?: number;
  period: 'MONTHLY' | 'YEARLY';
}

export interface JobSummary {
  id: string;
  title: string;
  company: string;
  location: string;
  remote_eligibility: 'FULLY_REMOTE' | 'HYBRID' | 'ON_SITE' | 'UNSPECIFIED';
  job_type: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'UNSPECIFIED';
  seniority: 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD' | 'EXECUTIVE' | 'UNSPECIFIED';
  salary?: JobSalary;
  skills: string[];
  source: string;
  published_at: string;
  expires_at?: string | null;
  is_synthetic?: boolean;
  is_expired?: boolean;
}

export interface JobDetail extends JobSummary {
  description: string;
  canonical_url: string;
  status: 'ACTIVE' | 'EXPIRED' | 'FLAGGED';
  ingested_at: string;
  responsibilities?: string[];
  qualifications?: string[];
}

export interface ApplicationHistoryEntry {
  id?: string;
  status: string;
  notes?: string | null;
  changed_at: string;
}

export interface TrackedApplication {
  id: string;
  job_id: string;
  job_summary: JobSummary;
  status: 'APPLIED' | 'INTERVIEWING' | 'OFFERED' | 'REJECTED' | 'WITHDRAWN';
  notes: string;
  version?: number;
  history?: ApplicationHistoryEntry[];
  applied_at: string;
  updated_at: string;
}

export interface SavedSearchItem {
  id: string;
  name: string;
  query?: string;
  location?: string;
  remote_eligibility?: string;
  seniority?: string;
  job_type?: string;
  min_salary?: number;
  alerts_enabled: boolean;
  alert_frequency?: string;
  created_at: string;
  updated_at: string;
}

export interface AlertSubscription {
  id: string;
  query: string;
  location: string;
  frequency: 'IMMEDIATE' | 'DAILY' | 'WEEKLY';
  active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  title: string;
  skills: string[];
  preferences: {
    locations: string[];
    remote_preference: 'FULLY_REMOTE' | 'HYBRID' | 'ON_SITE' | 'UNSPECIFIED';
    min_salary: number;
    currency: 'BDT' | 'USD';
  };
}

export const SYNTHETIC_JOBS: JobDetail[] = [
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
    title: "Senior Backend Engineer (Go & Distributed Systems)",
    company: "Chaldal",
    location: "Gulshan-2, Dhaka",
    remote_eligibility: "HYBRID",
    job_type: "FULL_TIME",
    seniority: "SENIOR",
    salary: {
      currency: "BDT",
      min: 160000,
      max: 230000,
      period: "MONTHLY"
    },
    skills: ["Go", "PostgreSQL", "Kafka", "Microservices", "Docker", "Redis"],
    source: "chaldal-careers",
    published_at: "2026-10-25T08:30:00Z",
    ingested_at: "2026-10-25T09:12:00Z",
    status: "ACTIVE",
    canonical_url: "https://careers.chaldal.com/jobs/senior-backend-go-2026",
    description: "Chaldal is looking for an experienced Backend Engineer to architect, build, and optimize our grocery fulfillment distribution pipeline. You will own high-throughput order microservices handling over 50,000 real-time SKU queries per minute.",
    responsibilities: [
      "Design fault-tolerant Go microservices communicating across Kafka message brokers.",
      "Optimize complex PostgreSQL queries and Redis caching layers for sub-10ms inventory lookups.",
      "Collaborate with infrastructure engineers to monitor telemetry and maintain 99.95% system uptime."
    ],
    qualifications: [
      "4+ years of professional backend engineering experience with Go or C#/.NET Core.",
      "Proven track record scaling transactional relational databases and asynchronous pipelines.",
      "Solid understanding of gRPC, REST, concurrency patterns, and containerized deployments."
    ]
  },
  {
    id: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
    title: "Lead Mobile Engineer (Android / Jetpack Compose)",
    company: "Pathao",
    location: "Dhanmondi, Dhaka",
    remote_eligibility: "ON_SITE",
    job_type: "FULL_TIME",
    seniority: "LEAD",
    salary: {
      currency: "BDT",
      min: 200000,
      max: 280000,
      period: "MONTHLY"
    },
    skills: ["Kotlin", "Jetpack Compose", "Android", "Coroutines", "MVVM", "Clean Architecture"],
    source: "pathao-careers",
    published_at: "2026-10-24T11:15:00Z",
    ingested_at: "2026-10-24T12:00:00Z",
    status: "ACTIVE",
    canonical_url: "https://pathao.com/careers/lead-mobile-engineer-android",
    description: "Drive the architectural evolution of Pathao's flagship consumer application. You will lead an agile squad of Android developers transitioning legacy XML layouts to pure Jetpack Compose while optimizing app start latency and cold boot battery footprint.",
    responsibilities: [
      "Lead technical design discussions and set engineering standards for Pathao's Android codebase.",
      "Architect declarative UI components using Jetpack Compose and Kotlin Flow/Coroutines.",
      "Mentor mid-level engineers and conduct deep architectural and performance code reviews."
    ],
    qualifications: [
      "6+ years of native Android development using Kotlin.",
      "Deep expertise in Jetpack Compose, modular Gradle architecture, and background sync.",
      "Experience releasing apps with 1M+ active monthly users in emerging connectivity environments."
    ]
  },
  {
    id: "c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f",
    title: "Staff Distributed Systems Engineer (Kafka Core)",
    company: "bKash Limited",
    location: "Kawran Bazar, Dhaka",
    remote_eligibility: "HYBRID",
    job_type: "FULL_TIME",
    seniority: "LEAD",
    salary: {
      currency: "BDT",
      min: 250000,
      max: 350000,
      period: "MONTHLY"
    },
    skills: ["Kafka", "Java", "Go", "Distributed Systems", "Kubernetes", "PostgreSQL"],
    source: "bdjobs",
    published_at: "2026-10-26T04:45:00Z",
    ingested_at: "2026-10-26T05:30:00Z",
    status: "ACTIVE",
    canonical_url: "https://jobs.bdjobs.com/jobdetails.asp?id=bkash-staff-dist-sys-2026",
    description: "Join the core FinTech infrastructure group powering millions of financial transactions daily across Bangladesh. You will oversee payment event streaming pipelines, exactly-once delivery guarantees, and high-security compliance controls.",
    responsibilities: [
      "Architect multi-cluster Kafka event streaming backbones with strict partition ordering.",
      "Build high-assurance transaction verification services with sub-second finality.",
      "Establish enterprise failover playbooks and participate in zero-downtime deployment rehearsals."
    ],
    qualifications: [
      "7+ years in distributed systems engineering with Java/Spring Boot or Go.",
      "Deep practical experience with Apache Kafka, consumer group rebalances, and schema registries.",
      "Rigorous adherence to banking security, idempotent processing, and automated audit trails."
    ]
  },
  {
    id: "d4e5f6a1-b2c3-4d4e-9f5a-6b7c8d9e0f1a",
    title: "Senior Full Stack Engineer (Next.js & Node.js)",
    company: "ShopUp",
    location: "Banani, Dhaka",
    remote_eligibility: "HYBRID",
    job_type: "FULL_TIME",
    seniority: "SENIOR",
    salary: {
      currency: "BDT",
      min: 140000,
      max: 190000,
      period: "MONTHLY"
    },
    skills: ["React", "Next.js", "TypeScript", "Node.js", "PostgreSQL", "TailwindCSS"],
    source: "linkedin-bd",
    published_at: "2026-10-23T14:20:00Z",
    ingested_at: "2026-10-23T15:05:00Z",
    status: "ACTIVE",
    canonical_url: "https://linkedin.com/jobs/view/shopup-senior-fullstack-dev",
    description: "ShopUp is empowering micro-retailers across South Asia. We are looking for a Senior Full Stack Engineer to build our merchant dashboard and inventory forecasting portal using Next.js App Router and Node.js microservices.",
    responsibilities: [
      "Develop responsive, accessible merchant interfaces optimized for low-bandwidth 4G networks.",
      "Build robust REST and GraphQL APIs backed by PostgreSQL and Prisma ORM.",
      "Partner with product managers to translate complex supply chain workflows into intuitive UI."
    ],
    qualifications: [
      "4+ years building production web applications with React/Next.js and Node.js.",
      "Strong TypeScript fluency and comprehensive automated testing experience (Jest, Playwright).",
      "Familiarity with server-side rendering, caching strategies, and web performance metrics."
    ]
  },
  {
    id: "e5f6a1b2-c3d4-4e5f-8a6b-7c8d9e0f1a2b",
    title: "Senior Cloud & DevOps Engineer",
    company: "Brain Station 23",
    location: "Mohakhali, Dhaka",
    remote_eligibility: "FULLY_REMOTE",
    job_type: "FULL_TIME",
    seniority: "SENIOR",
    salary: {
      currency: "BDT",
      min: 170000,
      max: 240000,
      period: "MONTHLY"
    },
    skills: ["Docker", "Kubernetes", "AWS", "Terraform", "CI/CD", "Linux", "Prometheus"],
    source: "brainstation-careers",
    published_at: "2026-10-26T07:10:00Z",
    ingested_at: "2026-10-26T08:00:00Z",
    status: "ACTIVE",
    canonical_url: "https://brainstation-23.com/career/senior-devops-engineer",
    description: "Lead enterprise cloud modernization and CI/CD automation for Brain Station 23's international client portfolios across North America and Europe. You will manage Kubernetes clusters, Infrastructure as Code, and observability pipelines.",
    responsibilities: [
      "Provision and automate secure AWS and GCP multi-region infrastructure using Terraform.",
      "Design zero-downtime blue/green deployment pipelines via GitHub Actions and ArgoCD.",
      "Implement centralized logging and alerting stacks with Prometheus, Grafana, and OpenTelemetry."
    ],
    qualifications: [
      "5+ years administering Linux environments and production Kubernetes clusters.",
      "Hands-on expertise with Terraform, Docker multi-stage builds, and cloud networking/VPCs.",
      "Strong scripting capabilities in Python or Bash."
    ]
  },
  {
    id: "f6a1b2c3-d4e5-4f6a-9b7c-8d9e0f1a2b3c",
    title: "Senior Frontend Engineer (Design Systems & React)",
    company: "Optimizely Dhaka",
    location: "Tejgaon I/A, Dhaka",
    remote_eligibility: "HYBRID",
    job_type: "FULL_TIME",
    seniority: "SENIOR",
    salary: {
      currency: "BDT",
      min: 190000,
      max: 260000,
      period: "MONTHLY"
    },
    skills: ["React", "TypeScript", "Design Systems", "TailwindCSS", "Accessibility", "Jest"],
    source: "optimizely-careers",
    published_at: "2026-10-25T16:00:00Z",
    ingested_at: "2026-10-25T16:45:00Z",
    status: "ACTIVE",
    canonical_url: "https://careers.optimizely.com/dhaka/senior-frontend-engineer",
    description: "Optimizely is expanding its Dhaka R&D center. Join our Core Web Experience team to build world-class digital experimentation interfaces, reusable design component libraries, and accessible web experiences.",
    responsibilities: [
      "Develop and maintain enterprise-grade UI components with rigorous WCAG 2.1 AA compliance.",
      "Collaborate closely with product designers in Figma to turn design tokens into living code.",
      "Optimize bundle size, core web vitals, and client-side rendering performance."
    ],
    qualifications: [
      "5+ years of dedicated frontend engineering using modern React and TypeScript.",
      "Proven mastery of CSS architecture, design tokens, focus management, and keyboard accessibility.",
      "Experience writing robust unit and integration tests using React Testing Library and Cypress."
    ]
  },
  {
    id: "a2b3c4d5-e6f7-4a2b-8c3d-4e5f6a7b8c9d",
    title: "Software Engineer (Enterprise Angular & Java)",
    company: "Therap (BD) Ltd.",
    location: "Dhaka Cantonment, Dhaka",
    remote_eligibility: "ON_SITE",
    job_type: "FULL_TIME",
    seniority: "MID",
    salary: {
      currency: "BDT",
      min: 110000,
      max: 160000,
      period: "MONTHLY"
    },
    skills: ["Angular", "TypeScript", "Java", "Spring Boot", "SQL", "RxJS"],
    source: "bdjobs",
    published_at: "2026-10-22T09:00:00Z",
    ingested_at: "2026-10-22T09:40:00Z",
    status: "ACTIVE",
    canonical_url: "https://therapservices.net/careers/software-engineer-dhaka",
    description: "Therap Services is a leader in electronic health records documentation for developmental disability care providers across the United States. Join our Dhaka engineering headquarters to develop resilient, mission-critical healthcare workflows.",
    responsibilities: [
      "Build complex, responsive data entry modules and clinical audit reports in Angular 18.",
      "Develop secure, performant REST endpoints using Java, Spring Boot, and Oracle Database.",
      "Ensure strict HIPAA and patient data privacy standards across all web interfaces."
    ],
    qualifications: [
      "2.5+ years of professional development experience with Angular and Java.",
      "Firm grasp of RxJS observables, reactive forms, and clean component architecture.",
      "Strong SQL fundamentals and database schema design skills."
    ]
  },
  {
    id: "b3c4d5e6-f7a2-4b3c-9d4e-5f6a7b8c9d0e",
    title: "Staff Frontend Architect (Next.js & Performance)",
    company: "Regional Technology Partners",
    location: "Regional Remote (South Asia)",
    remote_eligibility: "FULLY_REMOTE",
    job_type: "FULL_TIME",
    seniority: "LEAD",
    salary: {
      currency: "USD",
      min: 4000,
      max: 6000,
      period: "MONTHLY"
    },
    skills: ["React", "Next.js", "TypeScript", "Web Performance", "Architecture", "GraphQL"],
    source: "remoteok",
    published_at: "2026-10-26T13:00:00Z",
    ingested_at: "2026-10-26T14:10:00Z",
    status: "ACTIVE",
    canonical_url: "https://remoteok.com/remote-jobs/staff-frontend-architect-south-asia",
    description: "Seeking a distinguished Frontend Architect located in South Asia (UTC+5 to UTC+6 friendly) to lead technical strategy across multiple high-traffic consumer web applications. This is a 100% remote engagement with USD compensation.",
    responsibilities: [
      "Establish architectural guidelines for Next.js App Router, streaming SSR, and edge compute.",
      "Mentor senior frontend engineers across distributed squads in Dhaka, Bengaluru, and Lahore.",
      "Drive core web vitals optimization (LCP < 1.2s, CLS < 0.05) across millions of monthly pageviews."
    ],
    qualifications: [
      "7+ years architecting web applications with deep React ecosystem expertise.",
      "Demonstrated experience diagnosing complex client-side memory leaks and rendering bottlenecks.",
      "Excellent written and asynchronous communication skills for remote teamwork."
    ]
  },
  {
    id: "c4d5e6f7-a2b3-4c4d-8e5f-6a7b8c9d0e1f",
    title: "Junior / Mid QA Automation Engineer",
    company: "SEBPO",
    location: "Panthapath, Dhaka",
    remote_eligibility: "ON_SITE",
    job_type: "FULL_TIME",
    seniority: "MID",
    salary: {
      currency: "BDT",
      min: 65000,
      max: 95000,
      period: "MONTHLY"
    },
    skills: ["Python", "Selenium", "Playwright", "Postman", "SQL", "Git"],
    source: "bdjobs",
    published_at: "2026-10-21T10:30:00Z",
    ingested_at: "2026-10-21T11:15:00Z",
    status: "ACTIVE",
    canonical_url: "https://sebpo.com/careers/qa-automation-dhaka",
    description: "SEBPO is hiring a QA Automation Engineer to build reliable end-to-end testing suites for client digital advertising and ad-tech operations.",
    responsibilities: [
      "Write automated browser test scripts using Python and Playwright.",
      "Perform REST API testing and regression suites in Postman and CI/CD pipelines.",
      "Collaborate with developers to document reproducible bug tickets with clear network traces."
    ],
    qualifications: [
      "1.5+ years of software quality assurance experience.",
      "Proficiency writing automated scripts in Python or JavaScript.",
      "Solid understanding of HTTP status codes, JSON validation, and web fundamentals."
    ]
  },
  {
    id: "d5e6f7a2-b3c4-4d5e-9f6a-7b8c9d0e1f2a",
    title: "Senior Golang Backend Engineer (Fintech)",
    company: "Kona Software Lab",
    location: "Gulshan-1, Dhaka",
    remote_eligibility: "HYBRID",
    job_type: "FULL_TIME",
    seniority: "SENIOR",
    salary: {
      currency: "BDT",
      min: 175000,
      max: 240000,
      period: "MONTHLY"
    },
    skills: ["Go", "Golang", "PostgreSQL", "Docker", "Microservices", "gRPC", "Security"],
    source: "kona-careers",
    published_at: "2026-10-25T12:00:00Z",
    ingested_at: "2026-10-25T12:45:00Z",
    status: "ACTIVE",
    canonical_url: "https://konasl.com/career/senior-golang-engineer",
    description: "Kona Software Lab is an international smart-card, cryptographic security, and mobile payment solution provider. We are seeking a Senior Golang Engineer to build high-security payment gateway backends.",
    responsibilities: [
      "Develop ultra-reliable payment processing microservices using Go and gRPC.",
      "Implement EMV and cryptographic tokenization standards with hardware security modules (HSM).",
      "Conduct security code audits and vulnerability mitigations."
    ],
    qualifications: [
      "4+ years of Go backend development experience in production environments.",
      "Understanding of cryptography basics (PKI, AES, RSA, digital signatures).",
      "Commitment to writing clean, thoroughly unit-tested concurrent code."
    ]
  },
  {
    id: "e6f7a2b3-c4d5-4e6f-8a7b-8c9d0e1f2a3b",
    title: "Software Engineer (Python & Data Extraction)",
    company: "Augmedix Bangladesh",
    location: "Panthapath, Dhaka",
    remote_eligibility: "HYBRID",
    job_type: "FULL_TIME",
    seniority: "MID",
    salary: {
      currency: "BDT",
      min: 95000,
      max: 140000,
      period: "MONTHLY"
    },
    skills: ["Python", "FastAPI", "NLP", "PostgreSQL", "Docker", "Regex"],
    source: "augmedix-careers",
    published_at: "2026-10-24T08:15:00Z",
    ingested_at: "2026-10-24T09:00:00Z",
    status: "ACTIVE",
    canonical_url: "https://augmedix.com/careers/software-engineer-python-dhaka",
    description: "Augmedix provides ambient clinical medical documentation. We are looking for a Python engineer to optimize our clinical transcription pipelines and data extraction parsers.",
    responsibilities: [
      "Build high-performance REST microservices with FastAPI for audio-to-text post-processing.",
      "Extract structured medical terminology using rule-based and NLP pattern matchers.",
      "Maintain Dockerized deployments and collaborate with international data science squads."
    ],
    qualifications: [
      "2+ years writing production Python 3 applications.",
      "Hands-on experience with FastAPI or Flask and relational databases.",
      "Experience parsing and tokenizing unstructured text documents."
    ]
  },
  {
    id: "f7a2b3c4-d5e6-4f7a-9b8c-9d0e1f2a3b4c",
    title: "Lead Solutions Architect (Cloud Microservices)",
    company: "Dynamic Solution Innovators (DSI)",
    location: "Mohakhali DOHS, Dhaka",
    remote_eligibility: "HYBRID",
    job_type: "FULL_TIME",
    seniority: "LEAD",
    salary: {
      currency: "BDT",
      min: 220000,
      max: 300000,
      period: "MONTHLY"
    },
    skills: ["Go", "Node.js", "Kubernetes", "Microservices", "PostgreSQL", "Kafka", "AWS"],
    source: "dsi-careers",
    published_at: "2026-10-26T15:20:00Z",
    ingested_at: "2026-10-26T16:00:00Z",
    status: "ACTIVE",
    canonical_url: "https://dsinnovators.com/careers/lead-solutions-architect",
    description: "Lead technical solution design for large-scale enterprise modernization projects. DSI partners with multinational clients to build mission-critical logistics, telecom, and fintech platforms.",
    responsibilities: [
      "Define high-level architecture, service boundaries, and data synchronization patterns.",
      "Evaluate trade-offs between monolithic and microservice architectures for legacy clients.",
      "Establish enterprise security, CI/CD, and code quality governance across squads."
    ],
    qualifications: [
      "8+ years in commercial software development with 3+ years in an architectural leadership role.",
      "Demonstrated mastery of distributed systems, event-driven architectures, and domain-driven design.",
      "Exceptional client communication and technical presentation skills."
    ]
  }
];

// Initial Candidate Workspace Demo Data
export const INITIAL_USER_PROFILE: UserProfile = {
  id: "usr_dhaka_candidate_01",
  email: "farhan.ahmed@example.com",
  name: "Farhan Ahmed",
  title: "Senior Full Stack Software Engineer",
  skills: ["React", "TypeScript", "Node.js", "Go", "Docker", "PostgreSQL", "Next.js"],
  preferences: {
    locations: ["Dhaka", "Remote (South Asia)"],
    remote_preference: "HYBRID",
    min_salary: 150000,
    currency: "BDT"
  }
};

export const INITIAL_TRACKED_APPLICATIONS: TrackedApplication[] = [
  {
    id: "app_track_001",
    job_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
    job_summary: SYNTHETIC_JOBS[0],
    status: "INTERVIEWING",
    notes: "Completed initial recruiter screen on Oct 25. Technical systems design interview scheduled for Thursday.",
    applied_at: "2026-10-25T10:00:00Z",
    updated_at: "2026-10-26T09:30:00Z"
  },
  {
    id: "app_track_002",
    job_id: "e5f6a1b2-c3d4-4e5f-8a6b-7c8d9e0f1a2b",
    job_summary: SYNTHETIC_JOBS[4],
    status: "APPLIED",
    notes: "Applied via Brain Station 23 careers portal. Submitted tailored DevOps CV with Terraform portfolio link.",
    applied_at: "2026-10-26T14:00:00Z",
    updated_at: "2026-10-26T14:00:00Z"
  },
  {
    id: "app_track_003",
    job_id: "d4e5f6a1-b2c3-4d4e-9f5a-6b7c8d9e0f1a",
    job_summary: SYNTHETIC_JOBS[3],
    status: "OFFERED",
    notes: "Received formal offer letter. Reviewing compensation package and hybrid schedule policy.",
    applied_at: "2026-10-18T11:20:00Z",
    updated_at: "2026-10-26T16:00:00Z"
  }
];

export const INITIAL_SAVED_JOBS: JobSummary[] = [
  SYNTHETIC_JOBS[1], // Pathao Lead Mobile Engineer
  SYNTHETIC_JOBS[5], // Optimizely Senior Frontend Engineer
  SYNTHETIC_JOBS[7], // Staff Frontend Architect (USD)
];

export const INITIAL_ALERT_SUBSCRIPTIONS: AlertSubscription[] = [
  {
    id: "alert_sub_01",
    query: "Go OR Golang",
    location: "Dhaka",
    frequency: "DAILY",
    active: true,
    created_at: "2026-10-20T10:00:00Z"
  },
  {
    id: "alert_sub_02",
    query: "Staff Architect OR Lead Engineer",
    location: "Remote",
    frequency: "IMMEDIATE",
    active: true,
    created_at: "2026-10-22T14:30:00Z"
  }
];
