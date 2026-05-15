# Subscan Essentials 部署 FAQ

本文整理了本次部署过程中高频出现的问题与处理方式，适用于：

- 后端：`subscan-essentials`（Docker Compose，MySQL 模式）
- 前端：`subscan-essentials-ui-react`（Next.js standalone 运行）

## A) 前端部署与管理（速查）

本节是前端上线/运维的集中说明；**新机器从零部署**见 **A.0**；**域名与 Nginx 反代**见 **A.6**；更细分的报错说明见后文第 4、6、7、8、9 条。

### A.0 新机器 clone 后首次部署（清单）

以下假设本机已安装 **Node.js 18+**（与 Next.js 14 常见要求一致）及 **npm**，且 **后端 subscan API 已可访问**（例如 `http://<后端IP>:4399`）。

1. **获取代码**

   ```bash
   git clone <仓库地址> subscan-essentials-ui-react
   cd subscan-essentials-ui-react
   ```

2. **配置 API 地址（必做）**

   前后端不在同一台机器时，`NEXT_PUBLIC_API_HOST` 必须写后端真实可达地址，**不能**写 `127.0.0.1`（浏览器里会指向用户本机）。

   任选其一方式写入变量后，**必须重新执行构建**才会打进前端产物：

   - 在项目根创建 `.env.production`（或按你们规范使用 CI 环境变量），例如：

     ```env
     NEXT_PUBLIC_API_HOST=http://<后端IP>:4399
     ```

   - 若临时本机试跑且后端就在本机，可写 `http://127.0.0.1:4399`（仅当浏览器与后端同机访问时成立）。

3. **安装依赖与图片优化（standalone 推荐）**

   ```bash
   npm install
   npm i sharp
   ```

   `sharp` 用于 standalone 下 Next.js 图片优化；缺失时可能启动报错或优化失败，见后文第 7 条。

4. **构建**

   ```bash
   npm run build
   ```

   构建成功后，`package.json` 里的 **`build` 脚本会在 `next build` 之后紧接着执行 `copy-standalone-assets`**，将 `public/` 与 `.next/static/` 同步到 `.next/standalone/`（拷贝写在 `build` 主流程里，避免仅依赖 `postbuild` 时被 CI 的 `npm run build --ignore-scripts` 等配置跳过）。若构建失败，不要直接启动 standalone。

   **同步过去的 `.next/static` 同样负责浏览器端的 `/_next/static/...`（含 `chunks/webpack-*.js` 等）**。若 standalone 里仍缺少 `.next/standalone/.next/static/`（例如流水线里只跑了 **`next build`** 而不是 **`npm run build`**、或部署时未带上该目录），页面会出现 **`net::ERR_ABORTED` / `404` 加载 JS chunk** 之类报错，与 `server/chunks`（服务端打包）不是同一套文件。构建完成后可在**项目根目录**自检：

   ```bash
   ls .next/standalone/.next/static/chunks | head
   ```

   应能看到大量带 hash 的 `.js` 文件；若该路径不存在或为空，请重新执行 **`npm run build`**（或按 **A.3** 手动执行两条 `cp`）后再启动。同理，**`/images/...` 静态图**依赖 **`.next/standalone/public/`**（见 **A.3**），不要只核对仓库根的 `public/`。

5. **启动（必须在项目根目录执行）**

   ```bash
   PORT=3000 node .next/standalone/server.js
   ```

   说明：本项目使用 `output: 'standalone'`，**不要用** `npm start` / `next start` 作为线上方式（除非你们另行改配置）。

6. **可选：生产环境常驻**

   使用 **systemd**、**pm2**、**Docker** 或负载均衡反代等，将上述命令托管为服务；对外若经 **Nginx** 配域名与 HTTPS，见 **A.6**；反代时注意超时与 `Host` / `X-Forwarded-*` 头按需配置。

7. **验收**

   浏览器打开前端地址，确认接口请求指向配置的后端，且 `metadata` 等返回正常（见 **A.5**）。

8. **仅前端相关补充**

   - 若后端返回的 `networkNode` 在仓库中尚无 `public/images/network/<networkNode>/`，需按 `README.md` 补 logo/banner，或临时用符号链接复用已有网络目录，见后文第 **8** 条。
   - 使用 **standalone** 时，进程读取的是 **`.next/standalone/public/`**，不是仓库根的 `public/`。排查「图在仓库里但页面/curl 仍 404」时，**必须同时检查** `.next/standalone/public/...` 是否存在（见 **A.3**、第 **8** 条）。
   - 若从其他环境**只拷贝** `.next/standalone` 目录到新机器，须同时保证其中包含 **`public`** 与 **`.next/static`**，或在新机器上重新 `npm run build`。

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

Next.js 的 `standalone` 输出**不会自动带上**仓库里的 `public/` 与 `.next/static`，不拷贝则 `/images/...` 在运行时会变成「无效图片 / received null」。

构建后建议执行（与官方文档一致）：

```bash
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
```

当前项目在 `package.json` 的 **`build` 脚本末尾**串联了上述拷贝（`next build && npm run copy-standalone-assets`），一般无需再手敲命令。若流水线或文档里仍写 **`next build`** 且未接拷贝步骤，须改为 **`npm run build`**，或在本机按上文两条 `cp` 补拷。若你跳过完整构建、只复制了旧的 `.next/standalone`，仍需自行保证其中存在 `public` 与 `.next/static`。

构建完成后建议自检 **`public` 是否已进入 standalone**（与线上 `curl /images/...` 一致；仅检查仓库根的 `public` 容易漏判）：

```bash
ls -la .next/standalone/public/images/logo.png
ls -la .next/standalone/public/images/network/default/logo.png
```

若上述路径不存在，而仓库根 `public/` 里却有文件，说明拷贝未执行或产物过旧，请重新 **`npm run build`** 或手动执行本节两条 `cp` 后**重启** `server.js`。

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

- 浏览器访问前端地址后，Network 中 `metadata`、`token` 等接口应指向你配置的 **`NEXT_PUBLIC_API_HOST`**（内网调试时常为 `<后端IP>:4399`，上域名后见 **A.6**）；
- 接口返回应为 `code: 0`；
- 首页区块/交易数据应持续更新。

### A.6 域名与 Nginx（前后端分域名建议）

目标：浏览器只访问 **HTTPS 域名**；本机仍跑 **Next standalone（如 3000）** 与 **subscan API（如 4399）**，由 Nginx 终止 TLS 并反代。

#### 推荐结构

| 角色 | 示例域名 | 反代到 |
|------|----------|--------|
| 前端页面 | `https://scan.example.com` | `http://127.0.0.1:3000` |
| 后端 API | `https://api.example.com` | `http://127.0.0.1:4399` |

- **前端环境变量**：构建前在 `.env.production`（或 CI 变量）中把 API 写成**对外公网可访问的 API 域名**（与页面是否同域无关，浏览器会直连该地址发请求）：

  ```env
  NEXT_PUBLIC_API_HOST=https://api.example.com
  ```

  **不要**在 `NEXT_PUBLIC_API_HOST` 里写 `127.0.0.1`（见后文第 **4** 条）。变量修改后需重新 **`npm run build`** 并部署/重启前端。

- **CORS**：若前端域名为 `scan.example.com`、接口域名为 `api.example.com`，需保证 **subscan-api** 对浏览器来源放行 CORS（按后端实际配置调整）。若暂时无法改后端，可评估「同域路径反代 API」方案（例如由 Nginx 在 `scan.example.com` 上提供 `/api/` 反代到 4399，并把 `NEXT_PUBLIC_API_HOST` 设为 `https://scan.example.com`），前提是路径与后端路由一致且无冲突。

- **证书**：生产环境建议使用 **Let’s Encrypt**（`certbot --nginx`）或你们已有证书，在 `server { listen 443 ssl; ... }` 中配置 `ssl_certificate` / `ssl_certificate_key`。

#### Nginx 配置示例（按需改域名与端口）

以下为**最小可用**片段，实际部署请合并进站点配置、按需加 `access_log`、`client_max_body_size`、限流等。

**1）前端（Next standalone）**

```nginx
upstream next_standalone {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name scan.example.com;

    # ssl_certificate /path/fullchain.pem;
    # ssl_certificate_key /path/privkey.pem;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout  300s;
        proxy_send_timeout  300s;
        proxy_pass http://next_standalone;
    }
}
```

说明：`X-Forwarded-Proto` 便于应用识别原始协议为 HTTPS。若需 **WebSocket**，在 **`http { }` 顶层**（与 `server` 同级）增加 `map $http_upgrade $connection_upgrade { default upgrade; '' close; }`，并在本 `location` 中增加 `proxy_set_header Upgrade $http_upgrade;` 与 `proxy_set_header Connection $connection_upgrade;`（见 Nginx 官方反代 WebSocket 示例）。

**2）后端（subscan API）**

```nginx
upstream subscan_api {
    server 127.0.0.1:4399;
    keepalive 16;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    # ssl_certificate ...
    # ssl_certificate_key ...

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout  300s;
        proxy_send_timeout  300s;
        proxy_pass http://subscan_api;
    }
}
```

**3）安全与运维建议**

- **只监听本机**：`docker-compose` 或 API 进程尽量让 **4399 仅绑定 `127.0.0.1`**，由 Nginx 对外提供 443，减少端口直接暴露。
- **HTTP 跳转 HTTPS**：为 `scan.example.com` / `api.example.com` 各写一个 `listen 80` 的 `server`，`return 301 https://$host$request_uri;`。
- **健康检查**：`curl -sI https://scan.example.com/` 与 `curl -s -X POST https://api.example.com/api/scan/metadata -H 'Content-Type: application/json' -d '{}'` 应返回预期状态与 `code: 0`（参见后文第 **5** 条）。

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

修改后需重新 `build` 并重启前端服务。若经 **Nginx + HTTPS 域名** 暴露 API，应写 `https://api.example.com` 等形式，见 **A.6**。

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

- 图片资源路径文件不存在，或符号链接目标目录/文件缺失；
- 使用 standalone 启动时，**运行目录** `.next/standalone/public/` 未同步仓库的 `public/`（与仓库根 `public` 是否齐全不是同一回事）。

### 快速排查

**若使用 standalone（`node .next/standalone/server.js`）**：浏览器与 `curl` 访问的 `/images/...` 来自 **`.next/standalone/public`**。仅检查仓库根的 `public/` 正常，仍可能出现整页 **HTML 404** 或「invalid image / received null」——须对照 standalone 下路径。

```bash
# 仓库根（确认源码/构建前资源是否存在）
ls -l public/images/logo.png
ls -l public/images/network/default/logo.png

# standalone（与进程实际一致；此处缺失则 curl 常为 HTML 404）
ls -la .next/standalone/public/images/logo.png
ls -la .next/standalone/public/images/network/default/logo.png
```

HTTP 自检建议用 **响应头**（成功时为图片 `Content-Type`，失败时常为 `text/html`）：

```bash
curl -sI http://127.0.0.1:3000/images/logo.png
```

若日志指向具体网络目录（接口返回的 `networkNode`），请核对 **两处** `public`（仓库根与 standalone）及 symlink 是否解析到真实文件：

```bash
# 将 bifrost-kusama 换成 metadata 中的 networkNode
ls -la public/images/network/bifrost-kusama/logo.png
readlink -f public/images/network/bifrost-kusama/logo.png
ls -la .next/standalone/public/images/network/bifrost-kusama/logo.png
curl -sI http://127.0.0.1:3000/images/network/bifrost-kusama/logo.png
```

### 网络 logo / banner 路径不存在

**现象示例**：`The requested resource isn't a valid image for /images/network/bifrost-kusama/logo.png received null`。

**原因**：顶栏 Logo 与背景横幅使用 `public/images/network/<networkNode>/` 下的 `logo.png`、`banner.png`。若后端返回的 `networkNode` 在仓库中尚未建对应目录，Next.js 图片优化会请求失败并打印上述日志。

**常见误区**：已在仓库 **`public/images/network/`** 下建好目录或 **symlink**，且 `ls public/...` 正常，但未执行 **`npm run build`**（或未将 `public` 拷入 **`.next/standalone`**），则 **`.next/standalone/public/images/network/...` 可能仍不存在**，`curl` 返回 **HTML 404 页面** 而非图片。处理：见 **A.3**（重新 `npm run build` 或手动 `cp -r public .next/standalone/`）后**重启** `server.js`。

**可选处理方式**：

1. **按规范补资源（推荐长期做法）**：在 `public/images/network/<networkNode>/` 放置 `logo.png` 与 `banner.png`，规格见项目 `README.md` 中网络图片说明。
2. **临时复用已有网络素材**：在 `public/images/network/` 下对已有目录做符号链接，例如与 `bifrost-testnet` 共用一套图（按需替换为正式素材）：

```bash
cd public/images/network
ln -snf bifrost-testnet bifrost-kusama
```

3. **前端容错**：顶栏 `Image` 在加载失败时会回退到 `public/images/network/default/logo.png`，避免页面长期报错；横幅仍依赖存在文件或上述目录/链接，否则仅背景可能缺失。

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

### 原因说明

1. **`sub_block` 与 collection 不一致**（常见触发场景）：
   - `metadata` 尚未返回时，`typeOptions` 为空，若 `selectedKeys` 仍为 `['sub_block']`，会报警。
   - **`metadata` 被清空或接口失败**（例如构建预渲染、SWR 重试间隙）时，`typeOptions` 变为空数组，但本地 state 仍保留上一轮的 `['sub_block']`，同样会报警。
   - **合约验证页**：编译器 / Resolc 版本列表来自接口，首屏或构建阶段 `compilerOptions`、`resolcOptions` 可能为空，而 `selectedKeys` 仍使用写死的默认版本字符串，也会触发同类「keys not in collection」警告。
2. **`aria-label`**：`Select` / `Input` 使用 `label=""` 且无可见标签时，HeroUI 会要求提供 `aria-label` 或 `aria-labelledby`。

### 项目内已做修改

**`src/components/navbar/navbar.tsx`（导航栏搜索）**

- 使用 **`selectSelectedKeys`（`useMemo`）**：只要 `typeOptions` 为空则传空数组；有数据时保证传入的键一定落在当前 `SelectItem` 集合内（避免 state 滞后一帧）。
- 搜索跳转使用 **`effectiveSearchType`**（与 `selectSelectedKeys` 一致），避免 `type` 尚未同步时选错类型。
- `useEffect`：选项为空时若 `type` 仍有残留则 **`setType([])`**；选项恢复后再按仅 EVM / 首项规则对齐。
- `Select` 使用 `aria-label="Search category"`，选项未加载时 `isDisabled`。

**`src/components/contract/verify.tsx`（合约验证）**

- 编译器、Resolc 下拉使用 **`compilerSelectedKeys` / `resolcSelectedKeys`** 与接口返回的选项对齐，并在 `useEffect` 中修正无效 state；列表未加载时 `isDisabled`。
- 各 `Select` / 无单独标题的 `Input` 增加 **`aria-label`**，去掉无意义的空 `label`。
- 提交前若版本列表仍未就绪则提示用户等待，避免使用未对齐的 state。

若升级依赖后仍出现类似日志，可在仓库内搜索 `label=""` 的 HeroUI 组件并改为可见 `label` 或 `aria-label`。

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
