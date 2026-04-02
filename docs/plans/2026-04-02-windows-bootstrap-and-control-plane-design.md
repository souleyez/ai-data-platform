# Windows 引导安装客户端与总管理后台设计

## 目标

为 `ai-data-platform` 设计一套面向 Windows 10 / 11 的交付方案，满足下面几件事：

- 客户侧支持一键安装。
- 客户侧支持一键升级，且 `ai-data-platform` 与 `OpenClaw` 都能升级到最新版。
- 客户侧可以自动拉起完整本地运行环境，包括 OpenClaw、项目服务与依赖。
- 客户侧首次使用和每次启动都要求输入手机号，并向服务端验证。
- 服务端提供手机号管理、版本发布管理、模型 API 池管理。
- 客户端升级可后台执行，不阻塞正常使用。

这份设计先以“可落地 MVP”优先，不追求一次性做满企业级终态。

## 先定的几个原则

### 1. 不推荐客户端直接 `git pull` 作为正式升级机制

虽然版本源可以来自 GitHub，但正式客户端不应直接对工作目录执行 `git pull`。原因是：

- 客户机器未必具备稳定 Git 环境。
- 本地工作树容易脏。
- 失败回滚困难。
- 不能自然支持断点续传、版本校验和灰度。

推荐做法是：

- 发布源仍然来自 GitHub。
- 但客户端拉取的是“版本化发布产物”，例如 GitHub Release 附件或固定分支构建出的 zip 包。
- 每个版本都有 manifest、sha256、发布日期、兼容范围。
- 客户端只做下载、校验、解压、切换和回滚。

### 2. 不推荐把模型池原始 API Key 下发给客户端

如果服务端维护的是 Kimi / MiniMax 的 API 池，最稳的做法不是把原始 key 下发给客户机，而是：

- 客户端用手机号换一个短期租约 token。
- 本地项目或 OpenClaw 通过你的服务端模型代理访问真实模型。
- 服务端代理再从模型池里挑选可用 key。

这样可以避免：

- 客户端泄露模型 key。
- key 被客户绕过项目直接滥用。
- key 轮换时需要每台机器重新下发配置。

如果为了赶工要先做 MVP，也允许先做“短期临时 key 下发”，但这应被定义为过渡方案，不应作为长期架构。

### 3. 手机号校验是“许可门禁”，不是“强身份认证”

如果只靠手机号文本录入，不做短信验证码，那么任何知道手机号的人都可以冒用。

所以当前需求应被定义为：

- 这是一个许可校验 / 客户匹配机制。
- 不是安全认证机制。

MVP 可以接受；正式商用建议二期补短信 OTP 或企业邀请码。

## 推荐总体架构

推荐拆成 3 个系统，不要混成一个大脚本：

1. Windows 引导安装客户端
2. 本地运行时管理器
3. 云端总管理后台

### A. Windows 引导安装客户端

职责：

- 检查系统环境是否满足 Windows 10 / 11。
- 检查并安装依赖：
  - Git
  - Node.js 22
  - Corepack / pnpm
  - WSL2
  - 指定 Ubuntu 发行版
- 安装或升级 OpenClaw。
- 安装或升级 `ai-data-platform`。
- 拉起本地运行时管理器。
- 引导用户录入手机号并连接云端验证。

形态建议：

- 客户端用 `Tauri` 做一个轻量 Windows 桌面壳。
- 实际安装和运维动作仍由 PowerShell + WSL 脚本完成。

这样做的原因：

- 现有项目已经有 PowerShell 安装和启动脚本，可直接复用。
- UI 层只负责引导、状态展示和升级进度。
- 后端安装逻辑不必重写成纯原生程序。

### B. 本地运行时管理器

职责：

- 管理本地安装目录。
- 维护当前版本、待升级版本和回滚版本。
- 管理 OpenClaw gateway、本地 API、worker、web 的启动与健康检查。
- 在后台下载升级包。
- 下载完成后择机切换版本。

推荐不要一开始就做 Windows Service，MVP 先做：

- 一个随登录启动的本地管理进程。
- 通过计划任务或启动项开机自启。

本地管理器需要提供本机 loopback API，例如：

- `GET /local-runtime/status`
- `POST /local-runtime/start`
- `POST /local-runtime/stop`
- `POST /local-runtime/check-update`
- `POST /local-runtime/apply-update`

### C. 云端总管理后台

职责：

- 维护手机号白名单 / 客户用户表。
- 返回客户端当前应使用的版本策略。
- 提供 release manifest。
- 提供模型租约 token 或模型代理能力。
- 提供后台管理界面。

推荐与客户本地项目分离，单独部署为 control plane。

## 推荐目录与运行形态

### 客户机安装目录

建议使用：

- `%LocalAppData%\\AIDataPlatform\\`

目录结构建议：

```text
AIDataPlatform/
  current/
  releases/
    2026.04.02+001/
    2026.04.10+003/
  downloads/
  logs/
  runtime/
    launcher/
    manager/
  config/
    client.json
    phone-session.json
```

说明：

- `current/` 指向当前启用版本。
- `releases/` 保存已下载版本，便于回滚。
- `downloads/` 存放未完成下载，便于断点续传。
- `config/phone-session.json` 只保存短期会话，不存长期密钥。

### OpenClaw 安装位置

保持现有方案：

- OpenClaw 安装在 WSL Ubuntu 内。
- Windows 侧只负责检查、安装、重启和配置。

不要把 OpenClaw 改成 Windows 原生安装，先保持你当前已经跑通的 WSL 模式。

## 核心业务流

### 1. 首次安装流

1. 用户下载 Windows 安装客户端。
2. 客户端检查系统版本、WSL、Node、Git 等前置条件。
3. 如缺失则自动安装或引导安装。
4. 客户端安装 OpenClaw。
5. 客户端下载并展开 `ai-data-platform` 当前稳定版。
6. 客户端启动本地运行时管理器。
7. 弹出手机号输入框。
8. 客户端调用云端控制台接口校验手机号。
9. 如果手机号存在：
   - 返回可用状态
   - 返回版本策略
   - 返回模型接入策略
10. 如果手机号不存在：
   - 允许自动录入成新用户
   - 立即进入“强制升级检查”
   - 升级完成后允许进入系统

### 2. 每次启动流

1. 启动器先拉起本地运行时管理器。
2. 要求用户输入手机号。
3. 客户端调用云端：
   - 校验手机号是否允许使用
   - 查询最低版本要求
   - 查询是否有可后台升级的新版本
4. 如果低于最低版本：
   - 强制升级
   - 升级成功后再进入
5. 如果高于最低版本但有新版本：
   - 后台下载
   - 保持当前版本继续可用
   - 下载完成后提示重启切换或在空闲时切换

### 3. 升级流

1. 客户端拉取 release manifest。
2. 比较当前版本、最低要求版本、最新稳定版本。
3. 使用支持断点续传的下载器拉取 zip 包。
4. 校验 sha256。
5. 解压到 `releases/<version>/`。
6. 执行版本级安装脚本：
   - `pnpm install --prod` 或直接用已构建产物
   - 必要时更新本地 env 模板
   - 必要时更新 Windows 启动项或 WSL 服务
7. 健康检查通过后切换 `current/`。
8. 失败则回滚到上一版本。

## 服务端模块设计

### 1. 客户用户管理

最小表结构建议：

#### `customer_users`

- `id`
- `phone`
- `status`
- `source`
- `created_at`
- `updated_at`

说明：

- `status`: `active` / `disabled` / `pending`
- `source`: `admin_created` / `self_registered`

#### `client_devices`

- `id`
- `user_id`
- `device_fingerprint`
- `current_version`
- `last_seen_at`
- `last_ip`
- `os_version`
- `client_status`

说明：

- 即使暂时不做强设备绑定，也应该记录设备维度，后面好做审计。

### 2. 版本发布管理

#### `release_manifests`

- `id`
- `channel`
- `version`
- `min_supported_version`
- `artifact_url`
- `artifact_sha256`
- `artifact_size`
- `openclaw_version`
- `install_script_version`
- `status`
- `published_at`

说明：

- `channel`: `stable` / `beta` / `internal`
- `status`: `draft` / `published` / `disabled`

### 3. 模型池管理

#### `model_provider_keys`

- `id`
- `provider`
- `region`
- `api_key_encrypted`
- `status`
- `weight`
- `daily_quota`
- `used_quota`
- `last_error_at`
- `last_error_message`
- `created_at`
- `updated_at`

支持范围建议先收敛到：

- `moonshot`
- `minimax`

#### `model_leases`

- `id`
- `user_id`
- `phone`
- `provider_scope`
- `lease_token`
- `expires_at`
- `status`

如果走推荐方案，客户端拿到的是 `lease_token`，不是原始 API key。

## 接口边界建议

### 客户端对云端

#### `POST /client/auth/phone`

输入：

- `phone`
- `deviceFingerprint`
- `clientVersion`
- `osVersion`

输出：

- `userStatus`
- `requiresForceUpgrade`
- `minSupportedVersion`
- `latestVersion`
- `sessionToken`
- `modelAccessMode`

#### `GET /client/releases/latest`

输入：

- `channel`
- `currentVersion`

输出：

- 最新 release manifest

#### `POST /client/model-lease`

输入：

- `sessionToken`
- `providerScope`

输出：

- `leaseToken`
- `proxyBaseUrl`
- `expiresAt`

### 管理后台

#### 客户用户

- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id`

#### 发布管理

- `GET /admin/releases`
- `POST /admin/releases`
- `POST /admin/releases/:id/publish`

#### 模型池管理

- `GET /admin/model-keys`
- `POST /admin/model-keys`
- `PATCH /admin/model-keys/:id`

## 客户端本地鉴权与门禁设计

当前项目已有本地 `access-key` 和 `intelligence-mode` 机制。这个方案建议做下面的收口：

- 不再把本地 `access-key` 作为客户交互主入口。
- 手机号校验成为新主门禁。
- 本地 `access-key` 保留为内部维护或调试入口，不再面向客户。

推荐新增本地状态文件：

#### `client-license-session.json`

- `phone`
- `sessionToken`
- `validatedAt`
- `expiresAt`
- `lastUpgradeCheckAt`

注意：

- 因为你要求“每次新开都再次输入号码”，所以 `sessionToken` 不应设计成长期免登录。
- 最多只作为本次进程或短时会话使用。

## 升级策略建议

### MVP

- 每次启动都检查云端版本。
- 如果低于最小支持版本，阻塞使用并强制升级。
- 如果只是有新版本，后台下载，不打断当前使用。
- 升级包下载完成后，下次启动切换。

### 正式版

- 支持热切换前置检查。
- 支持延迟切换窗口。
- 支持多次失败回滚。
- 支持灰度发布到指定手机号或客户组。

## 实施顺序建议

### Phase 1: 控制平面 MVP

目标：

- 先把云端“手机号验证 + 版本发布”做出来。

范围：

- 用户手机号表
- 发布 manifest 表
- `POST /client/auth/phone`
- `GET /client/releases/latest`
- 简单管理后台页面

结果：

- 先能决定谁能用、谁该升级

### Phase 2: Windows 安装客户端 MVP

目标：

- 先跑通“从零安装到可启动”

范围：

- 检查 Windows 10 / 11
- 安装 WSL / Ubuntu
- 安装 OpenClaw
- 下载并展开项目
- 启动本地 API / web / worker / gateway
- 手机号录入与验证

结果：

- 客户首次拿到安装包即可落地

### Phase 3: 本地后台升级器

目标：

- 升级可后台下载和回滚

范围：

- 版本目录
- 下载任务
- sha 校验
- 版本切换
- 回滚策略

结果：

- 不再需要人工远程升级

### Phase 4: 模型池与代理

目标：

- 不把原始 Kimi / MiniMax key 发给客户端

范围：

- 模型池录入
- key 轮询与健康状态
- 客户端 lease token
- 模型代理

结果：

- 客户端只拿租约，不拿主 key

### Phase 5: 完整总管理后台

目标：

- 把客户、设备、版本、模型池统一管理

范围：

- 用户管理
- 设备管理
- 发布中心
- 模型池中心
- 运行日志与审计

## 现有项目可直接复用的资产

你当前仓库里已经有这些可复用能力：

- `tools/install-openclaw-latest.ps1`
- `tools/start-local.ps1`
- `tools/status-local.ps1`
- `tools/stop-local.ps1`
- `apps/api/src/routes/model-config.ts`
- `apps/api/src/lib/model-config.ts`
- `apps/api/src/routes/access-keys.ts`
- `apps/api/src/lib/access-keys.ts`
- `apps/api/src/lib/intelligence-mode.ts`

这些说明：

- OpenClaw 安装与配置已经不是空白。
- 本地服务启动与状态检查已经有基础脚本。
- 本地门禁已经有一版 access-key 原型。

所以最合理的路径不是重写全部，而是：

- 把现有脚本升级为“被安装客户端调用”
- 把现有 access-key 演进成“手机号许可会话”

## 主要风险

### 1. WSL 安装权限与系统差异

不同客户机的 WSL、Hyper-V、商店策略和安全策略差异很大。

建议：

- 安装器明确区分“需要管理员权限”和“可用户态完成”的步骤。
- 安装器必须有详细日志与重试点。

### 2. 手机号无验证码的冒用风险

这不是强认证，只是许可校验。

建议：

- MVP 接受。
- 二期补短信验证码。

### 3. GitHub 作为发布源的稳定性

如果直接依赖 GitHub 下载源码或大附件，在国内网络下不稳定。

建议：

- MVP 可先用 GitHub Releases。
- 正式版建议加国内镜像或对象存储分发。

### 4. 直接向客户端下发模型 key 的泄露风险

建议：

- 尽量走服务端代理。
- 即使短期下发，也只下发短期租约，不下发主 key。

## MVP 验收口径

MVP 完成后，至少要满足：

1. 一台全新 Windows 10 / 11 机器可以完成安装。
2. OpenClaw 与项目服务都能被自动拉起。
3. 用户每次启动都需要输入手机号。
4. 后台已录入手机号可直接使用。
5. 未录入手机号可自动注册并进入强制升级检查。
6. 发布新版本后，客户端能发现、下载、校验并切换。
7. Kimi / MiniMax 模型池可以在后台录入并提供给客户端使用。

## 建议下一步

下一步不要直接开做完整安装器，而是先落两份更细的执行稿：

1. `控制平面 MVP 接口与表结构`
2. `Windows 客户端安装与升级状态机`

我建议先做第 1 份，因为没有控制平面，客户端安装器做出来也没有正式的验证、升级和模型分发依据。
