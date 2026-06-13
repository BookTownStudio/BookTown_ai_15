---
id: BT-README
title: "BookTown Runtime"
status: active
authority_level: none
owner: project-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
---

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BookTown Runtime

BookTown runs on a single production-aligned Firebase runtime path.

## Prerequisites

- Node.js 18+
- Firebase project + CLI authentication

## Local Development

1. Install dependencies:
   `npm install`
2. Create `.env` in project root with Firebase web config:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Run frontend:
   `npm run dev`
4. Run functions/emulators as needed:
   `cd functions && npm run build`

## Deployment

1. Set backend secrets:
   `firebase functions:secrets:set GEMINI_API_KEY`
2. Build frontend:
   `npm run build`
3. Deploy:
   `firebase deploy`
