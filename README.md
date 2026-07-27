# NextOne

[简体中文](README.md) | [English](README.en.md)

NextOne 是一个主动帮助用户做取舍的个人行动系统。

当前仓库已完成 V0.1 M9 Daily Loop：除 Web 端完整行动闭环和离线同步外，现已提供
Expo / React Native 原生客户端、SQLite 本地事务、快速记录、今天、收件箱、任务决策、
机会性自动同步和 SecureStore 安全凭据；Web 端新增晨间规划、今日容量提示和 Zen
单任务模式。产品和开发文档位于 `docs/`。

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

## 当前边界

- 当前已实现 Web 工程基线、本地任务内核、今天页、执行看板、项目焦点、每日收尾与基础回顾；
- M6 已接通浏览器 IndexedDB Outbox 与服务端，并提供 `/settings/sync` 同步状态与冲突处理页；
- M7 已提供 `/settings/general` 和 `/settings/data`，导入覆盖前会自动创建本地恢复点；
- 清除本地副本不会删除云端数据，账户删除申请也不会在浏览器中直接执行最终删除；
- M8 已提供不依赖 WebView 的 Android 原生界面、SQLite Outbox、前台/网络恢复同步和安全凭据；
- M9 已提供晨间规划、每日容量反馈和 Zen 单任务模式；
- 标准 OIDC 认证和 Oracle 部署将在后续 M10 实现；
- 不依赖 Supabase、Redis、消息队列或付费 SaaS。
