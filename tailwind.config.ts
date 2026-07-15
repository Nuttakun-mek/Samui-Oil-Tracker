import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0B2545',
        cream: '#F6F4EE',
        border: '#E3DFD3',
        muted: '#5C6B7A',
        teal: {
          50: '#E4F3F3',
          600: '#0E7C86',
          700: '#0A5F67',
        },
      },
      fontFamily: {
        sans: ['Sarabun', 'Noto Sans Thai', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
