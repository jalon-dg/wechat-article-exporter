import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import dayjs from 'dayjs';
import TurndownService from 'turndown';
import {
  createOrder,
  getOrder,
  updateOrder,
  createTask,
  getTask,
  updateTask,
  getPendingTasks,
  getTasksByOrderId,
  type Order,
  type Task,
} from '~/server/db/miniapp';
import { proxyMpRequest } from '~/server/utils/proxy-request';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import type { H3Event } from 'h3';

// 模拟获取微信 Token（实际需要微信扫码登录）
async function getWechatToken(): Promise<string | null> {
  // 这里简化处理，实际需要管理员扫码登录获取 token
  // 可以从配置或数据库中读取
  return null;
}

// 搜索公众号
export async function searchBiz(keyword: string, event: H3Event) {
  try {
    const token = await getWechatToken();
    if (!token) {
      // 使用公开 API 搜索（如果有的话）
      // 这里先返回模拟数据，实际需要真实的 token
      return {
        base_resp: { ret: -1, err_msg: '服务暂未开放，请联系管理员' },
      };
    }

    const params = {
      action: 'search_biz',
      begin: 0,
      count: 5,
      query: keyword,
      token,
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
    };

    return proxyMpRequest({
      event,
      method: 'GET',
      endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
      query: params,
      parseJson: true,
    });
  } catch (e) {
    console.error('Search biz error:', e);
    return {
      base_resp: { ret: -1, err_msg: '搜索失败，请稍后重试' },
    };
  }
}

// 创建订单
export function createMiniappOrder(bizName: string, email: string, price: number = 500): Order {
  const orderId = uuidv4();
  const order: Order = {
    id: orderId,
    biz_name: bizName,
    biz_fakeid: null,
    email,
    status: 'pending',
    amount: price,
    pay_time: null,
    created_at: Date.now(),
    updated_at: null,
    completed_at: null,
    error: null,
  };

  createOrder(order);

  // 创建初始任务
  createTask({
    id: uuidv4(),
    order_id: orderId,
    type: 'fetch_articles',
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    created_at: Date.now(),
  });

  return order;
}

// 支付成功回调
export function handlePaymentCallback(orderId: string, paymentTime: number): Order | null {
  const order = getOrder(orderId);
  if (!order) return null;

  // 更新订单状态
  updateOrder(orderId, {
    status: 'paid',
    pay_time: paymentTime,
  });

  // 这里不要把任务提前标记为 processing：
  // 实际执行由 processTaskQueue() 从 pending 拉起（否则会导致队列永远不处理）
  updateOrder(orderId, { status: 'processing' });

  return getOrder(orderId) || null;
}

// 获取订单状态
export function getOrderStatus(orderId: string) {
  const order = getOrder(orderId);
  if (!order) return null;

  const tasks = getTasksByOrderId(orderId);
  return {
    order,
    tasks,
  };
}

// 生成 EPUB 电子书
async function generateEpub(
  orderId: string,
  bizName: string,
  articles: Array<{ title: string; content: string; update_time: number }>
): Promise<Buffer> {
  const turndownService = new TurndownService();

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  const oebps = zip.folder('OEBPS')!;
  const textFolder = oebps.folder('Text')!;

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const chapterTitles: string[] = [];
  const bookTitle = bizName.replace(/[<>"&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' })[c]!);

  // 生成封面
  const imagesFolder = oebps.folder('Images')!;
  const coverSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="#ffffff"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif"
        font-size="96" xml:space="preserve">
    ${bookTitle}
  </text>
</svg>`;
  imagesFolder.file('cover.svg', coverSvg, { compression: 'DEFLATE' });

  const escapeXml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const markdownToSimpleHtml = (md: string): string => {
    const lines = md.split('\n');
    const htmlLines: string[] = [];
    let buffer: string[] = [];

    const flushParagraph = () => {
      if (!buffer.length) return;
      const text = buffer.join(' ').trim();
      if (text) {
        htmlLines.push(`<p>${escapeXml(text)}</p>`);
      }
      buffer = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        flushParagraph();
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushParagraph();
        const level = Math.min(6, headingMatch[1].length);
        const text = headingMatch[2].trim();
        if (text) {
          htmlLines.push(`<h${level}>${escapeXml(text)}</h${level}>`);
        }
        continue;
      }

      buffer.push(line);
    }

    flushParagraph();
    return htmlLines.join('\n');
  };

  // 按时间倒序
  articles.sort((a, b) => b.update_time - a.update_time);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]!;
    const chapterId = `chapter_${String(i + 1).padStart(3, '0')}`;
    const xhtmlPath = `Text/${chapterId}.xhtml`;

    let markdown = '';
    if (article.content) {
      markdown = turndownService.turndown(article.content);
      markdown = markdown
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    if (!markdown) {
      markdown = '（该文章内容无法导出）';
    }
    const contentHtml = markdownToSimpleHtml(markdown);

    const title = (article.title || '无标题').replace(
      /[<>"&]/g,
      c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' })[c]!
    );
    chapterTitles.push(title);

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style type="text/css">
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; max-width: 100%; padding: 1em; line-height: 1.6; word-break: break-word; }
    p { margin: 0.5em 0; }
    h1, h2, h3, h4 { margin: 1em 0 0.5em; }
    .meta { color: #666; font-size: 0.9em; }
    .content { font-size: 1em; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">${dayjs.unix(article.update_time).format('YYYY-MM-DD HH:mm')}</p>
  <div class="content">
${contentHtml}
  </div>
</body>
</html>`;
    textFolder.file(`${chapterId}.xhtml`, xhtml, { compression: 'DEFLATE' });

    manifestItems.push(`    <item id="${chapterId}" href="${xhtmlPath}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`    <itemref idref="${chapterId}"/>`);
  }

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>${bookTitle}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${chapterTitles.map((t, index) => `      <li><a href="Text/chapter_${String(index + 1).padStart(3, '0')}.xhtml">${escapeXml(t)}</a></li>`).join('\n')}
    </ol>
  </nav>
</body>
</html>`;
  oebps.file('nav.xhtml', navXhtml, { compression: 'DEFLATE' });

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${bookTitle}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="uid">wechat-export-${Date.now()}</dc:identifier>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-image" href="Images/cover.svg" media-type="image/svg+xml" properties="cover-image"/>
${manifestItems.join('\n')}
  </manifest>
  <spine>
${spineItems.join('\n')}
  </spine>
</package>`;
  oebps.file('content.opf', contentOpf, { compression: 'DEFLATE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    { compression: 'DEFLATE' }
  );

  return await zip.generateAsync({ type: 'nodebuffer' });
}

// 发送邮件（模拟实现）
async function sendEmail(email: string, subject: string, content: string, attachments?: Buffer[]) {
  // 这里应该集成真实的邮件发送服务
  // 例如 nodemailer、SendGrid、Aliyun 邮件推送等
  console.log(`[Email] Sending to ${email}: ${subject}`);
  // 模拟发送成功
  return true;
}

// 处理任务队列
export async function processTaskQueue() {
  const pendingTasks = getPendingTasks();

  for (const task of pendingTasks) {
    if (task.status !== 'pending') continue;

    console.log(`[Task] Processing ${task.type} for order ${task.order_id}`);
    updateTask(task.id, { status: 'processing' });

    try {
      const order = getOrder(task.order_id);
      if (!order) {
        updateTask(task.id, { status: 'failed', error: 'Order not found' });
        continue;
      }

      if (task.type === 'fetch_articles') {
        // 模拟抓取文章
        // 实际需要调用微信 API 抓取
        const articles = [
          { title: '示例文章1', content: '<p>这是文章内容</p>', update_time: Date.now() / 1000 },
          { title: '示例文章2', content: '<p>这是另一篇文章</p>', update_time: Date.now() / 1000 - 86400 },
        ];

        // 创建下一个任务
        createTask({
          id: uuidv4(),
          order_id: task.order_id,
          type: 'generate_ebook',
          status: 'pending',
          progress: 0,
          result: JSON.stringify(articles),
          error: null,
          created_at: Date.now(),
        });

        updateTask(task.id, { status: 'completed', progress: 100, result: JSON.stringify(articles) });
      } else if (task.type === 'generate_ebook') {
        const articles = task.result ? JSON.parse(task.result) : [];
        const epubBuffer = await generateEpub(task.order_id, order.biz_name, articles);

        // 保存文件路径或上传到云存储
        const filePath = `/tmp/${order.id}.epub`;
        const { writeFileSync } = await import('fs');
        writeFileSync(filePath, epubBuffer);

        createTask({
          id: uuidv4(),
          order_id: task.order_id,
          type: 'send_email',
          status: 'pending',
          progress: 0,
          result: filePath,
          error: null,
          created_at: Date.now(),
        });

        updateTask(task.id, { status: 'completed', progress: 100 });
      } else if (task.type === 'send_email') {
        const filePath = task.result;
        const { readFileSync } = await import('fs');
        const epubBuffer = readFileSync(filePath);

        await sendEmail(
          order.email,
          `${order.biz_name} 文章合集已生成`,
          `您好，您的订单已完成。请查收附件中的电子书。`,
          [epubBuffer]
        );

        updateTask(task.id, { status: 'completed', progress: 100 });
        updateOrder(task.order_id, { status: 'completed', completed_at: Date.now() });
      }
    } catch (e) {
      console.error(`[Task] Error processing ${task.id}:`, e);
      updateTask(task.id, { status: 'failed', error: String(e) });
      updateOrder(task.order_id, { status: 'failed', error: String(e) });
    }
  }
}
