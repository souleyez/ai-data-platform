# 服务器部署说明

## 目标

线上部署时，`OpenClaw gateway` 和 `ai-data-platform` 应位于同一套系统内，不再使用 Windows 本地桥接。

推荐关系：

- `OpenClaw gateway` 监听内网地址，例如 `127.0.0.1:18789`
- `ai-data-platform API` 直接调用该地址
- `Web` 通过同源代理访问 API
- `Worker` 直接调用 API

## 建议拓扑

同机部署：

1. `openclaw-gateway.service`
2. `ai-data-platform-api.service`
3. `ai-data-platform-worker.service`
4. `ai-data-platform-web.service`

## 关键环境变量

API:

- `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789`
- `OPENCLAW_GATEWAY_TOKEN=<server-gateway-token>`
- `OPENCLAW_AGENT_ID=main`
- `PORT=3100`

Web:

- `NEXT_PUBLIC_API_BASE_URL=`
- `BACKEND_API_BASE_URL=http://127.0.0.1:3100`

Worker:

- `API_BASE_URL=http://127.0.0.1:3100`
- `WORKER_SCAN_PATH=/api/documents/scan`

## 部署步骤

1. 在服务器上启动并验证 `OpenClaw gateway`
2. 拷贝本仓库到目标目录，例如 `/srv/ai-data-platform`
3. 执行 `corepack pnpm install`
4. 执行 `corepack pnpm build`
5. 按 `deploy/server/ai-data-platform.env.example` 生成环境文件
6. 安装 `deploy/server/systemd/*.service`
7. `systemctl daemon-reload`
8. 启动并设置开机自启

## 验证项

- `curl http://127.0.0.1:18789/health`
- `curl http://127.0.0.1:3100/api/health`
- 打开前端首页并测试：
  - 一个本地模板问题，例如“幼猫的乳品建议”
  - 一个云端普通问题，例如“请给我一个偶像品牌命名建议”

## 本地桥接说明

`tools/openclaw-local-gateway.mjs` 仅用于开发机兼容：

- Windows 页面
- 本机 Node 服务
- WSL 内 OpenClaw gateway

线上如果 OpenClaw 和项目已经同机或同内网，这层可以不部署。
## 通用部署工具

当前仓库已提供两层通用部署工具：

- 服务端脚本：[update-server.sh](C:\Users\soulzyn\Desktop\codex\ai-data-platform\deploy\server\update-server.sh)
- 本机远程入口：[deploy-remote.ps1](C:\Users\soulzyn\Desktop\codex\ai-data-platform\tools\deploy-remote.ps1)

服务端脚本负责：

- `git fetch / pull --ff-only`
- `corepack pnpm install --frozen-lockfile`
- 按包构建 `api / web / worker`
- `systemctl restart`
- 健康检查

本机远程入口负责：

- 将服务端脚本临时下发到目标机器
- 传入目录、分支、服务名、健康检查地址等参数
- 执行一次标准部署流程

示例：

```powershell
corepack pnpm deploy:remote -- -Host 120.24.251.24 -User root -Password '<server-password>'
```

切到其他项目或机器时，主要替换这些参数：

- `-ProjectDir`
- `-Branch`
- `-HealthUrl`
- `-Services`
- `-BuildPackages`
