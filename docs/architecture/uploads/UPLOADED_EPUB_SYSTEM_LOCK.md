Status: LOCKED

Subsystem:
Uploaded EPUB Lifecycle

Lifecycle:

Upload
→ Finalize
→ Materialize Authority
→ Read
→ Resume
→ Continue Reading
→ Delete

Production Status:
BETA READY

Authority Model:

readerAuthority
is sole readability authority.

User uploads require:

uploadFinalized === true

before readable authority is projected.

Private uploads:

semanticGraphEligible = false

Deletion Cascade Removes:

books
uploaded editions
storage originals
generated covers
reader manifests
reader indexes
reading sessions
reading progress
highlights
bookmarks
reader events
upload metadata jobs
canonical candidate jobs
cover jobs
book_identity
book_ingestions

Known Non-Blocking Future Improvements:

- Job watchdogs
- Cover diagnostics normalization
- Home discovery authority cleanup
- Future asset architecture