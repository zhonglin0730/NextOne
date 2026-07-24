export const supportedLocales = ["zh-CN", "en-XA"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "zh-CN";

export const zhCN = {
  app: {
    name: "NextOne",
    tagline: "下一步，更清楚",
  },
  nav: {
    today: "今天",
    inbox: "收件箱",
    board: "看板",
    projects: "项目",
    review: "回顾",
    settings: "设置",
  },
  shell: {
    comingSoon: "工程基线已就绪，功能将在后续里程碑逐步实现。",
    quickCapture: "快速记录",
  },
} as const;

function pseudoLocalizeText(value: string): string {
  const expanded = value
    .replaceAll("一", "一一")
    .replaceAll("步", "步步")
    .replaceAll("任", "任任")
    .replaceAll("务", "务务");

  return `［${expanded}～～］`;
}

function mapPseudoValue(value: unknown): unknown {
  if (typeof value === "string") {
    return pseudoLocalizeText(value);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mapPseudoValue(child)]),
    );
  }

  return value;
}

const pseudoLocalizedZhCN = mapPseudoValue(zhCN) as typeof zhCN;

export const enXA = {
  ...pseudoLocalizedZhCN,
  app: {
    ...pseudoLocalizedZhCN.app,
    name: zhCN.app.name,
  },
} as const;

export const resources = {
  "zh-CN": { translation: zhCN },
  "en-XA": { translation: enXA },
} as const;
