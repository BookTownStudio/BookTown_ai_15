---
id: BT-VALIDATION-REPORT
title: "BookTown Build & Deployment Validation Report"
status: locked
authority_level: audit
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: VALIDATION_REPORT.md
---

# BookTown Build & Deployment Validation Report

## 1. Build Verification
- **Status**: ✅ PASSED
- **Tooling**: Vite + Rollup
- **Checklist**:
    - [x] No `process.env` secrets in frontend code.
    - [x] `@google/genai` SDK is **excluded** from frontend bundle (used only in `functions/`).
    - [x] Node-only modules (`express`, `multer`) removed from source path.
    - [x] `lib/firebase.ts` fails fast when Firebase keys are missing.

## 2. Environment Architecture
| Environment | Frontend Config | Backend Logic | Data Source |
| :--- | :--- | :--- | :--- |
| **Local Development** | `VITE_FIREBASE_API_KEY=...` | Local Emulators (`firebase emulators:start`) | Local Firestore Emulator |
| **Production** | `VITE_FIREBASE_API_KEY=...` | Cloud Functions (Gen 2) | Google Cloud Firestore |

## 3. User Flows Validated
These flows have been verified against the current codebase logic:

1.  **Onboarding**: 
    - Production Auth (Firebase) -> Works (configured in `lib/auth.tsx`).
2.  **AI Features**:
    - **Chat**: Frontend calls `/api/ai/chat`. `firebase.json` rewrites this to the `chat` Cloud Function.
    - **Security**: API Key is stored in Cloud Secret Manager, never exposed to client.
3.  **Publishing**:
    - **EPUB/PDF**: Generated client-side using `jszip` / `jspdf`.
    - **Upload**: `MediaService` optimizes images before upload to Storage.
4.  **Social Feed**:
    - Infinite scroll queries implemented in `useSocialFeeds`.
    - Firestore indexes required for complex queries (e.g., `orderBy('timestamp', 'desc')`).

## 4. Deployment Instructions

### Prerequisites
- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)

### Steps
1.  **Login**: `firebase login`
2.  **Initialize Project**: `firebase use --add` (Select your project)
3.  **Set Secrets**:
    ```bash
    firebase functions:secrets:set GEMINI_API_KEY
    # Paste your Gemini API key
    ```
4.  **Deploy**:
    ```bash
    npm run build
    firebase deploy
    ```

### Known Warnings (Non-Blocking)
- `firebase-functions/logger` import in backend typescript might show warnings if `skipLibCheck` is false. (Handled in `functions/tsconfig.json`).
- CORS configuration in `functions/src/index.ts` is set to `true` (Allow All). For strict production, restrict to your domain.

## 5. Firestore Indexes
Run the app locally with emulators. Firebase will generate a link to create missing indexes automatically in the console logs when you execute complex queries (like filtering Feeds).
