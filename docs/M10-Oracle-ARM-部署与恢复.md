# NextOne M10 Oracle ARM 部署与恢复

本文用于把 NextOne 部署到 Oracle ARM 服务器。生产拓扑只包含 Caddy、Spring Boot 和
PostgreSQL，不依赖 Supabase、Redis、消息队列或付费 SaaS。

## 1. 上线前准备

- 推荐使用 4C24G ARM 实例；1C1G 可以做跳板机或监控节点，不建议承载完整生产栈；
- Ubuntu 24.04 ARM64，安装 Docker Engine 和 Compose v2；
- 一个解析到服务器公网 IP 的域名；
- 安全列表和系统防火墙仅放行 TCP 22、80、443 和 UDP 443；
- 不开放 5432 和 8080。

在仓库根目录复制环境变量模板：

```bash
cp deploy/compose/.env.production.example deploy/compose/.env.production
chmod 600 deploy/compose/.env.production
```

编辑以下必填值：

- `NEXTONE_DOMAIN`：实际域名，不带协议；
- `NEXTONE_ACCESS_TOKEN`：至少 32 个随机字符，用于 Web 和移动端登录；
- `POSTGRES_PASSWORD`：与访问令牌不同的随机长密码。

可以在服务器执行 `openssl rand -hex 32` 分别生成两个秘密。不要把
`.env.production` 提交到 Git。

## 2. 配置检查与启动

```bash
docker compose \
  --env-file deploy/compose/.env.production \
  -f deploy/compose/compose.prod.yml \
  config --quiet

docker compose \
  --env-file deploy/compose/.env.production \
  -f deploy/compose/compose.prod.yml \
  up -d --build
```

Caddy 自动申请和续期 HTTPS 证书。Web 与 API 使用同一域名，浏览器不需要额外填写
API 地址；首次使用时在“设置 → 同步”填写访问令牌。数据库和 API 只在 Docker 内部网络
可见。

检查状态：

```bash
docker compose \
  --env-file deploy/compose/.env.production \
  -f deploy/compose/compose.prod.yml \
  ps

curl --fail https://你的域名/actuator/health
```

容器日志写到标准输出，其中 Spring Boot 使用 JSON 结构化日志。日志轮转由 Docker
daemon 统一配置，建议使用 `local` 日志驱动并设置容量上限。

## 3. 备份

手动备份：

```bash
docker compose \
  --env-file deploy/compose/.env.production \
  -f deploy/compose/compose.prod.yml \
  --profile maintenance run --rm backup
```

备份以 PostgreSQL custom format 写入仓库根目录的 `backups/`，默认保留 14 天。建议
通过 root 的 cron 每天凌晨执行，并把备份再复制到另一台 Oracle 免费实例；单机本地备份
不能防止系统盘损坏。

示例 cron（按实际仓库绝对路径修改）：

```cron
17 3 * * * cd /opt/nextone && docker compose --env-file deploy/compose/.env.production -f deploy/compose/compose.prod.yml --profile maintenance run --rm backup >> /var/log/nextone-backup.log 2>&1
```

## 4. 恢复演练

恢复会覆盖当前数据库，只能在明确选定备份后执行。先停止 Web 和 API，保留数据库：

```bash
docker compose \
  --env-file deploy/compose/.env.production \
  -f deploy/compose/compose.prod.yml \
  stop web server

RESTORE_FILE=/backups/nextone-YYYYMMDDTHHMMSSZ.dump \
docker compose \
  --env-file deploy/compose/.env.production \
  -f deploy/compose/compose.prod.yml \
  --profile maintenance run --rm restore

docker compose \
  --env-file deploy/compose/.env.production \
  -f deploy/compose/compose.prod.yml \
  up -d server web
```

恢复后检查健康接口、项目数量、任务状态和最近一条操作记录。正式上线前必须至少在测试卷
完成一次“备份 → 清空测试库 → 恢复 → 核对数据”的演练。

## 5. 最小监控

`deploy/scripts/check-health.sh` 同时检查 HTTPS 健康接口和磁盘剩余空间，可由 cron 每
5 分钟运行。脚本失败会输出 `ALERT` 并返回非零状态，可接入系统邮件或以后再接免费的
通知通道。

```cron
*/5 * * * * NEXTONE_HEALTH_URL=https://你的域名/actuator/health NEXTONE_DATA_PATH=/var/lib/docker sh /opt/nextone/deploy/scripts/check-health.sh >> /var/log/nextone-health.log 2>&1
```

## 6. 更新与回滚

更新前先备份，再拉取代码和重建镜像。Flyway 会在 API 启动时执行向前兼容的数据库迁移。

```bash
git pull --ff-only
docker compose --env-file deploy/compose/.env.production -f deploy/compose/compose.prod.yml up -d --build
```

应用回滚使用上一个 Git 提交重新构建；如果更新包含数据库迁移，不执行 Flyway 降级，
而是停止服务并恢复更新前备份。Caddy 和 PostgreSQL 数据分别保存在命名卷中，重建容器
不会删除数据；不要执行带 `--volumes` 的 `docker compose down`。

## 7. 当前未完成项

- 需要实际 Oracle ARM 主机和域名才能完成公网 HTTPS、ARM 镜像及防火墙验收；
- Android 真机目前因电脑处于远程网络环境而暂缓；服务上线后可直接使用公网 HTTPS API
  完成跨网络验收；
- 当前是单用户长令牌认证。标准 OIDC 属于后续账户体系增强，不阻塞个人版 V0.1 上线。
