---
id: BT-ARCH-PUBLIC-WEB-REGISTER-001
title: "Public Web Architecture Register"
status: active
authority_level: architecture
owner: public-web
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Public Web Architecture Register

## Purpose

This register routes BookTown SSR, public entity pages, SEO, sitemap, canonical URLs, structured data, and public exposure boundaries without creating new public routes or exposure rules.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/ssr.ts`
- `functions/src/ssr/ssrPublicPage.ts`
- `functions/src/ssr/sitemap.ts`
- `functions/src/ssr/sitemapPublications.ts`
- `firebase.json`
- Public app routes and publication libraries where implemented.

## Documentation Authority

Primary routing starts at [MASTER_PUBLIC_WEB.md](../../master/MASTER_PUBLIC_WEB.md), then this register. Product data authority remains with Catalog, Author, Quotes/Reviews, Writing/Publishing, Reader, and Design System documents.

## Architecture Areas

| Area | Authority |
|---|---|
| SSR generation | Public Web runtime. |
| Public entity pages | Public Web runtime consuming owning product-domain authority. |
| SEO metadata | Public Web runtime from governed product data. |
| Sitemap | Public Web sitemap modules. |
| Canonical URLs | Public Web runtime and hosting configuration. |
| Structured data | Public Web runtime from routed product authority. |
| Public exposure boundaries | Owning product domains plus backend access checks. |

## Governance Rules

- Public Web does not own canonical entity truth.
- Sitemap inclusion is not authority to expose private or immature content.
- Structured data must derive from governed backend/product authority.
- Public pages must respect owning domain exposure boundaries.
- Hosting/cache behavior must remain explicit and observable.

## Known Gaps

- Canonical URL policy needs stronger public-launch authority.
- Structured data coverage is implementation-led and should be audited before broad indexing.
- Public exposure rules for books, authors, quotes, publications, shelves, and profiles remain cross-domain.
