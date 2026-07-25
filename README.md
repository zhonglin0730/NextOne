# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne 是一个主动帮助用户做取舍的个人行动系统。

当前仓库已完成 V0.1 M3 项目与焦点：除快速记录、今日计划和执行看板外，
已支持项目列表、项目详情、项目焦点、下一步候选、无焦点决策提示和最近推进记录。
数据保存在 IndexedDB 并同步写入任务事件和 Outbox。产品和开发文档位于 `docs/`。

## 本机要求

- Node.js 22.12 或更高版本
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

启动本地数据库：

```bash
pnpm db:up
```

启动服务端：

```bash
pnpm server:run
```

环境变量参考 `deploy/compose/.env.example` 和 `apps/server/src/main/resources/application.yml`。

## 当前边界

- 当前已实现 Web 工程基线、本地任务内核、今天页、执行看板与项目焦点，回顾等页面仍按里程碑逐步开放；
- M1–M3 数据保存在浏览器 IndexedDB，Outbox 尚未连接服务端同步；
- Android、自动同步、正式认证和 Oracle 部署将在后续里程碑实现；
- 不依赖 Supabase、Redis、消息队列或付费 SaaS。
