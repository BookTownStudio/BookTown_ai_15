# Message Requests

## Supported Modes

- nobody
- mutual_follows
- everyone

---

## Flow

User A

↓

Message User B

↓

Privacy Check

↓

Request Conversation

↓

Recipient Accepts

↓

Conversation Active

---

## Auto Activation

If recipient replies to a pending request:

status:

pending

↓

active

automatically.

---

## Rejected Requests

Declined requests cannot be resumed by sending additional messages.

A new request must be initiated according to future policy decisions.

---

## Security

Request logic is enforced server-side.

Client cannot bypass request state.