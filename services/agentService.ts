
import { AgentService } from './agents.types';
import { RealAgentService } from './realAgentService';

console.log('[AgentService] Initializing. Mode: REAL (Backend)');

export const agentService: AgentService = new RealAgentService();
