# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

wechat-article-exporter is an online WeChat Official Account article batch download tool. It supports exporting articles with read counts and comment data. Can be used via the [online website](https://down.mptext.top), deployed with Docker, or deployed on Cloudflare.

Supports downloading articles in multiple formats: HTML (100% preserves original formatting), JSON, Excel, TXT, MD, and DOCX.

## Tech Stack

- **Framework**: Nuxt 3 + Vue 3 + TypeScript
- **UI**: @nuxt/ui (Tailwind CSS)
- **Database**: better-sqlite3 (local SQLite)
- **Server**: Nitro (server-side rendering disabled - SPA mode)
- **Grid**: AG Grid Enterprise
- **Mini-program**: Native WeChat mini-program (`apps/miniapp/native/`) with separate server (`apps/miniapp/server/`)
- **Node**: Requires Node.js >= 22

## Ports（各应用固定端口，避免混淆）

| 应用 | 端口 | 说明 |
|------|------|------|
| **Web** (用户端) | **3000** | Nuxt dev / 在线站 |
| **Miniapp** (小程序后端) | **3001** | Nitro API |
| **Desktop** 管理端 | **30001** | Nuxt admin (baseURL `/admin/`) |
| **Desktop** 客户端 | **5173** | Vite 渲染进程 dev |

## Commands

```bash
# Web (用户端) — 端口 3000
yarn dev              # Start Nuxt dev server (localhost:3000)

# Desktop (桌面客户端 + 管理端) — 端口 5173 + 30001
yarn app:dev          # Start desktop app dev (client + server)
yarn app:server:dev   # Start admin server only (localhost:30001)
yarn app:client:dev   # Start Vite dev server (localhost:5173)
yarn app:start        # Run Electron desktop app in dev mode
yarn app:build         # Build desktop app
yarn app:build:win     # Build Windows installer

# Miniapp (小程序) — 端口 3001
yarn miniapp:dev       # Start miniapp server (localhost:3001)
yarn miniapp:native:dev  # Start miniapp native dev (weixin devtools)
yarn miniapp:build    # Build miniapp server
yarn miniapp:native:build  # Build miniapp native

# Other
yarn build            # Production build for web
yarn preview          # Preview Cloudflare Pages build locally
yarn format           # Format code with Biome (organizes imports)
yarn debug            # Nuxt dev with inspector
yarn docker:build     # Build Docker image
yarn docker:publish   # Push to GitHub Container Registry
```

## Project Structure

```
wechat-article-exporter/
├── apps/
│   ├── web/              # Nuxt Web应用（用户端，前端 + 后端API）
│   │   ├── pages/        # Vue页面
│   │   ├── components/   # Vue组件
│   │   ├── composables/  # Vue composables
│   │   └── server/       # Nitro API
│   │       ├── api/
│   │       │   ├── public/    # 公开下载 API
│   │       │   └── web/       # 微信登录/爬取 API
│   │       ├── db/       # Web 端数据库
│   │       ├── kv/       # KV 存储（Cookie）
│   │       └── utils/    # 工具类
│   │
│   ├── desktop/          # 桌面客户端（自包含 client + server）
│   │   ├── client/       # Electron 客户端
│   │   │   ├── main.ts         # Electron 主进程
│   │   │   ├── preload.ts      # Preload 脚本
│   │   │   ├── vite.config.ts  # Vite 配置
│   │   │   ├── plugins/        # 插件
│   │   │   └── src/renderer/   # Vue 渲染进程
│   │   │       ├── App.vue
│   │   │       ├── main.ts
│   │   │       └── components/
│   │   │           └── steps/
│   │   │               ├── LoginStep.vue   # 含激活码功能
│   │   │               ├── CollectStep.vue
│   │   │               └── ExportStep.vue
│   │   │
│   │   └── server/      # 管理端（Nuxt，端口30001，baseURL /admin/）
│   │       ├── nuxt.config.ts
│   │       ├── pages/
│   │       │   └── admin/
│   │       │       └── index.vue
│   │       ├── server/
│   │       │   └── api/
│   │       │       └── license/  # License 管理 API
│   │       └── db/
│   │           └── license.ts   # License 数据库
│   │
│   └── miniapp/         # 微信小程序
│       ├── native/      # 小程序前端 (原生)
│       └── server/      # 小程序后端 (Nitro, 端口3001)
│           └── src/
│               ├── api/       # 小程序 API（订单、任务）
│               ├── db/        # 数据库
│               ├── services/  # 服务（task-processor）
│               └── kv/        # KV 存储
│
├── packages/            # 共享包
├── utils/               # 客户端工具
└── types/               # TypeScript类型定义
```

## Architecture Notes

- **SSR**: Disabled (`ssr: false`) - client-side only rendering
- **Database**: Uses better-sqlite3 for local data storage (articles, tasks, accounts)
- **KV Storage**: Configurable via `NITRO_KV_DRIVER` (defaults to memory)
- **API Pattern**: Nitro API routes in `server/api/` with `.get.ts` and `.post.ts` suffixes
- **WeChat Integration**: Mini-program handles payment processing, web APIs handle article scraping via WeChat's search functionality
- **Code Formatting**: Biome with single quotes, organizes imports on format
- **Electron Desktop**: Compiled to CommonJS via separate tsconfig, supports system tray and native dialogs
- **Export Formats**: HTML (full fidelity), JSON, Excel, TXT, MD, DOCX - handled by `utils/download/Exporter.ts`

## Key Patterns

1. **API Endpoints**: File-based routing in `server/api/[feature]/[method].ts`
   - `apps/web/server/api/public/v1/` - Public article search/download APIs
   - `apps/web/server/api/web/mp/` - WeChat account login and article scraping
   - `apps/web/server/api/web/login/` - WeChat QR code login flow
   - `apps/miniapp/server/src/api/miniapp/` - Mini-program payment and task APIs (端口3001)
   - `apps/desktop/server/server/api/license/` - License 管理 API (端口30001)
2. **Vue Components**: Feature-based organization in `apps/web/components/`
3. **Database**: SQLite in respective app's `server/db/` or `src/db/` directory
4. **Mini-program**: Native WeChat mini-program in `apps/miniapp/native/` with separate server `apps/miniapp/server/`
5. **Desktop App**: Self-contained with client (Electron) and server (Nuxt admin panel)
6. **Environment**: Uses `.env.example` for configuration template
   - `NITRO_KV_DRIVER`: Storage backend (memory/fs/cloudflare-kv-binding)
   - `NUXT_AGGRID_LICENSE`: AG Grid Enterprise license
   - `DEBUG_KEY`: Debug access key
   - `MANAGER_USERNAME` / `MANAGER_PASSWORD`: Admin credentials for desktop server