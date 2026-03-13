# 微信小程序项目

本项目包含微信小程序的前端和后端服务，用于微信公众号文章导出功能。

## 项目结构

```
apps/miniapp/
├── native/     # 小程序前端（原生微信小程序）
│   ├── pages/      # 页面文件
│   ├── api/        # API 请求封装
│   ├── config/     # 配置文件
│   └── app.json   # 小程序配置
└── server/     # 小程序后端服务（Nitro）
    ├── src/
    │   ├── api/       # API 接口
    │   │   └── miniapp/   # 所有 API 路由
    │   ├── db/        # 数据库操作
    │   ├── services/  # 业务逻辑
    │   ├── kv/        # KV 存储（Cookie/Token）
    │   └── utils/     # 工具函数
    └── data/      # SQLite 数据库文件
```

## 快速开始

### 前置条件
- Node.js >= 22
- 微信开发者工具
- 已启动 Web 端服务（用于微信登录态）

### 启动服务

```bash
# 1. 启动小程序后端服务（端口3001）
yarn miniapp:dev

# 2. 在微信开发者工具中打开 native 目录
# 选择 apps/miniapp/native 作为小程序项目目录
```

### 构建

```bash
# 构建后端服务
yarn miniapp:build

# 构建小程序前端（在微信开发者工具中操作）
yarn miniapp:native:build
```

## 依赖关系

小程序后端服务**依赖 Web 端的微信登录态**：

1. 用户需要先在 Web 端（localhost:3000）扫码登录微信
2. 登录态Token保存在 KV 存储中（默认 key: `default`）
3. 小程序后端通过读取 KV 存储来获取微信登录态

详见 [server/README.md](server/README.md)

## API 列表

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/miniapp/search-biz` | GET | 搜索公众号 |
| `/api/miniapp/create-order` | POST | 创建订单 |
| `/api/miniapp/order-status` | GET | 获取订单状态 |
| `/api/miniapp/orders` | GET | 获取用户订单列表 |
| `/api/miniapp/payment-callback` | POST | 支付回调 |
| `/api/miniapp/process-tasks` | POST | 处理任务队列 |
| `/api/miniapp/user-biz-list` | GET | 获取用户公众号列表 |
| `/api/miniapp/user-biz-detail` | GET | 获取公众号详情 |
| `/api/miniapp/user-biz-sync` | POST | 同步公众号文章 |
| `/api/miniapp/user-biz-export` | POST | 导出公众号文章 |
| `/api/miniapp/user-biz-task` | GET | 获取任务状态 |

详见 [server/README.md](server/README.md)