const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/**
 * VeloPulse design tokens — mirrored from apps/mobile so the visual language
 * is consistent across the cycling apps.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        surface: '#131313',
        'surface-dim': '#0f0f0f',
        'surface-container-lowest': '#0e0e0e',
        'surface-container-low': '#1c1b1b',
        'surface-container': '#201f1f',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353534',
        'on-surface': '#e5e2e1',
        'on-surface-variant': '#c4c9ac',
        outline: '#8e9379',
        'outline-variant': '#444933',
        'velo-lime': '#c3f400',
        'velo-lime-dim': '#abd600',
        'velo-on-lime': '#161e00',
      },
      fontFamily: {
        sora: ['Sora', 'system-ui', 'sans-serif'],
        grotesk: ['"Space Grotesk"', 'ui-monospace', 'monospace'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'metric-xl': ['64px', { lineHeight: '64px', letterSpacing: '-0.04em', fontWeight: '800' }],
        'metric-lg': ['48px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'metric-md': ['32px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.1em', fontWeight: '600' }],
        'mono-data': ['14px', { lineHeight: '20px', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
};
