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
- **Mini-program**: Native WeChat mini-program (`miniprogram-native/`)
- **Node**: Requires Node.js >= 22

## Commands

```bash
yarn dev          # Start development server
yarn build        # Production build
yarn format       # Format code with Biome (organizes imports)
yarn docker:build # Build Docker image
yarn docker:publish  # Push to GitHub Container Registry
```

## Project Structure

```
wechat-article-exporter/
├── server/
│   ├── api/           # Nitro server API endpoints
│   │   ├── public/    # Public article search/download APIs
│   │   ├── web/       # Web scraping and WeChat APIs
│   │   └── miniapp/   # Mini-program order APIs
│   ├── db/            # Database (better-sqlite3)
│   ├── services/      # Business logic (task-processor.ts)
│   └── utils/         # Server utilities
├── pages/             # Nuxt pages (dashboard, dev, index)
├── components/        # Vue components (organized by feature)
├── composables/       # Vue composables
├── miniprogram-native/ # WeChat mini-program (native)
├── miniprogram/       # Taro-based mini-program (legacy/inactive)
├── utils/             # Client-side utilities
├── shared/            # Shared code
├── types/             # TypeScript type definitions
└── test/              # Test files
```

## Architecture Notes

- **SSR**: Disabled (`ssr: false`) - client-side only rendering
- **Database**: Uses better-sqlite3 for local data storage (articles, tasks, accounts)
- **KV Storage**: Configurable via `NITRO_KV_DRIVER` (defaults to memory)
- **API Pattern**: Nitro API routes in `server/api/` with `.get.ts` and `.post.ts` suffixes
- **WeChat Integration**: Mini-program handles payment processing, web APIs handle article scraping via WeChat's search functionality
- **Code Formatting**: Biome with single quotes, organizes imports on format

## Key Patterns

1. **API Endpoints**: File-based routing in `server/api/[feature]/[method].ts`
2. **Vue Components**: Feature-based organization in `components/`
3. **Database**: SQLite stored in `server/db/`, accessed via better-sqlite3
4. **Mini-program**: Native WeChat mini-program in `miniprogram-native/` with separate payment/order flow
5. **Environment**: Uses `.env.example` for configuration template