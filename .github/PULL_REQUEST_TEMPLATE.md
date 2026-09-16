## Summary

<!-- A clear, one-sentence description of what this PR does. -->

Closes #<!-- issue number -->

---

## Type of Change

<!-- Check all that apply -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📝 Documentation update
- [ ] 🧪 Test improvement (no production code changed)
- [ ] 🔧 Refactor / code quality (no behaviour change)
- [ ] 🏗️ Infrastructure / CI change

---

## Affected Service(s)

<!-- Check all that apply -->

- [ ] `service-scraper` (Go)
- [ ] `service-ingestion` (Node.js)
- [ ] `service-user` (NestJS)
- [ ] `service-resume` (Python / FastAPI)
- [ ] `service-notification` (Node.js)
- [ ] `frontend-next` (Next.js)
- [ ] `nginx` / API Gateway
- [ ] `docker-compose` / Infrastructure
- [ ] CI/CD / GitHub Actions

---

## What Changed

<!-- Describe the specific changes made. Be precise — list files modified and what changed in each. -->

-
-
-

---

## How to Test

<!-- Step-by-step instructions so a reviewer can verify the change works. -->

1. Start the cluster: `docker compose up -d --build`
2.
3.

**Expected result:**

---

## Screenshots / Logs (if applicable)

<!-- For frontend changes, please include before/after screenshots.
     For backend changes, include relevant curl output or log snippets. -->

---

## Pre-merge Checklist

- [ ] My branch is up-to-date with `main`
- [ ] I have linked the issue this PR closes (`Closes #<number>`)
- [ ] All commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] I have added or updated tests to cover my changes
- [ ] All existing tests pass (`go test ./...` / `npm test` / `pytest`)
- [ ] Code is formatted (`go fmt` / `npm run format` / `black`)
- [ ] I have self-reviewed my diff on GitHub before requesting review
- [ ] I have updated documentation if the change affects public-facing behaviour
