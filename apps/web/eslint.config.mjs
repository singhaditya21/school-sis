import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const reactHookMigrationRuleOverrides = {
    'react-hooks/error-boundaries': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/purity': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
};

const relaxedNextVitals = nextVitals.map((config) => (
    config.plugins?.['react-hooks']
        ? {
            ...config,
            rules: {
                ...config.rules,
                ...reactHookMigrationRuleOverrides,
            },
        }
        : config
));

// A Tailwind utility on one of the numbered color scales (e.g. bg-blue-600).
// Semantic tokens (bg-primary, text-muted-foreground) carry no numeric shade.
const COLOR_LITERAL_RE =
    '(?:bg|text|border|ring|from|via|to|fill|stroke|divide|placeholder|caret|accent|decoration|outline)-' +
    '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-' +
    '(?:50|100|200|300|400|500|600|700|800|900|950)';

const NO_COLOR_LITERAL_MESSAGE =
    'Use a semantic design token (bg-primary, text-muted-foreground, border-border, text-destructive, bg-success-subtle, …) instead of a hardcoded Tailwind color shade.';

export default [
    ...relaxedNextVitals,
    ...nextTypescript,
    {
        ignores: [
            '.next/**',
            'node_modules/**',
            'coverage/**',
            'playwright-report/**',
            'src/graphify-out/**',
            'graphify-out/**',
        ],
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
            'prefer-const': 'warn',
            '@next/next/no-html-link-for-pages': 'off',
            'react/no-unescaped-entities': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'no-var': 'off',
        },
    },
    {
        // The design-system source must stay token-pure: no hardcoded color shades.
        // (App-wide regrowth is guarded by the color-literal ratchet test.)
        files: ['src/components/ui/**/*.{ts,tsx}', 'src/app/ui/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': [
                'error',
                { selector: `Literal[value=/${COLOR_LITERAL_RE}/]`, message: NO_COLOR_LITERAL_MESSAGE },
                { selector: `TemplateElement[value.raw=/${COLOR_LITERAL_RE}/]`, message: NO_COLOR_LITERAL_MESSAGE },
            ],
        },
    },
];
