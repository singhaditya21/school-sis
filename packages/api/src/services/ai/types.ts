// AI Fee Intelligence Types

export interface RiskScore {
    score: number; // 0-100
    tier: RiskTier;
    factors: RiskFactors;
    lastCalculated: Date;
}

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactors {
    overdueFactor: number;
    historyFactor: number;
    amountFactor: number;
    responsiveFactor: number;
}

export interface PaymentPrediction {
    likelihood7Days: number; // 0-100
    likelihood14Days: number;
    likelihood30Days: number;
    suggestedAction: SuggestedAction;
    confidence: number;
}

export type SuggestedAction =
    | 'no_action'
    | 'send_reminder'
    | 'send_urgent_reminder'
    | 'call_guardian'
    | 'escalate_to_principal';

export interface ReminderRecommendation {
    optimalDay: string; // 'Monday', 'Tuesday', etc.
    optimalTime: string; // 'morning', 'afternoon', 'evening'
    channel: 'sms' | 'email' | 'whatsapp';
    reason: string;
}

export interface CollectionForecast {
    next7Days: number;
    next14Days: number;
    next30Days: number;
    historicalAccuracy: number;
}

export interface StudentRiskProfile {
    studentId: string;
    studentName: string;
    className: string;
    riskScore: RiskScore;
    totalDue: number;
    overdueAmount: number;
    daysOverdue: number;
    lastPaymentDate: Date | null;
    paymentPrediction: PaymentPrediction;
    reminderRecommendation: ReminderRecommendation;
}

export interface FeeIntelligenceSummary {
    totalAtRisk: number;
    criticalCount: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    totalOverdueAmount: number;
    collectionForecast: CollectionForecast;
    topDefaulters: StudentRiskProfile[];
}
