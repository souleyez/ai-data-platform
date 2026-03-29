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

## UTF-8 Safe Smoke

为了避免 PowerShell、SSH inline script 或终端字体把正常的 UTF-8 中文显示成“看起来像乱码”的文本，线上中文问法的回归不要只靠终端肉眼判断。优先使用仓库内的 UTF-8 safe smoke：

```powershell
corepack pnpm smoke:remote:utf8 -- --host 120.24.251.24
```

这条脚本会：

- 先检查 `/api/health` 和 `/api/model-config`
- 再用 UTF-8 JSON 请求实际回归 `/api/chat`
- 覆盖普通问答、按库报表输出、技能维度表格、最近上传文档细节、否决按库意向、数据源中文规划
- 将响应按 Unicode escape 形式写入 `tmp/smoke-remote/`

这样判断命中链路时，依据的是接口字段和落盘结果，而不是终端里显示出来的中文是否正常。

### 什么时候说明终端乱码不算文件坏

如果满足下面两点，优先判断为“终端显示问题”，不是“源码文件已损坏”：

1. `corepack pnpm check:text-integrity` 通过
2. Python 读取文件并输出 `unicode_escape` 时内容正常

不要把 PowerShell 控制台里直接显示的中文再复制回源码，这会把显示层问题重新写成真实脏数据。

### BOM 也属于编码风险

`check:text-integrity` 现在也会检查 UTF-8 BOM。核心源码文件不应该带 BOM；如果守卫报 `UTF8_BOM`，应先清除 BOM 再继续部署或回归。

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

If the SSH password contains shell-sensitive characters, prefer setting `$env:AI_DATA_PLATFORM_REMOTE_PASSWORD` and omit `-Password`:
```powershell
$env:AI_DATA_PLATFORM_REMOTE_PASSWORD = '<server-password>'
corepack pnpm deploy:remote -- -Host 120.24.251.24 -User root
```

切到其他项目或机器时，主要替换这些参数：

- `-ProjectDir`
- `-Branch`
- `-HealthUrl`
- `-Services`
- `-BuildPackages`

### Remote Preflight

`deploy:remote` now runs a remote git-worktree preflight before `fetch / pull`.

- Default mode is fail-fast: any tracked or untracked repo change blocks deployment.
- Protected runtime paths are ignored by default: `storage/files/uploads` and `deploy/server/*.env` will be reported but will not block deploy.
- Use `corepack pnpm deploy:remote:preflight -- -Host 120.24.251.24 -User root -Password '<server-password>'` to inspect remote status without deploying.
- If the SSH password contains shell-sensitive characters, set `$env:AI_DATA_PLATFORM_REMOTE_PASSWORD` first and omit `-Password`; `deploy-remote.ps1` reads that variable automatically.
- Use `-RemoteWorktreeMode stash-safe` only when you explicitly want the deploy script to stash safe repo paths before pull.
- `stash-safe` excludes `storage/files/uploads` and `deploy/server/*.env`, so runtime uploads and server env files stay untouched.
- If remote code changes remain after `stash-safe`, the script still fails and prints the remaining paths for manual cleanup.
