import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#111817",
        surface: "#182220",
        surface2: "#1E2B28",
        hairline: "#2B3A36",
        moss: "#7A9B76",
        brass: "#C08552",
        mist: "#E7EDE8",
        muted: "#8CA39B",
        danger: "#C0654F",
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
export default config;
