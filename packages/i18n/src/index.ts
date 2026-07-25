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
    locale: "界面语言",
    offlineReady: "本地优先 · 离线可用",
    primaryNavigation: "主导航",
  },
  common: {
    close: "关闭",
    cancel: "取消",
    save: "保存",
    saving: "保存中…",
    error: "操作未完成，请重试。",
    emptyValue: "未设置",
  },
  capture: {
    title: "快速记录",
    placeholder: "记录一件事……",
    hint: "按 Enter 直接保存到收件箱，Shift + Enter 换行",
    details: "添加详细信息",
    note: "备注",
    project: "所属项目",
    notePlaceholder: "补充背景、想法或下一步线索",
    deadline: "截止日期",
    reviewAt: "再看日期",
    estimate: "预计时长（分钟）",
    energy: "精力要求",
    energyNone: "未设置",
    energyLow: "较低",
    energyMedium: "适中",
    energyHigh: "较高",
    submit: "保存到收件箱",
  },
  inbox: {
    title: "收件箱",
    description: "把未经判断的输入整理成明确行动。",
    count: "{{count}} 项待整理",
    emptyTitle: "收件箱已经清空",
    emptyDescription: "有新想法时，先快速记下来，不必立刻决定。",
    emptyAction: "记录一件事",
    source: "来自快速记录",
    openTask: "打开任务详情",
    clarify: "准备就绪",
    organize: "整理",
    quickPlaceholder: "记录一件事…",
    quickHint: "Enter 保存到收件箱",
  },
  task: {
    details: "任务详情",
    title: "标题",
    note: "备注",
    project: "所属项目",
    status: "当前状态",
    deadline: "截止日期",
    reviewAt: "再看日期",
    estimate: "预计时长（分钟）",
    energy: "精力要求",
    waitingFor: "等待对象或结果",
    activity: "活动记录",
    noActivity: "还没有活动记录",
    abandon: "放弃任务",
    abandonConfirm: "放弃后任务会移出活跃列表，但仍保留在活动记录中。确定放弃吗？",
    saved: "任务已保存",
    addToday: "加入今天",
  },
  status: {
    INBOX: "收件箱",
    READY: "准备就绪",
    DOING: "进行中",
    WAITING: "等待中",
    COMPLETED: "已完成",
    CANCELED: "已放弃",
  },
  action: {
    READY: "转为准备就绪",
    DOING: "立即开始",
    WAITING: "转为等待",
    COMPLETED: "完成",
    CANCELED: "放弃",
    pause: "暂停",
    someday: "以后再说",
    removeToday: "移出今日",
  },
  today: {
    title: "今天",
    description: "只承诺今天真正要推进的事。",
    dateLabel: "今日计划",
    focus: "今日焦点",
    focusDescription: "最多突出三件最重要的事，加入今天不会自动开始。",
    doing: "正在进行",
    doingDescription: "当前正在投入精力的任务。",
    later: "之后可做",
    laterDescription: "今天可以推进，但不占用焦点位置。",
    emptyFocus: "还没有今日焦点",
    emptyFocusDescription: "从看板选择准备就绪的任务加入今天。",
    emptyDoing: "当前没有进行中的任务",
    emptyLater: "今天没有其他待办",
    openBoard: "前往看板选择",
    focusCount: "{{count}}/3",
    minutes: "{{count}} 分钟",
  },
  board: {
    title: "看板",
    description: "整理行动状态，而不是堆积任务。",
    wip: "进行中 {{count}}/{{limit}}",
    emptyColumn: "暂无任务",
    dragHint: "可拖到其他列，也可以使用卡片按钮。",
    addToday: "加入今天",
    addedToday: "已加入今天",
    columns: {
      READY: "准备就绪",
      DOING: "进行中",
      WAITING: "等待中",
      SOMEDAY: "以后再说",
    },
  },
  wip: {
    title: "进行中任务已达到 {{limit}} 项。",
    confirm: "建议先完成、暂停或转为等待。仍要开始此任务吗？确认后会记录一次超限决定。",
  },
  event: {
    CREATED: "创建任务",
    CLARIFIED: "整理为准备就绪",
    STATUS_CHANGED: "变更任务状态",
    VISIBILITY_CHANGED: "变更可见性",
    ADDED_TO_DAILY_PLAN: "加入今天",
    REMOVED_FROM_DAILY_PLAN: "移出今日",
    DEADLINE_CHANGED: "调整截止日期",
    REVIEW_AT_CHANGED: "调整再看日期",
    WAITING_STARTED: "开始等待",
    WAITING_ENDED: "结束等待",
    COMPLETED: "完成任务",
    CANCELED: "放弃任务",
    REOPENED: "重新打开任务",
    WIP_LIMIT_OVERRIDDEN: "确认超出进行中上限",
    PROJECT_CHANGED: "调整所属项目",
    PROJECT_FOCUS_SET: "设为项目焦点",
    PROJECT_FOCUS_CLEARED: "清除项目焦点",
  },
  project: {
    eyebrow: "持续推进关键成果",
    title: "项目",
    description: "让每个活跃项目都保持一个清晰的下一步。",
    create: "新建项目",
    createFirst: "创建第一个项目",
    createHint: "聚焦新的重要领域",
    createEyebrow: "定义想要推进的成果",
    name: "项目名称",
    namePlaceholder: "例如：发布 NextOne V0.1",
    note: "项目说明",
    notePlaceholder: "说明想达成的结果、边界或关键约束。",
    emptyTitle: "还没有项目",
    emptyDescription: "项目用来聚合需要持续推进的成果，而不是制造更多任务层级。",
    active: "正常推进",
    needsDecision: "需要决定",
    decisionTitle: "{{count}} 个项目需要确定焦点",
    decisionDescription: "活跃项目没有清晰焦点时，系统会把它提到你的决策面前。",
    currentFocus: "当前焦点",
    focusTitle: "现在最值得推进的一步",
    noFocus: "尚未确定焦点行动",
    noCandidateDescription: "先添加一个明确、可执行的下一步候选。",
    recommendedNext: "建议的下一项",
    makeFocus: "设为焦点",
    setFocus: "设为焦点",
    completedThisWeek: "本周完成",
    waitingCount: "等待中",
    candidateCount: "下一步候选",
    noProgress: "还没有推进记录",
    lastProgress: "最近推进：{{date}}",
    back: "返回项目",
    notFound: "没有找到这个项目",
    nextCandidates: "下一步候选",
    noCandidates: "当前没有准备就绪的候选行动。",
    candidatePlaceholder: "添加一个明确的下一步…",
    addCandidate: "添加候选",
    doing: "进行中",
    waiting: "等待中",
    summary: "项目概览",
    recentActivity: "最近推进",
    recentlyCompleted: "最近完成",
    addToday: "加入今天",
    noProject: "不属于项目",
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
