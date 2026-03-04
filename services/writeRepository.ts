import { devLog } from '../lib/logging/devLog';

import { Project } from '../types/entities.ts';
import { dataService } from './dataService.ts';
import { normalizeProject, normalizeList } from '../lib/data-validation.ts';

/**
 * WriteRepository
 * Authoritative persistence layer for writing projects.
 * Enforces FIRESTORE as the single source of truth for authenticated users.
 */
export const WriteRepository = {
    /**
     * loadProjects
     * Source: Firestore only for authenticated users.
     * Performs a sync-audit to remove local "ghosts" from query caches.
     */
    async loadProjects(uid: string, isGuest: boolean): Promise<Project[]> {
        devLog(`[WriteRepo] Loading projects for UID: ${uid} (Guest: ${isGuest})`);
        
        // 1. Authoritative Fetch
        const projects = await dataService.projects.getProjects(uid);
        const normalized = normalizeList(projects, normalizeProject);

        // 2. Perform Ghost Audit (One-time check per fetch session)
        this.auditAndCleanupLocalGhosts(uid, normalized);

        return normalized;
    },

    /**
     * createProject
     * Authoritative materialization via Cloud Function.
     * Structural Rule: No local ID generation permitted for persistent projects.
     */
    async createProject(uid: string, project: Omit<Project, 'id' | 'updatedAt' | 'createdAt'>): Promise<Project> {
        devLog(`[WriteRepo] Requesting materialization for new project...`);
        const result = await dataService.projects.createProject(uid, project);
        
        if (!result.id) {
            throw new Error("MATERIALIZATION_FAILURE: Server returned no canonical ID.");
        }

        return normalizeProject(result);
    },

    /**
     * getProject
     * Direct authoritative point-read by canonical ID.
     * Avoids list scans and preserves bounded read cost.
     */
    async getProject(uid: string, projectId: string): Promise<Project> {
        if (!projectId || projectId === 'new') {
            throw new Error("AUTHORITY_VIOLATION: Invalid project ID for persistent read.");
        }
        const project = await dataService.projects.getProject(uid, projectId);
        return normalizeProject(project);
    },

    /**
     * updateProject
     * Structural Rule: Strict check - document MUST exist in Firestore.
     */
    async updateProject(uid: string, projectId: string, updates: Partial<Project>): Promise<void> {
        if (!projectId || projectId === 'new') {
            throw new Error("PERSISTENCE_VIOLATION: Cannot update a project without a canonical authority ID.");
        }
        await dataService.projects.updateProject(uid, projectId, updates);
    },

    /**
     * auditAndCleanupLocalGhosts
     * Compares local query caches against Firestore authority.
     * Purges any locally indexed items that don't exist on the server.
     */
    auditAndCleanupLocalGhosts(uid: string, serverProjects: Project[]) {
        const hasBeenCleaned = localStorage.getItem(`booktown_write_audit_${uid}`);
        if (hasBeenCleaned) return;

        console.warn(`[WriteRepo][AUDIT] Starting Write Persistence Audit for ${uid}...`);
        
        const serverIds = new Set(serverProjects.map(p => p.id));
        
        // 1. Scan React Query Cache (Primary source of ghost visibility)
        const cacheKey = 'booktown_query_cache_v2';
        try {
            const stored = localStorage.getItem(cacheKey);
            if (stored) {
                const cache = JSON.parse(stored);
                let removedCount = 0;
                
                // Key format for projects detail is usually: ["user","project", uid, projectId]
                Object.keys(cache).forEach(key => {
                    if (key.includes(`"project"`) && key.includes(`"${uid}"`)) {
                        const parsedKey = JSON.parse(key);
                        const id = parsedKey[parsedKey.length - 1];
                        
                        if (id !== 'new' && !serverIds.has(id)) {
                            console.warn(`[WriteRepo][CLEANUP] Evicting ghost authority: ${id}`);
                            delete cache[key];
                            removedCount++;
                        }
                    }
                });

                if (removedCount > 0) {
                    localStorage.setItem(cacheKey, JSON.stringify(cache));
                    devLog(`[WriteRepo][AUDIT_COMPLETE] Successfully purged ${removedCount} ghost projects.`);
                } else {
                    devLog(`[WriteRepo][AUDIT_COMPLETE] No ghost projects found in local cache.`);
                }
            }
        } catch (e) {
            console.error("[WriteRepo][AUDIT_FAILED] Local cache parsing error during cleanup.", e);
        }

        localStorage.setItem(`booktown_write_audit_${uid}`, 'true');
    }
};
