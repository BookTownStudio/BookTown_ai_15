# A2 — Ingestion Observability (LOCKED)

## Purpose
Define a single authoritative ingestion lifecycle for BookTown.

## Current State
- Logs are scattered across backend and frontend.
- No canonical ingestion state exists.
- Frontend infers ingestion readiness implicitly.

## Decision
Introduce a Firestore-backed ingestion audit record
as the single source of truth.

## Canonical Ingestion States
RECEIVED
VALIDATING
MATERIALIZING
STORAGE_UPLOADING
COVER_PROCESSING
COMPLETED
FAILED_RETRYABLE
FAILED_FATAL

## Ingestion Record
Collection: bookIngestions/{ingestionId}

(see spec approved in CTO review)

## Frontend Rule
UI must only proceed when ingestion state === COMPLETED.

## Status
LOCKED — implementation pending
