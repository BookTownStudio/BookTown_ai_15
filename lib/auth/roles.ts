// Roles are currently derived from user profile data and a static admin email
// allowlist. Long-term authority should come from backend-issued claims.

import { User } from '../../types/entities.ts';

/**
 * Defines the standardized user roles across the application.
 * - `superadmin`: Full control over the application.
 * - `superuser`: Can manage content and users, limited analytics.
 * - `moderator`: Legacy/Alias for basic moderation tasks.
 * - `user`: Standard user with no special privileges.
 */
export type UserRole = 'superadmin' | 'superuser' | 'moderator' | 'user';

/**
 * A hardcoded list of emails that are granted superadmin privileges.
 * Long-term, roles should be managed via a secure backend system.
 */
export const ADMIN_EMAILS: string[] = ['booktown10@gmail.com', 'test@booktown.com', 'admin@booktown.com'];

interface DeriveUserRoleArgs {
    authUser?: {
        uid: string;
        email?: string | null;
    } | null;
    profile?: Partial<User> | null;
}

/**
 * Determines a user's role based on their profile or email address.
 *
 * The priority is as follows:
 * 1. Role explicitly defined in the user's profile.
 * 2. Email address matching the hardcoded `ADMIN_EMAILS` list.
 * 3. Default to 'user' if neither of the above conditions is met.
 *
 * @param args - An object containing the authenticated user and their profile data.
 * @returns The determined `UserRole`.
 */
export const deriveUserRole = ({ authUser, profile }: DeriveUserRoleArgs): UserRole => {
    // 1. Check for a role in the user's profile.
    if (profile?.role && ['superadmin', 'superuser', 'moderator'].includes(profile.role)) {
        return profile.role as UserRole;
    }

    // 2. Check if the authenticated user's email is in the admin list.
    if (authUser?.email && ADMIN_EMAILS.includes(authUser.email)) {
        return 'superadmin';
    }

    // 3. Default to a standard user.
    return 'user';
};

/**
 * A helper function to quickly check if a given role has admin-level privileges.
 *
 * @param role - The `UserRole` to check.
 * @returns `true` if the role is 'superadmin', 'superuser', or 'moderator', otherwise `false`.
 */
export const isAdminRole = (role: UserRole): boolean => {
    return role === 'superadmin' || role === 'superuser' || role === 'moderator';
};

/**
 * Helper to check if a user is a Super Admin (full access).
 */
export const isSuperAdmin = (role: UserRole): boolean => {
    return role === 'superadmin';
};
