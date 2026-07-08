# ARCHINODE

**유럽 건축·디자인 브랜드를 한국 시장과 연결하는 플랫폼.**

Live: https://archinodekr.com

## Stack

Static HTML + Firebase (Firestore, Auth, Storage) on GitHub Pages.

## Structure

- `index.html`, `about.html`, `brands.html`, `magazine.html`, `for-brands.html` — public landing pages
- `categories/` — 10 categories + 69 subcategories
- `magazine/`, `trend-report/` — editorial articles (static HTML + Firestore-backed articles)
- `admin/` — admin dashboard (Firebase Auth-guarded)
- `brand-portal/` — brand-only portal (dashboard + article editor)
- `scripts/` — automation (sitemap, search index)
- `docs/` — setup guides and deferred work
- `archi-diary/` — dev journal + handoff notes

## Development

Never modify files directly on `main`. Work locally, verify, commit, push. GitHub Pages auto-deploys in 5-10 min.

## AI agents (Cowork)

See `CLAUDE.md` for the agent-facing quick start.

## Handoff files

Latest state and next actions are always in `archi-diary/handoff-<date>.md`.

## Contact

`office@archinode.org`
