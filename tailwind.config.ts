import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        card: "#111111",
        border: "#222222",
        muted: "#888888",
        accent: {
          purple: "#6C5CE7",
          blue: "#00D4FF",
        },
      },
      fontFamily: {
        grotesk: ["Space Grotesk", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, #6C5CE7 0%, #00D4FF 100%)",
        "accent-gradient-hover": "linear-gradient(135deg, #5a4bd1 0%, #00b8e6 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(108, 92, 231, 0.3)",
        "glow-hover": "0 0 30px rgba(108, 92, 231, 0.5)",
      },
    },
  },
  plugins: [],
};
export default config;
