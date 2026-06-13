---
id: BT-DOCS-ARCHITECTURE-MESSAGING-DM-PRIVACY
title: "Direct Message Privacy"
status: active
authority_level: architecture
owner: messaging-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Direct Message Privacy

## Settings Path

Settings

→ Privacy

→ Direct Messages

---

## Options

### Nobody

No incoming messages allowed.

---

### Mutual Follows

Default.

Only mutual followers may message directly.

Non-mutual users enter Message Requests.

---

### Everyone

Anyone may message directly.

---

## Storage

notification_preferences/{uid}

Field:

dmPrivacyMode

---

## Enforcement

Privacy enforcement is server-side.

Client settings are not trusted.

Missing values default to:

mutual_follows