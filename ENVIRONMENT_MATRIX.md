# Environment & Secrets Matrix

## Frontend Environment Flags (VITE_*)
These flags control frontend Firebase connectivity and are safe to expose in the bundle.

| Flag | Description | Default |
| :--- | :--- | :--- |
| `VITE_FIREBASE_API_KEY` | Firebase Public API Key. Presence indicates Firebase is configured. | `undefined` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID. | `undefined` |
| ... | (Other standard Firebase config variables) | ... |

## Backend Secrets
These secrets must **never** be exposed to the frontend. They are managed via Firebase Functions secrets or backend environment variables.

| Secret | Description | Storage Location |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key for AI generation. | Firebase Functions Secrets / Google Cloud Secret Manager |

## Environment Behavior Map

| Environment | Backend Connection | Data Source | AI Source |
| :--- | :--- | :--- | :--- |
| **Local Development** | Emulators / Real | Firestore | Cloud Functions (via proxy/emulator) |
| **Production** | Real | Firestore | Cloud Functions |
