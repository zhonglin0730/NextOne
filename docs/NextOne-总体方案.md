# NextOne 总体产品与技术方案

> 文档状态：产品与技术基线，已确认  
> 版本：0.1  
> 日期：2026-07-24  
> 产品暂定名：NextOne / 下一步

## 0. 执行摘要

NextOne 不定位为“功能更少的 Trello”，而定位为：

> 一个会主动帮助用户做取舍的个人行动系统。它不追求保存更多任务，而是持续帮助用户决定：现在做什么、什么暂时不做、什么应当彻底放弃。

产品采用“完整形态统一设计、按阶段逐步实现”的策略。完整设计用于提前稳定领域模型、状态机、同步协议、多端边界和数据迁移方式，不代表第一阶段同时建设所有客户端和基础设施。

当前建议基线如下：

| 决策项 | 推荐结论 |
|---|---|
| 核心差异 | 决策清理、WIP 限制、主动回顾、完成证据 |
| PC Web | React + TypeScript + Vite |
| Android / iOS | React Native + Expo，使用原生界面，不以 H5 代替 |
| 桌面客户端 | Tauri 2，复用 PC Web UI |
| 后端 | Spring Boot |
| 服务端数据库 | PostgreSQL |
| Web 本地库 | IndexedDB / Dexie |
| 移动端本地库 | SQLite |
| 桌面端本地库 | SQLite |
| 部署 | Oracle ARM + Docker Compose + Caddy |
| 同步 | 本地优先、Outbox、幂等 mutation、增量 pull |
| 认证 | 第一阶段单用户；内测阶段引入标准 OIDC |
| 国际化 | 第一阶段建立 i18n 基线，中文首发，英语在内测阶段交付 |
| 文件 | 第一阶段不做；后续优先使用 OCI Object Storage |
| 成本原则 | 用户价值验证前尽量保持零固定月费 |
| Supabase | 保留为迁移选项，不作为初期依赖 |
| Web V0.1 | 以 11:27 批次设计为主基线，11:41 批次仅提取通知、日志、任务抽屉和异常状态 |

阶段顺序：

1. 个人可用版：验证“收集—聚焦—执行—完成—回顾”闭环。
2. 私人内测版：多用户、稳定同步、周回顾、通知和备份。
3. 公开产品版：iOS、桌面端、附件、完整账号和运营能力。
4. 商业增强版：AI、订阅、集成和按负载扩容。

---

## 1. 需求理解

### 1.1 产品目标

NextOne 面向同时管理工作、学习、家庭、健康和个人项目的个人知识工作者，重点解决：

- 任务散落在多个列表，缺少统一入口；
- 卡片不断积累，工具逐渐变成任务坟场；
- 每天不知道应该先做什么；
- 延期任务长期变红，最终被用户忽略；
- 项目步骤很多，但缺少明确的下一步行动；
- 同时开始太多事情，完成率低；
- 完成了不少事情，却缺乏日报、周报和长期进展证据；
- 用户花在维护任务工具上的时间过多。

### 1.2 核心用户承诺

每次打开 NextOne，用户应该快速得到三个答案：

1. 今天真正要推进什么；
2. 当前最多应该同时做什么；
3. 哪些长期未决事项需要重新决定。

### 1.3 产品不追求什么

NextOne 初期及中期不追求：

- 团队项目管理；
- 复杂权限和企业组织结构；
- 甘特图、资源排期和工时审批；
- 聊天、评论和多人协同编辑；
- 无限自定义字段；
- Power-Up 或自动化规则市场；
- 用 AI 自动替用户移动和删除任务；
- 一套 UI 强行覆盖手机、Web 和桌面端。

### 1.4 成功标准

产品成功不以“创建了多少任务”为主要指标，而以以下行为衡量：

- 用户每周至少 5 天打开产品；
- 每日选择的焦点任务数量保持克制；
- 用户能够完成或明确放弃任务；
- 收件箱能够定期被清空；
- 长期未决任务能够被重新判断；
- 用户愿意完成每日或每周回顾；
- 完成日志能够用于工作汇报、学习记录或个人复盘；
- 用户维护工具本身的时间持续下降。

---

## 2. 当前现状与调用链

### 2.1 当前工程现状

当前 `D:\workspace\NextOne` 尚无应用代码、工程结构或数据库迁移，处于产品与技术方案确认阶段。

本方案确认后再进入工程初始化，不在方案阶段提前创建业务代码、数据库或部署资源。

### 2.2 目标调用链

在线时：

```text
用户操作
  → 客户端领域规则预校验
  → 本地事务写入实体和 Outbox
  → UI 立即响应
  → 后台 push mutation
  → Spring Boot 认证并重新校验业务规则
  → PostgreSQL 提交实体、事件和变更日志
  → 返回新 revision / 冲突结果
  → 客户端 pull 远端增量
  → 更新本地数据库
```

离线时：

```text
用户操作
  → 本地事务写入实体和 Outbox
  → UI 正常使用
  → 等待网络恢复或应用回到前台
  → 批量 push
  → 冲突检测
  → pull 增量
```

提醒与回顾：

```text
deadline / reviewAt / waiting checkpoint
  → 本地计划通知或服务端提醒任务
  → 任务进入“需要决定”队列
  → 用户选择继续、拆小、等待、以后或放弃
  → 记录 TaskEvent 和 ReviewDecision
```

---

## 3. 产品原则

### 3.1 五条基本原则

1. 所有事情先进入一个统一收件箱。
2. 任何活跃项目都应当存在可执行的 READY 或 DOING 任务。
3. 进行中的任务默认不得超过三个。
4. 没有外部后果的日期，不称为截止日期。
5. 系统必须帮助用户删除和放弃任务，而不只是帮助用户增加任务。

### 3.2 三个正交维度

任务不使用一个字段承载所有含义，至少拆成三个维度：

#### 执行状态

```text
INBOX
READY
DOING
WAITING
COMPLETED
CANCELED
```

#### 可见性

```text
ACTIVE
SNOOZED
SOMEDAY
```

#### 今日计划

“今天做”不是任务状态，而是独立的某日计划记录。

这样可以表达：

- 一个 READY 任务今天要做；
- 一个 READY 任务今天不做；
- 一个 WAITING 任务今天需要检查；
- 一个未完成的今日任务第二天不自动继续占据焦点；
- 一个 SOMEDAY 任务在 reviewAt 到达后重新进入决策队列。

### 3.3 WIP 规则

- 默认最多三个 DOING 任务；
- WAITING 不占用 DOING 名额；
- 用户可以明确覆盖默认限制，但必须记录覆盖事件；
- 后续根据覆盖率判断默认值是否合理；
- WIP 是行为引导，不应成为无法恢复的数据库死锁。

### 3.4 项目结构与当前执行

- 项目表达希望达成的结果；
- 工作包是独立实体，用于拆分阶段、模块或交付成果，不进入任务状态机；
- 任务可以归入工作包，也可以直接位于项目根级；
- “当前执行”由所有 DOING 任务和排序最前的 READY 任务实时派生，不持久化另一个焦点字段；
- 没有 READY 或 DOING 任务的活跃项目进入每周回顾队列。

### 3.5 日期语义

| 日期 | 含义 | 示例 |
|---|---|---|
| `deadlineAt` | 错过会产生现实后果的硬截止时间 | 报名截止、还款、上线 |
| `reviewAt` | 到达后重新考虑，不代表必须完成 | 两周后追问、下月再评估 |
| `waitingSince` | 开始等待的时间 | 等待审核、等待报告 |
| `reviewedAt` | 用户最近一次明确处理该事项的时间 | 保持准备就绪但不立即行动 |
| `completedAt` | 实际完成时间 | 生成完成日志 |
| `canceledAt` | 明确放弃时间 | 记录放弃而非物理删除 |

### 3.6 AI 原则

AI 只能提供候选方案，不直接替用户改变关键状态。

允许：

- 将模糊目标改写成可执行的下一步；
- 生成项目拆解候选；
- 根据完成事件生成日报、周报和项目进展；
- 总结延期和放弃原因。

不允许：

- 未经确认修改任务优先级；
- 未经确认移动、完成或删除任务；
- 自动创建大量任务污染看板；
- 以 AI 对话代替明确的产品交互。

---

## 4. 完整功能版图

### 4.1 收集

- 单输入框快速创建；
- 默认进入收件箱；
- 键盘快捷创建；
- 移动端快速添加；
- 分享到 NextOne；
- 后续支持语音、图片和文件；
- 自然语言识别日期、时长和领域；
- 导入 JSON、Markdown 和常见任务格式。

### 4.2 整理

- 收件箱逐项处理；
- 转为 READY、WAITING、SOMEDAY 或 CANCELED；
- 指定 Area 和 Project；
- 设置 deadlineAt 或 reviewAt；
- 拆成更小下一步；
- 将任务归入项目工作包；
- 重复任务和模板后期加入。

### 4.3 今日聚焦

- 每日计划独立于任务状态；
- 默认最多三件，可配置上限；
- 支持排序；
- 展示截止风险和预计时长；
- 日终选择完成、保留、移除或放弃；
- 未完成事项不自动无限顺延。

### 4.4 执行

- READY → DOING；
- WIP 限制；
- DOING → WAITING；
- DOING → READY 暂停；
- 完成和取消；
- PC 拖拽与快捷键；
- 移动端按钮、滑动、长按和底部操作栏；
- 拖拽不是唯一操作方式。

### 4.5 等待与再看

- WAITING 必须建议设置检查时间；
- 记录等待对象和等待原因；
- 等待过久自动进入回顾；
- SNOOZED 在 reviewAt 前不占据主注意力；
- reviewAt 到达后进入“需要决定”，而不是直接加入今日计划。

### 4.6 每日收尾

每日只处理：

1. 今天哪些完成；
2. 哪些继续保留；
3. 哪些不再值得做；
4. 明天最重要的三件是什么。

目标是在一个页面内、数分钟内完成。

### 4.7 每周回顾

系统主动生成：

- 超过七天未变化的任务；
- 连续推迟多次的任务；
- 等待时间过长的任务；
- 没有 READY 或 DOING 任务的活跃项目；
- 临近 deadline 的任务；
- 长期占用 DOING 的任务；
- 本周完成和取消的事项。

每项提供：

```text
继续
安排到今天
拆成下一步
转为等待
设置再看日期
以后再说
彻底放弃
```

用户选择“保持准备就绪”时，系统必须更新 `reviewedAt` 并记录回顾事件。停滞判断应依据最近一次有意义的修改、状态变化或明确回顾时间，避免用户刚处理过的事项立即再次进入回顾队列。

### 4.8 完成证据

- 每个完成或取消动作形成事件；
- 按 Area、Project 和日期生成日志；
- 生成日报、周报和项目进展；
- 展示完成、放弃、等待和延期趋势；
- 允许用户纠正自动生成的总结；
- 总结不是任务事实的唯一来源。

### 4.9 查询和过滤

- 全文搜索；
- Area、Project、状态和可见性；
- 截止风险；
- 可用时间；
- 精力等级；
- 等待时长；
- 长期未处理；
- 已完成和已取消日志。

时间和精力均为可选元数据，不在快速创建时强制填写。

---

## 5. 多端体验边界

### 5.1 PC Web

主要负责“整理和规划”：

- 横向多列看板；
- 今日承诺清单；
- 鼠标拖拽；
- 键盘快捷键；
- 右键菜单；
- 批量整理；
- 项目规划；
- 每周回顾；
- 日志和导出；
- URL 路由和可访问性。

### 5.2 Android / iOS

主要负责“捕获和执行”：

- 今天；
- 收件箱；
- 项目；
- 回顾；
- 我的；
- 单手快速添加；
- 按钮和滑动切换状态；
- 本地通知；
- 分享入口；
- 离线使用；
- 后台机会性同步；
- 后续支持语音、拍照和桌面小组件。

移动端使用 React Native 原生组件，不把 PC 多列看板横向缩小后作为主要界面。

### 5.3 桌面客户端

Tauri 复用 PC Web 的界面和大部分业务层，增加：

- 全局快捷添加；
- 系统托盘；
- 开机启动；
- 本地备份；
- 文件关联；
- 系统通知；
- 多窗口；
- 自动升级。

桌面客户端在 Web 稳定后引入，不在第一阶段单独开发。

---

## 6. 实施阶段

### 6.1 阶段 0：方案与工程基线

目标：

- 确认本文档；
- 确认主要产品术语；
- 确认阶段 1 的客户端优先级；
- 建立 Monorepo；
- 建立领域、契约、存储接口和测试基线；
- 建立国际化键、语言回退和伪本地化测试基线；
- 建立 Oracle 部署基线，但不提前运行非必要服务。

交付：

- 产品需求基线；
- 页面信息架构；
- Web V0.1 页面与交互实现基线；
- 数据模型和迁移基线；
- OpenAPI 契约；
- 同步协议说明；
- Web、移动端低保真原型；
- CI、代码规范和测试框架；
- Docker Compose 开发环境。

### 6.2 阶段 1：个人可用版

目标：由产品所有者连续真实使用，验证核心行为闭环。

范围：

- PC Web；
- Android React Native App；
- 收件箱；
- READY、DOING、WAITING、SOMEDAY；
- 今日计划；
- WIP 默认上限；
- deadlineAt 和 reviewAt；
- 完成和取消；
- 完成日志；
- 每日收尾；
- 回顾中心和基础决策队列；
- Area 和基础 Project；
- 单用户服务端；
- Web IndexedDB；
- Android SQLite；
- `zh-CN` 首发语言和伪本地化校验；
- 所有系统文案通过语言键读取，不在业务组件中硬编码；
- 简化版 Outbox 和增量同步；
- JSON 导入导出；
- Oracle ARM 部署；
- PostgreSQL 备份。

暂不包含：

- 开放注册；
- iOS；
- Tauri；
- 附件；
- OAuth；
- AI；
- 订阅；
- 团队协作。

阶段验收：

- 连续四周可日常使用；
- 核心数据无丢失；
- 离线创建、修改、完成后能够恢复同步；
- 每日收尾完成率达到可接受水平；
- 能从事件生成可信的每日完成记录；
- 记录所有绕过 WIP 和跳过回顾的行为，用于验证设计。

### 6.3 阶段 2：私人内测版

目标：支持少量真实用户和多个设备。

范围：

- 多用户；
- `en-US` 英文界面、通知和导出；
- OIDC 认证和设备管理；
- 邮箱验证、找回和会话撤销；
- 稳定的幂等 push / pull；
- 基础冲突中心；
- 工作包结构与项目执行概览；
- 完整引导式每周回顾；
- 本地通知；
- 等待超时和再看提醒；
- Markdown 日报、周报；
- 数据备份和恢复入口；
- 管理端最小能力；
- 错误监控、限流和审计；
- Android 发布测试。

阶段验收：

- 多设备并发修改不会静默丢数据；
- mutation 重试不会重复执行；
- 服务端和客户端版本能够兼容滚动升级；
- 完成一次备份恢复演练；
- 用户可导出全部数据并注销账户；
- 内测用户能理解“截止日期”和“再看日期”的差异。

### 6.4 阶段 3：公开产品版

目标：具备公开注册、分发和可运维能力。

范围：

- iOS App；
- Tauri 桌面客户端；
- 根据用户需求扩展更多语言；
- 附件、图片和语音；
- OCI Object Storage；
- Google / Apple 登录和 Passkey 可选；
- 推送通知；
- 完整账户安全；
- 客户端升级策略；
- 数据保留和隐私能力；
- 状态页、告警和故障处理；
- 容量和成本监控；
- 正式应用商店发布。

阶段验收：

- 通过安全检查和依赖审计；
- 完成数据库和对象存储恢复演练；
- 具备服务降级和维护模式；
- 具备公开隐私政策、用户协议和数据删除流程；
- Oracle 故障时有明确迁移方案。

### 6.5 阶段 4：商业增强版

按实际使用数据决定是否增加：

- AI 下一步改写；
- AI 项目拆解；
- AI 日报、周报；
- 订阅和计费；
- 日历集成；
- 邮件转任务；
- 浏览器插件；
- GitHub 等第三方集成；
- 高级统计；
- 模板；
- 更高等级基础设施。

团队协作不默认进入该阶段，除非产品定位发生明确变化。

---

## 7. 技术架构

### 7.1 总体架构

```text
┌──────────────────────────────────────────────┐
│ Clients                                      │
│                                              │
│ Web             Mobile            Desktop    │
│ React/Vite      RN/Expo           Tauri      │
│ IndexedDB       SQLite            SQLite     │
└───────────────┬──────────────────────────────┘
                │ HTTPS / JSON / OpenAPI
                ▼
┌──────────────────────────────────────────────┐
│ Oracle ARM                                   │
│                                              │
│ Caddy                                        │
│   └─ Spring Boot API                         │
│        ├─ Auth Resource Server               │
│        ├─ Domain/Application                 │
│        ├─ Sync                               │
│        ├─ Review                             │
│        ├─ Notification                       │
│        └─ Export                             │
│                                              │
│ PostgreSQL                                   │
│ Backup Job                                   │
│ OIDC Provider（阶段 2）                       │
└───────────────┬──────────────────────────────┘
                │
                ├─ OCI Object Storage
                ├─ OCI Email Delivery
                └─ OCI Monitoring / Vault
```

### 7.2 Monorepo

推荐：

```text
next-one/
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
│  ├─ sync-core/
│  ├─ design-tokens/
│  └─ i18n/
├─ deploy/
│  ├─ compose/
│  ├─ caddy/
│  └─ scripts/
├─ docs/
├─ pnpm-workspace.yaml
└─ package.json
```

约束：

- `domain` 保存客户端共享的 TypeScript 模型和纯规则；
- `application` 保存客户端用例；
- `contracts` 保存 API DTO 和版本化契约；
- `api-client` 由 OpenAPI 生成或统一封装；
- `storage-contracts` 定义客户端本地存储接口；
- `sync-core` 只在开始实现同步时建立，不提前填充空抽象；
- `i18n` 保存共享语言键、语言包、格式化约定和伪语言；
- Java 服务端是服务端业务规则的权威实现；
- TypeScript 与 Java 规则通过共享测试样例保持一致；
- 不强求 Web 和移动端共享 UI。

### 7.3 Web 技术

- React；
- TypeScript；
- Vite；
- React Router；
- Dexie / IndexedDB；
- Zustand 仅保存临时 UI 状态；
- dnd-kit；
- Radix UI 或 shadcn/ui；
- Vitest；
- Playwright。

任务、项目、事件等持久数据不得复制一份到 Zustand 作为第二数据源。

### 7.4 移动端技术

- React Native；
- Expo；
- Expo Router；
- Expo SQLite；
- React Native Reanimated；
- React Native Gesture Handler；
- FlashList 或等价虚拟列表；
- Expo Notifications；
- Expo SecureStore；
- Maestro，必要时补 Detox。

移动端后台同步只能作为机会性补充。应用启动、回到前台和网络恢复是主要同步触发点。

### 7.5 桌面技术

- Tauri 2；
- 复用 React Web UI；
- Tauri SQLite；
- Rust 插件层仅承载系统能力；
- 不在 Rust 重写领域业务。

### 7.6 服务端技术

- Java LTS；
- Spring Boot；
- Spring Security Resource Server；
- PostgreSQL；
- Flyway；
- 阶段 1 使用 Spring JDBC 和显式 SQL 作为主要数据访问方式；
- OpenAPI；
- Testcontainers；
- 结构化日志；
- Spring Boot Actuator。

Redis 不是初始依赖。只有出现分布式锁、共享限流、热点缓存或队列需求时再引入。

### 7.7 国际化与多语言

国际化从第一阶段建立技术基线，但不要求第一阶段同时翻译多种正式语言。

#### 语言阶段

```text
阶段 1：zh-CN + 伪本地化
阶段 2：en-US
阶段 3：按用户需求增加 ja-JP、zh-TW 等语言
RTL：第一阶段保证架构可支持，不承诺首批交付
```

#### 客户端原则

- Web 和移动端共享语言键及核心语言资源；
- 页面、组件、校验、通知和空状态不得直接硬编码系统文案；
- 使用支持复数、参数插值和语言回退的 i18n 方案；
- 默认语言回退为 `en-US` 或产品指定的稳定基准语言；
- 用户可以在设置中覆盖系统语言；
- 缺失语言键在开发环境明确报错，生产环境安全回退；
- 翻译资源按功能域拆分，避免单个超大语言文件；
- 用户输入的任务、项目和备注保持原文，不自动翻译；
- 系统默认 Area、示例内容和模板在创建时按用户语言生成。

语言键示例：

```text
task.status.ready
task.action.moveToWaiting
review.reason.staleTask
review.action.keepReady
sync.error.conflict
notification.dailyReview.title
```

#### 服务端原则

- API 返回稳定错误码和结构化参数，不把中文错误消息作为协议；
- 客户端根据错误码完成本地化；
- 服务端发送邮件、推送和异步报告时，根据用户语言选择模板；
- 审计事件保存稳定事件类型，不保存仅供机器判断的翻译文本；
- AI 提示词、输出语言和用户界面语言分离配置；
- 导出支持选择语言，但任务原始内容不被翻译。

错误示例：

```json
{
  "code": "TASK_WIP_LIMIT_REACHED",
  "params": {
    "limit": 3
  }
}
```

#### 日期、数字和时区

- 时间戳统一保存 UTC；
- DailyPlan 依据用户 IANA 时区计算自然日；
- 日期、星期、相对时间、数字和复数使用 locale 格式化；
- 不拼接“3 + 个 + 任务”等中文特定句式；
- 每周起始日、12/24 小时制和日期格式允许按 locale 默认并由用户覆盖；
- 服务端不可根据部署服务器时区生成用户日期。

#### 设计稿要求

- 以德语或伪本地化验证至少 30%～50% 文案扩张；
- 按钮和标签不依赖固定文本宽度；
- 表格、卡片、弹窗支持换行或合理截断；
- 不把文字嵌入图片；
- 图标不能作为唯一语义来源；
- CSS 优先使用 `margin-inline`、`padding-inline`、`inset-inline` 等逻辑属性；
- 左右方向箭头、步骤和面包屑为 RTL 保留镜像能力；
- 中文、拉丁文字和日文字体分别验证字重、行高和缺字回退；
- 检查 125%、150% 页面缩放以及系统大字体。

---

## 8. 领域模型与数据表

### 8.1 建模原则

- 当前状态表是事实来源；
- `task_event` 用于审计、回顾和统计，不采用完整事件溯源；
- 所有实体使用全局唯一 ID；
- 服务端时间统一存 UTC；
- 用户日历日期按用户 IANA 时区计算；
- 删除使用软删除；
- 同步状态属于客户端本地元数据，不污染通用领域实体；
- 数据库 schema 按阶段通过 Flyway 增量落地。

### 8.2 核心表

#### `app_user`

```text
id
display_name
timezone
locale
language
week_start
hour_cycle
plan
created_at
updated_at
deleted_at
revision
```

不将邮箱作为主键。

#### `user_identity`

```text
id
user_id
issuer
subject
email_snapshot
created_at
```

唯一约束：

```text
(issuer, subject)
```

这样可以在不修改业务用户 ID 的情况下更换 OIDC 提供方。

#### `device`

```text
id
user_id
name
platform
app_version
last_seen_at
revoked_at
created_at
```

#### `area`

```text
id
user_id
name
color
sort_key
created_at
updated_at
deleted_at
revision
```

#### `project`

```text
id
user_id
area_id
title
note
status
focus_task_id
sort_key
completed_at
canceled_at
created_at
updated_at
deleted_at
revision
```

项目状态：

```text
ACTIVE
ON_HOLD
COMPLETED
CANCELED
```

#### `task`

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

不在 `task` 中保存：

```text
is_today
sync_status
last_device_id
```

#### `daily_plan`

```text
id
user_id
plan_date
timezone
status
opened_at
closed_at
created_at
updated_at
revision
```

唯一约束：

```text
(user_id, plan_date)
```

#### `daily_plan_item`

```text
id
daily_plan_id
task_id
sort_key
selected_at
outcome
removed_at
created_at
updated_at
revision
```

`outcome`：

```text
PENDING
COMPLETED
KEPT
REMOVED
CANCELED
```

#### `task_event`

```text
id
user_id
task_id
device_id
event_type
payload_json
occurred_at
recorded_at
server_sequence
```

主要事件：

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

#### `review_session`

```text
id
user_id
review_type
period_start
period_end
status
started_at
completed_at
created_at
```

#### `review_item`

```text
id
review_session_id
entity_type
entity_id
reason
decision
decision_payload
decided_at
```

#### `attachment`

阶段 3 引入：

```text
id
user_id
task_id
object_key
original_name
content_type
size_bytes
checksum
created_at
deleted_at
revision
```

### 8.3 同步表

#### `sync_mutation`

```text
client_mutation_id
user_id
device_id
entity_type
entity_id
operation
base_revision
payload_json
occurred_at
received_at
result_status
result_revision
```

`client_mutation_id` 必须唯一，用于幂等重试。

#### `change_log`

```text
server_sequence
user_id
entity_type
entity_id
operation
revision
payload_json
created_at
```

客户端 cursor 使用 `server_sequence`，不使用客户端时间戳。

#### 客户端 `outbox`

```text
client_mutation_id
device_id
entity_type
entity_id
operation
base_revision
payload
created_at
retry_count
last_error
```

客户端本地数据库还包含：

```text
sync_state
conflicts
```

### 8.4 排序

- 使用可插入的字符串排序键；
- 插入两项之间时只更新被移动项；
- 同键时使用实体 ID 作为确定性二级排序；
- 支持后台重平衡；
- 重平衡本身必须可幂等；
- 冲突时不静默覆盖用户可见顺序。

---

## 9. 状态机与业务规则

### 9.1 主要状态转换

```text
INBOX → READY
INBOX → WAITING
INBOX → CANCELED
INBOX → SOMEDAY（通过 visibility）

READY → DOING
READY → WAITING
READY → COMPLETED
READY → CANCELED

DOING → READY
DOING → WAITING
DOING → COMPLETED
DOING → CANCELED

WAITING → READY
WAITING → DOING
WAITING → COMPLETED
WAITING → CANCELED

COMPLETED → READY（显式重新打开）
CANCELED → READY（显式恢复）
```

### 9.2 关键不变量

- 用户只能访问自己的实体；
- 同一用户同一自然日最多一个 DailyPlan；
- 默认 DOING 数量达到上限时，开始新任务需要显式覆盖；
- COMPLETED 必须有 completedAt；
- CANCELED 必须有 canceledAt；
- WAITING 建议具有 waitingSince 和 reviewAt，但初期不做数据库强制；
- “保持准备就绪”等明确回顾动作必须更新 reviewedAt 并产生 REVIEWED 事件；
- WAITING 与 DOING 互斥；进入 WAITING 后不再占用 DOING 名额；
- deadlineAt 与 reviewAt 可以同时存在；
- 任务的 workPackageId 必须属于同一项目，工作包层级最多两级；
- 软删除实体不出现在正常查询中；
- 所有写操作产生 revision；
- 重要状态转换产生 TaskEvent；
- 服务器必须重新校验客户端离线操作。

---

## 10. API 与同步协议

### 10.1 API 分层

```text
/api/v1/auth-context
/api/v1/me
/api/v1/bootstrap
/api/v1/sync/push
/api/v1/sync/pull
/api/v1/reviews/*
/api/v1/exports/*
/api/v1/attachments/*
```

核心任务变更优先通过同步 mutation 表达，服务端管理后台或特殊操作可以提供命令 API。

### 10.2 Push

```json
{
  "deviceId": "device-001",
  "mutations": [
    {
      "clientMutationId": "mutation-001",
      "entityType": "TASK",
      "entityId": "task-001",
      "operation": "UPDATE",
      "baseRevision": 12,
      "occurredAt": "2026-07-23T08:30:00Z",
      "payload": {
        "status": "DOING"
      }
    }
  ]
}
```

服务端返回：

```json
{
  "results": [
    {
      "clientMutationId": "mutation-001",
      "status": "APPLIED",
      "revision": 13,
      "serverSequence": 10201
    }
  ]
}
```

可能状态：

```text
APPLIED
ALREADY_APPLIED
REJECTED
CONFLICT
```

### 10.3 Pull

```text
GET /api/v1/sync/pull?cursor=10200&limit=500
```

返回：

```json
{
  "nextCursor": 10280,
  "hasMore": false,
  "changes": []
}
```

### 10.4 冲突策略

按风险分层：

| 场景 | 初始策略 |
|---|---|
| 不同字段同时修改 | 可自动字段级合并 |
| 标题、备注同时修改 | 保留两版，进入冲突中心 |
| 完成与普通编辑冲突 | 完成优先保留，编辑内容不丢失 |
| 删除与修改冲突 | 不静默删除，要求确认 |
| 排序冲突 | 按排序键和 ID 确定顺序，必要时提示 |
| 今日计划冲突 | 合并后重新检查上限 |
| WIP 冲突 | 允许同步但生成超限决策项 |

第一阶段只实现可解释的简化策略，不追求通用 CRDT。

### 10.5 Bootstrap

新设备首次登录：

1. 获取用户、配置和服务端 schema 版本；
2. 分页下载当前有效实体；
3. 下载必要墓碑和最近事件；
4. 建立 cursor；
5. 完成本地索引；
6. 再允许进入正常同步。

---

## 11. 认证与授权

### 11.1 阶段 1

- 不开放注册；
- 仅产品所有者账户；
- 管理员初始化设备；
- 短期 access token + 可撤销 refresh token；
- SecureStore 或安全 Cookie 保存凭证；
- 不在客户端保存长期明文密钥。

### 11.2 阶段 2

推荐引入标准 OIDC 提供方，优先评估自建 Keycloak：

- Authorization Code + PKCE；
- Web、Android、iOS 使用同一 issuer；
- Spring Boot 作为 Resource Server；
- JWT 通过 JWKS 验证；
- 业务用户通过 `(issuer, subject)` 映射；
- 邮件通过 OCI Email Delivery；
- 支持设备和会话撤销。

如果后续迁移至 Supabase Auth、Zitadel 或其他服务，只需保持 OIDC 边界和用户身份映射。

### 11.3 授权

- 所有查询显式带 userId 条件；
- 不能只依赖客户端传入 userId；
- userId 来自已验证身份；
- 附件使用短期授权；
- 管理接口与用户接口分离；
- 高风险操作二次确认并产生审计事件。

---

## 12. Oracle ARM 部署方案

### 12.1 初期部署

```text
Oracle ARM VM
├─ Docker Engine
├─ Docker Compose
├─ Caddy
├─ Spring Boot
├─ PostgreSQL
└─ Backup Job
```

只对公网开放：

```text
80
443
```

要求：

- PostgreSQL 不开放公网端口；
- SSH 只使用密钥；
- 管理入口限制来源或使用安全隧道；
- 容器镜像必须验证 arm64 支持；
- Java 构建产物保持架构无关；
- 数据卷和日志目录明确挂载；
- 使用健康检查和重启策略；
- 所有密钥通过环境文件、Docker secret 或 OCI Vault 管理；
- `.env` 不提交仓库。

### 12.2 资源注意事项

Oracle 当前文档中的新 Always Free A1 配额为总计 2 OCPU、12GB；现有 24GB 实例可能属于历史资源或不同账户状态。

在确认前：

- 不删除实例；
- 不重建实例；
- 不调整 shape；
- 检查实例是否标记 Always Free Eligible；
- 检查账户是否为 Pay As You Go；
- 设置预算和用量告警。

### 12.3 数据目录

```text
/srv/nextone/
├─ compose/
├─ postgres/
├─ attachments/
├─ backups/
└─ logs/
```

目录权限按服务账户最小化配置。

### 12.4 备份

阶段 1：

- 每日 `pg_dump`；
- 压缩并加密；
- 上传 OCI Object Storage；
- 保留 7 个日备份和 4 个周备份；
- 每月至少一次下载到个人本地设备；
- 记录备份校验和。

阶段 2：

- 自动备份状态告警；
- 定期恢复到临时数据库；
- 记录恢复时间；
- 增加配置和对象文件备份；
- 保留必要的数据库迁移和镜像版本。

阶段 3：

- 增加跨厂商异地备份；
- 评估 PostgreSQL WAL 归档和时间点恢复；
- 明确 RPO 和 RTO。

仅在同一服务器保存备份不视为有效备份；仅在同一 Oracle 账户保存备份也不能覆盖账户级故障。

### 12.5 监控

初期：

- Spring Boot Actuator；
- 容器健康检查；
- Caddy 访问日志；
- JSON 应用日志；
- OCI Monitoring；
- Uptime Kuma；
- 磁盘、内存、CPU、证书、备份和同步失败告警。

Prometheus、Grafana、Loki 等在出现明确分析需求后再加入。

---

## 13. 成本方案

### 13.1 初期目标

除域名等必要费用外，保持接近零固定月费。

| 项目 | 初期方案 | 预计固定月费 |
|---|---|---:|
| 计算 | 已有 Oracle ARM | 0 |
| PostgreSQL | 自建 | 0 |
| HTTPS | Caddy + ACME | 0 |
| 对象存储 | OCI Always Free 额度内 | 0 |
| 邮件 | OCI Email Delivery 免费额度内 | 0 |
| 监控 | Actuator + OCI + Uptime Kuma | 0 |
| Android 推送 | FCM | 0 |
| 源码和 CI | 现有 Git 平台免费额度 | 0 |
| Supabase | 不使用 | 0 |

### 13.2 后续不可完全避免的成本

- 域名；
- Apple Developer 账号；
- Google Play 开发者注册；
- iOS 构建环境或云构建；
- 跨厂商异地备份；
- 邮件、短信或推送超额；
- Oracle 实例失效后的替代服务器；
- 用户增长后的数据库、存储和带宽；
- AI 调用；
- 支付渠道和税务合规。

### 13.3 付费触发原则

只有满足以下任一条件才引入持续付费服务：

- 付费能够明显缩短关键产品交付时间；
- 当前自建方案已经成为可靠性风险；
- 有真实用户数据需要更高等级保护；
- 收入可以覆盖成本；
- 免费额度成为确定的增长瓶颈；
- 法规或应用商店要求必须使用。

“免费”不是永久架构约束，数据安全和可恢复性优先于节省小额费用。

---

## 14. 可选方案与取舍

### 14.1 方案 A：Oracle + Spring Boot + PostgreSQL

推荐。

优点：

- 充分利用已有资源；
- 固定现金成本低；
- Java 技术栈统一；
- 数据和同步逻辑可控；
- 不产生跨云数据库延迟；
- 迁移路径清晰。

缺点：

- 自己负责数据库维护；
- 单机存在单点故障；
- 认证和邮件需要额外建设；
- 必须认真做备份和安全。

### 14.2 方案 B：Oracle Spring Boot + Supabase Cloud

保留为未来选项。

优点：

- 托管 PostgreSQL、Auth 和 Storage；
- 减少部分运维；
- 更快获得通用账号能力。

缺点：

- 跨云网络和故障边界；
- 免费额度和长期月费；
- Oracle 资源利用率下降；
- 同时维护 Spring 与 Supabase 权限模型；
- 核心业务仍不能完全交给 Supabase。

适用条件：

- 用户增长后数据库运维成为明确瓶颈；
- 愿意以月费换取备份和托管；
- 选择了与 Oracle 服务接近的区域。

### 14.3 方案 C：Oracle 自建 Supabase

不推荐。

优点：

- 开源；
- 具备 Auth、REST、Realtime、Storage 等完整组件；
- 数据在自己的服务器。

缺点：

- 服务数量多；
- 与 Spring Boot 职责重叠；
- 升级、备份、安全、监控和故障恢复复杂；
- 自建后失去托管 Supabase 的主要价值。

### 14.4 方案 D：全部客户端直连 Supabase

不推荐。

原因：

- 业务规则分散在客户端、RLS、触发器和函数；
- 离线同步和冲突策略难统一；
- Java 后端能力无法发挥；
- 复杂回顾和决策规则后期维护困难。

---

## 15. 测试范围

### 15.1 领域规则

- 状态转换；
- WIP 限制；
- 今日计划上限；
- deadline 与 reviewAt；
- 工作包归属与当前执行派生；
- 完成、取消和重新打开；
- 软删除；
- 回顾候选生成；
- 日历日期与时区边界。

Java 与 TypeScript 使用同一套 JSON 规则样例，分别执行一致性测试。

### 15.2 存储

- Web Dexie repository contract；
- Mobile SQLite repository contract；
- Server PostgreSQL repository；
- Flyway 从空库升级；
- 连续多个历史版本升级；
- 排序键插入和重平衡；
- 大量任务查询和索引。

### 15.3 同步

- 离线创建后同步；
- 重复提交幂等；
- push 中途失败重试；
- pull 分页；
- 删除传播；
- 两设备修改不同字段；
- 两设备修改相同字段；
- 完成与编辑冲突；
- 排序冲突；
- cursor 恢复；
- 新设备 bootstrap；
- 旧客户端与新服务端兼容。

### 15.4 客户端

Web：

- 键盘操作；
- 拖拽替代操作；
- 可访问性；
- 响应式布局；
- IndexedDB 数据恢复；
- Playwright 核心流程。

移动端：

- Android 真机；
- 前后台切换；
- SQLite 持久化；
- 弱网和断网；
- 通知权限拒绝；
- 深链；
- Maestro 核心流程。

### 15.5 服务端与部署

- Testcontainers PostgreSQL 集成测试；
- API 鉴权；
- 用户数据隔离；
- ARM64 镜像启动；
- Docker Compose 冒烟；
- 备份和恢复；
- 磁盘写满告警；
- 数据库不可用时的失败行为；
- 滚动升级和回滚。

### 15.6 国际化

- 扫描业务组件中的硬编码系统文案；
- 检查缺失语言键和无效语言键；
- `zh-CN`、`en-US` 和伪语言快照；
- 复数、参数插值和回退语言；
- 不同 locale 的日期、星期、数字和相对时间；
- 夏令时、跨日和每周起始日；
- 30%～50% 文案扩张；
- RTL 布局冒烟；
- 邮件、推送、导出和错误码本地化；
- 中文、英文和日文输入、搜索、排序及导出编码。

---

## 16. 兼容性策略

- API 使用 `/api/v1` 版本前缀；
- OpenAPI 作为客户端契约来源；
- 服务端至少兼容前一个正式客户端版本；
- 客户端发送 appVersion、schemaVersion 和 protocolVersion；
- 本地数据库只做向前迁移，失败时保留原数据；
- 重大协议升级先部署兼容服务端，再发布客户端；
- 未升级客户端不得导致服务端数据损坏；
- 时间戳使用 UTC，日计划使用用户时区自然日；
- API 使用稳定错误码，不以某种语言的错误消息作为契约；
- 客户端升级不得删除旧版本仍使用的语言键；
- 缺失翻译按既定语言链回退；
- 用户语言、时区、每周起始日和 12/24 小时制独立保存；
- 导出格式包含 schemaVersion；
- 导入前校验并生成恢复点。

---

## 17. 发布与回滚

### 17.1 发布顺序

1. 完成数据库备份；
2. 部署向后兼容的数据库迁移；
3. 部署服务端；
4. 执行健康检查和同步冒烟；
5. 发布 Web；
6. 分批发布移动端；
7. 观察错误率、同步冲突和数据库指标。

### 17.2 回滚原则

- 应用镜像保留至少两个稳定版本；
- 数据库迁移优先采用 expand / migrate / contract；
- 不依赖破坏性 down migration；
- 新字段先兼容空值；
- 删除字段至少跨一个正式版本；
- 同步协议通过 feature flag 控制；
- 出现严重同步错误时可切换只读维护模式；
- 客户端 Outbox 不因服务端回滚而清空。

### 17.3 数据恢复

- 从备份恢复到新数据库验证；
- 对比行数、校验和和关键用户数据；
- 更新连接后先只读验证；
- 确认后恢复写入；
- 记录故障原因和丢失窗口。

---

## 18. 风险

### 18.1 产品风险

| 风险 | 应对 |
|---|---|
| 与 Things、Todoist 等已有能力重叠 | 以主动清理和决策回顾作为核心差异 |
| WIP 限制过强 | 默认限制、允许显式覆盖、跟踪覆盖率 |
| 回顾过程太重 | 控制在单页和数分钟内 |
| 字段过多造成维护负担 | 快速创建只要求标题，元数据按需补充 |
| 系统暗中选择“唯一下一步”造成误导 | 完整展示 DOING，并只把排序第一的 READY 作为接续提示 |
| 用户不愿放弃任务 | 用完成证据和低压力文案建立信任 |

### 18.2 技术风险

| 风险 | 应对 |
|---|---|
| 离线同步复杂 | 简化协议、幂等 mutation、明确冲突中心 |
| Java 与 TypeScript 规则漂移 | 共享规则样例和契约测试 |
| 单机故障 | 自动备份、恢复演练、迁移预案 |
| Oracle 免费资源被回收或调整 | 告警、备份、避免依赖不可恢复实例 |
| ARM 镜像兼容 | CI 构建并验证 arm64 |
| 移动后台同步不可靠 | 前台和网络恢复同步为主 |
| 排序键增长或冲突 | 确定性二级排序和重平衡 |
| 自建认证安全风险 | 内测阶段引入标准 OIDC，避免公开自研密码体系 |

### 18.3 成本风险

- 零成本目标导致忽视备份；
- 用户增长后仍拒绝必要的托管服务；
- AI、附件和出口流量不可控；
- 应用商店和 iOS 构建成本低估。

所有可计量资源需要配额、告警和降级策略。

---

## 19. 关键指标

### 19.1 产品指标

- 每周活跃天数；
- 收件箱清空频率；
- 每日计划平均数量；
- 每日计划结算率；
- WIP 超限次数和覆盖率；
- 任务完成率；
- 主动取消率；
- 延期次数分布；
- reviewAt 到期后的决策率；
- 每周回顾完成率；
- 无可执行任务项目数量；
- 日报、周报导出或复制次数。

### 19.2 技术指标

- API 可用性和 P95 延迟；
- push 成功率；
- Outbox 积压数量；
- 同步冲突率；
- 客户端崩溃率；
- 数据库大小和慢查询；
- 备份成功率；
- 最近一次恢复演练时间；
- 磁盘使用率；
- 通知送达率；
- 每用户存储和出口流量。

---

## 20. 后续实施决策

产品方向、Web V0.1 信息架构和技术总路线已经确认。下列事项不阻塞产品基线，但应在对应阶段开始前确定：

1. 阶段 1 是否确定为 PC Web + Android，iOS 后置；
2. 阶段 1 是否需要真实多设备自动同步，还是允许先手动导入导出；
3. 个人使用的主时区是否固定为 `Asia/Shanghai`；
4. 默认今日上限是 3 还是 5；
5. 默认 DOING 上限是否固定为 3；
6. “以后再说”和“暂时隐藏”是否继续共用 SOMEDAY 可见性；
7. 阶段 1 是否包含完整 Project，还是先只有 Area；
8. 是否接受阶段 1 不做附件；
9. Oracle 24GB 实例当前的账户类型、OCPU、磁盘和 Always Free 标记；
10. 代码仓库是否采用前后端 Monorepo；
11. Java 数据访问层阶段 1 已确定采用 Spring JDBC；后续只有在查询复杂度显著增长时再评估 jOOQ；
12. 第一阶段是否直接引入标准 OIDC，还是先使用封闭单用户认证。

---

## 21. 推荐确认结论

如果没有额外调整，建议以以下内容作为实施基线：

- 产品定位：以项目成果、工作包结构和清晰执行流为中心的个人项目管理系统；
- 完整设计、阶段实施；
- 阶段 1：PC Web + Android；
- 项目是主视角，任务服务于成果；Area 作为可选组织维度；
- 今日计划和任务状态分离；
- DOING 默认上限 3；
- 今日承诺默认上限 3；
- 支持 deadlineAt 和 reviewAt；
- 采用本地优先和简化版同步；
- Oracle ARM 运行 Caddy、Spring Boot、PostgreSQL 和备份任务；
- 不使用 Supabase；
- 不自建整套 Supabase；
- 阶段 1 不做 iOS、Tauri、附件、AI、团队和计费；
- Web 一级导航固定为“项目 / 今天 / 收件箱 / 回顾”；项目驾驶舱是默认落点，看板和设置是辅助入口；
- 日志归入回顾，通知使用顶部入口，数据与账户归入设置；
- 标签只作为任务属性，日历、模板、统计和专业版入口不进入 V0.1；
- 回顾中心和基础决策队列进入阶段 1，完整引导式每周回顾进入阶段 2；
- 数据库、同步协议和多端接口从第一天按长期形态设计；
- Web V0.1 的具体页面、术语和交互以 `docs/PRD/NextOne-Web-V0.1-实现基线.md` 为准。
- V0.1 的工程拆解、里程碑和验收顺序以 `docs/NextOne-V0.1-开发执行计划.md` 为准。

---

## 22. 参考资料

- [Oracle Cloud Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- [Oracle Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)
- [Supabase Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [React Native Native Components](https://reactnative.dev/docs/next/intro-react-native-components)
- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Background Task](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Tauri 2](https://v2.tauri.app/start/)
- [Things Today / Anytime / Someday / Logbook](https://culturedcode.com/things/support/articles/4001304/)
