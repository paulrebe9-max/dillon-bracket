import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'dillon-navy': '#1a2b4a',
        'dillon-teal': '#0e7c7b',
        'dillon-gold': '#f0a500',
      },
    },
  },
  plugins: [],
};
export default config;
