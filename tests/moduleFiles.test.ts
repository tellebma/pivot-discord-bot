import { describe, expect, it } from 'vitest';
import { isLoadableModuleFile } from '@/utils/moduleFiles';

describe('isLoadableModuleFile', () => {
  it('accepte les sources TypeScript (mode dev, tsx)', () => {
    expect(isLoadableModuleFile('ping.ts')).toBe(true);
  });

  it('accepte les fichiers JavaScript compilés (production, dist/)', () => {
    expect(isLoadableModuleFile('ping.js')).toBe(true);
  });

  it('rejette les fichiers de déclaration générés par le build (déclaration: true)', () => {
    expect(isLoadableModuleFile('ping.d.ts')).toBe(false);
  });

  it('rejette les source maps', () => {
    expect(isLoadableModuleFile('ping.js.map')).toBe(false);
    expect(isLoadableModuleFile('ping.d.ts.map')).toBe(false);
  });

  it('rejette les autres fichiers', () => {
    expect(isLoadableModuleFile('README.md')).toBe(false);
  });
});
