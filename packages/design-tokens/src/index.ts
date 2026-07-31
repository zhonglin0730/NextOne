export const designTokens = {
  color: {
    accent: "#2563eb",
    accentStrong: "#1d4ed8",
    background: "#f7f7f4",
    surface: "#ffffff",
    text: "#172033",
    textMuted: "#667085",
    border: "#e8e9e5",
    danger: "#c43d4b",
  },
  radius: {
    small: "8px",
    medium: "12px",
    large: "18px",
  },
  content: {
    standard: "1040px",
    wide: "1180px",
    board: "1380px",
  },
  control: {
    target: "38px",
  },
  shadow: {
    card: "0 12px 36px rgb(30 40 70 / 5%)",
    elevated: "0 18px 48px rgb(30 40 70 / 8%)",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
  },
} as const;
