# Subscan Essentials 部署 FAQ

本文整理了本次部署过程中高频出现的问题与处理方式，适用于：

- 后端：`subscan-essentials`（Docker Compose，MySQL 模式）
- 前端：`subscan-essentials-ui-react`（Next.js standalone 运行）

## A) 前端部署与管理（速查）

本节是前端上线/运维的集中说明；更细分的报错说明见后文第 4、6、7、8、9 条。

### A.1 环境变量配置（最关键）

- 前后端分机器部署时，`NEXT_PUBLIC_API_HOST` 必须配置为后端可达地址，不能写 `127.0.0.1`：

```env
NEXT_PUBLIC_API_HOST=http://<后端IP>:4399
```

- 配置后需要重新构建前端才能生效。

### A.2 构建与启动（standalone）

```bash
npm install
npm i sharp
npm run build
PORT=3000 node .next/standalone/server.js
```

说明：项目配置了 `output: 'standalone'`，不要用 `next start`。

### A.3 standalone 静态资源同步（避免图片报错）

构建后建议执行：

```bash
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
```

否则可能出现：

```text
The requested resource isn't a valid image for /images/logo.png received null
```

### A.4 常用运维命令

```bash
# 启动
PORT=3000 node .next/standalone/server.js

# 端口占用排查
ss -lntp | rg ":3000"

# API 连通性检查
curl -s -X POST "http://<后端IP>:4399/api/scan/metadata" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### A.5 快速验收

- 浏览器访问前端地址后，Network 中 `metadata`、`token` 等接口应指向 `<后端IP>:4399`；
- 接口返回应为 `code: 0`；
- 首页区块/交易数据应持续更新。

## 1) `docker compose` 提示 `version is obsolete`

### 现象

```text
WARN ... docker-compose.yml: the attribute `version` is obsolete
```

### 原因

Docker Compose v2 已不再需要 `version` 字段。

### 影响

仅警告，不阻塞服务启动。

### 处理

可忽略；如需消除警告，删除 `docker-compose.yml` 顶部 `version` 字段。

## 2) `pull access denied for subscan/api`

### 现象

```text
Image subscan/api Error pull access denied for subscan/api
```

### 原因

- `subscan-api` 本地镜像尚未 build 成功；
- `subscan-observer` / `subscan-worker` 复用 `image: subscan/api` 时会尝试拉取远端同名镜像。

### 处理

先确保本地 build 成功，再启动 compose。一般不需要 `docker login`。

## 3) 后端镜像构建失败：`go.mod requires go >= 1.25.0`

### 现象

```text
go.mod requires go >= 1.25.0 (running go 1.24.0; GOTOOLCHAIN=local)
```

### 原因

`Dockerfile` 构建镜像使用的 Go 版本低于 `go.mod` 要求。

### 处理

将构建阶段基础镜像升级到 Go 1.25+（例如 `golang:1.25`），再重新构建。

## 4) 前端可打开，但请求打到 `127.0.0.1:4399` 并 `ERR_CONNECTION_REFUSED`

### 现象

浏览器 Network 中请求地址类似：

```text
http://127.0.0.1:4399/api/scan/metadata
```

### 原因

`NEXT_PUBLIC_API_HOST` 配成了 `127.0.0.1`。对于“前后端分机器部署”，浏览器中的 `127.0.0.1` 指向访问者本机，而不是后端服务器。

### 处理

将前端环境变量改为后端可达地址，例如：

```env
NEXT_PUBLIC_API_HOST=http://37.59.100.71:4399
```

修改后需重新 `build` 并重启前端服务。

## 5) `curl -I /api/scan/metadata` 返回 404

### 现象

```bash
curl -I http://<host>:4399/api/scan/metadata
```

返回 `404 Not Found`。

### 原因

`-I` 使用的是 `HEAD` 请求，而该接口通常按 `POST` 使用。

### 正确检查方式

```bash
curl -s -X POST "http://<host>:4399/api/scan/metadata" \
  -H "Content-Type: application/json" \
  -d '{}'
```

期望返回 `code: 0`。

## 6) `next start` 与 `output: standalone` 不兼容

### 现象

```text
"next start" does not work with "output: standalone" configuration
```

### 原因

前端 `next.config.js` 配置了：

```js
output: 'standalone'
```

### 处理

使用 standalone 启动命令：

```bash
PORT=3000 node .next/standalone/server.js
```

## 7) standalone 启动时报 `sharp` 缺失

### 现象

```text
Error: 'sharp' is required to be installed in standalone mode
```

### 原因

Next.js 图片优化在该模式下需要 `sharp`。

### 处理

在前端项目安装依赖并重建：

```bash
npm i sharp
npm run build
```

## 8) 报错 `The requested resource isn't a valid image`

### 现象

```text
The requested resource isn't a valid image for /images/logo.png received null
```

### 常见原因

- 图片资源路径文件不存在；
- 使用 standalone 启动时，静态资源未正确带到运行目录。

### 快速排查

```bash
ls -l public/images/logo.png
ls -l public/images/network/default/logo.png
curl -I http://127.0.0.1:3000/images/logo.png
```

### 处理建议（standalone）

构建后同步静态资源，再启动：

```bash
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
PORT=3000 node .next/standalone/server.js
```

## 9) `Select: Keys "sub_block"...` 与 `aria-label` 警告

### 现象

控制台出现多条组件警告：

- `Select: Keys "sub_block" passed to "selectedKeys" are not present in the collection`
- `If you do not provide a visible label, you must specify an aria-label or aria-labelledby`

### 影响

通常不阻塞服务启动与页面访问，属于 UI 组件配置/可访问性警告。

### 建议

后续在前端代码中修正 Select 默认值与无障碍属性配置。

## 10) MySQL / Redis 不希望暴露外网

### 建议

在 `docker-compose.yml` 中不为 `mysql`、`redis` 配置 `ports` 映射，只通过内部 Docker 网络供 `subscan-api` / `subscan-worker` / `subscan-observer` 访问。

> 当前本次部署已经按该策略调整。

## 11) 如何用参数控制 `worker` 副本数量

### 问题

希望通过命令参数动态调整 `subscan-worker` 副本数，而不是在 compose 文件里手写多个 `subscan-worker-*` 服务。

### 推荐方式

使用 `--scale`：

```bash
docker compose up -d --no-build --scale subscan-worker=2
```

后续可随时调整，例如：

```bash
docker compose up -d --no-build --scale subscan-worker=7
```

### 前提条件

`subscan-worker` 服务不能配置固定 `container_name`，否则无法扩容多个副本（容器名会冲突）。

### 注意事项

- 建议保持 `subscan-observer` 为单副本，避免重复订阅发布；
- `worker` 扩容同时建议观察数据库写入负载与错误率。

## 12) 为什么只是加副本，`up --build` 却报 `data/mysql/#innodb_redo permission denied`

### 现象

```text
failed to solve: error from sender: open ... data/mysql/#innodb_redo: permission denied
```

### 原因

`docker compose up -d --build` 会对含 `build:` 的服务执行镜像构建。构建时 Docker 会打包 `build context`（当前项目目录），如果目录内有当前用户无权限读取的文件（例如 MySQL 数据目录），就会报错。

### 处理方式

1. 若只是扩副本，不需要重建镜像，使用：

```bash
docker compose up -d --no-build
```

2. 为避免后续再次触发，建议添加 `.dockerignore` 排除数据目录：

```dockerignore
data/
.git
```

3. 如确需构建且必须读取该目录，可修复权限（谨慎）：

```bash
sudo chown -R $USER:$USER
