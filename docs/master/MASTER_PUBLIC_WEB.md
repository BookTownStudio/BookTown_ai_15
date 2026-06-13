---
id: BT-MASTER-PUBLIC-WEB-001
title: "BookTown Public Web Master Document"
status: active
authority_level: master
owner: public-web
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Public Web Master Document

## Purpose

This document is the Master Layer entry point for SSR, public pages, SEO, sitemap, and public entity exposure. It summarizes authority and routes to lower-level runtime sources without creating new public web architecture or product behavior.

For authority routing, start with [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md).

## Scope

In scope:

- SSR public pages.
- Sitemap generation.
- Public publication pages.
- Public entity exposure.
- Hosting/public route boundaries.
- SEO-oriented public metadata.

Out of scope:

- New public page types.
- New SEO policy.
- New crawl/indexing guarantees.
- New public access rules.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/ssr.ts`
- `functions/src/ssr/ssrPublicPage.ts`
- `functions/src/ssr/sitemap.ts`
- `functions/src/ssr/sitemapPublications.ts`
- `firebase.json`
- Public-facing app routes where present.
- `lib/publications/*`

Backend SSR/runtime owns public page generation, sitemap generation, public metadata composition, and public route behavior. Product domains own the data exposed through public pages.

## Documentation Authority

Primary authority currently comes from runtime and routed product authority:

- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_AUTHOR_SYSTEM.md](MASTER_AUTHOR_SYSTEM.md)
- [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md)
- [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md)
- [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md)
- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)

Related operational authority:

- [MASTER_OBSERVABILITY.md](MASTER_OBSERVABILITY.md)
- [MASTER_ADMIN_OPERATIONS.md](MASTER_ADMIN_OPERATIONS.md)

## System Architecture

Public Web is BookTown's public exposure layer for selected entities, publications, sitemaps, and SEO-readable surfaces. It consumes product-domain authority and renders public pages without becoming canonical authority for books, authors, quotes, publications, or users.

The architecture separates:

- Public route generation.
- Sitemap generation.
- Public metadata.
- Product-domain data authority.
- Hosting and cache behavior.
- Public design-system consumption.

## Core Components

| Component | Role |
|---|---|
| SSR domain | Owns public page generation entry points. |
| Public page renderer | Builds server-rendered public pages. |
| Sitemap generator | Produces sitemap outputs. |
| Publication sitemap | Exposes publication URLs where allowed. |
| Public metadata | Provides SEO/display metadata. |
| Public route consumers | Consume catalog, author, quote, and publication authority. |

## Data Authority

| Data | Authority |
|---|---|
| Book public data | Catalog / Library. |
| Author public data | Author System and Catalog. |
| Quote public data | Quotes / Reviews and ontology/catalog authority. |
| Publication public data | Writing / Publishing and Reader. |
| Sitemap entries | Public Web runtime from routed product authority. |
| Public page styling | Design System. |
| Public access decisions | Owning product domain and backend runtime. |

## User-Facing Surfaces

- Public book/entity pages where enabled.
- Public author pages where enabled.
- Public quote pages where enabled.
- Public publication pages.
- Sitemap endpoints.
- SEO/social preview surfaces.

## Operational Dependencies

- Catalog / Library.
- Author System.
- Quotes / Reviews.
- Writing / Publishing.
- Design System.
- Hosting configuration.
- Observability.
- Admin / Control Plane for publication/exposure governance.

## Projection Dependencies

Public Web may depend on:

- `catalog_identity_projection`
- `quote_projection`
- `review_projection`
- `cover_derivatives`
- `reader_manifests`
- `runtime_health`
- `system_events`

## Governance Rules

- Public Web does not own canonical product data.
- Public exposure must respect owning domain authority.
- Sitemap inclusion must not imply product authority or public readiness by itself.
- Public metadata must derive from governed sources.
- Public web behavior should route through product, design, and operations authority.
- Runtime-led public web behavior needs dedicated architecture documentation before broad expansion.

## Current Maturity

Product maturity: Emerging.

Architecture maturity: Implemented, with documentation authority sparse.

Documentation maturity: Partial to Good after this Master document.

Readiness: Internal Ready.

## Known Gaps

- Dedicated public web/SSR architecture authority is still needed.
- Public exposure rules for books, authors, quotes, and publications need explicit consolidation.
- SEO and sitemap governance should be documented before major public launch.
- Hosting/cache behavior is implementation-led and should be routed into authority docs.

## Related Documents

- [MASTER_AUTHORITY_MATRIX.md](MASTER_AUTHORITY_MATRIX.md)
- [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md)
- [MASTER_AUTHOR_SYSTEM.md](MASTER_AUTHOR_SYSTEM.md)
- [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md)
- [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md)
- [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md)

## System Ownership Matrix

| System | Owner | Runtime Authority | Documentation Authority |
|---|---|---|---|
| SSR | Public Web | SSR domain and SSR modules | This Master doc and runtime authority. |
| Sitemap | Public Web | Sitemap modules | This Master doc and runtime authority. |
| Public publication pages | Public Web; Publishing Platform | SSR and publication runtime | Publishing and Public Web masters. |
| Public entity exposure | Public Web; owning domains | SSR plus product domains | Owning product Master documents. |

## Dependency Matrix

| Dependency | Direction | Reason |
|---|---|---|
| Catalog / Author / Quotes | Upstream | Public pages consume entity data. |
| Writing / Publishing | Upstream | Public publication pages consume publishing authority. |
| Design System | Downstream | Public surfaces need consistent UI. |
| Observability | Downstream | Public web health needs monitoring. |
| Admin / Control Plane | Downstream | Exposure governance may require privileged controls. |

## Authority Routing

| Question | Route |
|---|---|
| Public page generation | SSR runtime and this Master document. |
| Book public truth | [MASTER_CATALOG_LIBRARY.md](MASTER_CATALOG_LIBRARY.md). |
| Author public truth | [MASTER_AUTHOR_SYSTEM.md](MASTER_AUTHOR_SYSTEM.md). |
| Quote public truth | [MASTER_QUOTES_REVIEWS.md](MASTER_QUOTES_REVIEWS.md). |
| Publication public truth | [MASTER_WRITE_PUBLISHING.md](MASTER_WRITE_PUBLISHING.md). |
| Public design | [MASTER_DESIGN_SYSTEM.md](MASTER_DESIGN_SYSTEM.md). |

## Future Evolution

Future public web changes should be documented in dedicated SSR/public web authority and reflected here as routing updates. This Master document must not introduce new public exposure or SEO behavior directly.
