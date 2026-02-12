// lib/matchmaker/matchmaker.types.ts

import { UserStats } from '../../services/db.types.ts';
import { Book } from '../../types/entities.ts';

/**
 * MatchMaker Input Context
 * ------------------------------------------------
 * Authoritative context for the recommendation engine.
 *
 * NOTE: profileCompletionScore is a Read-Only modifier. 
 * It is categorized as a non-preference, non-behavioral signal
 * used to weigh the overall reliability of the user's data graph.
 */
export interface MatchContext {
    readonly userStats?: UserStats;
    readonly currentShelfIds?: string[];
    readonly recentBookIds?: string[];
}

export interface Recommendation {
    bookId: string;
    baseConfidence: number; // 0.0 to 1.0
    reasonEn: string;
    reasonAr: string;
}

export interface WeightedRecommendation extends Recommendation {
    finalConfidence: number;
}
