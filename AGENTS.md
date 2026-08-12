# NextOne 项目规则

## 产品定位与事实来源

- NextOne 是面向个人的项目推进系统，不是普通待办清单，也不是团队协作型 Trello。
- 修改产品语义、信息架构或页面流程前，依次阅读 `README.md`、`docs/PRD/NextOne-Web-V0.1-实现基线.md`、相关页面设计稿及直接调用链。
- `docs/PRD/web/V0.1/` 和按页面命名的设计稿是现有产品参考；`docs/PRD/web/ui-direction-lab/` 只用于方向实验，除非任务明确采用，否则不得替换生产视觉基线。
- 领域术语、状态不变量、数据安全语义和阶段范围以已确认 PRD 为准，不因视觉改造擅自改写。

## 工程边界

- 当前 Web 为 React 19 + Vite + TypeScript，移动端为 Expo / React Native；使用 pnpm 工作区。
- Web 视觉令牌以 `packages/design-tokens/src/tokens.css` 为首要来源，`apps/web/src/styles.css` 和现有组件是运行时事实。优先复用令牌和组件，不在页面散落新颜色、圆角、阴影或间距常量。
- 保持改动聚焦于当前页面或流程；不得借 UI 调整重写领域模型、存储、同步或路由。
- Web 与原生端共享产品语言，但不得把桌面页面直接缩成手机界面；移动端遵循现有原生组件和导航模式。

## UI 与交互

- 涉及 Web UI 时使用 `$frontend-quality-loop`。复杂产品界面以 `$ui-ux-pro-max` 为主要设计支持；React 实现按需使用 `$vercel-react-best-practices`；现有弱界面升级才使用 `$redesign-existing-projects`。
- `$frontend-design` 和 `$design-taste-frontend` 只用于明确的品牌页、发布页或独立营销页，不得主导任务流、设置页、看板、数据管理和回顾流程。
- 保持当前“暖中性色浅色表面 + 克制蓝色强调 + 中文优先”的产品气质。不得无依据切换为默认暗色、霓虹紫、玻璃拟态、无意义渐变或大面积装饰。
- 信息层级服务于“看清项目、做出取舍、推进下一步”。不得把所有内容都做成卡片；状态、主操作、阻塞原因和下一步必须一眼可辨。
- 拖拽之外必须保留可访问的按钮路径。覆盖默认、悬停、键盘焦点、按下、禁用、加载、空、离线、同步异常、成功和错误状态。

## 验证

- 页面或流程改动至少检查 1280×800 与 390×844；涉及宽屏看板时补查 1440 px 宽度。重设计保留改前截图，修复一轮后最多再确认一轮。
- Web 静态检查优先运行 `pnpm --filter @nextone/web check`；组件逻辑按风险运行 `pnpm --filter @nextone/web test`；跨页核心流程运行 `pnpm test:e2e`。
- 移动端相关改动使用仓库现有 `pnpm mobile:dev` 或 `pnpm mobile:android` 路径验证，并列出真机或模拟器手动检查。
- 交付时说明使用的设计路线、截图尺寸、自动检查、未验证范围和建议的 Git commit 信息。
