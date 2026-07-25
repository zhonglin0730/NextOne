# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne 是一个主动帮助用户做取舍的个人行动系统。

当前仓库已完成 V0.1 M6 同步：Web 端已具备快速记录、今日计划、执行看板、
项目焦点、每日收尾与基础回顾；IndexedDB Outbox 已接通 Spring Boot/PostgreSQL，
支持幂等推送、增量拉取、离线重试和显式冲突处理。产品和开发文档位于 `docs/`。

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

```powershell
$env:NEXTONE_ACCESS_TOKEN="请替换为随机长令牌"
pnpm server:run
```

本地默认令牌仅用于开发：`nextone-local-dev-token`。调用 `/api/v1/**` 时使用
`Authorization: Bearer <token>`。OpenAPI 文件位于
`http://127.0.0.1:8080/openapi/nextone-v1.yaml`。

环境变量参考 `deploy/compose/.env.example` 和 `apps/server/src/main/resources/application.yml`。

## 当前边界

- 当前已实现 Web 工程基线、本地任务内核、今天页、执行看板、项目焦点、每日收尾与基础回顾；
- M6 已接通浏览器 IndexedDB Outbox 与服务端，并提供 `/settings/sync` 同步状态与冲突处理页；
- Android、标准 OIDC 认证和 Oracle 部署将在后续里程碑实现；
- 不依赖 Supabase、Redis、消息队列或付费 SaaS。
