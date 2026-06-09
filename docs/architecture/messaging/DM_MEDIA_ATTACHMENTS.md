# Direct Message Media Attachments

Direct message media uploads are not supported by the current attachment upload contract.

The existing upload pipeline is scoped to `posts`, `projects`, and `drafts`. Messenger must not pass a conversation id as a post id or use `parentType="posts"` for direct message uploads.

A future DM media contract must add an explicit backend-supported parent type, such as `conversations` or `direct_messages`, and validate server-side that the caller is an active participant in the conversation before issuing upload tokens or finalizing metadata.

Until that contract exists, Messenger may attach BookTown entities through `EntityPicker`, but media upload must remain hidden or disabled in Messenger.
