---
id: BT-VISION-README-001
title: "BookTown Vision Layer"
status: active
authority_level: vision
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: true
---

# BookTown Vision Layer

The Vision Layer defines what BookTown is trying to become. It translates Canon truths into long-term product direction while remaining separate from implementation, architecture, product specification, delivery planning, operations, and historical evidence.

Vision documents describe destination. They do not define technical structure, delivery sequencing, feature requirements, or temporary plans.

## Vision Layer Structure

| Document | Purpose |
|---|---|
| [BOOKTOWN_FINAL_PRODUCT_VISION.md](BOOKTOWN_FINAL_PRODUCT_VISION.md) | Defines the ultimate BookTown vision and long-term destination. |
| [LITERARY_INTELLIGENCE_VISION.md](LITERARY_INTELLIGENCE_VISION.md) | Defines the future of Literary Intelligence, MatchMaker, Literary Graph, Identity Graph, and Affinity systems. |
| [EXPERIENCE_VISION.md](EXPERIENCE_VISION.md) | Defines the desired BookTown user experience across reading, writing, discovery, social, and intelligence. |

## Vision-to-Canon Relationship

Canon defines permanent product and platform truth. Vision expresses where BookTown is going while respecting Canon.

Vision may evolve as the platform matures. Canon changes only through stricter governance. If Vision conflicts with active Canon, Canon controls and Vision must be revised.

## Vision-to-Master Relationship

Vision defines destination. Master documents define current system truth, product maps, maturity, ownership, and authority routing.

Master documents should reflect progress toward Vision without turning Vision into a delivery plan or implementation plan.

## Future-State Definitions

The Vision Layer defines:

| Area | Future-State Question |
|---|---|
| BookTown | What is BookTown ultimately becoming? |
| Literary Intelligence | How should the platform understand literature, readers, authors, affinity, and discovery? |
| Experience | How should BookTown feel across reading, writing, discovery, social, and intelligence? |

## Non-Goals and Exclusions

Vision documents must not contain:

1. Implementation details.
2. Technical references.
3. Delivery sequencing.
4. Task lists.
5. Historical findings.
6. Temporary architecture decisions.
7. Feature specifications.

## Authority Role

Vision sits below Canon and above Master:

```text
Canon -> Vision -> Master -> ADR -> Architecture -> Product -> Governance -> Operations -> Audits -> Archive
```

Vision is product direction authority. It should remain valid for at least five years.

## Reading Order

For Vision questions, read:

1. [BOOKTOWN_FINAL_PRODUCT_VISION.md](BOOKTOWN_FINAL_PRODUCT_VISION.md)
2. [LITERARY_INTELLIGENCE_VISION.md](LITERARY_INTELLIGENCE_VISION.md)
3. [EXPERIENCE_VISION.md](EXPERIENCE_VISION.md)
4. Canon documents when a permanent-truth question is involved.
5. Master documents when current system state or routing is needed.
