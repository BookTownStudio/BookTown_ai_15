import {
  CallableFunction,
  CallableOptions,
  CallableRequest,
  onCall,
} from "firebase-functions/v2/https";
import { CONTRACT_VERSION } from "./shared/version";
import { failureEnvelope, successEnvelope } from "./envelope";
import { resolveCallableContract } from "./contractResolver";
import { fromError, fromValidationFailure } from "./errorMapper";
import { logValidationFailure } from "./observability";
import { generateCorrelationId, getHeaderValue } from "./correlation";
import type { CallableEndpointKey } from "./types";

function extractCallableOptions(rawCallable: unknown): CallableOptions | null {
  const endpoint =
    rawCallable && typeof rawCallable === "object"
      ? (rawCallable as { __endpoint?: Record<string, unknown> }).__endpoint
      : undefined;

  if (!endpoint) {
    return null;
  }

  const opts: CallableOptions = {};

  if (endpoint.region) {
    opts.region = endpoint.region as CallableOptions["region"];
  }

  if (typeof endpoint.timeoutSeconds === "number") {
    opts.timeoutSeconds = endpoint.timeoutSeconds;
  }

  if (typeof endpoint.availableMemoryMb === "number") {
    opts.memory = `${endpoint.availableMemoryMb}MiB` as CallableOptions["memory"];
  }

  return Object.keys(opts).length > 0 ? opts : null;
}

export function wrapCallableV2<K extends CallableEndpointKey>(
  endpointKey: K,
  rawCallable: CallableFunction<unknown, unknown>
): CallableFunction<unknown, unknown> {
  const contract = resolveCallableContract(endpointKey);

  const wrappedHandler = async (request: CallableRequest<unknown>) => {
    const correlationId =
      getHeaderValue(
        request.rawRequest?.headers as Record<string, unknown> | undefined,
        "x-correlation-id"
      ) ?? generateCorrelationId();

    const uid = request.auth?.uid ?? null;

    const parsedRequest = contract.requestSchema.safeParse(request.data);
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
      const rawResult = await rawCallable.run({
        ...request,
        data: parsedRequest.data,
      } as CallableRequest<unknown>);

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
  };

  const opts = extractCallableOptions(rawCallable);
  return opts ? onCall(opts, wrappedHandler) : onCall(wrappedHandler);
}
