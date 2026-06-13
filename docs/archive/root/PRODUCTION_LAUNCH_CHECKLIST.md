---
id: BT-PRODUCTION-LAUNCH-CHECKLIST
title: "BookTown Production Launch Checklist"
status: archived
authority_level: archive
owner: documentation-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: PRODUCTION_LAUNCH_CHECKLIST.md
---

# BookTown Production Launch Checklist

## 1. PWA & Mobile Experience
- [ ] **Manifest**: Verify `manifest.json` has correct `id`, `start_url`, `icons`, and `display: standalone`.
- [ ] **Icons**: Ensure `/icons/icon.svg` and apple touch icons render correctly on iOS and Android.
- [ ] **Offline Mode**: 
    - Turn off network.
    - Refresh page (Service Worker should handle it - *Note: Default Vite PWA plugin needed for full caching, currently simulated via OfflineProvider*).
    - Create a post/project (Should queue in `offlineQueue`).
    - Turn on network (Should sync automatically).
- [ ] **iOS Splash**: Verify status bar color matches theme (`#0f172a`).

## 2. Data & Security
- [ ] **Firestore Rules**: Deploy `firestore.rules`.
    - Test: Try to edit another user's profile (Should fail).
    - Test: Try to post as another user (Should fail).
- [ ] **Storage Rules**: Deploy `storage.rules`.
    - Test: Upload an image > 10MB (Should fail).
    - Test: Upload non-image file (Should fail).
- [ ] **Validation**: Ensure `lib/data-validation.ts` is active and normalizing all inputs.

## 3. Performance
- [ ] **Bundle Size**: Run `npm run build` and check chunk sizes.
    - Vendor chunk should be separate.
    - Editor chunk should be lazy loaded.
- [ ] **Lazy Loading**: Verify clicking "Write" tab triggers a network request for the editor chunk (Code Splitting).
- [ ] **Lighthouse Score**: Target >90 for Performance, Accessibility, Best Practices, SEO.

## 4. Environment Variables
- [ ] **Production**: Set all required Firebase `VITE_*` keys in hosting environment.
- [ ] **Backend Secrets**: Set `GEMINI_API_KEY` via Firebase Functions secrets (never in frontend env vars).

## 5. Feature Verification
- [ ] **Gemini AI**: Test "Surprise Me" and "Librarian" chat with a valid API key.
- [ ] **Tiptap Editor**: Test text formatting, floating menu, and autosave.
- [ ] **Feeds**: Scroll infinite list in Social tab without lag.
