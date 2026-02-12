import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { User } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

export const useUserProfile = (uid: string | undefined) => {
  return useQuery<User | null>({
    // FIX: Cast readonly queryKey tuple to mutable any[] through unknown
    queryKey: queryKeys.user.profile(uid) as unknown as any[],
    queryFn: async () => {
      try {
        return await dataService.users.getProfile(uid!);
      } catch (error: any) {
        // AUTH_PROFILE_BOOTSTRAP_INVARIANT_LOCK_V1
        // Missing profile is expected on first login before bootstrap completes.
        const isNotFound =
          error?.message?.includes('not found') ||
          error?.code === 'not-found';

        if (isNotFound) {
          return null;
        }
        throw error;
      }
    },

    /**
     * PROFILE_V1_READ_NORMALIZATION
     * --------------------------------
     * Enforces locked invariants at the read boundary:
     * - handle is authoritative (never synthesized)
     * - display name is never empty (UI-safe)
     * - cosmetic fields may change, identity does not
     */
    select: (profile) => {
      if (!profile) return null;

      const resolveDate = (value: any): string | null => {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (value instanceof Date) return value.toISOString();
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        return null;
      };

      const resolvedJoinDate =
        resolveDate(profile.joinDate) ||
        resolveDate((profile as any).createdAt) ||
        profile.joinDate ||
        '';

      return {
        ...profile,
        joinDate: resolvedJoinDate,
        name:
          typeof profile.name === 'string' && profile.name.trim().length > 0
            ? profile.name
            : '.', // minimal valid display name invariant
        handle: profile.handle, // handle is authoritative & immutable
      };
    },

    enabled: !!uid,
    staleTime: 1000 * 60 * 15, // 15 minutes — identity is stable
  });
};
