# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne 是一个面向个人的项目推进系统：用项目看全局，用工作包拆结构，用任务状态推动执行。

它不是传统待办清单，也不只是功能更少的 Trello。NextOne 从想要达成的项目结果出发，
帮助个人在项目驾驶舱中看清整体进度、卡点和当前执行，再通过看板组织执行流、用“今天”
承接当日承诺，并在回顾中持续纠偏。WIP 限制、无可执行任务提醒和等待事项提示仍会帮助用户
做取舍，但它们服务于项目推进，而不是把产品定义成一个任务决策工具。

当前仓库已完成 Web 端个人项目推进闭环和离线同步，并提供 Expo / React Native 原生
客户端。现有能力包括项目驾驶舱、工作包拆解、项目执行进度、执行看板、快速记录、今天、
收件箱、晨间规划、每日收尾、基础回顾、Zen 单任务模式、IndexedDB / SQLite 本地存储、
机会性自动同步和 SecureStore 安全凭据。产品和开发文档位于 `docs/`。

## 核心工作流

1. 创建项目，写清希望达成的结果；
2. 用工作包拆出阶段或成果范围，再用任务表达可以执行的行动；
3. 从项目或看板挑选少量任务加入今天，控制同时进行的工作；
4. 完成、暂停或标记等待，让项目进度和卡点保持真实；
5. 通过每日收尾和周期回顾处理等待、停滞和没有可执行任务的项目。

## 本机要求

- Node.js 22.13 或更高版本
- pnpm 11
- Java 17 或更高版本
- Maven 3.6.3 或更高版本
- Docker Desktop（运行本地 PostgreSQL 时需要）

## 常用命令

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm dev
```

启动 Android 开发服务：

```bash
pnpm mobile:dev
```

使用 Android 手机上的 Expo Go 扫描终端二维码，或在已配置 Android 模拟器时运行
`pnpm mobile:android`。Android 模拟器访问本机 API 时使用 `http://10.0.2.2:8080`；
真机需要在应用“设置”中填写局域网或公网可访问的服务端地址。

启动本地数据库：

```bash
pnpm db:up
```

启动服务端：

```powershell
$env:NEXTONE_ACCESS_TOKEN="请替换为随机长令牌"
pnpm server:run
```

本地默认令牌仅用于开发：`nextone-local-dev-token`。调用 `/api/v1/**` 时使用
`Authorization: Bearer <token>`。OpenAPI 文件位于
`http://127.0.0.1:8080/openapi/nextone-v1.yaml`。

环境变量参考 `deploy/compose/.env.example` 和 `apps/server/src/main/resources/application.yml`。
Oracle ARM 生产部署、备份和恢复步骤见
[`docs/M10-Oracle-ARM-部署与恢复.md`](docs/M10-Oracle-ARM-部署与恢复.md)。

## 当前边界

- 当前已实现 Web 工程基线、本地任务内核、项目驾驶舱、工作包结构、项目执行进度、执行看板、今天页、每日收尾与基础回顾；
- M6 已接通浏览器 IndexedDB Outbox 与服务端，并提供 `/settings/sync` 同步状态与冲突处理页；
- M7 已提供 `/settings/general` 和 `/settings/data`，导入覆盖前会自动创建本地恢复点；
- 清除本地副本不会删除云端数据，账户删除申请也不会在浏览器中直接执行最终删除；
- M8 已提供不依赖 WebView 的 Android 原生界面、SQLite Outbox、前台/网络恢复同步和安全凭据；
- M9 已提供晨间规划、每日容量反馈和 Zen 单任务模式；
- M10 的 ARM64 镜像、生产 Compose、Caddy HTTPS、备份恢复和最小监控配置已就绪，等待
  Oracle ARM 主机与域名完成真实部署验收；
- 当前个人版使用单用户长令牌认证，标准 OIDC 属于后续账户体系增强；
- 不依赖 Supabase、Redis、消息队列或付费 SaaS。
