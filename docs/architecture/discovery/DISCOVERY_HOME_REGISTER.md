---
id: BT-ARCH-DISCOVERY-HOME-REGISTER-001
title: "Discovery and Home Architecture Register"
status: active
authority_level: architecture
owner: discovery-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Discovery and Home Architecture Register

## Purpose

This register routes Discovery, Home, discovery modules, recommendations, AI boundaries, and consumer governance. It consolidates existing discovery architecture documents without defining new modules, ranking behavior, or editorial policy.

## Runtime Authority

Runtime authority currently lives in:

- `functions/src/domains/home.ts`
- `functions/src/home/*`
- `functions/src/library/discovery/*`
- `app/tabs/home.tsx`
- `app/tabs/discover.tsx`
- `app/discovery/*`
- `components/discovery/*`

## Documentation Authority

Primary routing starts at [MASTER_DISCOVERY_HOME.md](../../master/MASTER_DISCOVERY_HOME.md), then this register.

Routed architecture documents:

- [DISCOVERY_MODULE_AUTHORITY.md](DISCOVERY_MODULE_AUTHORITY.md)
- [DISCOVERY_CONSUMER_GOVERNANCE.md](DISCOVERY_CONSUMER_GOVERNANCE.md)
- [DISCOVERY_RECOMMENDATION_BOUNDARIES.md](DISCOVERY_RECOMMENDATION_BOUNDARIES.md)
- [HOME_DISCOVERY_CONSOLE_PRESERVATION.md](../HOME_DISCOVERY_CONSOLE_PRESERVATION.md)

## Authority Areas

| Area | Authority |
|---|---|
| Home modules | Home/discovery backend runtime and module authority. |
| Discovery modules | Discovery module authority and backend runtime. |
| Editorial selection | Home discovery console and Admin/Control Plane. |
| Recommendations | AI/Intelligence or Author Recommendations as upstream authority. |
| Consumer behavior | Discovery consumer governance. |
| Search-driven discovery | Search authority. |
| Catalog entities | Catalog / Library and Entity Platform. |

## AI Boundaries

Discovery may consume AI or recommendation outputs, but those outputs remain derived signals. Discovery must not promote AI-generated output into canonical catalog, author, quote, or user truth.

## Governance Rules

- Discovery outputs are editorial or derived, not canonical.
- Recommendation consumers must not mutate upstream intelligence authority.
- Editorial modules must remain distinct from recommendation modules.
- Search, Catalog, Reader, and AI authority remain separable.
- Audit evidence does not define discovery behavior unless promoted into routed authority.

## Known Gaps

- Editorial governance requires more explicit lower-level policy before broad public operation.
- Recommendation consumers remain dependent on AI/Intelligence maturity.
- Module expansion should update this register and the Master route together.
