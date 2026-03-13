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

## Commands

```bash
# Development
yarn dev              # Start Nuxt dev server (localhost:3000)
yarn dev:electron     # Start with Electron (Nuxt + Electron watch mode)
yarn electron:start  # Run Electron desktop app in dev mode
yarn miniapp:dev      # Start miniapp server (localhost:3001)
yarn miniapp:native:dev  # Start miniapp native dev (weixin devtools)

# Building
yarn build           # Production build for Nuxt
yarn build:electron  # Build Nuxt + compile Electron + package desktop app
yarn build:electron:win  # Build for Windows (NSIS installer)
yarn miniapp:build   # Build miniapp server
yarn miniapp:native:build  # Build miniapp native
yarn preview         # Preview Cloudflare Pages build locally

# Code quality
yarn format          # Format code with Biome (organizes imports)
yarn debug           # Nuxt dev with inspector

# Docker
yarn docker:build    # Build Docker image
yarn docker:publish  # Push to GitHub Container Registry
```

## Project Structure

```
wechat-article-exporter/
├── apps/
│   ├── web/           # Nuxt Web应用（前端 + 后端API）
│   │   ├── pages/         # Vue页面
│   │   ├── components/   # Vue组件
│   │   ├── composables/   # Vue composables
│   │   └── server/        # Nitro API (web端API)
│   ├── electron/      # Electron桌面客户端 (Vite + Vue 3)
│   └── miniapp/       # 微信小程序项目
│       ├── native/    # 小程序前端 (原生)
│       └── server/    # 小程序后端 (Nitro, 端口3001)
├── packages/          # 共享包
├── utils/             # 客户端工具
├── types/             # TypeScript类型定义
└── test/              # 测试文件
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
   - `apps/miniapp/server/src/api/miniapp/` - Mini-program payment and task APIs (独立服务, 端口3001)
2. **Vue Components**: Feature-based organization in `apps/web/components/`
3. **Database**: SQLite stored in `apps/web/server/db/`, accessed via better-sqlite3
4. **Mini-program**: Native WeChat mini-program in `apps/miniapp/native/` with separate server `apps/miniapp/server/`
5. **Environment**: Uses `.env.example` for configuration template
   - `NITRO_KV_DRIVER`: Storage backend (memory/fs/cloudflare-kv-binding)
   - `NUXT_AGGRID_LICENSE`: AG Grid Enterprise license
   - `DEBUG_KEY`: Debug access key
