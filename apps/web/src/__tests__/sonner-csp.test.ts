import fs from 'fs';
import path from 'path';

describe('Sonner CSP integration', () => {
    it('bundles Sonner styles without creating a runtime style element', () => {
        const layoutSource = fs.readFileSync(
            path.join(process.cwd(), 'src/app/layout.tsx'),
            'utf8',
        );
        const sonnerDist = path.dirname(require.resolve('sonner'));
        const sonnerEntrySources = ['index.js', 'index.mjs'].map((fileName) => (
            fs.readFileSync(path.join(sonnerDist, fileName), 'utf8')
        ));
        const sonnerStyles = fs.readFileSync(path.join(sonnerDist, 'styles.css'), 'utf8');

        expect(layoutSource).toMatch(/import ["']sonner\/dist\/styles\.css["'];/);
        expect(sonnerStyles).toContain('[data-sonner-toaster]');
        for (const entrySource of sonnerEntrySources) {
            expect(entrySource).not.toMatch(/document\.createElement\(["']style["']\)/);
        }
    });
});
