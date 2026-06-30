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
];
