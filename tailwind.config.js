/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        ink: {
          950: "#070a10",
          900: "#0a0e14",
          850: "#0e131c",
          800: "#12161f",
          750: "#161b27",
          700: "#1b2230",
          650: "#222b3c",
          600: "#2a3344",
          500: "#3a4459",
          400: "#525d74",
          300: "#6b768c",
          200: "#8b98ab",
          100: "#c2cad8",
          50: "#e6edf6",
        },
        fluor: {
          DEFAULT: "#2dd4bf",
          glow: "#5eead4",
          deep: "#0f766e",
          ink: "#042f2e",
        },
        amber: {
          DEFAULT: "#fbbf24",
          glow: "#fcd34d",
          deep: "#92400e",
        },
        coral: {
          DEFAULT: "#f87171",
          glow: "#fca5a5",
        },
        violet: {
          DEFAULT: "#a78bfa",
          glow: "#c4b5fd",
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(45,212,191,0.35), 0 0 18px -2px rgba(45,212,191,0.45)",
        "glow-amber": "0 0 0 1px rgba(251,191,36,0.35), 0 0 18px -2px rgba(251,191,36,0.4)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.04)",
        panel: "0 1px 0 0 rgba(255,255,255,0.03), 0 12px 30px -12px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        "radial-fluor":
          "radial-gradient(circle at 50% 0%, rgba(45,212,191,0.10), transparent 60%)",
      },
      backgroundSize: {
        grid: "32px 32px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scan": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.4s ease both",
        "scan": "scan 1.6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.4s ease-out infinite",
        "spin-slow": "spin-slow 1.1s linear infinite",
      },
    },
  },
  plugins: [],
};
