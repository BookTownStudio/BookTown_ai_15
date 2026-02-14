
# BookTown Operational Governance

This document outlines the governance rules, limits, and safety measures implemented in the BookTown application to ensure stability, cost control, and user safety.

## 1. AI Usage Limits

To prevent abuse and manage costs associated with the Gemini API, the following limits are enforced by the backend:

| Resource | Limit | Action on Exceed |
| :--- | :--- | :--- |
| **Chat Prompt Length** | 10,000 characters | Request rejected (400 Bad Request). |
| **System Instruction** | 2,000 characters | Request rejected. |
| **Summarization Input** | 15,000 characters | Request rejected. |
| **Supported Models** | `gemini-2.5-flash`, `gemini-2.5-flash-lite` | Request rejected if model not whitelisted. |

*Note: Future updates will include per-user daily rate limiting using Firestore/Redis counters.*

## 2. Publishing Safeguards

The publishing pipeline (`app/project/publish.tsx`) includes strict validation to prevent corrupted data from reaching the public catalog.

*   **Pre-Upload Check**: Generated EPUB and PDF blobs are checked for valid size (>100 bytes) before upload is attempted.
*   **Atomic Updates**: The backend `publishBook` function uses Firestore transactions (where applicable) or sequential writes to ensure the `published_books` collection and the user's `project` status remain in sync.
*   **Versioning**: Re-publishing a project automatically increments its version number.

## 3. Media Limits

| Type | Max Size | Format |
| :--- | :--- | :--- |
| **Profile Avatar** | 5 MB | JPEG, PNG, WebP |
| **Book Cover** | 10 MB | JPEG, PNG, WebP |
| **Post Image** | 10 MB | JPEG, PNG, WebP |

*   **Optimization**: All images are resized and compressed client-side via `MediaService` before upload to save bandwidth and storage costs.

## 4. Observability

Critical flows are logged to Google Cloud Logging via `firebase-functions/logger`:

*   **AI Requests**: `[AI Request Started]`, `[AI Request Success]`, `[Gemini API Error]`. Logs include model name, token usage estimate (char count), and latency. **Prompt content is NOT logged** to protect user privacy.
*   **Errors**: All 5xx errors are captured with stack traces.

## 5. Environment Awareness

*   **Single Runtime Path**: App behavior is production-aligned in all environments. It always uses Firebase-backed services.
*   **Configuration Gate**: Missing Firebase credentials are treated as startup misconfiguration and must fail fast.
