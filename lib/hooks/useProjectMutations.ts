
import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { WriteRepository } from '../../services/writeRepository.ts';
import { dataService } from '../../services/dataService.ts';
import { Project, PublishedBook } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';
import type {
    CanonicalBookPublishResult,
    LongformPublicationPublishResult,
    ProjectReleaseRecord,
} from '../../services/firebaseProjectService.ts';

function insertProjectIntoProjectsCache(
    queryClient: ReturnType<typeof useQueryClient>,
    uid: string,
    project: Project
) {
    queryClient.setQueryData(queryKeys.user.projects(uid) as unknown as any[], (old: Project[] | undefined) => {
        const existing = Array.isArray(old) ? old : [];
        const withoutDuplicate = existing.filter((item) => item.id !== project.id);
        return [project, ...withoutDuplicate];
    });
}

export const useCreateProject = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (newProject: Omit<Project, 'id' | 'updatedAt' | 'createdAt'>) => {
            if (!uid) throw new Error("Unauthenticated write attempt blocked.");
            // RULE: Materialization MUST go through WriteRepository
            return WriteRepository.createProject(uid, newProject);
        },
        onSuccess: (data) => {
            if (uid && data.id) {
                insertProjectIntoProjectsCache(queryClient, uid, data);
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData(queryKeys.user.project(uid, data.id) as unknown as any[], data);
            }
        },
    });
};

export const useDeleteProject = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (projectId: string) => {
            if (!uid) throw new Error("Unauthenticated delete attempt blocked.");
            // Direct call to dataService for delete is acceptable as it's authoritative
            await dataService.projects.deleteProject(uid, projectId);
            return { success: true, projectId };
        },
        onMutate: async (projectId) => {
            if (!uid) return;
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries(queryKeys.user.projects(uid) as unknown as any[]);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousProjects = queryClient.getQueryData(queryKeys.user.projects(uid) as unknown as any[]);
            
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.user.projects(uid) as unknown as any[], (old: Project[] = []) => 
                old.filter(p => p.id !== projectId)
            );
            return { previousProjects };
        },
        onSettled: () => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
        },
    });
};

export const useDuplicateProject = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (projectId: string) => {
            if (!uid) throw new Error("Unauthenticated duplicate attempt blocked.");
            return dataService.projects.duplicateProject(uid, projectId);
        },
        onSuccess: (data) => {
             if (uid && data.id) {
                insertProjectIntoProjectsCache(queryClient, uid, data);
             }
             // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
             queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
        },
    });
};

export const useCreateProjectShareLink = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (projectId: string) => {
            if (!uid) throw new Error("Unauthenticated share attempt blocked.");
            return dataService.projects.createShareLink(uid, projectId, window.location.origin);
        },
    });
};

interface UpdateProjectVariables {
    projectId: string;
    updates: Partial<Project>;
}

export const useUpdateProject = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async ({ projectId, updates }: UpdateProjectVariables) => {
            if (!uid) throw new Error("Unauthenticated update attempt blocked.");
            // RULE: All updates via WriteRepository to ensure existence checks
            await WriteRepository.updateProject(uid, projectId, updates);
            return { success: true };
        },
        onMutate: async ({ projectId, updates }) => {
            if (!uid) return;
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries(queryKeys.user.project(uid, projectId) as unknown as any[]);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries(queryKeys.user.projects(uid) as unknown as any[]);
            
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousProject = queryClient.getQueryData(queryKeys.user.project(uid, projectId) as unknown as any[]);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousProjects = queryClient.getQueryData(queryKeys.user.projects(uid) as unknown as any[]);

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.user.project(uid, projectId) as unknown as any[], (old: any) => 
                old ? { ...old, ...updates } : old
            );

            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.user.projects(uid) as unknown as any[], (old: Project[] = []) => 
                old.map(p => p.id === projectId ? { ...p, ...updates } : p)
            );

            return { previousProject, previousProjects };
        },
        onSettled: (data, error, { projectId }) => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(queryKeys.user.project(uid, projectId) as unknown as any[]);
        },
    });
};

interface StageBookFilesVariables {
    projectId: string;
    files: {
        epub: Blob;
        pdf: Blob;
    }
}

export const useStageBookFiles = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async ({ projectId, files }: StageBookFilesVariables) => {
            if (!uid) throw new Error("Unauthenticated upload attempt blocked.");
            return dataService.projects.stageBookFiles(uid, projectId, files);
        }
    });
};

interface ConfirmPublishVariables {
    projectId: string;
    metadata: {
        title: string;
        description: string;
        coverUrl?: string;
    };
    files: {
        epubUrl: string;
        pdfUrl: string;
    }
}

export const useConfirmPublish = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation<PublishedBook, ConfirmPublishVariables>({
        mutationFn: async ({ projectId, metadata, files }) => {
            if (!uid) throw new Error("Unauthenticated publish attempt blocked.");
            return dataService.projects.publishBook(uid, projectId, metadata, files);
        },
        onSuccess: (data, vars) => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.invalidateQueries(queryKeys.user.project(uid, vars.projectId) as unknown as any[]);
        }
    });
};

interface CreateProjectReleaseVariables {
    projectId: string;
    publishKind: 'ebook_epub' | 'blog';
}

export const useCreateProjectRelease = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation<ProjectReleaseRecord, CreateProjectReleaseVariables>({
        mutationFn: async ({ projectId, publishKind }) => {
            if (!uid) throw new Error("Unauthenticated release creation attempt blocked.");
            return dataService.projects.createProjectRelease(projectId, publishKind);
        },
    });
};

type PublishReleaseVariables = {
    releaseId: string;
    target: 'blog' | 'ebook';
    projectId: string;
};

type PublishReleaseResult =
    | ({ target: 'blog' } & LongformPublicationPublishResult)
    | ({ target: 'ebook' } & CanonicalBookPublishResult);

export const usePublishProjectRelease = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation<PublishReleaseResult, PublishReleaseVariables>({
        mutationFn: async ({ releaseId, target }) => {
            if (!uid) throw new Error("Unauthenticated publish attempt blocked.");

            if (target === 'blog') {
                const result = await dataService.projects.bridgeReleaseToLongformPublication(releaseId);
                return {
                    target,
                    ...result,
                };
            }

            await dataService.projects.generateProjectReleaseEpub(releaseId);
            const result = await dataService.projects.bridgeReleaseToCanonicalBook(releaseId);
            return {
                target,
                ...result,
            };
        },
        onSuccess: (_data, vars) => {
            if (uid) {
                queryClient.invalidateQueries(queryKeys.user.projects(uid) as unknown as any[]);
                queryClient.invalidateQueries(queryKeys.user.project(uid, vars.projectId) as unknown as any[]);
            }
        },
    });
};
