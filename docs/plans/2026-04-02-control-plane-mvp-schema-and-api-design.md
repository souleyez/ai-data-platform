# 控制平面 MVP 表结构与接口设计

## 目标

这份设计只解决一件事：

为未来的 Windows 安装客户端提供一个可用的云端控制平面 MVP，让客户端能够完成：

- 手机号校验
- 首次自助录入
- 强制升级判定
- 最新版本发现
- 模型接入策略获取

这份设计不覆盖安装器 UI，也不覆盖完整后台页面实现细节。

## 设计结论

### 推荐方案

推荐做法是：

- 在同一仓库内新增一套独立部署的 control plane 服务
- API 继续沿用 `Fastify`
- 管理端 Web 继续沿用 `Next.js`
- 数据库直接用 `Postgres`

不推荐把控制平面继续做在当前客户本地 API 的 JSON 文件状态层上。原因是：

- 这是多客户共享服务，不再是单机状态。
- 需要审计、禁用、发布、设备追踪。
- 后面模型池也必须有更正式的状态管理。

### 备选方案

#### A. 直接扩展现有 `apps/api` 与 `apps/web`

优点：

- 开发最快
- 可复用现有技术栈

缺点：

- 客户端本地 API 和云端控制平面边界会混
- 部署角色不清晰

#### B. 同仓库新增 `apps/control-plane-api` 与 `apps/control-plane-web`

优点：

- 逻辑边界清晰
- 仍可共享工具链和脚本
- 最适合后续产品化

缺点：

- 初期目录会多一层

#### C. 单独再开一个新仓库

优点：

- 隔离最彻底

缺点：

- 当前阶段过重
- 协作和发布成本更高

MVP 推荐选 B。

## MVP 范围

MVP 只做 5 类能力：

1. 手机号用户管理
2. 客户端设备登记
3. 版本发布与升级策略
4. 客户端会话签发
5. 模型接入策略下发

MVP 先不做：

- 短信验证码
- 完整 RBAC
- 多租户组织模型
- 完整模型代理网关
- 复杂灰度规则

## 逻辑边界

### 客户端负责

- 收集手机号
- 收集设备指纹
- 上报当前客户端版本
- 拉取升级信息
- 拉取模型接入策略

### 控制平面负责

- 判断手机号是否允许使用
- 不存在时自动录入
- 告知是否必须升级
- 告知最新稳定版本
- 返回模型接入方式

## 建议应用结构

```text
apps/
  api/                     # 客户本地 API
  web/                     # 客户本地 Web
  worker/                  # 客户本地 worker
  control-plane-api/       # 云端控制平面 API
  control-plane-web/       # 云端管理后台
packages/
  control-plane-contracts/ # 共享接口类型与状态码
```

## 数据库选择

MVP 直接使用 `Postgres`。

原因：

- 需要多用户并发
- 需要唯一索引，例如手机号唯一
- 需要状态筛选和审计查询
- 未来模型池和发布记录会扩展

## 核心数据模型

### 1. `users`

用途：

- 手机号主表

字段建议：

- `id` `uuid`
- `phone` `varchar(32)` unique
- `status` `varchar(16)` not null
- `source` `varchar(16)` not null
- `note` `text` default ''
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

枚举建议：

- `status`: `active` / `disabled`
- `source`: `admin_created` / `self_registered`

说明：

- 手机号必须唯一
- `self_registered` 对应你要求的“不存在则允许录入”

### 2. `devices`

用途：

- 记录具体客户机

字段建议：

- `id` `uuid`
- `user_id` `uuid` references `users(id)`
- `device_fingerprint` `varchar(128)` not null
- `device_name` `varchar(128)` default ''
- `os_family` `varchar(32)` default 'windows'
- `os_version` `varchar(64)` default ''
- `client_version` `varchar(64)` default ''
- `openclaw_version` `varchar(64)` default ''
- `last_ip` `varchar(64)` default ''
- `last_seen_at` `timestamptz`
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

索引建议：

- unique(`user_id`, `device_fingerprint`)
- index(`last_seen_at`)

### 3. `release_channels`

用途：

- 定义发布通道

字段建议：

- `id` `uuid`
- `name` `varchar(32)` unique
- `description` `text`
- `created_at` `timestamptz`

默认值：

- `stable`
- `beta`
- `internal`

### 4. `releases`

用途：

- 记录每个发布版本

字段建议：

- `id` `uuid`
- `channel` `varchar(32)` not null
- `version` `varchar(64)` not null
- `status` `varchar(16)` not null
- `artifact_url` `text` not null
- `artifact_sha256` `varchar(128)` not null
- `artifact_size` `bigint` not null
- `openclaw_version` `varchar(64)` default ''
- `installer_version` `varchar(64)` default ''
- `min_supported_version` `varchar(64)` default ''
- `release_notes` `text` default ''
- `published_at` `timestamptz`
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

约束建议：

- unique(`channel`, `version`)

枚举建议：

- `status`: `draft` / `published` / `disabled`

### 5. `client_policies`

用途：

- 给不同手机号或不同通道做策略覆盖

字段建议：

- `id` `uuid`
- `scope_type` `varchar(16)` not null
- `scope_value` `varchar(128)` not null
- `channel` `varchar(32)` default 'stable'
- `min_supported_version` `varchar(64)` default ''
- `target_version` `varchar(64)` default ''
- `force_upgrade` `boolean` default false
- `allow_self_register` `boolean` default true
- `model_access_mode` `varchar(32)` default 'lease'
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

枚举建议：

- `scope_type`: `global` / `phone`
- `model_access_mode`: `lease` / `direct-config`

说明：

- MVP 不做复杂规则引擎，用“全局策略 + 手机号覆盖”就够

### 6. `model_provider_keys`

用途：

- 存储模型池 key

字段建议：

- `id` `uuid`
- `provider` `varchar(32)` not null
- `region` `varchar(16)` default ''
- `label` `varchar(64)` default ''
- `api_key_ciphertext` `text` not null
- `status` `varchar(16)` not null
- `weight` `integer` default 100
- `daily_quota` `integer` default 0
- `used_quota` `integer` default 0
- `last_error_at` `timestamptz`
- `last_error_message` `text` default ''
- `created_at` `timestamptz`
- `updated_at` `timestamptz`

枚举建议：

- `provider`: `moonshot` / `minimax`
- `status`: `active` / `disabled` / `cooldown`

说明：

- `api_key_ciphertext` 必须加密存储

### 7. `client_sessions`

用途：

- 给客户端启动后这次使用签发短期会话

字段建议：

- `id` `uuid`
- `user_id` `uuid`
- `device_id` `uuid`
- `session_token_hash` `varchar(128)`
- `expires_at` `timestamptz`
- `created_at` `timestamptz`
- `revoked_at` `timestamptz`

说明：

- 不保存明文 token，只保存 hash
- 因为你要求每次启动重新输手机号，所以有效期可以很短，比如 8 小时

### 8. `model_leases`

用途：

- 给本地项目换模型访问租约

字段建议：

- `id` `uuid`
- `user_id` `uuid`
- `device_id` `uuid`
- `provider_scope` `varchar(32)`
- `lease_token_hash` `varchar(128)`
- `expires_at` `timestamptz`
- `created_at` `timestamptz`
- `revoked_at` `timestamptz`

## 状态机

### 手机号验证状态机

- `unknown`
- `active`
- `disabled`

处理规则：

- `active`: 正常使用
- `disabled`: 禁止使用
- `unknown`: 如果全局策略允许自助注册，则自动建用户并进入强制升级检查

### 客户端版本状态机

- `ok`
- `upgrade_available`
- `force_upgrade_required`

判定规则：

- 当前版本 `< min_supported_version` => `force_upgrade_required`
- 当前版本 `< latest published version` => `upgrade_available`
- 否则 `ok`

## 客户端 API 设计

### 1. `POST /client/bootstrap/auth`

用途：

- 每次启动输入手机号后调用

请求体：

```json
{
  "phone": "13800138000",
  "deviceFingerprint": "win-abc123",
  "deviceName": "DESKTOP-123456",
  "osVersion": "Windows 11 24H2",
  "clientVersion": "2026.04.02+001",
  "openclawVersion": "2026.3.31"
}
```

响应体：

```json
{
  "status": "ok",
  "user": {
    "id": "u_xxx",
    "phone": "13800138000",
    "source": "admin_created",
    "status": "active"
  },
  "device": {
    "id": "d_xxx"
  },
  "session": {
    "token": "sess_xxx",
    "expiresAt": "2026-04-02T12:00:00.000Z"
  },
  "upgrade": {
    "state": "force_upgrade_required",
    "channel": "stable",
    "currentVersion": "2026.04.02+001",
    "minSupportedVersion": "2026.04.10+003",
    "latestVersion": "2026.04.10+003"
  },
  "modelAccess": {
    "mode": "lease",
    "providers": ["moonshot", "minimax"]
  }
}
```

处理规则：

- 手机号存在：正常返回
- 手机号不存在：
  - 自动创建 `self_registered`
  - 响应中强制 `upgrade.state = force_upgrade_required`

### 2. `GET /client/releases/latest`

请求头：

- `Authorization: Bearer <sessionToken>`

查询参数：

- `channel=stable`

响应体：

```json
{
  "status": "ok",
  "release": {
    "version": "2026.04.10+003",
    "artifactUrl": "https://...",
    "artifactSha256": "abc",
    "artifactSize": 123456789,
    "openclawVersion": "2026.4.10",
    "installerVersion": "2026.4.10",
    "releaseNotes": "..."
  }
}
```

### 3. `POST /client/model-lease`

请求头：

- `Authorization: Bearer <sessionToken>`

请求体：

```json
{
  "providerScope": "default"
}
```

响应体：

```json
{
  "status": "ok",
  "lease": {
    "token": "lease_xxx",
    "expiresAt": "2026-04-02T13:00:00.000Z"
  },
  "proxy": {
    "baseUrl": "https://control.example.com/model-proxy"
  }
}
```

说明：

- 这是推荐方案
- MVP 如果暂时不做模型代理，这个接口也可以先返回“直配策略”，但字段要保留

### 4. `GET /client/policy`

用途：

- 允许客户端单独刷新策略

响应体：

- 当前通道
- 最低支持版本
- 是否允许自助注册
- 是否强制升级

## 管理后台 API 设计

### 用户管理

- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id`

最小能力：

- 新增手机号
- 禁用手机号
- 查看手机号来源与最近设备

### 发布管理

- `GET /admin/releases`
- `POST /admin/releases`
- `POST /admin/releases/:id/publish`
- `PATCH /admin/releases/:id`

最小能力：

- 创建草稿版
- 发布 stable 版
- 设置最小支持版本

### 模型池管理

- `GET /admin/model-provider-keys`
- `POST /admin/model-provider-keys`
- `PATCH /admin/model-provider-keys/:id`

最小能力：

- 新增 Kimi / MiniMax key
- 启用 / 禁用
- 查看是否报错

### 策略管理

- `GET /admin/client-policies`
- `POST /admin/client-policies`
- `PATCH /admin/client-policies/:id`

最小能力：

- 设置全局最小版本
- 指定手机号强制升级

## 版本比较规则

客户端和服务端要统一版本格式。

推荐格式：

- `YYYY.MM.DD+NNN`

例如：

- `2026.04.02+001`
- `2026.04.10+003`

比较规则：

- 先按日期部分比较
- 再按 build 序号比较

不要在 MVP 里引入 semver + prerelease 的复杂逻辑。

## 安全边界

### 1. 手机号不是强认证

MVP 可接受，但应在文档中明确：

- 这只是客户许可验证
- 不是高强度身份认证

### 2. 会话 token 只做短期

建议：

- `sessionToken` 8 小时
- `leaseToken` 1 小时

### 3. 模型 key 永不明文下发

如果后面走代理模式：

- 客户端只拿 lease
- 服务端代理拿真实 key

### 4. 发布产物必须校验

服务端必须下发：

- `artifactSha256`
- `artifactSize`

客户端必须校验后再切换版本。

## 推荐实施顺序

### 第一步

先落数据库和 4 张核心表：

- `users`
- `devices`
- `releases`
- `client_sessions`

### 第二步

先实现 2 个客户端接口：

- `POST /client/bootstrap/auth`
- `GET /client/releases/latest`

这两项完成后，安装器就已经有最小控制依据。

### 第三步

补管理后台最小页面：

- 手机号录入页
- 发布清单页

### 第四步

再补模型池：

- `model_provider_keys`
- `model_leases`

## 对现有项目的影响

现有本地项目里已经有：

- `access-keys`
- `intelligence-mode`
- `model-config`

这些都不应该直接扩成云端控制平面，而应该这样处理：

- 本地 `access-keys` 逐步退居内部调试用途
- 新手机号门禁走云端控制平面
- 本地 `model-config` 继续负责本机 OpenClaw 配置
- 云端控制平面只决定“是否允许使用、是否必须升级、模型如何接入”

## 本阶段产出

这一阶段结束后，应该能开始编码：

1. `apps/control-plane-api`
2. `apps/control-plane-web`
3. `packages/control-plane-contracts`

## 下一步建议

下一步最值得继续的是：

1. 把 `apps/control-plane-api` 的目录和基础 Fastify 服务先搭起来
2. 同时补一版 SQL schema 和 migration 方案
3. 先实现 `POST /client/bootstrap/auth`

这三步完成后，Windows 安装器就有真实后端可对接了。
