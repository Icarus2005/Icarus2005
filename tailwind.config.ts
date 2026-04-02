import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#dde6ff",
          200: "#c3d1fe",
          300: "#9ab2fd",
          400: "#6f8bfa",
          500: "#4c65f5",
          600: "#3545ea",
          700: "#2c38d0",
          800: "#2830a9",
          900: "#272e85",
          950: "#191c51",
        },
      },
    },
  },
  plugins: [],
};

export default config;
