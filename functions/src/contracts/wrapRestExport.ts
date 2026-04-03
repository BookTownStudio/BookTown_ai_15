import { Request, onRequest, HttpsFunction } from "firebase-functions/v2/https";
import type { Response } from "express";
import { CONTRACT_VERSION } from "./shared/version";
import { failureEnvelope, successEnvelope } from "./envelope";
import { resolveRestContract } from "./contractResolver";
import { fromError, fromHttpStatus, fromValidationFailure } from "./errorMapper";
import { logValidationFailure } from "./observability";
import { generateCorrelationId, getHeaderValue } from "./correlation";

type RestOptions = {
  region?: unknown;
  timeoutSeconds?: unknown;
  memory?: unknown;
};

function extractRestOptions(raw: HttpsFunction): RestOptions | null {
  const endpoint = (raw as unknown as { __endpoint?: Record<string, unknown> }).__endpoint;
  if (!endpoint) return null;

  const opts: RestOptions = {};

  if (endpoint.region) {
    opts.region = endpoint.region;
  }

  if (typeof endpoint.timeoutSeconds === "number") {
    opts.timeoutSeconds = endpoint.timeoutSeconds;
  }

  if (typeof endpoint.availableMemoryMb === "number") {
    opts.memory = `${endpoint.availableMemoryMb}MiB`;
  }

  return Object.keys(opts).length > 0 ? opts : null;
}

function normalizeRequestPayload(endpointKey: string, req: Request): unknown {
  if (endpointKey === "searchBooks") {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw)
        ? Math.trunc(limitRaw)
        : undefined;

    const ebookOnlyRaw = req.query.ebookOnly;
    const ebookOnly =
      ebookOnlyRaw === "true"
        ? true
        : ebookOnlyRaw === "false"
        ? false
        : undefined;
    const availabilityOnlyRaw = req.query.availabilityOnly;
    const availabilityOnly =
      availabilityOnlyRaw === "true"
        ? true
        : availabilityOnlyRaw === "false"
        ? false
        : undefined;

    return {
      q,
      lang,
      ...(cursor ? { cursor } : {}),
      ...(limit === undefined ? {} : { limit }),
      ...(ebookOnly === undefined ? {} : { ebookOnly }),
      ...(availabilityOnly === undefined ? {} : { availabilityOnly }),
    };
  }

  return req.body ?? {};
}

export function wrapRestExport(rawRest: HttpsFunction): HttpsFunction {
  const wrappedHandler = async (req: Request, res: Response) => {
    const resolved = resolveRestContract(req.method, req.path || req.url);
    if (!resolved) {
      return rawRest(req, res);
    }

    const { key: endpointKey, contract } = resolved;

    const correlationId =
      getHeaderValue(req.headers as Record<string, unknown>, "x-correlation-id") ??
      generateCorrelationId();

    const uid =
      getHeaderValue(req.headers as Record<string, unknown>, "x-booktown-uid") ??
      null;

    const parsedRequest = contract.requestSchema.safeParse(
      normalizeRequestPayload(endpointKey, req)
    );

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
      res
        .status(400)
        .json(failureEnvelope(mapped.code, mapped.message, mapped.details));
      return;
    }

    const originalJson = res.json.bind(res);

    (res as unknown as { json: (body: unknown) => Response }).json = (
      body: unknown
    ): Response => {
      if (res.statusCode >= 400) {
        const mapped = fromHttpStatus(res.statusCode, body);
        return originalJson(failureEnvelope(mapped.code, mapped.message, mapped.details));
      }

      const wrappedSuccess = successEnvelope(body);
      const parsedResponse = contract.responseSchema.safeParse(wrappedSuccess);

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
        res.status(500);
        return originalJson(
          failureEnvelope(mapped.code, mapped.message, mapped.details)
        );
      }

      return originalJson(parsedResponse.data);
    };

    try {
      await rawRest(req, res);
      return;
    } catch (error) {
      const mapped = fromError(error);
      if (!res.headersSent) {
        res
          .status(500)
          .json(failureEnvelope(mapped.code, mapped.message, mapped.details));
        return;
      }
      return;
    }
  };

  const opts = extractRestOptions(rawRest);
  return opts
    ? onRequest(opts as any, wrappedHandler)
    : onRequest(wrappedHandler);
}
