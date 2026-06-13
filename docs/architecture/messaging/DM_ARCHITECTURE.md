---
id: BT-DOCS-ARCHITECTURE-MESSAGING-DM-ARCHITECTURE
title: "Direct Message Architecture"
status: active
authority_level: architecture
owner: messaging-platform
last_audited: 2026-06-13
source_of_truth: true
supersedes: []
superseded_by: null
ai_read: true
---

# Direct Message Architecture

## Core Flow

User

↓

Messenger UI

↓

EntityPicker (optional)

↓

Send Message

↓

sendDirectMessage Callable

↓

Attachment Validation

↓

Snapshot Resolution

↓

Firestore Conversation

↓

Recipient

---

## Core Collections

conversations/{conversationId}

conversations/{conversationId}/messages/{messageId}

conversations/{conversationId}/idempotency/{id}

notifications/{notificationId}

users/{uid}/meta/unread

notification_preferences/{uid}

---

## Ownership

Client:

- Reads
- Renders
- Requests actions

Server:

- Validation
- Authorization
- Snapshot generation
- Notifications
- Unread counts

---

## Architectural Decisions

### AD-001

Server-authoritative snapshots.

### AD-002

Client metadata is not trusted.

### AD-003

DM architecture is one-to-one only.

### AD-004

ConversationContext reserved for future use.

### AD-005

EntityPicker remains pure.