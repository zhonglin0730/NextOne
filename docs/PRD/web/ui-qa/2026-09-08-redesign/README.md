# 新设计图落地验收 · 2026-09-08

## 设计来源与取舍

用户指定对话《评估Nextone市场改进》：https://chatgpt.com/c/6a9ccb3e-59d8-83e8-8c9a-38f99c69d1bb。
已读取七张新图；以今天、收件箱、项目详情、看板、回顾五张一致风格的单页图为主，借用另外两张拼图的项目封面形式。

落地方向：浅蓝灰文字侧栏、白色工作表面、克制蓝色操作、自然山湖图像、细边框与清晰主次分栏。不是把设计截图贴成页面。
保留现有项目优先导航、状态机、真实数据、同步、任务详情、专注和继续点；不加入图中未实现的团队头像、邮件集成、AI 建议、任务百分比或日历。

## 改动

- `packages/design-tokens/src/tokens.css`：统一表面、文字、边框及侧栏尺寸令牌。
- `apps/web/src/App.tsx`、`styles/shell.css`：216px 桌面侧栏、顶部搜索、上下文记录按钮；手机保留五项底部导航。
- `components/SearchDialog.tsx`：真实的项目与活跃任务搜索，Ctrl/Cmd+K、Esc、输入焦点、空结果与错误状态。
- `projects/ProjectsPage.tsx`、`ProjectPortfolioOverview.tsx`：项目封面、实际进度、旁侧提醒。
- `today/TodayPage.tsx`、`review/ReviewBrief.tsx`：进行中与准备开始分组、右侧待处理提醒。
- `tasks/InboxPage.tsx`：任务列表与预览分栏，记录入口紧随列表；手机去掉旁栏。
- `review/ReviewCenterPage.tsx`：摘要、决策区和辅助区域分层。
- `styles/foundation.css`、`projects.css`、`tasks.css`、`review-settings.css`、`responsive.css`：共享排版和响应式适配。
- `packages/i18n/src/index.ts`、`docs/ui/UI_SPEC.md`：新界面文案与基线。

## 图片资产

使用 imagegen 内置生成路径制作独立风景资产，未把带文字的 UI 拼图直接裁切为背景。
交付资产：`apps/web/public/images/alpine-lake.png`，约 1.86 MB。原始生成文件保留在 Codex generated_images 目录。
提示词：A tranquil alpine lake at soft dawn, layered slate blue mountains, a modest snow peak, evergreen shoreline, reflective water and warm ivory sky. Desaturated blue-gray and warm neutral palette, photographic texture; usable when center-cropped into a sidebar. No people, buildings, text, logos, UI or borders.
侧栏、封面和氛围卡复用同一素材；手机隐藏纯氛围卡，避免挤占任务操作空间。个性化封面尚未加入。

## 真实渲染

本目录 `before-*` 为改前留存，`after-*` 为本次结果。

| 页面 | 桌面 | 手机 | 补充 |
| --- | --- | --- | --- |
| 项目 | 1280×800 | 390×844 | 封面、进度条 |
| 今天 | 1280×800 | 390×844 | 主次操作、完整卡片边框 |
| 收件箱 | 1280×800 | 390×844 | 记录入口位置 |
| 回顾 | 1280×800 | 390×844 | 手机优先决策，隐藏配图 |
| 总看板 | 1280×800 | 390×844 | 1440×800 |

本轮实看修正了重复收尾入口、收件箱记录入口被旁栏撑到底部、手机进度条 flex 高度塌陷和搜索打开后输入未获焦点。
既有 E2E 另行更新了 `2026-09-06-resume/after-*` 截图，覆盖项目任务与深色继续点对话框；这批截图是本次重跑产物。

## 自动验证

- `pnpm --filter @nextone/web check`：通过。
- `pnpm --filter @nextone/web test`：8 个文件，23 个测试通过。
- `pnpm --filter @nextone/web build`：通过。
- `pnpm test:e2e`：4 通过，1 跳过。覆盖项目→结构→看板→今天、暂停继续点、桌面/手机布局以及新搜索键盘路径。
- 跨浏览器在线同步用例需要显式环境开关，本轮未运行；没有修改同步逻辑。
- `git diff --check`：通过。

初轮曾发现 CSS 多余括号和搜索焦点失败，已修复后重跑通过，不以初轮失败结果冒充验收成功。
Playwright 在 Windows 的服务退出阶段等待过久；确认所有用例结束后，仅停止其专用 4173 Vite 进程，最终测试退出码为 0。5173 开发服务保留。

## 边界

本轮重点重构共享框架及五条主要页面；项目结构编辑、设置、专注详情复用新框架和令牌，未逐项做独立像素复刻。
浏览器扩展产生的粉色悬浮翻译按钮不是 NextOne 元素。未进行 Safari、Firefox 和真实手机设备验收。
设计图的氛围已落地，但项目封面个性化、大量任务密度及完整深色页矩阵仍可继续打磨。

使用技能：frontend-quality-loop（真实截图闭环）、ui-ux-pro-max（分栏与移动优先级）、vercel-react-best-practices（React 实现）、imagegen（独立风景素材）。

建议提交信息：`feat: rebuild web workspace from refreshed design references`。本轮未提交或推送。
