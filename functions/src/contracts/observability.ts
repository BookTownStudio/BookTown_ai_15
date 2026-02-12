import * as logger from "firebase-functions/logger";
import { CONTRACT_VERSION } from "./shared/version";

export type ValidationFailureLog = {
  endpointKey: string;
  contractVersion?: string;
  correlationId: string;
  uid: string | null;
  validationErrors: unknown;
  stage: "request" | "response";
};

export function logValidationFailure(payload: ValidationFailureLog): void {
  logger.error("[CONTRACT][VALIDATION_FAILURE]", {
    endpointKey: payload.endpointKey,
    contractVersion: payload.contractVersion ?? CONTRACT_VERSION,
    correlationId: payload.correlationId,
    uid: payload.uid,
    validationErrors: payload.validationErrors,
    stage: payload.stage,
  });
}
