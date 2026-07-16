import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FBF6F9',
          100: '#F4E8EF',
          200: '#E5C7D8',
          300: '#C98EAF',
          500: '#963B70',
          600: '#722257',
          700: '#5D1946',
          800: '#481136',
          900: '#310923',
        },
        gold: {
          50: '#FFFAEC',
          100: '#F8EDC8',
          200: '#EBD38A',
          500: '#C69214',
          600: '#A9790D',
          700: '#805A08',
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
