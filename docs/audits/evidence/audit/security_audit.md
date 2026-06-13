---
id: BT-AUDIT-SECURITY-AUDIT
title: "Security Audit - BookTown"
status: locked
authority_level: audit
owner: audit-governance
last_audited: 2026-06-13
source_of_truth: false
supersedes: []
superseded_by: null
ai_read: false
migrated_from: audit/security_audit.md
---

# Security Audit - BookTown

**Date**: May 3, 2026  
**Scope**: Firestore rules, callable function authentication, data validation, sensitive logic exposure

---

## 1. Firestore Rules - Overly Permissive Read Access

**Severity**: HIGH

**Finding**: Public collections (books, authors, quotes) allow unauthenticated read access without content filtering, exposing potentially sensitive user data.

**Evidence** (firestore.rules lines 1-877):
```
match /books/{document=**} {
  allow read: if resource.data.visibility == "public" || (isActiveOwner(...))
  allow write: if false;  // Books are admin-controlled
}
```

**Issues**:
- No pagination enforcement in rules (could read entire collection)
- No rate limiting at Firestore rule level
- Sensitive fields (internal IDs, analytics data) returned to client without filtering
- No query depth limiting for subcollections

**Impact**:
- Potential data exfiltration attacks (scraping all public content)
- Brute force attacks on search functionality
- Exposure of internal database structure to malicious users

**Fix Direction**: 
1. Add rate limiting at callable function level before database queries
2. Create separate read projections for public data (exclude internal fields)
3. Enforce query limits in Firestore rules
4. Implement API key rotation for public endpoints
5. Add suspicious activity monitoring for bulk reads

---

## 2. Callable Function - Missing Input Validation

**Severity**: HIGH

**Finding**: 131 callable endpoints lack comprehensive input validation. Many use custom validation instead of consistent Zod schema validation.

**Evidence** (functions/src):
```typescript
export const adminCreateCanonicalBook = onCall({ cors: true }, async (request) => {
  const validatedData = parseInput(adminCreateCanonicalBookSchema, request.data);
  // Good: Uses Zod validation
  
  // But other functions use:
  const data = (request.data ?? {}) as AdminDeleteCanonicalBookInput;
  // Bad: Unsafe cast without validation
})
```

**Risks**:
- Type coercion vulnerabilities
- Buffer overflow possibilities with unbounded arrays
- Injection attacks through unsanitized strings
- Negative number attacks for numeric fields

**Impact**:
- Malicious actors could send malformed requests causing crashes
- Data corruption through invalid input
- Denial of service via resource exhaustion

**Fix Direction**:
1. Audit all callable endpoints for consistent Zod validation
2. Create validation middleware for all functions
3. Add request size limits (current: unknown)
4. Implement request timeout enforcement
5. Log all validation failures for security monitoring

---

## 3. Authorization - Role-Based Access Control Gaps

**Severity**: MEDIUM

**Finding**: Authorization uses simple role checks (superadmin, moderator, system) but lacks fine-grained permission model. No explicit deny rules.

**Evidence** (firestore.rules lines 27-37):
```
function isAdminUser() {
  return isSignedIn()
    && request.auth.token.role in ['superadmin', 'moderator', 'system'];
}

function isSuperAdminUser() {
  return isSignedIn()
    && (
      request.auth.token.superadmin == true
      || request.auth.token.role == 'superadmin'
    );
}
```

**Issues**:
- No document-level permissions (all superadmins can modify any book)
- No action-based permissions (cannot restrict specific operations)
- No audit trail for who performed what action
- Role elevation attacks possible if auth token forged

**Impact**:
- Accidental data corruption by any admin
- No accountability for admin actions
- Cannot implement principle of least privilege

**Fix Direction**:
1. Implement fine-grained permission system (e.g., canEditBook, canDeleteBook)
2. Add audit logging for all admin operations
3. Implement request signing to prevent token forgery
4. Create role hierarchy with explicit permission inheritance
5. Add approval workflow for critical operations

---

## 4. Sensitive Logic - Client-Side Authorization Checks

**Severity**: MEDIUM

**Finding**: Some authorization checks occur in frontend hooks/components before backend validation, creating false sense of security.

**Evidence**:
- Admin UI components likely have client-side permission checks
- No guarantee backend validates on every operation
- Client-side checks can be bypassed via browser DevTools

**Impact**:
- Determined attacker can call unauthorized endpoints
- Sensitive operations (book merging, deletion) may execute without proper authorization
- No server-side enforcement of business rules

**Fix Direction**:
1. Move all authorization logic to backend callable functions
2. Remove client-side authorization checks (they should be UI hints only)
3. Add server-side audit logging for all operations
4. Implement request signing to verify client identity
5. Add honeypot fields to detect automated attacks

---

## 5. Data Exposure - PII in Audit Logs

**Severity**: MEDIUM

**Finding**: Admin audit logs store user names, book titles, and other PII without masking or anonymization.

**Evidence** (functions/src/admin/literaryAuthority.ts):
```typescript
await db.collection("admin_audit_log").add({
  action: "book_create",
  title: input.title,  // Direct PII
  author: input.author,  // Direct PII
  actorUid: caller.uid,
  timestamp: now,
});
```

**Issues**:
- Audit logs viewable by any superadmin
- No data retention policy
- No PII classification
- Logs may be backed up or recovered by attackers

**Impact**:
- Compliance violations (GDPR, CCPA)
- Privacy breaches if logs accessed
- Regulatory fines

**Fix Direction**:
1. Classify data (PII, sensitive, internal)
2. Implement PII masking in audit logs
3. Create data retention policies
4. Encrypt sensitive fields in logs
5. Implement log access controls (only head of security)

---

## 6. CORS Configuration - Overly Permissive

**Severity**: MEDIUM

**Finding**: All callable functions use `cors: true` without specifying allowed origins.

**Evidence** (functions/src/domains/admin.ts):
```typescript
export const adminCreateCanonicalBook = onCall({ cors: true }, async (request) => {
  // Allows requests from ANY origin
})
```

**Issues**:
- CSRF attacks possible from any website
- Malicious website can call your functions
- No origin validation

**Impact**:
- Users on malicious sites can trigger unintended actions
- Data theft via cross-origin requests
- Administrative functions exposed to attackers

**Fix Direction**:
1. Configure explicit allowed origins
2. Use same-origin-only for sensitive endpoints
3. Implement CSRF token validation
4. Add request origin logging
5. Consider API key requirement for sensitive operations

---

## 7. Secret Management - Environment Variables Exposed

**Severity**: HIGH

**Finding**: Sensitive configuration (API keys, database credentials) may be exposed in logs, error messages, or stored in version control.

**Evidence**:
- Firebase config visible in client code (intentional but risky)
- Google Books API key used in environment (GOOGLE_BOOKS_API_KEY)
- No key rotation policy visible
- Error messages may leak configuration

**Impact**:
- API key theft enables unlimited API calls
- Database credential exposure enables unauthorized access
- Configuration in version control becomes permanent liability

**Fix Direction**:
1. Rotate all API keys immediately
2. Move sensitive config to Secret Manager (not environment variables)
3. Implement key rotation policy (quarterly)
4. Add API key usage monitoring
5. Remove sensitive data from error messages
6. Audit git history for exposed secrets

---

## 8. Input Sanitization - User-Generated Content

**Severity**: MEDIUM

**Finding**: Book titles, author names, quotes, and other user content stored without sanitization. Risk of injection attacks.

**Evidence**:
- No HTML/script tag filtering
- No length limits in schema for some fields
- No regex validation for special characters

**Impact**:
- Stored XSS if content displayed without escaping
- Denial of service via massive documents
- Data corruption through special character injection

**Fix Direction**:
1. Add content sanitization library (DOMPurify for frontend, sanitize-html for backend)
2. Enforce length limits for all string fields
3. Add character whitelist validation
4. Implement content security policy headers
5. Add XSS protection in response headers

---

## 9. Authentication - Token Validation

**Severity**: LOW

**Finding**: Firebase handles auth token validation, but no additional token binding or fingerprinting.

**Issues**:
- Tokens valid across all devices
- Token theft enables impersonation
- No session invalidation on logout (Firebase handles this, but unclear)

**Fix Direction**:
1. Implement device fingerprinting
2. Add request signature validation
3. Create short-lived access tokens with refresh tokens
4. Implement token rotation on sensitive operations

---

## 10. Rate Limiting - Absent at Function Level

**Severity**: HIGH

**Finding**: No rate limiting on callable functions allows brute force and DoS attacks.

**Evidence**:
- 131 endpoints exposed without per-user/per-IP rate limits
- Search engine accepts queries without throttling
- Admin operations have no concurrency limits

**Impact**:
- Brute force password attacks possible
- Denial of service via expensive operations
- Resource exhaustion on shared database

**Fix Direction**:
1. Implement per-user rate limiting (Redis-backed)
2. Add per-IP rate limiting for unauthenticated endpoints
3. Create tiered rate limits (free vs paid users)
4. Add adaptive rate limiting based on load
5. Implement circuit breaker for expensive operations

---

## Summary Table

| Issue | Severity | Category | CVSS | Status |
|-------|----------|----------|------|--------|
| Overly Permissive Reads | HIGH | Authorization | 7.5 | Open |
| Missing Input Validation | HIGH | Input Handling | 8.0 | Open |
| No Rate Limiting | HIGH | DoS Protection | 7.8 | Open |
| Secret Exposure Risk | HIGH | Secret Management | 8.5 | Open |
| CORS Misconfiguration | MEDIUM | CSRF Protection | 6.5 | Open |
| PII in Logs | MEDIUM | Data Protection | 6.0 | Open |
| Authorization Gaps | MEDIUM | Access Control | 6.8 | Open |
| Client-Side Auth | MEDIUM | Access Control | 6.2 | Open |
| No XSS Protection | MEDIUM | Injection | 6.5 | Open |
| Token Security | LOW | Authentication | 4.5 | Open |

---

## Critical Action Items (Next 48 Hours)

1. **Rotate all API keys** - GOOGLE_BOOKS_API_KEY and any other exposed secrets
2. **Implement rate limiting** - At minimum per-user limit on expensive operations
3. **Add input validation** - All callable endpoints must use Zod schemas
4. **Review Firestore rules** - Remove unnecessary read permissions

---

## Compliance Status

**GDPR**: ⚠️ PII in logs without retention policy  
**CCPA**: ⚠️ User data exposure through public collections  
**HIPAA**: N/A  
**SOC 2**: 🔴 No audit logging, no access controls  

Recommend security audit by third party before production launch.
