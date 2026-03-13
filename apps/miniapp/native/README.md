# 微信小程序前端

原生微信小程序，用于用户下单和查看订单状态。

## 页面结构

### 1. 首页 (pages/index/index)
- 搜索公众号功能
- 显示搜索结果列表
- 选择公众号后创建订单

### 2. 订单页 (pages/orders/orders)
- 显示用户所有订单列表
- 订单状态：pending → paid → processing → completed

### 3. 订单详情页 (pages/order/order)
- 显示订单详情
- 显示任务进度
- 支付按钮（模拟）

### 4. 我的公众号页 (pages/my-biz/my-biz)
- 用户绑定的公众号列表
- 同步/导出功能

### 5. 公众号详情页 (pages/my-biz-detail/my-biz-detail)
- 公众号文章列表
- 同步状态

## 页面路由

| 路径 | 说明 |
|------|------|
| pages/index/index | 首页（搜索下单） |
| pages/orders/orders | 订单列表 |
| pages/order/order | 订单详情 |
| pages/my-biz/my-biz | 我的公众号 |
| pages/my-biz-detail/my-biz-detail | 公众号详情 |

## API 请求

小程序通过 `api/request.js` 封装请求方法：

```javascript
const API_BASE = 'http://127.0.0.1:3001';

// 搜索公众号
searchBiz(keyword)

// 创建订单
createOrder({ bizName, email, price })

// 获取订单状态
getOrderStatus(orderId)

// 获取订单列表
getOrders()

// 处理任务
processTasks()

// 用户公众号
getUserBizList(userId)
getUserBizDetail(id)
syncUserBiz(userBizId)
exportUserBiz(userBizId)
getUserBizTask(taskId)
```

## 开发

### 前置条件
1. 安装微信开发者工具
2. 启动小程序后端服务：`yarn miniapp:dev`

### 本地开发

1. 启动后端服务：
```bash
yarn miniapp:dev
```

2. 在微信开发者工具中导入项目：
- 项目目录：`apps/miniapp/native`
- AppID：使用测试号或自己的小程序号

3. 修改请求地址（如需要）：
编辑 `api/request.js` 中的 `API_BASE`：
```javascript
const API_BASE = 'http://127.0.0.1:3001'; // 开发环境
// const API_BASE = 'https://your-server.com'; // 生产环境
```

### 构建发布

1. 在微信开发者工具中：
   - 点击「上传」按钮
   - 填写版本号和备注
   - 提交审核

2. 或使用命令行工具：
```bash
yarn miniapp:native:build
```

## 目录结构

```
native/
├── api/
│   └── request.js      # API 请求封装
├── config/
│   └── index.ts        # 配置
├── pages/
│   ├── index/          # 首页
│   ├── order/          # 订单详情
│   ├── orders/         # 订单列表
│   ├── my-biz/         # 我的公众号
│   └── my-biz-detail/  # 公众号详情
├── app.js              # 小程序入口
├── app.json            # 小程序配置
├── app.wxss            # 全局样式
├── project.config.json # 项目配置
└── sitemap.json        # sitemap 配置
```

## 配置说明

### app.json
```json
{
  "pages": ["pages/index/index", ...],
  "window": {
    "navigationBarTitleText": "公众号电子书"
  },
  "tabBar": {
    "list": [
      { "pagePath": "pages/index/index", "text": "首页" },
      { "pagePath": "pages/orders/orders", "text": "订单" },
      { "pagePath": "pages/my-biz/my-biz", "text": "我的公众号" }
    ]
  }
}
```

### project.config.json
- `appid`: 小程序 AppID
- `compileType`: miniprogram
- `setting.urlCheck`: 是否检查安全域名

## 支付流程

当前为模拟支付流程：
1. 用户创建订单（状态：pending）
2. 点击支付按钮
3. 模拟支付成功，调用 `/api/miniapp/payment-callback`
4. 订单状态变为：processing
5. 触发任务处理

## 数据流向

```
用户操作 → 小程序前端 → 小程序后端 → Web端KV存储(微信Token) → 微信API
                                              ↓
                                        任务处理
                                              ↓
                                        生成EPUB → 发送邮件
```