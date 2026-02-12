import { useAuth } from '../auth.tsx';

export const useEffectiveUid = () => {
  const { user, isGuest } = useAuth();

  // Single authoritative identity
  return isGuest ? 'alex_doe' : user?.uid || null;
};