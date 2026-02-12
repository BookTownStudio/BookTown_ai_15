
import { AgentService } from './agents.types';
import { MockAgentService } from './mockAgentService';
import { RealAgentService } from './realAgentService';

// Determine environment
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {} as any;
const forceMock = env.VITE_FORCE_MOCK === 'true';

// Check for demo environment hostnames
const isDemoEnv = typeof window !== 'undefined' && (
    window.location.hostname.includes('aistudio') || 
    window.location.hostname.includes('googleusercontent') ||
    window.location.hostname.includes('run.app')
);

// We use the Real service if we are NOT in a demo environment and NOT forced to mock.
// NOTE: Real service requires the backend to be running (e.g., local emulators or deployed functions).
const useRealService = !isDemoEnv && !forceMock;

console.log(`[AgentService] Initializing. Mode: ${useRealService ? 'REAL (Backend)' : 'MOCK (Client)'}`);

export const agentService: AgentService = useRealService ? new RealAgentService() : new MockAgentService();
