import { logMatchmakerExplainability } from "./explainability";

export interface Recommendation {
    bookId: string;
    baseConfidence: number;
    reasonEn: string;
    reasonAr: string;
}

export interface WeightedRecommendation extends Recommendation {
    finalConfidence: number;
}

/**
 * calculateFinalConfidence (Backend/Authority)
 * ------------------------------------------------
 * Authoritative weighting function for MatchMaker V1.
 * 
 * Logic Decision:
 * - Profile Completion Score (PCS) acts as a Confidence Modifier.
 * - Higher PCS increases trust in the data graph.
 *
 * Formula: 
 *   multiplier = clamp(score / 100, 0.6, 1.0)
 *   fallback   = 0.75
 */
export function calculateFinalConfidence(
    userId: string,
    recommendation: Recommendation,
    profileCompletionScore?: number
): WeightedRecommendation {
    const DEFAULT_MULTIPLIER = 0.75;
    const MIN_MULTIPLIER = 0.6;
    const MAX_MULTIPLIER = 1.0;

    let multiplier = DEFAULT_MULTIPLIER;
    let applied = false;

    if (typeof profileCompletionScore === 'number') {
        const rawScore = profileCompletionScore;
        // Formula Enforcement: multiplier = clamp(score / 100, 0.6, 1.0)
        multiplier = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, rawScore / 100));
        applied = true;
    }

    const finalConfidence = recommendation.baseConfidence * multiplier;

    // 🔒 Non-blocking Explainability Hook
    logMatchmakerExplainability({
        userId,
        profileCompletionScore: profileCompletionScore ?? 0,
        confidenceMultiplier: multiplier,
        applied,
        reason: (applied && multiplier <= 0.75) ? "low_profile_completion" : undefined
    });

    return {
        ...recommendation,
        finalConfidence: parseFloat(finalConfidence.toFixed(4))
    };
}
