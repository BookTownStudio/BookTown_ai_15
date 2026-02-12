import { apiContracts } from "./shared/apiContracts";
import type {
  CallableEndpointKey,
  RestContract,
  RestEndpointKey,
  CallableContract,
} from "./types";

const restIndex = new Map<string, RestEndpointKey>();

for (const [key, contract] of Object.entries(apiContracts.rest) as Array<
  [RestEndpointKey, RestContract<RestEndpointKey>]
>) {
  if (!contract.method || !contract.route) continue;
  restIndex.set(`${contract.method.toUpperCase()} ${normalizePath(contract.route)}`, key);
}

export function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  const trimmed = withoutQuery.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function resolveCallableContract<K extends CallableEndpointKey>(
  endpointKey: K
): CallableContract<K> {
  const contract = apiContracts.callable[endpointKey];
  if (!contract) {
    throw new Error(`Missing callable contract for endpoint: ${endpointKey}`);
  }

  return contract;
}

export function resolveRestContract(
  method: string,
  path: string
): { key: RestEndpointKey; contract: RestContract<RestEndpointKey> } | null {
  const key = restIndex.get(`${method.toUpperCase()} ${normalizePath(path)}`);
  if (!key) return null;

  return {
    key,
    contract: apiContracts.rest[key],
  };
}
