import { z } from "zod";
import { apiContracts } from "./shared/apiContracts";

/**
 * Extend callable keys to allow endpoints not yet registered
 * in apiContracts (e.g. admin tools during development)
 */
export type CallableEndpointKey =
  | keyof typeof apiContracts.callable
  | "adminMergeCanonicalBooks";

export type RestEndpointKey = keyof typeof apiContracts.rest;

/**
 * Safely resolve contract if it exists, otherwise fallback
 */
export type CallableContract<K extends CallableEndpointKey> =
  K extends keyof typeof apiContracts.callable
    ? (typeof apiContracts.callable)[K]
    : {
        requestSchema: z.ZodTypeAny;
        responseSchema: z.ZodTypeAny;
        errorSchema: z.ZodTypeAny;
      };

export type RestContract<K extends RestEndpointKey> =
  (typeof apiContracts.rest)[K];

export type RequestOfCallable<K extends CallableEndpointKey> = z.infer<
  CallableContract<K>["requestSchema"]
>;

export type SuccessEnvelopeOfCallable<K extends CallableEndpointKey> = z.infer<
  CallableContract<K>["responseSchema"]
>;

export type SuccessDataOfCallable<K extends CallableEndpointKey> =
  SuccessEnvelopeOfCallable<K>["data"];

export type FailureEnvelope = z.infer<
  (typeof apiContracts.callable)[keyof typeof apiContracts.callable]["errorSchema"]
>;