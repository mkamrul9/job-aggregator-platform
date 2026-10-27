# Phase 1 implementation prompt

Copy the text below into the implementation chat when you want P01 to begin. This file is a prepared prompt; creating it does not execute its instructions.

```text
Implement only P01 from PRODUCTION_ROADMAP.md in this repository. Read that roadmap and applicable AGENTS.md/contribution instructions first, inspect the actual working tree, and produce a concrete checklist before editing. Do not start P02 or later phases. Preserve existing user changes.

Project constraint:
This is a polyglot microservices platform whose individual apps/services must also be independently presentable for technology-specific job applications. Preserve all seven identities:
- service-resume: Python Resume Extractor.
- frontend-admin: Angular Operations Dashboard; keep Angular, do not replace it with React.
- service-scraper: Go Job Collection Engine.
- service-user: NestJS Identity and Profile API.
- service-ingestion: Node.js Job Ingestion and Search API.
- service-notification: Node.js Notification Delivery Service.
- frontend-next: React/Next.js Candidate App.

Keep the monorepo. Document independent build/test/run/deployment boundaries and minimum infrastructure. Standalone demonstrations will use the same core implementation as platform mode; clearly labelled synthetic data or adapters may replace external dependencies. Demo mode must never bypass production authentication, expose real data, or send mail to real recipients. No runtime/demo feature work is required in P01.

P01 scope:
1. Work on an appropriate feature branch, using codex/production-p01-service-baseline by default. Do not commit directly to main. Inspect status without printing secrets; never display raw credential-bearing remote URLs, environment values, or credential files. Do not change application architecture or merge services.
2. Remediate credential hygiene. Replace embedded Git-remote credentials with a credential-free remote and the normal credential helper. Safely inspect tracked environment files and relevant history with redacted output. Revoke/rotate known exposed credentials through an authorized provider mechanism when available, and verify the result without revealing values. Removing a token from Git configuration does not revoke it. If an account-owner action is necessary, finish independent work and report the exact remaining action; leave that security gate open. Do not push using a known compromised token. Do not rewrite Git history, force-push, delete accounts, or destroy data.
3. Untrack accidentally committed node_modules, Python caches, and generated outputs while preserving local files. Retain package lockfiles, application source, schemas, generated protocol artifacts needed at runtime, and useful documentation. Decide deliberately whether Go vendoring is intentional: document and verify that policy rather than deleting vendor indiscriminately. Fix ignore rules, including rules that currently hide useful docs and any overly broad secret patterns that could accidentally ignore dependency locks. Keep local secrets local and untracked.
4. Add or improve safe project-level .env.example files using placeholders and documented variables. Record required versus optional settings, secrets versus public config, and future standalone/demo versus integrated settings without inventing unsupported configuration flags. Preserve local .env values without copying them into tracked files. Document the intended identity-emulator/development approach; implementing it belongs to later phases.
5. Create a tracked SERVICE_CATALOG.md covering all seven projects: purpose, primary stack, data ownership, entry points/interfaces, actual dependency manifests, current build/test/run commands, required infrastructure, current verification status, standalone-readiness gaps, planned demo approach, intended deployment boundary, and owning feature phase. Classify commands as verified, observed-but-unverified, or planned. Do not claim a currently broken service is independently usable.
6. Create or improve a focused README in each project, and add a root README index linking directly to them. Lead with that project's problem, primary technology, and actual current capability; explain the wider platform briefly as context. Include setup prerequisites, configuration examples, commands/status, tests, interfaces, known limitations, and planned demo evidence. Do not fabricate demo URLs, screenshots, benchmarks, or production adoption. P01 supplies honest documentation/templates, not new UI, runners, deployments, or cloned repositories.
7. Establish scoped secret/dependency-check entry points and clear contribution/ownership/review requirements, with an appropriate phase evidence log. Inspect existing CI before changing it. Keep real checks meaningful, document provider access requirements and baseline findings, and do not hide failures or introduce sweeping dependency upgrades. Full runtime/CI repairs belong to P02. Apply remote repository protection changes only where the required access and authorization are available; otherwise record the unresolved configuration requirement.

Validation and completion:
- Use focused repository/secret/configuration/documentation checks appropriate to P01. Inspect tracked-file status to confirm cleanup preserves source, lockfiles, protocol assets, and local developer files. Check documentation links and ensure examples contain no credentials. Record baseline application failures for P02 without declaring the platform green.
- Confirm all seven catalog entries, focused README/configuration templates, independent dependency boundaries, and later standalone-demo requirements are documented. Angular remains Angular, and the Python extractor does not require a React frontend for its future local demonstration.
- Update the roadmap/evidence log honestly. P01 remains incomplete if a required credential revocation, security check, or push/required CI gate cannot be verified. Report exact blockers and completed work; do not claim completion to move forward. Inherited application build failures are separate P02 findings, and required branch protections must still be respected.
- Review and stage only the intended phase files. Include the approved roadmap, service catalog, and phase prompt with the documentation baseline if they are still untracked; do not use an indiscriminate git add.
- When the P01 gates allow the checkpoint, create a conventional commit such as "chore(repo): secure source baseline and document independent services", push the feature branch, verify the remote SHA and applicable required CI results, and report the evidence. No main-branch merge or deployment is requested. If the push or a required gate fails, diagnose within P01 scope or report the precise unresolved gate.
- Finish with a concise report of changes, affected projects, checks/results, remaining risks or owner actions, branch, commit SHA, verified push/CI status, and readiness for P02. Stop after P01; do not begin P02.
```
