import React from 'react';

interface ScholarMindCrestProps {
    size?: 'sm' | 'md' | 'lg';
    variant?: 'navy' | 'midnight';
    className?: string;
}

/**
 * Oxford Navy & Heritage Brass heraldic crest mark for ScholarMind.
 * Uses pure semantic tokens (zero numbered Tailwind color literals).
 */
export function ScholarMindCrest({
    size = 'md',
    variant = 'navy',
    className = '',
}: ScholarMindCrestProps) {
    const dims =
        size === 'sm'
            ? 'w-8 h-8 rounded-lg'
            : size === 'lg'
              ? 'w-12 h-12 rounded-xl'
              : 'w-10 h-10 rounded-xl';

    const svgSize = size === 'sm' ? 18 : size === 'lg' ? 24 : 20;

    const surface =
        variant === 'midnight'
            ? 'bg-brass text-brass-foreground ring-1 ring-brass/60 shadow-sm'
            : 'bg-primary text-primary-foreground ring-1 ring-brass/50 shadow-sm';

    return (
        <div
            aria-hidden="true"
            className={`${dims} ${surface} inline-flex items-center justify-center shrink-0 relative overflow-hidden ${className}`}
        >
            <span className="absolute inset-x-0 top-0 h-[2px] bg-brass" />
            <svg
                width={svgSize}
                height={svgSize}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M12 2.5L4.5 5.75V11.5C4.5 16.35 7.7 20.78 12 22C16.3 20.78 19.5 16.35 19.5 11.5V5.75L12 2.5Z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path
                    d="M8.5 10.5L12 8.5L15.5 10.5L12 12.5L8.5 10.5Z"
                    fill="hsl(var(--brass))"
                    stroke="hsl(var(--brass))"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                />
                <path
                    d="M9.5 13.25V15.5C9.5 16.35 10.62 17 12 17C13.38 17 14.5 16.35 14.5 15.5V13.25"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    );
}
