// lib/matchmaker/weighting.ts

import { UserStats } from '../../services/db.types.ts';
import { Recommendation, WeightedRecommendation } from './matchmaker.types.ts';

/**
 * calculateFinalConfidence
 * ------------------------------------------------
 * Authoritative weighting function for MatchMaker V1.
 * 
 * Logic Decision:
 * - Profile Completion Score (PCS) acts as a Confidence Modifier.
 * - Higher PCS indicates a more "complete" data graph, increasing trust in recs.
 * - Lower PCS reduces rec confidence but does not block them (Calm UX).
 *
 * Formula: 
 *   multiplier = clamp(score / 100, 0.6, 1.0)
 *   fallback   = 0.75 (used when score is undefined/missing)
 */
export function calculateFinalConfidence(
    recommendation: Recommendation,
    userStats?: UserStats
): WeightedRecommendation {
    const DEFAULT_MULTIPLIER = 0.75;
    const MIN_MULTIPLIER = 0.6;
    const MAX_MULTIPLIER = 1.0;

    let multiplier = DEFAULT_MULTIPLIER;

    if (userStats && typeof userStats.profileCompletionScore === 'number') {
        const rawScore = userStats.profileCompletionScore;
        // Formula Enforcement: multiplier = clamp(score / 100, 0.6, 1.0)
        multiplier = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, rawScore / 100));
    }

    const finalConfidence = recommendation.baseConfidence * multiplier;

    return {
        ...recommendation,
        finalConfidence: parseFloat(finalConfidence.toFixed(4))
    };
}

/**
 * rankRecommendations
 * Standard ranker using weighted confidence.
 */
export function rankRecommendations(
    recommendations: Recommendation[],
    userStats?: UserStats
): WeightedRecommendation[] {
    return recommendations
        .map(rec => calculateFinalConfidence(rec, userStats))
        .sort((a, b) => b.finalConfidence - a.finalConfidence);
}
