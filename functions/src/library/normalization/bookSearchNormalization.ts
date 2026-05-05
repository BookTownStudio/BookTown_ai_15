/**
 * Shared normalization utilities for book search across the library pipeline.
 *
 * Both normalizeSearchText and normalizeIsbn are sourced from the shared
 * module and re-exported so that existing callers do not need to change their
 * imports.
 */

import { normalizeSearchText, normalizeIsbn } from "../../shared/normalization";

export { normalizeSearchText, normalizeIsbn };
