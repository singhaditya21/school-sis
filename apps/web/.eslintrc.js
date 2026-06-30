module.exports = {
    root: true,
    extends: ['next/core-web-vitals', 'next/typescript'],
    rules: {
        // Security: warn on explicit `any` — helps catch unsafe type escapes
        '@typescript-eslint/no-explicit-any': 'warn',
        // Security: warn on unused variables to reduce dead code surface
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        // Security: no uncontrolled console.log in production paths
        'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
        // Style: prefer const over let where possible
        'prefer-const': 'warn',
        '@next/next/no-html-link-for-pages': 'off',
        'react/no-unescaped-entities': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        'no-var': 'off',
    },
};
