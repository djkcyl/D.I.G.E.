# Docker 容器化与 Android APK 打包

规范版本：v1.0（与 PR 实施规范对齐）

## 生产镜像

```bash
docker compose build
docker compose up -d
# http://localhost:8080
```

或：

```bash
docker build -t dige:local .
docker run --rm -p 8080:80 dige:local
```

- 多阶段：`node:22-alpine` + `pnpm@9.13.0` → `nginx:alpine`
- SPA：`try_files`；SW/manifest：不缓存；哈希静态资源：长缓存

## 开发容器

```bash
docker compose -f docker-compose.dev.yml up --build
# http://localhost:3000  （宿主机映射；容器内仍为 5173。本机 pnpm dev 同为 3000）
```

VS Code / Cursor：Reopen in Container（`.devcontainer/devcontainer.json`）。
源码挂载 + 匿名卷 `/app/node_modules`，避免 Windows 与 Linux 依赖冲突。

## Capacitor Android

- App ID：`cn.aunly.dige`
- App Name：`D.I.G.E.`
- `webDir`：`dist`

```bash
pnpm install
pnpm build
pnpm exec cap add android   # 首次
pnpm exec cap sync android
pnpm exec cap open android  # 可选 Android Studio
```

分享链接在 localhost / Capacitor 环境下自动使用官方域名 `https://dige.aunly.cn`。

## CI（示例模板）

工作流以**示例模板**提供，默认不启用（避免 fork PAT 缺少 `workflow` scope 时无法推送）：

- 模板路径：`scripts/ci/build-apk.yml`
- 启用方式：上游维护者复制到 `.github/workflows/build-apk.yml` 后即可由 Actions 运行

触发条件（启用后）：`workflow_dispatch` 或 tag `v*` → 上传 debug APK artifact。

```bash
mkdir -p .github/workflows
cp scripts/ci/build-apk.yml .github/workflows/build-apk.yml
```

## 说明

- 仓库可不提交完整 `android/` 工程；CI 在无目录时执行 `cap add android`。
- 正式上架需自行配置 release 签名（勿提交 keystore）。
