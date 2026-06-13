---
id: BT-DOCS-ARCHITECTURE-DM-MEDIA-ATTACHMENTS
title: "Direct Message Media Attachments"
status: archived
authority_level: archive
owner: architecture-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: docs/architecture/messaging/DM_MEDIA_ATTACHMENTS.md
ai_read: false
migrated_from: docs/architecture/DM_MEDIA_ATTACHMENTS.md
---

# Direct Message Media Attachments

Direct message media uploads are not supported by the current attachment upload contract.

The existing upload pipeline is scoped to `posts`, `projects`, and `drafts`. Messenger must not pass a conversation id as a post id or use `parentType="posts"` for direct message uploads.

A future DM media contract must add an explicit backend-supported parent type, such as `conversations` or `direct_messages`, and validate server-side that the caller is an active participant in the conversation before issuing upload tokens or finalizing metadata.

Until that contract exists, Messenger may attach BookTown entities through `EntityPicker`, but media upload must remain hidden or disabled in Messenger.

