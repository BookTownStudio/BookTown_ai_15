import { devLog } from '../lib/logging/devLog';

import { AgentService } from './agents.types';
import { RealAgentService } from './realAgentService';

devLog('[AgentService] Initializing. Mode: REAL (Backend)');

export const agentService: AgentService = new RealAgentService();
