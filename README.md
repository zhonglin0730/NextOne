# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne 是一个主动帮助用户做取舍的个人行动系统。

当前仓库处于 V0.1 工程基线阶段。产品和开发文档位于 `docs/`。

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

- 当前只初始化 Web、共享 TypeScript 包、Spring Boot 和本地 PostgreSQL；
- Android、自动同步、正式认证和 Oracle 部署将在后续里程碑实现；
- 不依赖 Supabase、Redis、消息队列或付费 SaaS。
