'use client';

import { Badge } from '@/components/ui/badge';
import type { RiskTier } from '@/lib/services/ai/types';

interface RiskScoreBadgeProps {
    score: number;
    tier: RiskTier;
    showScore?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

const TIER_CONFIG = {
    low: {
        label: 'Low Risk',
        icon: '🟢',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
    },
    medium: {
        label: 'Medium Risk',
        icon: '🟡',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
    },
    high: {
        label: 'High Risk',
        icon: '🟠',
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    },
    critical: {
        label: 'Critical',
        icon: '🔴',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    },
};

export function RiskScoreBadge({ score, tier, showScore = true, size = 'md' }: RiskScoreBadgeProps) {
    const config = TIER_CONFIG[tier];

    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-1',
        lg: 'text-base px-3 py-1.5',
    };

    return (
        <Badge
            variant="outline"
            className={`${config.className} ${sizeClasses[size]} font-medium`}
        >
            <span className="mr-1">{config.icon}</span>
            {showScore ? (
                <span>{score}</span>
            ) : (
                <span>{config.label}</span>
            )}
        </Badge>
    );
}

interface RiskScoreBarProps {
    score: number;
    showLabels?: boolean;
}

export function RiskScoreBar({ score, showLabels = true }: RiskScoreBarProps) {
    const getColor = (score: number) => {
        if (score <= 25) return 'bg-green-500';
        if (score <= 50) return 'bg-yellow-500';
        if (score <= 75) return 'bg-orange-500';
        return 'bg-red-500';
    };

    return (
        <div className="w-full">
            <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    className={`absolute left-0 top-0 h-full ${getColor(score)} transition-all duration-500`}
                    style={{ width: `${score}%` }}
                />
            </div>
            {showLabels && (
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>100</span>
                </div>
            )}
        </div>
    );
}

interface RiskBreakdownProps {
    factors: {
        overdueFactor: number;
        historyFactor: number;
        amountFactor: number;
        responsiveFactor: number;
    };
}

export function RiskBreakdown({ factors }: RiskBreakdownProps) {
    const items = [
        { label: 'Overdue Days', value: factors.overdueFactor, max: 40, color: 'bg-red-400' },
        { label: 'Payment History', value: factors.historyFactor, max: 30, color: 'bg-orange-400' },
        { label: 'Amount Owed', value: factors.amountFactor, max: 20, color: 'bg-yellow-400' },
        { label: 'Responsiveness', value: factors.responsiveFactor, max: 10, color: 'bg-blue-400' },
    ];

    return (
        <div className="space-y-2">
            {items.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{item.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${item.color}`}
                            style={{ width: `${(item.value / item.max) * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-medium w-8 text-right">{item.value}/{item.max}</span>
                </div>
            ))}
        </div>
    );
}
