// Role authority is derived from Firebase custom claims only.

/**
 * Defines the standardized user roles across the application.
 * - `superadmin`: Full control over the application.
 * - `moderator`: Moderation and operational admin actions.
 * - `user`: Standard user with no special privileges.
 */
export type UserRole = 'superadmin' | 'moderator' | 'user';

const CLAIM_ROLE_ALIASES: Record<string, UserRole> = {
    user: 'user',
    moderator: 'moderator',
    superadmin: 'superadmin',
    superuser: 'moderator',
    admin: 'superadmin',
    system: 'superadmin',
};

interface DeriveUserRoleArgs {
    claimsRole?: string | null;
}

/**
 * Determines a user's role from Firebase custom claims.
 *
 * @param args - Contains role data extracted from ID token claims.
 * @returns The determined `UserRole`.
 */
export const deriveUserRole = ({ claimsRole }: DeriveUserRoleArgs): UserRole => {
    if (typeof claimsRole === 'string') {
        const normalized = claimsRole.trim().toLowerCase();
        if (normalized in CLAIM_ROLE_ALIASES) {
            return CLAIM_ROLE_ALIASES[normalized];
        }
    }
    return 'user';
};

/**
 * A helper function to quickly check if a given role has admin-level privileges.
 *
 * @param role - The `UserRole` to check.
 * @returns `true` if the role is 'superadmin' or 'moderator', otherwise `false`.
 */
export const isAdminRole = (role: UserRole): boolean => {
    return role === 'superadmin' || role === 'moderator';
};

/**
 * Helper to check if a user is a Super Admin (full access).
 */
export const isSuperAdmin = (role: UserRole): boolean => {
    return role === 'superadmin';
};
