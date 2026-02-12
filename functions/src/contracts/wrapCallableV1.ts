import * as functions from "firebase-functions";
import { CONTRACT_VERSION } from "./shared/version";
import { failureEnvelope, successEnvelope } from "./envelope";
import { resolveCallableContract } from "./contractResolver";
import { fromError, fromValidationFailure } from "./errorMapper";
import { logValidationFailure } from "./observability";
import { generateCorrelationId, getHeaderValue } from "./correlation";
import type { CallableEndpointKey } from "./types";

type V1CallableLike = {
  run: (data: unknown, context: functions.https.CallableContext) => Promise<unknown> | unknown;
};

export function wrapCallableV1<K extends CallableEndpointKey>(
  endpointKey: K,
  rawCallable: V1CallableLike
) {
  const contract = resolveCallableContract(endpointKey);

  return functions.https.onCall(async (data, context) => {
    const correlationId =
      getHeaderValue(
        context.rawRequest?.headers as Record<string, unknown> | undefined,
        "x-correlation-id"
      ) ?? generateCorrelationId();

    const uid = context.auth?.uid ?? null;

    const parsedRequest = contract.requestSchema.safeParse(data);
    if (!parsedRequest.success) {
      logValidationFailure({
        endpointKey,
        contractVersion: CONTRACT_VERSION,
        correlationId,
        uid,
        validationErrors: parsedRequest.error.flatten(),
        stage: "request",
      });

      const mapped = fromValidationFailure("request", parsedRequest.error.flatten());
      return failureEnvelope(mapped.code, mapped.message, mapped.details);
    }

    try {
      const rawResult = await rawCallable.run(parsedRequest.data, context);

      const wrappedResult = successEnvelope(rawResult);
      const parsedResponse = contract.responseSchema.safeParse(wrappedResult);

      if (!parsedResponse.success) {
        logValidationFailure({
          endpointKey,
          contractVersion: CONTRACT_VERSION,
          correlationId,
          uid,
          validationErrors: parsedResponse.error.flatten(),
          stage: "response",
        });

        const mapped = fromValidationFailure("response", parsedResponse.error.flatten());
        return failureEnvelope(mapped.code, mapped.message, mapped.details);
      }

      return parsedResponse.data;
    } catch (error) {
      const mapped = fromError(error);
      return failureEnvelope(mapped.code, mapped.message, mapped.details);
    }
  });
}
