/**
 * NativeWind / Tailwind settings. The colors repeat src/constants/theme.ts.
 * A test (__tests__/theme-test.ts) fails if the two drift apart.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' lets the app control dark mode itself (gyan is a dark navy app).
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0B1220',
        panel: '#0F172A',
        glass: 'rgba(255,255,255,0.06)',
        'glass-strong': 'rgba(255,255,255,0.14)',
        'glass-border': 'rgba(255,255,255,0.14)',
        heading: '#FFFFFF',
        body: '#E2E8F0',
        muted: '#94A3B8',
        brand: '#0066FF',
        link: '#99CBFF',
        record: '#C2410C',
        success: '#86EFAC',
        danger: '#FCA5A5',
      },
      fontFamily: {
        heading: ['SchibstedGrotesk_700Bold'],
        body: ['IBMPlexSans_400Regular'],
        'body-medium': ['IBMPlexSans_500Medium'],
        'body-semibold': ['IBMPlexSans_600SemiBold'],
      },
      borderRadius: {
        pill: '999px',
      },
      transitionDuration: {
        ui: '200ms',
        reveal: '320ms',
      },
      transitionTimingFunction: {
        gyan: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
