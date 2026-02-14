
# BookTown v1.0 Handover Documentation

**Date:** October 26, 2023
**Version:** 1.0.0 (Production Ready)

## 1. System Overview

BookTown is a production-grade React application for social book discovery, writing, and AI-assisted reading. It follows a **Hexagonal Architecture** where UI components interact with service interfaces (`DataService`, `MediaService`, `AgentService`) bound to Firebase-backed implementations.

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

1.  **Search Index**: Production search relies on Firestore inequality filters (`>=`, `<=`). For scale >1M records, integrate Algolia or Typesense.
2.  **AI Rate Limiting**: Currently enforced per-request IP/quota in Cloud Functions. User-based quota requires enabling App Check.

## 5. Troubleshooting

*   **"Missing API Key" in Prod**: Ensure `.env` was present at build time. Vite embeds vars during `npm run build`.
*   **CORS Errors on AI Chat**: Ensure `firebase.json` rewrites are correctly pointing `/api/ai/*` to the cloud function.
*   **Images fail to load**: Check `storage.rules`. Images must be <10MB and valid MIME types.
