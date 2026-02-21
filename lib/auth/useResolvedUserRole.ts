import { useAuth } from '../auth.tsx';
import { isAdminRole } from './roles.ts';

export function useResolvedUserRole() {
  const { role } = useAuth();
  const isAdmin = isAdminRole(role);

  return { role, isAdmin };
}
