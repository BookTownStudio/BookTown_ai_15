# Direct Message Shelf Attachments

Messenger v1 treats shelf attachments as intentional disclosure.

Users may attach private shelves to direct messages. Sending the attachment shares only the immutable message snapshot needed to render the attachment in the conversation, such as shelf id, owner id, title, and book count.

The snapshot does not grant the recipient browsing access to the underlying shelf. Shelf detail screens and shelf entry queries must continue enforcing their own visibility and ownership rules. A recipient may see the shelf attachment in the message but must not gain unauthorized access to the full shelf contents through that attachment.

This policy preserves direct-message sharing intent without changing the shelf privacy model.
