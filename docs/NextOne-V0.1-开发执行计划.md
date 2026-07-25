# NextOne V0.1 开发执行计划

> 文档状态：执行草案  
> 版本：0.1  
> 日期：2026-07-24  
> 产品基线：`docs/PRD/NextOne-Web-V0.1-实现基线.md`  
> 总体方案：`docs/NextOne-总体方案.md`

## 1. 目标

V0.1 的目标不是一次性完成完整产品，而是交付一个可以连续真实使用的个人行动闭环：

```text
快速记录
  → 收件箱整理
  → 选择今天与开始执行
  → 完成 / 等待 / 放弃
  → 每日收尾
  → 回顾中心重新决策
```

阶段完成后，产品所有者应能连续四周使用 NextOne 管理真实任务，且核心数据可恢复、离线操作可继续、关键决策有事件记录。

## 2. 当前现状

当前仓库只有：

- 总体产品与技术方案；
- Web V0.1 产品实现基线；
- Web 页面设计图。

尚未建立：

- Monorepo；
- Web、移动端和服务端工程；
- 数据库迁移；
- OpenAPI 契约；
- 自动化测试；
- Docker Compose 和 Oracle 部署配置。

因此实施应从工程基线和最小纵向闭环开始，不并行铺开所有页面。

## 3. 实施原则

### 3.1 纵向切片优先

每个里程碑都应尽量包含：

```text
界面
→ 客户端用例
→ 本地持久化
→ 领域事件
→ 服务端规则
→ 数据库存储
→ 定向测试
```

避免先完成全部 UI，再补数据模型和同步。

### 3.2 Web 先行，移动端复用规则

- 先完成 PC Web 的真实使用闭环；
- Android 在任务模型、状态机和同步契约稳定后接入；
- Web 与移动端共享领域类型、语言键、契约和测试样例；
- 不强制共享 UI 组件。

### 3.3 本地优先分两步

第一步：

- Web 使用 IndexedDB；
- 所有核心操作先写本地事务；
- 建立 Outbox 数据结构；
- 暂不要求立即接通服务端同步。

第二步：

- 接入幂等 push 和增量 pull；
- 验证离线、重试和冲突；
- 再部署到 Oracle ARM。

这样可以先验证产品闭环，同时不推迟同步架构的关键约束。

### 3.4 控制基础设施

V0.1 只运行：

- Caddy；
- Spring Boot；
- PostgreSQL；
- 备份任务。

不引入 Redis、消息队列、自建 Supabase、Kubernetes、独立搜索服务和付费 SaaS。

## 4. 推荐工程结构

```text
NextOne/
├─ apps/
│  ├─ web/
│  ├─ mobile/
│  └─ server/
├─ packages/
│  ├─ domain/
│  ├─ application/
│  ├─ contracts/
│  ├─ api-client/
│  ├─ storage-contracts/
│  ├─ design-tokens/
│  └─ i18n/
├─ deploy/
│  ├─ compose/
│  ├─ caddy/
│  └─ scripts/
├─ docs/
├─ package.json
└─ pnpm-workspace.yaml
```

阶段 1 暂不创建空的 `sync-core` 包。同步实现开始时再从已经运行的应用层逻辑中提取。

## 5. 模块边界

### 5.1 Web

```text
app-shell
today
inbox
board
projects
review
activity-log
settings
sync-status
```

职责：

- 页面路由和交互；
- IndexedDB 查询与事务；
- 本地命令执行；
- Outbox 写入；
- 国际化和格式化；
- 离线与同步状态展示。

### 5.2 共享 TypeScript 包

| 包 | 职责 |
|---|---|
| `domain` | 实体类型、状态枚举、纯业务规则 |
| `application` | 客户端用例和命令编排 |
| `contracts` | API DTO、错误码、schema 版本 |
| `api-client` | 服务端调用封装或 OpenAPI 生成代码 |
| `storage-contracts` | 本地仓储接口和事务边界 |
| `design-tokens` | 颜色、字号、间距、圆角和语义 token |
| `i18n` | 语言键、中文资源、伪本地化和格式化约定 |

持久任务数据不得复制到 Zustand。Zustand 只保存弹窗、筛选、选中项等临时界面状态。

### 5.3 服务端

```text
auth
task
project
daily-plan
review
activity
sync
export
settings
```

建议采用单体分模块结构，不提前拆微服务。

每个模块按以下层次组织：

```text
api
application
domain
infrastructure
```

Java 服务端负责最终校验：

- 状态转换；
- WIP 限制；
- 今日上限；
- 项目焦点归属；
- revision；
- 幂等 mutation；
- 用户数据隔离。

## 6. Web 路由基线

```text
/today
/inbox
/board
/projects
/projects/:projectId
/review
/review/daily
/review/weekly
/review/tasks/:taskId
/review/activity
/settings/general
/settings/notifications
/settings/sync
/settings/data
```

补充约束：

- `/review/weekly` 的完整流程在阶段 2 开放；
- `/settings/notifications` 阶段 1 可以只提供占位配置模型，不展示不可用选项；
- 任务详情使用抽屉或可深链弹层，刷新后仍能恢复上下文；
- 通知中心使用全局顶部入口，不增加一级导航。

## 7. 数据迁移顺序

数据库迁移建议按以下顺序建立：

1. 用户、身份和设备；
2. Area；
3. Project；
4. Task；
5. DailyPlan 和 DailyPlanItem；
6. TaskEvent；
7. ReviewSession 和 ReviewItem；
8. SyncMutation 和 ChangeLog；
9. 用户设置和导出记录。

`task` 首批必须包含：

```text
id
user_id
area_id
project_id
title
note
status
visibility
deadline_at
review_at
reviewed_at
waiting_for
waiting_since
estimate_minutes
energy_level
sort_key
completed_at
canceled_at
created_at
updated_at
deleted_at
revision
```

客户端 IndexedDB 使用对应 schema version。任何字段变化必须同时提供：

- Web 本地库升级；
- 服务端 Flyway 迁移；
- API 兼容处理；
- 回滚或前向修复说明。

## 8. 事件基线

V0.1 首批事件：

```text
CREATED
CLARIFIED
STATUS_CHANGED
VISIBILITY_CHANGED
ADDED_TO_DAILY_PLAN
REMOVED_FROM_DAILY_PLAN
DEADLINE_CHANGED
REVIEW_AT_CHANGED
REVIEWED
WAITING_STARTED
WAITING_ENDED
COMPLETED
CANCELED
REOPENED
WIP_LIMIT_OVERRIDDEN
```

事件用途：

- 构建行动日志；
- 生成每日完成证据；
- 判断任务是否真实推进；
- 支持回顾；
- 解释同步冲突；
- 为后续统计保留事实来源。

日志展示不是事件表的简单直出。客户端应把稳定事件类型格式化为用户语言。

## 9. 开发里程碑

### M0：工程基线

实施状态（2026-07-24）：

- Monorepo、Web、共享 TypeScript 包、Spring Boot、PostgreSQL Compose、格式化和测试基线已经建立；
- Web 类型检查、共享规则测试、生产构建和浏览器烟雾测试已通过；
- Spring Boot Java 17 编译和 Context 启动测试已通过；
- Compose 静态配置检查已通过；
- 本机 Docker 引擎当前未运行，因此 PostgreSQL 容器启动、Flyway 实际迁移和 Actuator 联调尚未验证；
- 当前不需要连接 Oracle 服务器，进入生产镜像和 ARM 部署验证时再申请服务器信息。

交付：

- 初始化 Monorepo；
- 建立 Web 和 Spring Boot 工程；
- 建立共享包；
- 建立格式化、静态检查和测试命令；
- 建立中文与伪本地化资源；
- 建立 design tokens；
- 建立本地 PostgreSQL Compose；
- 建立基础 CI。

验收：

- Web 和服务端可分别启动；
- 一个命令可以运行定向测试；
- Web 可以切换中文与伪语言；
- 服务端健康检查可访问；
- 不依赖任何付费服务。

### M1：本地任务内核

实施状态（2026-07-24）：

- 已建立 Task、Area、Project、TaskEvent 和 Outbox 领域/存储模型；
- 已新增客户端应用层，快速记录和状态转换会在同一事务中写入任务、事件与 Outbox；
- 已建立 IndexedDB v1 schema，包含 `tasks`、`areas`、`projects`、`taskEvents` 和 `outbox`；
- 已完成快速记录、收件箱列表、空状态、任务详情抽屉、状态操作和活动记录；
- 已通过严格类型检查、领域与应用测试、Web 生产构建和 Prettier 检查；
- 已完成浏览器验收：仅标题创建、刷新恢复、任务详情、状态转换和放弃确认均可用；
- M1 暂不接服务端同步，Outbox 在 M6 接入 push/pull；当前不需要 Oracle 服务器。

交付：

- Task、Area、Project 的 TypeScript 领域模型；
- IndexedDB schema；
- 本地仓储接口；
- 快速记录；
- 收件箱列表；
- 任务详情抽屉；
- 状态转换和事件记录；
- Outbox 表结构。

验收：

- 只输入标题即可保存到收件箱；
- 刷新和离线后数据仍存在；
- 放弃不会物理删除；
- 每次关键状态变化生成一个事件；
- 非法状态转换被拒绝。

### M2：今天与执行

实施状态（2026-07-24）：

- 已建立 DailyPlan 和 DailyPlanItem 领域模型、仓储契约与 IndexedDB v2 schema；
- 已完成今天页，区分今日焦点、正在进行和之后可做，加入今天不会改变任务状态；
- 已完成 READY、DOING、WAITING 和 SOMEDAY 四列执行看板，拖拽和按钮复用同一应用操作；
- 已实现 DOING 默认上限 3、超限明确确认、WIP 覆盖事件和 WAITING 释放名额；
- 已实现立即开始、暂停、等待、完成、加入/移出今天与以后再说；
- 已通过 14 个领域与应用测试、严格类型检查、生产构建和浏览器交互验收；
- 已验证 IndexedDB v1 数据无损升级到 v2，今日计划按本地日期隔离，未完成任务不会自动进入次日；
- M2 仍为纯本地闭环，不需要 Oracle 服务器，也未引入 Supabase 或其他付费依赖。

交付：

- 今天页；
- DailyPlan 和 DailyPlanItem；
- 看板；
- WIP 限制；
- 加入今天、立即开始、暂停、等待、完成和放弃；
- 拖拽与按钮等价操作。

验收：

- 加入今天不自动转为 DOING；
- DOING 默认最多 3；
- WAITING 不占用 DOING 名额；
- 超限需要明确确认并生成事件；
- 未完成任务不会自动进入次日计划。

### M3：项目与焦点

实施状态（2026-07-25）：

- 已完成项目列表与项目详情，并支持创建项目和为任务选择所属项目；
- 已实现每个活跃项目一个突出焦点行动，设置焦点时校验任务必须属于当前项目；
- 已实现下一步候选、进行中、等待中、最近完成和最近推进记录；
- 焦点任务完成或放弃后会自动清空焦点，只推荐一项下一步，不会自动加入今天；
- 已实现无焦点活跃项目识别和“需要决定”提示，不展示虚构完成百分比；
- 已通过 18 个领域、国际化与应用测试、严格类型检查、生产构建和 Prettier 检查；
- 已完成桌面端与 375px 手机宽度的浏览器验收，未发现横向溢出或控制台错误；
- M3 继续使用 IndexedDB 和现有 Outbox，不需要 Oracle 服务器或付费服务。

交付：

- 项目列表；
- 项目详情；
- 项目焦点行动；
- 下一步候选；
- 无焦点项目识别；
- 最近推进事件。

验收：

- 项目不展示虚构完成百分比；
- 焦点任务必须属于当前项目；
- 完成焦点后只推荐下一项；
- 无焦点活跃项目进入决策队列。

### M4：每日收尾和基础回顾

实施状态（2026-07-25）：

- 已完成每日收尾页，按已完成、待决策、收尾中放弃和明日焦点四区呈现；
- 未完成事项支持“明天继续”“移出今日”“等待”“以后/也许”“设为再看”和“放弃”，其中明日焦点仍限制为前三项；
- 已完成回顾中心，覆盖停滞、等待超时、长期进行中、无焦点项目、临期和再看日期到期规则；
- “保持准备就绪”会更新 `reviewedAt` 并写入 `REVIEWED` 事件，刚回顾过的事项不会立即再次进入停滞队列；
- 已完成基础行动日志，保留完成、放弃、回顾和项目焦点决策记录；
- 已通过 22 个领域、国际化与应用测试、严格类型检查、生产构建和 Prettier 检查；
- 已完成桌面端与 375px 手机宽度的浏览器验收，未发现横向溢出或控制台错误；
- M4 继续使用 IndexedDB 和现有 Outbox，不需要 Oracle 服务器或付费服务。

交付：

- 每日收尾；
- 回顾中心；
- 停滞、等待超时、无焦点、临期和再看日期规则；
- 单项决策；
- `reviewedAt` 和 `REVIEWED`；
- 基础行动日志。

验收：

- 每日收尾能处理全部未完成事项；
- “明天继续”和“移出今日”语义明确；
- 保持准备就绪会更新 `reviewedAt`；
- 刚回顾过的事项不会立即再次进入停滞队列；
- 放弃事项能在日志中查询。

### M5：服务端持久化

交付：

- PostgreSQL schema 和 Flyway；
- 单用户认证；
- Task、Project、DailyPlan、Review 和 Event 服务端模块；
- OpenAPI；
- Bootstrap；
- 统一错误码；
- Testcontainers 集成测试。

验收：

- 服务端重新校验所有关键领域规则；
- API 不依赖中文错误文本；
- 用户只能读取自己的数据；
- 数据库迁移可以在空库和已有库运行；
- 服务端重启后数据完整。

### M6：同步

交付：

- Outbox 推送；
- 幂等 mutation；
- 增量 pull；
- revision 冲突检测；
- 基础冲突处理；
- 离线和同步状态；
- 重试与退避。

验收：

- 相同 mutation 重试不会重复执行；
- 离线创建、修改和完成在联网后同步；
- 同步失败不丢弃 Outbox；
- 完成与普通编辑冲突时保留完成和编辑内容；
- 删除冲突不静默丢数据；
- 同步技术更新时间不影响停滞判断。

### M7：设置、数据安全和国际化

交付：

- 通用规则；
- 语言与地区；
- JSON 导入导出；
- 导入预览；
- 自动恢复点；
- 清除本地副本；
- 账户删除流程接口；
- 伪本地化布局修复。

验收：

- 导入覆盖前必须预览和确认；
- 清除本地副本不会删除云端数据；
- 删除账户与清理本地数据严格分离；
- 所有系统文案使用语言键；
- 长文案和 150% 缩放不遮挡核心操作。

### M8：Android

交付：

- Expo 工程；
- SQLite 本地存储；
- 快速记录、今天、收件箱和任务决策；
- 应用启动、回到前台和网络恢复同步；
- 本地安全凭据存储。

验收：

- 移动端不使用 WebView 替代核心界面；
- 与 Web 使用相同状态枚举和 API 契约；
- 离线操作可恢复同步；
- 后台同步失败不影响本地使用。

### M9：Oracle ARM 部署

交付：

- 生产 Compose；
- Caddy HTTPS；
- Spring Boot；
- PostgreSQL 数据卷；
- 数据库备份和保留策略；
- 健康检查；
- 结构化日志；
- 最小告警脚本；
- 部署和恢复说明。

验收：

- 重建容器不会丢失数据；
- 数据库备份可以实际恢复；
- 未开放 PostgreSQL 公网端口；
- 服务只使用明确的数据目录；
- 内存和磁盘占用适合现有 Oracle ARM 24GB 实例；
- 不产生必须的第三方固定月费。

## 10. 测试顺序

### 10.1 领域规则

优先测试：

- 状态转换；
- WIP 限制和覆盖；
- 今日上限；
- WAITING 释放 DOING 名额；
- deadlineAt 与 reviewAt 的独立性；
- reviewedAt 对停滞判断的影响；
- 项目焦点归属；
- 完成、放弃和重新打开。

### 10.2 本地持久化

- IndexedDB 事务；
- schema 升级；
- 刷新恢复；
- 离线操作；
- Outbox 原子写入；
- 导入预览和恢复点。

### 10.3 服务端

- Flyway；
- 用户隔离；
- 幂等 mutation；
- revision；
- Bootstrap；
- 增量 pull；
- 备份恢复。

### 10.4 端到端

首批端到端场景：

1. 快速记录并从收件箱加入今天；
2. 开始第四个任务时触发 WIP 决策；
3. 转为等待并设置检查时间；
4. 完成每日收尾并选择明日三项；
5. 回顾停滞任务并保持准备就绪；
6. 放弃任务后在日志中查询；
7. 离线完成任务后恢复同步；
8. 导入数据前预览并取消覆盖。

## 11. 每个里程碑的完成定义

一个里程碑只有同时满足以下条件才算完成：

- 产品规则符合 PRD；
- 领域规则有定向测试；
- 数据迁移可重复执行；
- 错误和空状态已处理；
- 系统文案已国际化；
- 键盘和非拖拽路径可用；
- 没有引入未批准的付费依赖；
- 文档与实际行为一致；
- 已记录已知限制和回滚方式。

## 12. 兼容性与回滚

### 客户端

- IndexedDB schema 只向前迁移；
- 破坏性迁移前自动导出或建立恢复点；
- 新客户端能够识别服务端 schema 版本；
- 不支持的服务端版本应阻止写入并明确提示。

### 服务端

- Flyway 已执行迁移不直接修改；
- 应用回滚前确认旧版本是否兼容新 schema；
- 优先采用扩展、迁移数据、切换读取、最后清理的方式；
- V0.1 不自动执行不可逆数据删除。

### 部署

- 应用镜像可回滚；
- 数据库使用备份和前向修复；
- Caddy 配置变更前保留上一版；
- 数据目录不随容器删除。

## 13. 主要风险

| 风险 | 控制方式 |
|---|---|
| 两套设计稿继续混用 | 以 Web V0.1 实现基线为唯一页面依据 |
| 先做全套 UI 导致规则返工 | 按纵向切片实现 |
| 本地库与服务端规则漂移 | 共享测试样例并由服务端最终校验 |
| 同步复杂度拖慢产品验证 | 先建立 Outbox，再分里程碑接通同步 |
| 回顾规则产生提醒噪音 | 记录 reviewedAt，通知只保留可操作项 |
| 功能范围膨胀 | 日历、模板、统计、计费延后 |
| 国际化后补导致布局返工 | 第一里程碑建立语言键和伪本地化 |
| Oracle 单机故障 | 自动备份、恢复演练和可迁移 Compose |

## 14. 编码前决策

以下决策建议在初始化工程前一次性确认：

| 决策 | 推荐默认值 |
|---|---|
| 首个客户端 | PC Web |
| Android 开始时间 | Web 核心闭环和同步契约稳定后 |
| 今日焦点上限 | 3 |
| DOING 上限 | 3 |
| 首发时区 | 默认 `Asia/Shanghai`，用户可修改 |
| 阶段 1 Project | 包含基础 Project 和焦点行动 |
| 阶段 1 附件 | 不包含 |
| 仓库 | Monorepo |
| Java 构建 | Maven |
| 数据访问 | 在 jOOQ、MyBatis、Spring Data 中确认一种 |
| 阶段 1 认证 | 封闭单用户认证，阶段 2 切换标准 OIDC |
| 阶段 1 同步 | 真实自动同步，但排在本地闭环之后 |

除数据访问方案外，其余推荐值均与当前产品和技术基线一致。

## 15. 推荐启动顺序

实际编码按以下顺序开始：

```text
确认编码前决策
→ M0 工程基线
→ M1 本地任务内核
→ M2 今天与执行
→ M3 项目与焦点
→ M4 每日收尾和基础回顾
→ M5 服务端持久化
→ M6 同步
→ M7 设置、数据安全和国际化
→ M8 Android
→ M9 Oracle ARM 部署
```

M0 完成后再细化后续里程碑，不在初始化时一次性创建所有占位模块。
