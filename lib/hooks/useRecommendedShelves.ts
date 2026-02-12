// lib/hooks/useRecommendedShelves.ts

import { useEffect } from 'react';
import { useUserShelves } from './useUserShelves.ts';

/**
 * useRecommendedShelves
 * ------------------------------------------------
 * UX-only hook.
 *
 * PURPOSE:
 * - Suggest helpful shelves to users
 * - Drive onboarding nudges
 *
 * GUARANTEES:
 * - NO writes
 * - NO system shelf assumptions
 * - NO coupling to reading state
 * - Safe for migrations & partial data
 */
export const useRecommendedShelves = () => {
  const { data: shelves } = useUserShelves();

  useEffect(() => {
    if (!shelves || shelves.length === 0) return;

    /**
     * 🔒 Filter to user-managed shelves only
     */
    const userShelves = shelves.filter(
      s => !s.isSystem && !s.isVirtual
    );

    // Placeholder for future UX logic
    // (e.g. recommend creating genre shelves)
    void userShelves;
  }, [shelves]);
};