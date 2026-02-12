import { useAuth } from '../auth.tsx';
import { useUserProfile } from '../hooks/useUserProfile.ts';
import { deriveUserRole, isAdminRole } from './roles.ts';

export function useResolvedUserRole() {
  const { user } = useAuth();
  const { data: profile } = useUserProfile(user?.uid);

  const role = deriveUserRole({ authUser: user, profile });
  const isAdmin = isAdminRole(role);

  return { role, isAdmin };
}
