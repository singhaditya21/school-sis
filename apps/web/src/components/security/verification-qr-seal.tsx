import { buildVerificationMatrix } from '@/lib/security/gate-pass-token';

interface VerificationQrSealProps {
    seed: string;
    sizePx?: number;
    label?: string;
}

export function VerificationQrSeal({
    seed,
    sizePx = 126,
    label = 'Cryptographic Verification Seal',
}: VerificationQrSealProps) {
    const matrix = buildVerificationMatrix(seed, 21);
    const gridCount = matrix.length;

    return (
        <div
            className="inline-flex flex-col items-center justify-center rounded-xl border border-brass/40 bg-card p-2.5 shadow-sm"
            aria-label={label}
        >
            <svg
                width={sizePx}
                height={sizePx}
                viewBox={`0 0 ${gridCount} ${gridCount}`}
                shapeRendering="crispEdges"
                role="img"
                aria-label={label}
                className="rounded-sm"
            >
                <rect width={gridCount} height={gridCount} fill="var(--card)" />
                {matrix.map((row, r) =>
                    row.map((active, c) =>
                        active ? (
                            <rect
                                key={`${r}-${c}`}
                                x={c}
                                y={r}
                                width={1}
                                height={1}
                                fill="var(--primary)"
                            />
                        ) : null,
                    ),
                )}
            </svg>
        </div>
    );
}
