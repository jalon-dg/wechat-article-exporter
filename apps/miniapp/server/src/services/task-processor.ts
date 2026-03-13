import { v4 as uuidv4 } from 'uuid';
import { tmpdir } from 'os';
import { join } from 'path';
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
  createUserBiz,
  getUserBiz,
  updateUserBiz,
  createUserBizTask,
  getUserBizTask,
  updateUserBizTask,
  getPendingUserBizTasks,
  type Order,
  type Task,
  type UserBiz,
} from '../db/miniapp';
import { proxyMpRequest } from '../utils/proxy-request';
import { getMpCookie } from '../kv/cookie';

// 从KV存储中获取已保存的微信登录信息
async function getWechatToken(): Promise<{ token: string; cookieStr: string } | null> {
  const kvKeys = ['default', 'auth-key', 'wechat-default'];

  for (const key of kvKeys) {
    const cookieData = await getMpCookie(key);
    if (cookieData && cookieData.token) {
      console.log(`[WeChat] Found token for key: ${key}`);
      const cookieStr = cookieData.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
      return {
        token: cookieData.token,
        cookieStr,
      };
    }
  }

  console.log('[WeChat] No saved token found, please login via web first');
  return null;
}

// 搜索公众号
export async function searchBiz(keyword: string) {
  try {
    const token = await getWechatToken();
    if (!token) {
      return {
        base_resp: { ret: -1, err_msg: '服务暂未开放，请联系管理员' },
      };
    }

    const params = {
      action: 'search_biz',
      begin: 0,
      count: 5,
      query: keyword,
      token: token.token,
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
    };

    return proxyMpRequest({
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

  updateOrder(orderId, {
    status: 'paid',
    pay_time: paymentTime,
  });

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
  console.log(`[Email] Sending to ${email}: ${subject}`);
  return true;
}

// 处理任务队列
export async function processTaskQueue() {
  let processed = true;

  while (processed) {
    processed = false;
    const pendingTasks = getPendingTasks();

    for (const task of pendingTasks) {
      if (task.status !== 'pending') continue;
      processed = true;

      console.log(`[Task] Processing ${task.type} for order ${task.order_id}`);
      updateTask(task.id, { status: 'processing' });

      try {
        const order = getOrder(task.order_id);
        if (!order) {
          updateTask(task.id, { status: 'failed', error: 'Order not found' });
          continue;
        }

        if (task.type === 'fetch_articles') {
          console.log(`[Fetch] Starting for order ${task.order_id}, biz: ${order.biz_name}`);

          const wechatAuth = await getWechatToken();
          if (!wechatAuth) {
            console.error('[Fetch] No WeChat token found. Please login via web first!');
            updateTask(task.id, { status: 'failed', error: '请先在网页版扫码登录微信' });
            continue;
          }

          console.log(`[Fetch] Searching biz: ${order.biz_name}`);
          const searchParams = {
            action: 'search_biz',
            begin: 0,
            count: 1,
            query: order.biz_name,
            token: wechatAuth.token,
            lang: 'zh_CN',
            f: 'json',
            ajax: '1',
          };

          let searchResp;
          try {
            searchResp = await proxyMpRequest({
              method: 'GET',
              endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
              query: searchParams,
              cookie: wechatAuth.cookieStr,
              parseJson: true,
            });
          } catch (e) {
            console.error('[Fetch] Search biz error:', e);
          }

          let fakeid = null;
          if (searchResp && searchResp.base_resp && searchResp.base_resp.ret === 0 && searchResp.list && searchResp.list.length > 0) {
            fakeid = searchResp.list[0].fakeid;
            console.log(`[Fetch] Found fakeid: ${fakeid}`);
          } else {
            console.error('[Fetch] Cannot find biz, response:', searchResp);
          }

          let articles: any[] = [];

          if (fakeid) {
            console.log(`[Fetch] Fetching articles for fakeid: ${fakeid}`);
            const articleParams = {
              sub: 'list',
              search_field: 'null',
              begin: 0,
              count: 10,
              query: '',
              fakeid: fakeid,
              type: '101_1',
              free_publish_type: 1,
              sub_action: 'list_ex',
              token: wechatAuth.token,
              lang: 'zh_CN',
              f: 'json',
              ajax: 1,
            };

            let articleResp;
            try {
              articleResp = await proxyMpRequest({
                method: 'GET',
                endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
                query: articleParams,
                cookie: wechatAuth.cookieStr,
                parseJson: true,
              });
            } catch (e) {
              console.error('[Fetch] Get articles error:', e);
            }

            if (articleResp && articleResp.base_resp && articleResp.base_resp.ret === 0) {
              const publish_page = JSON.parse(articleResp.publish_page);
              articles = publish_page.publish_list
                .filter((item: any) => !!item.publish_info)
                .flatMap((item: any) => {
                  const publish_info = JSON.parse(item.publish_info);
                  return publish_info.appmsgex;
                });
              console.log(`[Fetch] Got ${articles.length} articles, fetching content...`);

              for (let i = 0; i < articles.length; i++) {
                const article = articles[i];
                if (article.link) {
                  try {
                    console.log(`[Fetch] Fetching article ${i + 1}/${articles.length}: ${article.title}`);
                    const contentResp = await fetch(article.link, {
                      headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Cookie': wechatAuth.cookieStr,
                      },
                    });
                    const html = await contentResp.text();

                    const contentMatch = html.match(/<div class="rich_media_content "[^>]*>([\s\S]*?)<\/div>/);
                    const content = contentMatch ? contentMatch[1] : '<p>无法获取文章内容</p>';

                    articles[i] = {
                      ...article,
                      content: content,
                    };
                  } catch (e) {
                    console.error(`[Fetch] Error fetching article ${article.title}:`, e);
                    articles[i] = {
                      ...article,
                      content: `<p>获取文章内容失败</p>`,
                    };
                  }
                }
              }
              console.log(`[Fetch] All article contents fetched!`);
            }
          }

          if (articles.length === 0) {
            console.log('[Fetch] Using demo articles (no real articles found)');
            articles = [
              { title: '示例文章1', content: '<p>这是文章内容</p>', update_time: Date.now() / 1000 },
              { title: '示例文章2', content: '<p>这是另一篇文章</p>', update_time: Date.now() / 1000 - 86400 },
            ];
          }

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
          console.log(`[EPUB] Starting generate for order ${task.order_id}, biz: ${order.biz_name}`);
          const articles = task.result ? JSON.parse(task.result) : [];
          console.log(`[EPUB] Articles count: ${articles.length}`);

          const epubBuffer = await generateEpub(task.order_id, order.biz_name, articles);
          console.log(`[EPUB] Buffer size: ${epubBuffer.length} bytes`);

          const filePath = join(tmpdir(), `${order.id}.epub`);
          console.log(`[EPUB] Saving to: ${filePath}`);
          const { writeFileSync } = await import('fs');
          writeFileSync(filePath, epubBuffer);
          console.log(`[EPUB] Saved successfully!`);

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
          console.log(`[Email] Starting send for order ${task.order_id}`);
          const filePath = task.result;
          if (!filePath) {
            console.error(`[Email] File path is null for order ${task.order_id}`);
            updateTask(task.id, { status: 'failed', error: '文件路径不存在' });
            continue;
          }
          console.log(`[Email] Reading file: ${filePath}`);
          const { readFileSync } = await import('fs');
          const epubBuffer = readFileSync(filePath);
          console.log(`[Email] File size: ${epubBuffer.length} bytes, sending to: ${order.email}`);

          await sendEmail(
            order.email,
            `${order.biz_name} 文章合集已生成`,
            `您好，您的订单已完成。请查收附件中的电子书。`,
            [epubBuffer]
          );
          console.log(`[Email] Sent successfully for order ${task.order_id}!`);

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
}

// 创建用户公众号关联
export function createUserBizRelation(
  userId: string,
  bizName: string,
  email: string,
  orderId: string
): UserBiz {
  const userBiz: UserBiz = {
    id: uuidv4(),
    user_id: userId,
    biz_name: bizName,
    biz_fakeid: null,
    email,
    order_id: orderId,
    last_sync_at: null,
    article_count: 0,
    status: 'active',
    created_at: Date.now(),
    updated_at: null,
  };

  createUserBiz(userBiz);

  createUserBizTask({
    id: uuidv4(),
    user_biz_id: userBiz.id,
    type: 'sync_articles',
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    created_at: Date.now(),
  });

  return userBiz;
}

// 处理用户公众号任务队列
export async function processUserBizTaskQueue() {
  let processed = true;

  while (processed) {
    processed = false;
    const pendingTasks = getPendingUserBizTasks();

    for (const task of pendingTasks) {
      if (task.status !== 'pending') continue;
      processed = true;

      console.log(`[UserBizTask] Processing ${task.type} for user_biz ${task.user_biz_id}`);
      updateUserBizTask(task.id, { status: 'processing' });

      try {
        const userBiz = getUserBiz(task.user_biz_id);
        if (!userBiz) {
          updateUserBizTask(task.id, { status: 'failed', error: 'UserBiz not found' });
          continue;
        }

        if (task.type === 'sync_articles') {
          console.log(`[UserBizTask] Syncing articles for ${userBiz.biz_name}`);

          const wechatAuth = await getWechatToken();
          if (!wechatAuth) {
            console.error('[UserBizTask] No WeChat token found');
            updateUserBizTask(task.id, { status: 'failed', error: '请先在网页版扫码登录微信' });
            continue;
          }

          const searchParams = {
            action: 'search_biz',
            begin: 0,
            count: 1,
            query: userBiz.biz_name,
            token: wechatAuth.token,
            lang: 'zh_CN',
            f: 'json',
            ajax: '1',
          };

          let searchResp;
          try {
            searchResp = await proxyMpRequest({
              method: 'GET',
              endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
              query: searchParams,
              cookie: wechatAuth.cookieStr,
              parseJson: true,
            });
          } catch (e) {
            console.error('[UserBizTask] Search biz error:', e);
          }

          let fakeid = userBiz.biz_fakeid;
          if (!fakeid && searchResp && searchResp.base_resp && searchResp.base_resp.ret === 0 && searchResp.list && searchResp.list.length > 0) {
            fakeid = searchResp.list[0].fakeid;
            console.log(`[UserBizTask] Found fakeid: ${fakeid}`);
            updateUserBiz(userBiz.id, { biz_fakeid: fakeid });
          }

          let articles: any[] = [];

          if (fakeid) {
            const articleParams = {
              sub: 'list',
              search_field: 'null',
              begin: 0,
              count: 10,
              query: '',
              fakeid: fakeid,
              type: '101_1',
              free_publish_type: 1,
              sub_action: 'list_ex',
              token: wechatAuth.token,
              lang: 'zh_CN',
              f: 'json',
              ajax: 1,
            };

            let articleResp;
            try {
              articleResp = await proxyMpRequest({
                method: 'GET',
                endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
                query: articleParams,
                cookie: wechatAuth.cookieStr,
                parseJson: true,
              });
            } catch (e) {
              console.error('[UserBizTask] Get articles error:', e);
            }

            if (articleResp && articleResp.base_resp && articleResp.base_resp.ret === 0) {
              const publish_page = JSON.parse(articleResp.publish_page);
              articles = publish_page.publish_list
                .filter((item: any) => !!item.publish_info)
                .flatMap((item: any) => {
                  const publish_info = JSON.parse(item.publish_info);
                  return publish_info.appmsgex;
                });
              console.log(`[UserBizTask] Got ${articles.length} articles`);

              for (let i = 0; i < articles.length; i++) {
                const article = articles[i];
                if (article.link) {
                  try {
                    console.log(`[UserBizTask] Fetching article ${i + 1}/${articles.length}: ${article.title}`);
                    const contentResp = await fetch(article.link, {
                      headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Cookie': wechatAuth.cookieStr,
                      },
                    });
                    const html = await contentResp.text();

                    const contentMatch = html.match(/<div class="rich_media_content "[^>]*>([\s\S]*?)<\/div>/);
                    const content = contentMatch ? contentMatch[1] : '<p>无法获取文章内容</p>';

                    articles[i] = {
                      ...article,
                      content: content,
                    };
                  } catch (e) {
                    console.error(`[UserBizTask] Error fetching article ${article.title}:`, e);
                    articles[i] = {
                      ...article,
                      content: `<p>获取文章内容失败</p>`,
                    };
                  }
                }
              }
            }
          }

          if (articles.length === 0) {
            console.log('[UserBizTask] Using demo articles (no real articles found)');
            articles = [
              { title: '示例文章1', content: '<p>这是文章内容</p>', update_time: Date.now() / 1000 },
              { title: '示例文章2', content: '<p>这是另一篇文章</p>', update_time: Date.now() / 1000 - 86400 },
            ];
          }

          updateUserBiz(userBiz.id, {
            last_sync_at: Date.now(),
            article_count: articles.length,
          });

          updateUserBizTask(task.id, {
            status: 'completed',
            progress: 100,
            result: JSON.stringify(articles),
          });

          createUserBizTask({
            id: uuidv4(),
            user_biz_id: userBiz.id,
            type: 'generate_epub',
            status: 'pending',
            progress: 0,
            result: null,
            error: null,
            created_at: Date.now(),
          });
        } else if (task.type === 'generate_epub') {
          console.log(`[UserBizTask] Generating EPUB for ${userBiz.biz_name}`);

          const articles = task.result ? JSON.parse(task.result) : [];
          const epubBuffer = await generateEpub(task.id, userBiz.biz_name, articles);
          console.log(`[UserBizTask] EPUB buffer size: ${epubBuffer.length} bytes`);

          const filePath = join(tmpdir(), `user_biz_${userBiz.id}.epub`);
          const { writeFileSync } = await import('fs');
          writeFileSync(filePath, epubBuffer);
          console.log(`[UserBizTask] EPUB saved to: ${filePath}`);

          updateUserBizTask(task.id, {
            status: 'completed',
            progress: 100,
            result: filePath,
          });

          createUserBizTask({
            id: uuidv4(),
            user_biz_id: userBiz.id,
            type: 'send_email',
            status: 'pending',
            progress: 0,
            result: filePath,
            error: null,
            created_at: Date.now(),
          });
        } else if (task.type === 'send_email') {
          console.log(`[UserBizTask] Sending email for ${userBiz.biz_name}`);

          const filePath = task.result;
          if (!filePath) {
            updateUserBizTask(task.id, { status: 'failed', error: '文件路径不存在' });
            continue;
          }

          const { readFileSync } = await import('fs');
          const epubBuffer = readFileSync(filePath);

          await sendEmail(
            userBiz.email,
            `${userBiz.biz_name} 文章合集已生成`,
            `您好，您的文章合集已生成。请查收附件中的电子书。`,
            [epubBuffer]
          );
          console.log(`[UserBizTask] Email sent successfully!`);

          updateUserBizTask(task.id, { status: 'completed', progress: 100 });
        }
      } catch (e) {
        console.error(`[UserBizTask] Error processing ${task.id}:`, e);
        updateUserBizTask(task.id, { status: 'failed', error: String(e) });
      }
    }
  }
}