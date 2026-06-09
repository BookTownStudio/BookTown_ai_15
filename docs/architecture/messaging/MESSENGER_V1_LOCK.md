# BookTown Messenger V1

Status: LOCKED

Version: Messenger V1

---

## Scope

Included:

- One-to-one messaging
- Message Requests
- DM Privacy Controls
- Reporting
- Notifications
- Unread Tracking
- Book Attachments
- Author Attachments
- Shelf Attachments
- Quote Attachments
- Venue Attachments

Excluded:

- Media Uploads
- Group Conversations
- Realtime Messaging
- Push Notifications
- Presence Indicators
- Typing Indicators
- Voice Messages
- Video Messages

---

## Core Principles

### MP-001

Server owns all writes.

Clients never write conversation or message documents directly.

---

### MP-002

Attachment snapshots are server-authoritative.

Client metadata is ignored.

Server resolves attachment snapshots.

---

### MP-003

EntityPicker is a pure selector.

EntityPicker must never:

- Upload files
- Request upload tokens
- Finalize uploads
- Require parentId
- Require parentType

---

### MP-004

Messenger supports:

- Book
- Author
- Shelf
- Quote
- Venue

Media uploads are intentionally disabled.

---

### MP-005

ConversationContext exists as a foundation for future contextual conversations.

No migration required.

---

## Related Documents

- DM_ARCHITECTURE.md
- DM_ATTACHMENTS.md
- DM_REQUESTS.md
- DM_PRIVACY.md
- DM_FUTURE_ROADMAP.md
- DM_MEDIA_ATTACHMENTS.md
- DM_SHELF_ATTACHMENTS.md