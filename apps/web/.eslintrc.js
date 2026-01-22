module.exports = {
    root: true,
    extends: ['next/core-web-vitals', 'next/typescript'],
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@next/next/no-html-link-for-pages': 'off',
        'react/no-unescaped-entities': 'off',
        'prefer-const': 'off',
    },
};
