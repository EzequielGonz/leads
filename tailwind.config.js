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
        bg: {
          primary: "#0f172a",
          secondary: "#1e293b",
          tertiary: "#334155",
        },
        primary: {
          DEFAULT: "#1e3a8a",
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#1e40af",
          600: "#1e3a8a",
          700: "#1e3a8a",
          900: "#172554",
        },
        accent: {
          cyan: "#06b6d4",
          gold: "#d97706",
          red: "#7f1d1d",
        },
        glass: {
          DEFAULT: "rgba(30, 41, 59, 0.6)",
          border: "rgba(148, 163, 184, 0.15)",
        },
        text: {
          primary: "#f8fafc",
          secondary: "#cbd5e1",
          muted: "#94a3b8",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(6, 182, 212, 0.15)",
        "glow-blue": "0 0 40px rgba(30, 58, 138, 0.3)",
        "soft": "0 4px 24px rgba(0, 0, 0, 0.3)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.4)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "fade-up": "fadeUp 0.6s ease-out forwards",
        "stagger-1": "fadeUp 0.6s ease-out 0.1s forwards",
        "stagger-2": "fadeUp 0.6s ease-out 0.2s forwards",
        "stagger-3": "fadeUp 0.6s ease-out 0.3s forwards",
        "stagger-4": "fadeUp 0.6s ease-out 0.4s forwards",
        "stagger-5": "fadeUp 0.6s ease-out 0.5s forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "count": "count 2s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
    },
  },
  plugins: [],
};
