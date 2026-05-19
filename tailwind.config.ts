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
        background: "#08070a",
        foreground: "#f5f5f5",
        card: "#13111a",
        "card-hover": "#1a1822",
        border: "#2a2632",
        gold: {
          DEFAULT: "#d4af37",
          light: "#f5d77a",
          dark: "#a88a2a",
        },
        crimson: {
          DEFAULT: "#8b1a1a",
          light: "#b22222",
          dark: "#5c0e0e",
        },
        velvet: {
          DEFAULT: "#2d1a35",
          light: "#3d2245",
          dark: "#1a0e22",
        },
        accent: {
          red: "#dc2626",
          gold: "#d4af37",
          purple: "#a855f7",
        },
        muted: {
          DEFAULT: "#5a5566",
          foreground: "#9a94a6",
        },
      },
      fontFamily: {
        heading: ["Cormorant Garamond", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(212, 175, 55, 0.25), 0 4px 30px rgba(0,0,0,0.5)",
        "glow-lg": "0 0 40px rgba(212, 175, 55, 0.4), 0 8px 50px rgba(0,0,0,0.6)",
        "glow-red": "0 0 20px rgba(220, 38, 38, 0.3), 0 4px 30px rgba(0,0,0,0.5)",
        "glow-crimson": "0 0 30px rgba(139, 26, 26, 0.4), 0 4px 40px rgba(0,0,0,0.6)",
        "glow-purple": "0 0 25px rgba(168, 85, 247, 0.3), 0 4px 30px rgba(0,0,0,0.5)",
        card: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "gradient-gold": "linear-gradient(135deg, #d4af37 0%, #f5d77a 50%, #a88a2a 100%)",
        "gradient-crimson": "linear-gradient(135deg, #8b1a1a 0%, #b22222 50%, #5c0e0e 100%)",
        "gradient-velvet": "linear-gradient(135deg, #2d1a35 0%, #3d2245 100%)",
        "gradient-card": "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)",
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-gold": "pulseGold 2.5s ease-in-out infinite",
        "shimmer": "shimmer 3s linear infinite",
        "float": "float 4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseGold: {
          "0%, 100%": { boxShadow: "0 0 15px rgba(212, 175, 55, 0.3)" },
          "50%": { boxShadow: "0 0 35px rgba(212, 175, 55, 0.6)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      screens: {
        xs: "375px",
      },
      opacity: {
        '8': '0.08',
        '15': '0.15',
        '35': '0.35',
        '45': '0.45',
        '55': '0.55',
        '65': '0.65',
        '85': '0.85',
      },
    },
  },
  plugins: [],
};

export default config;
