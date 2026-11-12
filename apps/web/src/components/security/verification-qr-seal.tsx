import { buildVerificationMatrix } from '@/lib/security/gate-pass-token';

interface VerificationQrSealProps {
    seed: string;
    sizePx?: number;
    label?: string;
}

function isFinderCenter(r: number, c: number, size: number): boolean {
    const topLeft = r >= 2 && r <= 4 && c >= 2 && c <= 4;
    const topRight = r >= 2 && r <= 4 && c >= size - 5 && c <= size - 3;
    const bottomLeft = r >= size - 5 && r <= size - 3 && c >= 2 && c <= 4;
    return topLeft || topRight || bottomLeft;
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
                <rect width={gridCount} height={gridCount} fill="#FFFFFF" />
                {matrix.map((row, r) =>
                    row.map((active, c) =>
                        active ? (
                            <rect
                                key={`${r}-${c}`}
                                x={c}
                                y={r}
                                width={1}
                                height={1}
                                fill={isFinderCenter(r, c, gridCount) ? '#AF7627' : '#162B4D'}
                            />
                        ) : null,
                    ),
                )}
            </svg>
        </div>
    );
}
