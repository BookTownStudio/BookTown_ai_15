# Environment & Secrets Matrix

## Frontend Environment Flags (VITE_*)
These flags control frontend behavior and are safe to expose in the bundle.

| Flag | Description | Default |
| :--- | :--- | :--- |
| `VITE_FORCE_MOCK` | If `true`, forces the app to use Mock Data Services and Mock AI, regardless of other configs. Useful for UI testing or offline demos. | `false` |
| `VITE_FIREBASE_API_KEY` | Firebase Public API Key. Presence indicates Firebase is configured. | `undefined` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID. | `undefined` |
| ... | (Other standard Firebase config variables) | ... |

## Backend Secrets
These secrets must **never** be exposed to the frontend. They are managed via Firebase Functions secrets or backend environment variables.

| Secret | Description | Storage Location |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key for AI generation. | Firebase Functions Secrets / Google Cloud Secret Manager |

## Environment Behavior Map

| Environment | `VITE_FORCE_MOCK` | Backend Connection | Data Source | AI Source |
| :--- | :--- | :--- | :--- | :--- |
| **AI Studio / Demo** | `false` (implicit) | None | Mock DB (In-Memory) | Mock Agent (Client-side simulation) |
| **Local Dev (Mock Mode)** | `true` | None | Mock DB | Mock Agent |
| **Local Dev (Connected)** | `false` | Emulators / Real | Real Firestore | Real Functions (via proxy/emulator) |
| **Production** | `false` | Real | Real Firestore | Real Functions |
