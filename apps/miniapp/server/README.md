# 小程序后端服务

基于 Nitro 的独立后端服务，处理小程序的所有 API 请求。

## 技术栈

- **框架**: Nitro (H3)
- **数据库**: better-sqlite3
- **模板转换**: Turndown (HTML 转 Markdown)
- **压缩**: JSZip (EPUB 生成)

## 配置

服务运行配置在 `nitro.config.ts` 中：

```typescript
export default defineNitroConfig({
  preset: 'node-server',
  srcDir: 'src',
  apiDir: 'api',
  port: 3001,
  routeRules: {
    '/api/**': { cors: true },
  },
});
```

## 数据库

使用 SQLite 数据库，文件位于 `data/miniapp.db`。

### 表结构

#### orders（订单表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 订单ID (UUID) |
| biz_name | TEXT | 公众号名称 |
| biz_fakeid | TEXT | 公众号 fakeid |
| email | TEXT | 用户邮箱 |
| status | TEXT | 订单状态 |
| amount | INTEGER | 金额（分） |
| pay_time | INTEGER | 支付时间戳 |
| created_at | INTEGER | 创建时间戳 |
| updated_at | INTEGER | 更新时间戳 |
| completed_at | INTEGER | 完成时间戳 |
| error | TEXT | 错误信息 |

#### tasks（任务表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 任务ID |
| order_id | TEXT | 关联订单ID |
| type | TEXT | 任务类型 |
| status | TEXT | 任务状态 |
| progress | INTEGER | 进度 (0-100) |
| result | TEXT | 结果 JSON |
| error | TEXT | 错误信息 |
| created_at | INTEGER | 创建时间戳 |
| updated_at | INTEGER | 更新时间戳 |

#### user_biz（用户公众号关联表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | ID |
| user_id | TEXT | 用户ID |
| biz_name | TEXT | 公众号名称 |
| biz_fakeid | TEXT | 公众号 fakeid |
| email | TEXT | 用户邮箱 |
| order_id | TEXT | 订单ID |
| last_sync_at | INTEGER | 最后同步时间 |
| article_count | INTEGER | 文章数量 |
| status | TEXT | 状态 |
| created_at | INTEGER | 创建时间戳 |
| updated_at | INTEGER | 更新时间戳 |

#### user_biz_tasks（用户公众号任务表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 任务ID |
| user_biz_id | TEXT | 关联公众号ID |
| type | TEXT | 任务类型 |
| status | TEXT | 任务状态 |
| progress | INTEGER | 进度 |
| result | TEXT | 结果 |
| error | TEXT | 错误信息 |
| created_at | INTEGER | 创建时间戳 |
| updated_at | INTEGER | 更新时间戳 |

## 任务流程

### 订单任务流程
1. `fetch_articles` - 获取公众号文章列表和内容
2. `generate_ebook` - 生成 EPUB 电子书
3. `send_email` - 发送邮件（模拟实现）

### 用户公众号任务流程
1. `sync_articles` - 同步公众号文章
2. `generate_epub` - 生成 EPUB
3. `send_email` - 发送邮件

## 微信登录态

服务依赖 Web 端保存的微信登录态。Token 保存在 KV 存储中，支持以下 key：
- `default`
- `auth-key`
- `wechat-default`

获取 Token 代码：
```typescript
import { getMpCookie } from './kv/cookie';

async function getWechatToken() {
  const kvKeys = ['default', 'auth-key', 'wechat-default'];
  for (const key of kvKeys) {
    const cookieData = await getMpCookie(key);
    if (cookieData && cookieData.token) {
      return {
        token: cookieData.token,
        cookieStr: cookieData.cookies.map(c => `${c.name}=${c.value}`).join('; '),
      };
    }
  }
  return null;
}
```

## API 详情

### 搜索公众号
```
GET /api/miniapp/search-biz?keyword=xxx

Response:
{
  base_resp: { ret: 0, err_msg: "ok" },
  list: [{ fakeid: "xxx", nickname: "公众号名称", ... }]
}
```

### 创建订单
```
POST /api/miniapp/create-order
Body: { bizName: "公众号名称", email: "user@example.com", price: 500 }

Response: Order 对象
```

### 获取订单状态
```
GET /api/miniapp/order-status?orderId=xxx

Response:
{
  order: { ... },
  tasks: [{ id: "xxx", type: "fetch_articles", status: "completed", ... }]
}
```

### 处理任务队列
```
POST /api/miniapp/process-tasks

Response: { processed: 5 }
```

### 用户公众号操作
- `GET /api/miniapp/user-biz-list?userId=xxx` - 获取用户公众号列表
- `GET /api/miniapp/user-biz-detail?id=xxx` - 获取公众号详情
- `POST /api/miniapp/user-biz-sync` - 同步文章 { userBizId: "xxx" }
- `POST /api/miniapp/user-biz-export` - 导出文章 { userBizId: "xxx" }
- `GET /api/miniapp/user-biz-task?taskId=xxx` - 获取任务状态

## 开发

```bash
# 开发模式（热重载）
yarn miniapp:dev

# 生产构建
yarn miniapp:build

# 预览
yarn miniapp:preview
```

## 注意事项

1. 邮件发送为模拟实现，需配置真实邮件服务
2. 微信登录态必须先通过 Web 端获取
3. 任务处理为同步执行，生产环境建议使用消息队列