
# BookTown v1.0 Handover Documentation

**Date:** October 26, 2023
**Version:** 1.0.0 (Production Ready)

## 1. System Overview

BookTown is a dual-mode React application designed for social book discovery, writing, and AI-assisted reading. It utilizes a **Hexagonal Architecture** approach where core UI components interact with abstract Service Interfaces (`DataService`, `MediaService`, `AgentService`), allowing the backend implementation to be swapped seamlessly.

### Operational Modes

| Feature | **AI Studio / Demo Mode** | **Production Mode** |
| :--- | :--- | :--- |
| **Trigger** | `VITE_FORCE_MOCK=true` OR Hostname includes `aistudio` | Valid `VITE_FIREBASE_API_KEY` present |
| **Database** | In-Memory Mock (`lib/db.ts`) | Google Cloud Firestore |
| **Authentication** | Guest Mode (Mock Admin) | Firebase Auth (Google, Email) |
| **Storage** | Browser Blob URLs (Temporary) | Firebase Storage |
| **AI Agents** | Client-side Mock Responses | Cloud Functions (`/api/ai/*`) -> Gemini 2.5 |
| **Search** | Local In-Memory Filter | Firestore Queries + Federated Search |

## 2. Environment Configuration

### Frontend (.env)
Required for Production builds. Do **not** commit to version control.

```env
# Firebase Configuration (Publicly visible in bundle)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=booktown.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=booktown
VITE_FIREBASE_STORAGE_BUCKET=booktown.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Operational Flags
VITE_FORCE_MOCK=false # Set to true to force Mock Mode even with keys
```

### Backend (Firebase Functions Secrets)
Managed via Google Cloud Secret Manager.

```bash
# Set secrets via CLI
firebase functions:secrets:set GEMINI_API_KEY
```

## 3. Deployment Guide

### Frontend (Hosting)
The frontend is a static SPA built with Vite.

1.  **Build**: `npm run build`
2.  **Output**: Generates `dist/` folder.
3.  **Deploy**: `firebase deploy --only hosting`

### Backend (Functions)
Serverless functions handle AI Gateway logic to protect API keys.

1.  **Build**: `cd functions && npm run build`
2.  **Deploy**: `firebase deploy --only functions`

## 4. Known Limitations & Tradeoffs

1.  **Mock Persistence**: In AI Studio/Demo mode, all data (posts, shelves, books) is lost on page refresh. This is by design.
2.  **Search Index**: Production search relies on Firestore inequality filters (`>=`, `<=`). For scale >1M records, integrate Algolia or Typesense.
3.  **AI Rate Limiting**: Currently enforced per-request IP/quota in Cloud Functions. User-based quota requires enabling App Check.

## 5. Troubleshooting

*   **"Missing API Key" in Prod**: Ensure `.env` was present at build time. Vite embeds vars during `npm run build`.
*   **CORS Errors on AI Chat**: Ensure `firebase.json` rewrites are correctly pointing `/api/ai/*` to the cloud function.
*   **Images fail to load**: Check `storage.rules`. Images must be <10MB and valid MIME types.
