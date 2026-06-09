# DM Attachments

## Supported Types

### Book

Snapshot:

- entityId
- title
- author
- coverUrl

---

### Author

Snapshot:

- entityId
- name
- country
- avatar

---

### Shelf

Snapshot:

- entityId
- title
- ownerId
- bookCount

---

### Quote

Snapshot:

- entityId
- quoteOwnerId
- quoteText

---

### Venue

Snapshot:

- entityId
- title
- address
- coverUrl

---

## Validation

All attachment validation occurs server-side.

Clients send:

- type
- entityId

Server resolves snapshots.

---

## Security

Attachment payloads cannot forge:

- titles
- covers
- owners
- metadata

All display fields originate from Firestore.

---

## Media

See:

DM_MEDIA_ATTACHMENTS.md