import { onCall } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { mutateAgentSession as mutateAgentSessionRaw } from "../agents/mutateAgentSession";

/**
 * aiLibrarian — lazy-loaded callable
 *
 * librarian.ts (5,000+ lines) and the Vertex AI SDK are NOT imported at module
 * load time.  They are loaded on the first invocation of this function inside
 * the container, then cached by Node's module registry for subsequent calls.
 *
 * Options are replicated from librarianCallable.ts to preserve deployment
 * configuration without eagerly importing the module.
 */
export const aiLibrarian = onCall(
  {
    cors: true,
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 20,
    concurrency: 20,
    enforceAppCheck: true,
  },
  async (request) => {
    const { aiLibrarianCallable } = await import("../ai/librarianCallable");
    return aiLibrarianCallable.run(request as CallableRequest<unknown>);
  }
);

/**
 * aiDiscoverAgent — lazy-loaded callable
 *
 * @google-cloud/vertexai is NOT imported at module load time.
 * Options replicated from discoverAgentCallable.ts.
 */
export const aiDiscoverAgent = onCall(
  {
    cors: true,
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 20,
    concurrency: 20,
    enforceAppCheck: true,
  },
  async (request) => {
    const { aiDiscoverAgentCallable } = await import("../ai/discoverAgentCallable");
    return aiDiscoverAgentCallable.run(request as CallableRequest<unknown>);
  }
);

export const mutateAgentSession = mutateAgentSessionRaw;
