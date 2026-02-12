import { z } from "zod";
import { apiContracts } from "./shared/apiContracts";

export type CallableEndpointKey = keyof typeof apiContracts.callable;
export type RestEndpointKey = keyof typeof apiContracts.rest;

export type CallableContract<K extends CallableEndpointKey> =
  (typeof apiContracts.callable)[K];

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
  (typeof apiContracts.callable)[CallableEndpointKey]["errorSchema"]
>;
