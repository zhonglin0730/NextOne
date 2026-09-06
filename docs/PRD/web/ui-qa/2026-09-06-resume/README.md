# 继续记录验收

日期：2026-09-06。

设计路线：沿用现有暖中性色和克制蓝色，由 frontend-quality-loop、ui-ux-pro-max 和 React 实现规则支持。
在现有暂停流程增加可跳过的一句继续记录；项目看板按现有任务顺序列出有记录的活跃待开始任务，不推荐项目排名。
今天、任务详情、专注模式和每日收尾复用同一记录。没有增加导航、状态或自动生成任务。

## 修改范围

- `apps/web/src/tasks/ResumeNoteDialog.tsx`：共用暂停/编辑弹窗，取消、直接暂停、保存、失败保留输入及键盘焦点。
- `apps/web/src/tasks/ResumeNote.tsx`：继续记录和修改时间，修改时保留任务详情未保存草稿。
- `App.tsx`、`taskActions.ts`、`BoardPage.tsx`、`TodayPage.tsx`、`TaskDrawer.tsx`、`DailyClosePage.tsx`、`ZenMode.tsx`：接入原流程。
- 应用层、领域 Task、服务端 TaskView / TaskRepository / TaskService / SyncService、OpenAPI、V9 迁移：离线保存、同步和旧客户端兼容。
- 中英文 README、实现基线及国际化文案：说明行为。

## 验证

- Web check、生产 build 通过。
- Application 45 项、Web 23 项单元测试通过。
- 浏览器 E2E：3 项通过，1 项真实跨浏览器同步测试因未配置运行环境跳过。
- PostgreSQL 隔离容器：8 项集成测试全部通过，包括空库/旧库迁移、继续记录保存、清空、拉取、旧客户端编辑保留记录。
- 修复验证中发现的旧格式任务缺少专注计数字段时被拒绝同步的问题。
- 新 E2E 覆盖取消暂停、直接暂停、保存后刷新、收尾修改、项目继续、清空、详情草稿保留和专注模式取消/暂停。
- 视口：1280×800、390×844、1440×900；截图已检查浅色页面/编辑框和深色移动编辑框。无页面水平溢出。
- 新流程测试使用独立浏览器上下文并阻止 API 请求，截图里的“同步失败”来自主动隔离测试数据，未向用户数据库写入验收项目。

## 限制

- 本轮为增量功能，没有重做原页面，也未留存本轮改前运行截图。
- 未在真实手机或用户的两个浏览器间做公网联调；原生 Android 未增加输入界面。
- 首轮未重启本地后端；后续本地联调已完成 V9 迁移，见下文。未部署到公网服务器。
- 继续记录由用户填写。它不验证或推断实际完成内容，也不决定项目优先级。

建议提交：`feat: preserve task continuation notes across pause and resume`。

## 后续本地同步联调（2026-09-06）

- 本地 PostgreSQL 保留已有数据，后端启动时从 V7 依次应用 V8、V9，健康检查为 UP；Web 在 `http://127.0.0.1:5173` 可访问。
- 扩展 `apps/web/e2e/cross-browser-sync.e2e.ts`，使用两个隔离的 Chrome 浏览器上下文连接实际本地 API / PostgreSQL。
- 验证 A 创建任务、B 读取任务；A 保存继续点后 B 不刷新页面，通过自动同步拉取并在详情中展示；B 修改后 A 刷新读取；A 清空后 B 刷新确认清空，服务端保留清空时间戳。
- 定向 E2E 通过（1 项，最终用例耗时 35.5 秒），Web check 与 `git diff --check` 通过。本轮未改生产 UI 或业务代码，未重新运行全套单元测试及视觉截图。
- 测试只创建唯一标题的临时任务，结束时读取最新 revision 删除，并断言服务端返回 APPLIED、任务已不存在；未修改已有项目或任务。
- 验证范围是同一电脑上的两个独立 Chrome 上下文，不等于 Chrome / Firefox 跨引擎兼容测试，也未覆盖公网、真机、同时编辑冲突或离线重连。本轮没有修改同步周期：常驻页面约每 30 秒自动拉取，重新聚焦页面也会触发同步，并非实时推送。

建议提交：`test: verify continuation notes sync across browsers`。
