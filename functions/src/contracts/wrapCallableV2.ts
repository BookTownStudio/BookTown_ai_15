import {
  CallableFunction,
  CallableOptions,
  CallableRequest,
  onCall,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { CONTRACT_VERSION } from "./shared/version";
import { failureEnvelope, successEnvelope } from "./envelope";
import { resolveCallableContract } from "./contractResolver";
import { fromError, fromValidationFailure } from "./errorMapper";
import { logValidationFailure } from "./observability";
import { generateCorrelationId, getHeaderValue } from "./correlation";
import type { CallableEndpointKey } from "./types";

type PathSegment = string | number;
type JsonObject = Record<string, unknown>;
type StructuralSnapshot = {
  topLevelKeys: string[];
  nestedKeys: string[];
  undefinedPaths: string[];
  nullPaths: string[];
  enumValues: Record<string, unknown>;
  payloadHash: string;
};

function pathToString(path: readonly PathSegment[]): string {
  return path.length > 0 ? path.map(String).join(".") : "<root>";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashStructuralPayload(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getPathValue(value: unknown, path: readonly PathSegment[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current) && typeof segment === "number") {
      return current[segment];
    }
    if (typeof current === "object") {
      return (current as JsonObject)[String(segment)];
    }
    return undefined;
  }, value);
}

function isSensitivePath(path: readonly PathSegment[]): boolean {
  const joined = path.map(String).join(".").toLowerCase();
  return (
    joined.includes("plaintext") ||
    joined.includes("prose") ||
    joined.includes("body") ||
    joined.endsWith(".content") ||
    joined.endsWith(".text") ||
    joined === "text" ||
    joined.includes(".content.") && joined.endsWith(".text")
  );
}

function summarizeStructuralPayload(payload: unknown): StructuralSnapshot {
  const nestedKeys: string[] = [];
  const undefinedPaths: string[] = [];
  const nullPaths: string[] = [];
  const enumValues: Record<string, unknown> = {};
  const visited = new WeakSet<object>();

  function walk(value: unknown, path: PathSegment[]): unknown {
    const pathName = pathToString(path);
    if (value === undefined) {
      undefinedPaths.push(pathName);
      return { type: "undefined" };
    }
    if (value === null) {
      nullPaths.push(pathName);
      return { type: "null" };
    }
    if (typeof value === "string") {
      if (["source", "authority", "type", "status", "mode"].includes(String(path[path.length - 1]))) {
        enumValues[pathName] = value;
      }
      return isSensitivePath(path)
        ? { type: "string", length: value.length, redacted: true }
        : { type: "string", length: value.length };
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return { type: typeof value, value };
    }
    if (typeof value === "bigint") {
      return { type: "bigint" };
    }
    if (Array.isArray(value)) {
      nestedKeys.push(`${pathName}[]`);
      if (isSensitivePath(path)) {
        return { type: "array", length: value.length, redacted: true };
      }
      return {
        type: "array",
        length: value.length,
        sample: value.slice(0, 8).map((entry, index) => walk(entry, [...path, index])),
      };
    }
    if (typeof value === "object") {
      if (visited.has(value)) {
        return { type: "circular" };
      }
      visited.add(value);
      const entries = Object.entries(value as JsonObject);
      nestedKeys.push(...entries.map(([key]) => pathToString([...path, key])));
      if (isSensitivePath(path)) {
        return { type: "object", keys: entries.map(([key]) => key), redacted: true };
      }
      return Object.fromEntries(entries.map(([key, entry]) => [key, walk(entry, [...path, key])]));
    }
    return { type: typeof value };
  }

  const structuralProjection = walk(payload, []);
  const root = payload && typeof payload === "object" ? payload as JsonObject : {};
  return {
    topLevelKeys: Object.keys(root),
    nestedKeys: nestedKeys.slice(0, 512),
    undefinedPaths: undefinedPaths.slice(0, 256),
    nullPaths: nullPaths.slice(0, 256),
    enumValues,
    payloadHash: hashStructuralPayload(structuralProjection),
  };
}

function summarizeValue(value: unknown, path: readonly PathSegment[] = []): unknown {
  if (value === null) {
    return { type: "null" };
  }
  if (value === undefined) {
    return { type: "undefined" };
  }
  if (typeof value === "string") {
    if (isSensitivePath(path)) {
      return { type: "string", length: value.length, redacted: true };
    }
    return { type: "string", value: value.slice(0, 160), length: value.length };
  }
  if (typeof value === "number") {
    return { type: Number.isNaN(value) ? "nan" : "number", value: Number.isFinite(value) ? value : String(value) };
  }
  if (typeof value === "boolean") {
    return { type: "boolean", value };
  }
  if (typeof value === "bigint") {
    return { type: "bigint", value: value.toString() };
  }
  if (typeof value === "function") {
    return { type: "function" };
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3).map((entry, index) => summarizeValue(entry, [...path, index])),
    };
  }
  if (value instanceof Date) {
    return { type: "Date", value: value.toISOString() };
  }
  if (value instanceof Map) {
    return { type: "Map", size: value.size };
  }
  if (value instanceof Set) {
    return { type: "Set", size: value.size };
  }
  if (typeof value === "object") {
    const objectValue = value as JsonObject;
    const keys = Object.keys(objectValue);
    const isAttrsPath = path[path.length - 1] === "attrs";
    return {
      type: "object",
      prototype: Object.getPrototypeOf(value)?.constructor?.name ?? "null",
      keys,
      ...(isAttrsPath
        ? {
            values: Object.fromEntries(
              keys.slice(0, 24).map((key) => [key, summarizeValue(objectValue[key], [...path, key])])
            ),
          }
        : {}),
    };
  }
  return { type: typeof value };
}

function summarizeValidationIssue(issue: unknown, payload: unknown): JsonObject {
  const record = issue && typeof issue === "object" ? issue as JsonObject : {};
  const path = Array.isArray(record.path) ? record.path as PathSegment[] : [];
  const issueKeys = Array.isArray(record.keys) ? record.keys.filter((key): key is string => typeof key === "string") : [];
  const pathValue = getPathValue(payload, path);
  return {
    path: pathToString(path),
    code: typeof record.code === "string" ? record.code : "unknown",
    message: typeof record.message === "string" ? record.message : undefined,
    expected: record.expected,
    received: record.received,
    keys: issueKeys.length > 0 ? issueKeys : undefined,
    value: summarizeValue(pathValue, path),
    ...(issueKeys.length > 0 && pathValue && typeof pathValue === "object"
      ? {
          rejectedValues: Object.fromEntries(
            issueKeys.map((key) => [key, summarizeValue((pathValue as JsonObject)[key], [...path, key])])
          ),
        }
      : {}),
  };
}

function extractValidationForensics(issues: readonly unknown[], payload: unknown): JsonObject {
  const rejectedFieldPaths: string[] = [];
  const typeMismatches: JsonObject[] = [];
  const unknownKeys: JsonObject[] = [];
  const enumMismatches: JsonObject[] = [];
  const undefinedFields: string[] = [];
  const nullabilityMismatches: JsonObject[] = [];

  issues.forEach((issue) => {
    const record = issue && typeof issue === "object" ? issue as JsonObject : {};
    const path = Array.isArray(record.path) ? record.path as PathSegment[] : [];
    const pathName = pathToString(path);
    const code = typeof record.code === "string" ? record.code : "unknown";
    const value = getPathValue(payload, path);
    rejectedFieldPaths.push(pathName);

    if (code === "unrecognized_keys") {
      const keys = Array.isArray(record.keys)
        ? record.keys.filter((key): key is string => typeof key === "string")
        : [];
      unknownKeys.push({ path: pathName, keys });
      return;
    }

    if (code === "invalid_enum_value" || code === "invalid_value") {
      enumMismatches.push({
        path: pathName,
        expected: record.options ?? record.values ?? record.expected,
        received: summarizeValue(value, path),
      });
    }

    if (value === undefined) {
      undefinedFields.push(pathName);
    }
    if (value === null) {
      nullabilityMismatches.push({
        path: pathName,
        expected: record.expected,
        received: "null",
      });
    }
    if (record.expected !== undefined || record.received !== undefined) {
      typeMismatches.push({
        path: pathName,
        expected: record.expected,
        received: record.received ?? summarizeValue(value, path),
      });
    }
  });

  return {
    rejectedFieldPaths,
    typeMismatches,
    unknownKeys,
    enumMismatches,
    undefinedFields,
    nullabilityMismatches,
  };
}

function summarizeChunkMutationPayload(payload: unknown): JsonObject {
  const data = payload && typeof payload === "object" ? payload as JsonObject : {};
  const snapshot = data.snapshot && typeof data.snapshot === "object" ? data.snapshot as JsonObject : {};
  const contentDoc = snapshot.contentDoc && typeof snapshot.contentDoc === "object"
    ? snapshot.contentDoc as JsonObject
    : {};
  const content = Array.isArray(contentDoc.content) ? contentDoc.content : [];
  return {
    topLevelKeys: Object.keys(data),
    projectId: summarizeValue(data.projectId, ["projectId"]),
    revision: summarizeValue(data.revision, ["revision"]),
    source: summarizeValue(data.source, ["source"]),
    authority: summarizeValue(data.authority, ["authority"]),
    authoritativeSectionIds: summarizeValue(data.authoritativeSectionIds, ["authoritativeSectionIds"]),
    affectedChunkIds: summarizeValue(data.affectedChunkIds, ["affectedChunkIds"]),
    operationKeys: data.operation && typeof data.operation === "object" ? Object.keys(data.operation as JsonObject) : [],
    operationCausalityKeys:
      data.operation && typeof data.operation === "object" &&
      (data.operation as JsonObject).causality && typeof (data.operation as JsonObject).causality === "object"
        ? Object.keys((data.operation as { causality: JsonObject }).causality)
        : [],
    snapshotKeys: Object.keys(snapshot),
    wordCount: summarizeValue(snapshot.wordCount, ["snapshot", "wordCount"]),
    totalSectionCount: summarizeValue(snapshot.totalSectionCount, ["snapshot", "totalSectionCount"]),
    totalChunkCount: summarizeValue(snapshot.totalChunkCount, ["snapshot", "totalChunkCount"]),
    contentDocKeys: Object.keys(contentDoc),
    topNodeCount: content.length,
    topNodes: content.slice(0, 8).map((node, index) => {
      const nodeObject = node && typeof node === "object" ? node as JsonObject : {};
      return {
        index,
        type: nodeObject.type,
        keys: Object.keys(nodeObject),
        attrs: summarizeValue(nodeObject.attrs, ["snapshot", "contentDoc", "content", index, "attrs"]),
        childCount: Array.isArray(nodeObject.content) ? nodeObject.content.length : 0,
      };
    }),
  };
}

function createValidationDetails(error: { flatten: () => unknown; issues: unknown[] }, payload: unknown): JsonObject {
  return {
    flatten: error.flatten(),
    issues: error.issues.map((issue) => summarizeValidationIssue(issue, payload)),
  };
}

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
    const requestStructure = summarizeStructuralPayload(request.data);
    if (!parsedRequest.success) {
      const validationDetails = createValidationDetails(parsedRequest.error, request.data);
      const validationForensics = extractValidationForensics(parsedRequest.error.issues, request.data);
      logValidationFailure({
        endpointKey,
        contractVersion: CONTRACT_VERSION,
        correlationId,
        uid,
        validationErrors: validationDetails,
        stage: "request",
      });

      if (endpointKey === "applyWriteChunkMutation") {
        logger.error("[WRITE][CHUNK_MUTATION_CONTRACT_REJECTION]", {
          endpointKey,
          callableName: endpointKey,
          schemaName: "writeChunkMutationRequestSchema",
          validationSuccess: false,
          contractVersion: CONTRACT_VERSION,
          correlationId,
          uid,
          projectId: request.data && typeof request.data === "object"
            ? (request.data as JsonObject).projectId
            : undefined,
          revisionId: request.data && typeof request.data === "object"
            ? (request.data as JsonObject).revision
            : undefined,
          ...validationForensics,
          validationDetails,
          payloadStructure: requestStructure,
          payloadSummary: summarizeChunkMutationPayload(request.data),
        });
      }

      const mapped = fromValidationFailure("request", validationDetails);
      return failureEnvelope(mapped.code, mapped.message, mapped.details);
    }

    if (endpointKey === "applyWriteChunkMutation") {
      logger.info("[WRITE][CHUNK_MUTATION_CONTRACT_VALIDATION]", {
        endpointKey,
        callableName: endpointKey,
        schemaName: "writeChunkMutationRequestSchema",
        validationSuccess: true,
        contractVersion: CONTRACT_VERSION,
        correlationId,
        uid,
        projectId: parsedRequest.data && typeof parsedRequest.data === "object"
          ? (parsedRequest.data as JsonObject).projectId
          : undefined,
        revisionId: parsedRequest.data && typeof parsedRequest.data === "object"
          ? (parsedRequest.data as JsonObject).revision
          : undefined,
        payloadStructure: requestStructure,
      });
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
