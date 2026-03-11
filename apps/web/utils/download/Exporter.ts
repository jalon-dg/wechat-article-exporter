import dayjs from 'dayjs';
import JSZip from 'jszip';
import mime from 'mime';
import TurndownService from 'turndown';
import { filterInvalidFilenameChars, sleep } from '#shared/utils/helpers';
import usePreferences from '~/composables/usePreferences';
import { getArticleByLink } from '~/store/v2/article';
import { getHtmlCache, type HtmlAsset } from '~/store/v2/html';
import { getAccountNameByFakeid, getAllInfo, type MpAccount } from '~/store/v2/info';
import { getMetadataCache } from '~/store/v2/metadata';
import { getResourceCache, updateResourceCache } from '~/store/v2/resource';
import { getResourceMapCache, updateResourceMapCache } from '~/store/v2/resource-map';
import type { Preferences } from '~/types/preferences';
import { getArticleComments, renderComments } from '~/utils/comment';
import { BaseDownloader } from '~/utils/download/BaseDownloader';
import { type ExcelExportEntity, export2ExcelFile, export2JsonFile } from '~/utils/exporter';
import type { DownloadOptions } from './types';

// 导出类型
type ExportType = 'excel' | 'json' | 'html' | 'txt' | 'markdown' | 'word' | 'pdf' | 'epub';

const preferences: Ref<Preferences> = usePreferences() as unknown as Ref<Preferences>;

export class Exporter extends BaseDownloader {
  private exportType: ExportType = 'html';
  private allAccountInfo: MpAccount[] = [];

  // 导出的根目录
  private exportRootDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private readonly resources: Set<{ url: string; fakeid: string }>;

  constructor(urls: string[], options: DownloadOptions = {}) {
    super(urls, options);
    this.resources = new Set();
  }

  // 启动导出任务
  public async startExport(type: ExportType = 'html') {
    if (this.isRunning) {
      throw new Error('导出任务正在运行中，无需重复启动');
    }

    if (['html', 'txt', 'markdown', 'word', 'pdf', 'epub'].includes(type)) {
      // 这些类型需要实时写入文件系统，提前初始化导出目录句柄
      try {
        await this.acquireExportDirectoryHandle();
      } catch (err) {
        console.error(err);
        return;
      }
    }

    this.exportType = type;
    this.isRunning = true;
    const start = Date.now();
    this.emit('export:begin');

    this.allAccountInfo = await getAllInfo();

    try {
      if (this.exportType === 'excel') {
        await this.exportExcelFiles();
      } else if (this.exportType === 'json') {
        await this.exportJsonFiles();
      } else if (this.exportType === 'html') {
        // 1. 提取出所有html中需要下载的资源链接
        await this.extractResources();
        this.emit('export:download', this.resources.size);

        // 2. 采用队列下载 resources 资源
        await this.processExportQueue();

        // 3. 替换html中的资源路径，并写入文件系统
        await this.exportHtmlFiles();
      } else if (this.exportType === 'txt') {
        await this.exportTxtFiles();
      } else if (this.exportType === 'word') {
        await this.exportWordFiles();
      } else if (this.exportType === 'markdown') {
        await this.exportMarkdownFiles();
      } else if (this.exportType === 'epub') {
        await this.exportEpubFiles();
      } else if (this.exportType === 'pdf') {
        await this.exportPdfFiles();
      }
    } finally {
      this.isRunning = false;
      const elapse = Math.round((Date.now() - start) / 1000);
      this.emit('export:finish', elapse);
      this.cancelAllPending();
    }
  }

  // 提取出 html 中的子资源，并保存在 resource-map 表中
  private async extractResources(): Promise<void> {
    const parser = new DOMParser();

    for (const url of this.urls) {
      const article = await getArticleByLink(url);
      if (!article) {
        continue;
      }

      const cached = await getHtmlCache(url);
      if (!cached) {
        console.warn(`文章(url: ${url} )的 html 还未下载，不能导出`);
        continue;
      }

      const html = await cached.file.text();
      const document = parser.parseFromString(html, 'text/html');

      // 该 html 内部的资源，包括图片、背景图片、样式
      const resources: string[] = [];

      // 提取图片地址
      const imgs = document.querySelectorAll<HTMLImageElement>('img');
      for (const img of imgs) {
        const imgUrl = img.getAttribute('src') || img.getAttribute('data-src');
        if (imgUrl) {
          resources.push(imgUrl);
          this.resources.add({ url: imgUrl, fakeid: article.fakeid });
        }
      }

      // 提取样式地址
      const links = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
      for (const link of links) {
        const url = link.href;
        if (url) {
          resources.push(url);
          this.resources.add({ url: url, fakeid: article.fakeid });
        }
      }

      // 提取背景图片地址
      html.replaceAll(
        /((?:background|background-image): url\((?:&quot;)?)((?:https?|\/\/)[^)]+?)((?:&quot;)?\))/gs,
        (_, p1, url, p3) => {
          resources.push(url);
          this.resources.add({ url: url, fakeid: article.fakeid });
          return `${p1}${url}${p3}`;
        }
      );

      await updateResourceMapCache({
        fakeid: article.fakeid,
        url: url,
        resources: resources,
      });
    }
  }

  // 处理导出任务队列
  private async processExportQueue() {
    const activePromises: Promise<any>[] = [];
    const resources = [...this.resources];

    while (resources.length > 0 || activePromises.length > 0) {
      // 检查是否需要启动新的下载任务，需同时满足以下两点:
      // - 没有达到并发量限制
      // - 还有更多 URL 需要下载
      while (activePromises.length < this.options.concurrency && resources.length > 0) {
        // 启动新的下载任务
        const resource: { url: string; fakeid: string } = resources.pop()!;
        const promise = this.downloadResourceTask(resource.url, resource.fakeid);
        activePromises.push(promise);
        promise.finally(() => {
          const index = activePromises.indexOf(promise);
          if (index > -1) {
            activePromises.splice(index, 1);
          }

          // 下载任务结束，触发通知
          this.emit('export:download:progress', resource.url, this.completed.has(resource.url), this.getStatus());
        });
      }

      // 等待任何活动任务完成
      if (activePromises.length > 0) {
        await Promise.race(activePromises);
      }
    }
  }

  // 下载资源任务
  private async downloadResourceTask(url: string, fakeid: string): Promise<void> {
    this.pending.add(url);

    // 检查缓存是否可用，避免重复下载相同资源
    const cached = await getResourceCache(url);
    if (cached) {
      this.pending.delete(url);
      this.completed.add(url);
      return;
    }

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      const proxy = this.proxyManager.getBestProxy();

      try {
        const blob = await this.download(fakeid, url, proxy);
        await updateResourceCache({
          fakeid: fakeid,
          url: url,
          file: blob,
        });
        this.pending.delete(url);
        this.completed.add(url);
        this.proxyManager.recordSuccess(proxy);
        return;
      } catch (error) {
        await this.handleDownloadFailure(proxy, url, attempt, error);
      }
    }

    this.pending.delete(url);
    this.failed.add(url);
  }

  // 导出 excel 文件
  private async exportExcelFiles(): Promise<void> {
    const total = this.urls.length;
    this.emit('export:total', total);

    const parser = new DOMParser();
    const data: ExcelExportEntity[] = [];

    for (let i = 0; i < total; i++) {
      const url = this.urls[i];
      console.debug(`(${i + 1}/${total})开始导出: ${url}`);

      const article = await getArticleByLink(url);
      const accountName = await getAccountNameByFakeid(article.fakeid);
      const exportedArticle: ExcelExportEntity = { ...article, _accountName: accountName };
      if (preferences.value.exportConfig.exportExcelIncludeContent) {
        exportedArticle.content = await this.getPureContent(url, 'text', parser);
      }
      const metadata = await getMetadataCache(url);
      if (metadata) {
        exportedArticle.readNum = metadata.readNum;
        exportedArticle.oldLikeNum = metadata.oldLikeNum;
        exportedArticle.shareNum = metadata.shareNum;
        exportedArticle.likeNum = metadata.likeNum;
        exportedArticle.commentNum = metadata.commentNum;
      }
      data.push(exportedArticle);

      this.emit('export:progress', i + 1);
    }

    await export2ExcelFile(data, '微信公众号文章');
  }

  // 导出 json 文件
  private async exportJsonFiles(): Promise<void> {
    const total = this.urls.length;
    this.emit('export:total', total);

    const parser = new DOMParser();
    const data: ExcelExportEntity[] = [];

    for (let i = 0; i < total; i++) {
      const url = this.urls[i];
      console.log(`(${i + 1}/${total})开始导出: ${url}`);

      const article = await getArticleByLink(url);
      const accountName = await getAccountNameByFakeid(article.fakeid);
      const exportedArticle: ExcelExportEntity = { ...article, _accountName: accountName };

      if (preferences.value.exportConfig.exportJsonIncludeContent) {
        exportedArticle.content = await this.getPureContent(url, 'text', parser);
      }
      const metadata = await getMetadataCache(url);
      if (metadata) {
        exportedArticle.readNum = metadata.readNum;
        exportedArticle.oldLikeNum = metadata.oldLikeNum;
        exportedArticle.shareNum = metadata.shareNum;
        exportedArticle.likeNum = metadata.likeNum;
        exportedArticle.commentNum = metadata.commentNum;
      }
      if (preferences.value.exportConfig.exportJsonIncludeComments) {
        // 包含评论
        exportedArticle.comments = await getArticleComments(url);
      }
      data.push(exportedArticle);

      this.emit('export:progress', i + 1);
    }

    await export2JsonFile(data, '微信公众号文章');
  }

  // 导出 html 文件
  private async exportHtmlFiles() {
    const total = this.urls.length;
    console.log(`总共${total}篇文章`);
    this.emit('export:write', total);

    for (let i = 0; i < total; i++) {
      const url = this.urls[i];
      const cached = await getHtmlCache(url);
      if (!cached) {
        console.warn(`文章(url: ${url} )的 html 还未下载，不能导出`);
        continue;
      }

      const dirname = await this.exportDirName(cached.url);

      console.log(`(${i + 1}/${total})开始导出: ${cached.title}，目录名: ${dirname}`);
      const html = await cached.file.text();
      const resourceMap = await getResourceMapCache(url);
      if (!resourceMap) {
        console.warn(`文章(url: ${url} )的 resource-map 缺失，无法导出`);
        continue;
      }

      const urlmap = new Map<string, string>();
      for (const resourceUrl of resourceMap.resources) {
        const resource = await getResourceCache(resourceUrl);
        if (!resource) {
          continue;
        }

        const uuid = new Date().getTime() + Math.random().toString();
        const ext = mime.getExtension(resource.file.type);
        if (ext) {
          await this.writeFile(dirname + `/assets/${uuid}.${ext}`, resource.file);
          urlmap.set(resourceUrl, `./assets/${uuid}.${ext}`);
        }
      }

      const finalHtml = await this.normalizeHtml(cached, html, urlmap);
      const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });

      await this.writeFile(dirname + '/index.html', blob);
      this.emit('export:write:progress', i + 1);
    }
    await sleep(100);
  }

  // 导出 txt 文件
  private async exportTxtFiles() {
    const total = this.urls.length;
    this.emit('export:total', total);

    const parser = new DOMParser();

    for (let i = 0; i < total; i++) {
      const url = this.urls[i];

      const filename = await this.exportDirName(url);
      console.log(`(${i + 1}/${total})开始导出: ${filename}(${url})`);

      const content = await this.getPureContent(url, 'text', parser);
      if (!content) {
        continue;
      }

      const blob = new Blob([content], { type: 'text/plain' });
      await this.writeFile(filename + '.txt', blob);
      this.emit('export:progress', i + 1);
    }
    await sleep(100);
  }

  // 导出 markdown 文件
  private async exportMarkdownFiles() {
    const total = this.urls.length;
    this.emit('export:total', total);

    const parser = new DOMParser();
    const turndownService = new TurndownService();

    for (let i = 0; i < total; i++) {
      const url = this.urls[i];

      const filename = await this.exportDirName(url);
      console.log(`(${i + 1}/${total})开始导出: ${filename}(${url})`);

      const content = await this.getPureContent(url, 'html', parser);
      if (!content) {
        continue;
      }
      const markdown = turndownService.turndown(content);

      const blob = new Blob([markdown], { type: 'text/markdown' });
      await this.writeFile(filename + '.md', blob);
      this.emit('export:progress', i + 1);
    }
    await sleep(100);
  }

  // 导出 word 文件
  private async exportWordFiles() {
    const total = this.urls.length;
    this.emit('export:total', total);

    const parser = new DOMParser();

    for (let i = 0; i < total; i++) {
      const url = this.urls[i];

      const filename = await this.exportDirName(url);
      console.log(`(${i + 1}/${total})开始导出: ${filename}(${url})`);

      const content = await this.getPureContent(url, 'html', parser);
      if (!content) {
        continue;
      }
      const blob = window.htmlDocx.asBlob(content) as Blob;

      await this.writeFile(filename + '.docx', blob);
      this.emit('export:progress', i + 1);
    }
    await sleep(100);
  }

  // 导出 pdf 文件
  private async exportPdfFiles() {}

  // 导出电子书（EPUB）：用 Markdown 生成正文，每篇文章为一章，按发布时间倒序（最新在前），不含图片
  private async exportEpubFiles() {
    const parser = new DOMParser();
    const turndownService = new TurndownService();

    // 1. 按文章发布时间倒序（从晚到早）排序
    const articlesWithUrl: { url: string; article: Awaited<ReturnType<typeof getArticleByLink>> }[] = [];
    for (const url of this.urls) {
      try {
        const article = await getArticleByLink(url);
        articlesWithUrl.push({ url, article });
      } catch {
        console.warn(`文章 ${url} 不存在，跳过`);
      }
    }
    articlesWithUrl.sort((a, b) => b.article.update_time - a.article.update_time);

    const total = articlesWithUrl.length;
    if (total === 0) {
      throw new Error('没有可导出的文章');
    }
    this.emit('export:total', total);

    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    const oebps = zip.folder('OEBPS')!;
    const textFolder = oebps.folder('Text')!;

    const manifestItems: string[] = [];
    const spineItems: string[] = [];
    const chapterTitles: string[] = [];
    let bookTitle = '微信公众号文章合集';
    const firstAccount = this.allAccountInfo.find(a => a.fakeid === articlesWithUrl[0]!.article.fakeid);
    if (firstAccount?.nickname) {
      bookTitle = `${firstAccount.nickname} 文章合集`;
    }
    bookTitle = bookTitle.replace(/[<>"&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' })[c]!);

    // 生成一张带有电子书名称的大字 SVG 作为封面
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
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    // 将一行 Markdown 文本里的 **加粗** 转成 <strong> 标签，其余内容正常转义
    const inlineMarkdownToHtml = (text: string): string => {
      const strongReg = /\*\*([^*]+)\*\*/g;
      let lastIndex = 0;
      let result = '';
      let match: RegExpExecArray | null;

      while ((match = strongReg.exec(text)) !== null) {
        // 普通文本
        if (match.index > lastIndex) {
          result += escapeXml(text.slice(lastIndex, match.index));
        }
        // 加粗文本
        const boldInner = match[1] ?? '';
        result += `<strong>${escapeXml(boldInner)}</strong>`;
        lastIndex = match.index + match[0].length;
      }

      // 剩余尾部文本
      if (lastIndex < text.length) {
        result += escapeXml(text.slice(lastIndex));
      }

      return result;
    };

    const markdownToSimpleHtml = (md: string): string => {
      const lines = md.split('\n');
      const htmlLines: string[] = [];
      let buffer: string[] = [];

      const flushParagraph = () => {
        if (!buffer.length) return;
        const text = buffer.join(' ').trim();
        if (text) {
          htmlLines.push(`<p>${inlineMarkdownToHtml(text)}</p>`);
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
            htmlLines.push(`<h${level}>${inlineMarkdownToHtml(text)}</h${level}>`);
          }
          continue;
        }

        buffer.push(line);
      }

      flushParagraph();
      return htmlLines.join('\n');
    };

    for (let i = 0; i < articlesWithUrl.length; i++) {
      const { url, article } = articlesWithUrl[i]!;
      const chapterId = `chapter_${String(i + 1).padStart(3, '0')}`;
      const xhtmlPath = `Text/${chapterId}.xhtml`;

      // 获取正文 HTML，用 Turndown 转为 Markdown，再用简单规则转为结构清爽的 HTML，并删除图片
      let htmlContent = await this.getPureContent(url, 'html', parser);
      let markdown = '';
      if (htmlContent) {
        markdown = turndownService.turndown(htmlContent);
        // 删除所有图片：![alt](url) 或 ![alt](url "title")
        markdown = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
      }
      if (!markdown) {
        markdown = '（该文章内容无法导出）';
      }
      const contentHtml = markdownToSimpleHtml(markdown);

      const title = (article.title || '无标题').replace(/[<>"&]/g, c =>
        ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' })[c]!
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
      this.emit('export:progress', i + 1);
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
${chapterTitles
  .map(
    (t, index) =>
      `      <li><a href="Text/chapter_${String(index + 1).padStart(3, '0')}.xhtml">${t}</a></li>`
  )
  .join('\n')}
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

    const epubBlob = await zip.generateAsync({ type: 'blob' });
    const safeTitle = (firstAccount?.nickname || '微信公众号文章').replace(/[/\\:*?"<>|]/g, '_').slice(0, 100);
    await this.writeFile(`${safeTitle}.epub`, epubBlob);
    await sleep(100);
  }

  private async getPureContent(url: string, format: 'html' | 'text', parser: DOMParser): Promise<string> {
    const cached = await getHtmlCache(url);
    if (!cached) {
      console.warn(`文章(url: ${url} )的 html 还未下载，不能导出其内容`);
      return '';
    }

    const html = await cached.file.text();
    const document = parser.parseFromString(html, 'text/html');
    const $jsArticleContent = document.querySelector('#js_article')!;
    // 删除无用dom元素
    $jsArticleContent.querySelector('#js_top_ad_area')?.remove();
    $jsArticleContent.querySelector('#js_tags_preview_toast')?.remove();
    $jsArticleContent.querySelector('#content_bottom_area')?.remove();
    $jsArticleContent.querySelectorAll('script').forEach(el => {
      el.remove();
    });
    $jsArticleContent.querySelector('#js_pc_qr_code')?.remove();
    $jsArticleContent.querySelector('#wx_stream_article_slide_tip')?.remove();

    // 图片懒加载：将 data-src 回填到 src，便于导出
    const imgs = $jsArticleContent.querySelectorAll<HTMLImageElement>('img');
    imgs.forEach(img => {
      const src = img.getAttribute('src');
      const dataSrc = img.getAttribute('data-src');
      if (!src && dataSrc) {
        img.setAttribute('src', dataSrc);
      }
    });

    // 文本分享消息补充
    const $js_text_desc = $jsArticleContent.querySelector('#js_text_desc') as HTMLElement | null;
    if ($js_text_desc && !$js_text_desc.innerHTML.trim()) {
      const textContentMatch = html.match(
        /var\s+TextContentNoEncode\s*=\s*window\.a_value_which_never_exists\s*\|\|\s*(?<value>'[^']*')/s
      );
      const contentMatch = html.match(
        /var\s+ContentNoEncode\s*=\s*window\.a_value_which_never_exists\s*\|\|\s*(?<value>'[^']*')/s
      );

      let desc: string | null = null;
      const assignFromMatch = (match: RegExpMatchArray | null, key: string) => {
        if (match && match.groups && match.groups.value) {
          const code = `window.${key} = ${match.groups.value}`;
          // eslint-disable-next-line no-eval
          eval(code);
          // @ts-ignore
          return (window as any)[key] as string;
        }
        return null;
      };

      desc = assignFromMatch(textContentMatch, '__WX_TEXT_NO_ENCODE__');
      if (!desc) {
        desc = assignFromMatch(contentMatch, '__WX_CONTENT_NO_ENCODE__');
      }

      if (desc) {
        desc = desc.replace(/\r/g, '').replace(/\n/g, '<br>');
        $js_text_desc.innerHTML = desc;
      }
    }

    if (format === 'html') {
      return $jsArticleContent.outerHTML;
    } else if (format === 'text') {
      return ($jsArticleContent as HTMLElement).innerText!.replace(/\s+/g, ' ').trim();
    } else {
      return '';
    }
  }

  static async getHtmlContent(url: string) {
    const parser = new DOMParser();
    const exporter = new Exporter([]);
    return exporter.getPureContent(url, 'html', parser);
  }

  // 调整最终的 html
  private async normalizeHtml(
    cachedHtml: HtmlAsset,
    html: string,
    urlmap: Map<string, string> = new Map()
  ): Promise<string> {
    // 替换背景图片为本地路径
    // 背景图片无法用选择器选中并修改，因此只能用正则进行匹配替换
    html = html.replaceAll(
      /((?:background|background-image): url\((?:&quot;)?)((?:https?|\/\/)[^)]+?)((?:&quot;)?\))/gs,
      (_, p1, url, p3) => {
        if (urlmap.has(url)) {
          const path = urlmap.get(url)!;
          return `${p1}./${path}${p3}`;
        } else {
          console.warn('背景图片丢失: ', url);
          return `${p1}${url}${p3}`;
        }
      }
    );

    const parser = new DOMParser();
    const document = parser.parseFromString(html, 'text/html');
    const $jsArticleContent = document.querySelector('#js_article')!;

    // #js_content 默认是不可见的(通过js修改为可见)，需要移除该样式
    $jsArticleContent.querySelector('#js_content')?.removeAttribute('style');

    // 删除无用dom元素
    $jsArticleContent.querySelector('#js_top_ad_area')?.remove();
    $jsArticleContent.querySelector('#js_tags_preview_toast')?.remove();
    $jsArticleContent.querySelector('#content_bottom_area')?.remove();
    $jsArticleContent.querySelectorAll('script').forEach(el => {
      el.remove();
    });
    $jsArticleContent.querySelector('#js_pc_qr_code')?.remove();
    $jsArticleContent.querySelector('#wx_stream_article_slide_tip')?.remove();

    let bodyCls = document.body.className;

    // 渲染发布时间
    function __setPubTime(oriTimestamp: number, dom: HTMLElement) {
      const dateObj = new Date(oriTimestamp * 1000);
      const padStart = function padStart(v: number) {
        return '0'.concat(v.toString()).slice(-2);
      };
      const year = dateObj.getFullYear().toString();
      const month = padStart(dateObj.getMonth() + 1);
      const date = padStart(dateObj.getDate());
      const hour = padStart(dateObj.getHours());
      const minute = padStart(dateObj.getMinutes());
      const timeString = ''.concat(hour, ':').concat(minute);
      const dateString = ''.concat(year, '年').concat(month, '月').concat(date, '日');
      const showDate = ''.concat(dateString, ' ').concat(timeString);

      if (dom) {
        dom.innerText = showDate;
      }
    }
    const pubTimeMatchResult = html.match(/var oriCreateTime = '(?<date>\d+)'/);
    if (pubTimeMatchResult && pubTimeMatchResult.groups && pubTimeMatchResult.groups.date) {
      __setPubTime(parseInt(pubTimeMatchResult.groups.date), document.getElementById('publish_time')!);
    }

    // 渲染ip属地
    function getIpWoridng(ipConfig: any) {
      let ipWording = '';
      if (parseInt(ipConfig.countryId, 10) === 156) {
        ipWording = ipConfig.provinceName;
      } else if (ipConfig.countryId) {
        ipWording = ipConfig.countryName;
      }
      return ipWording;
    }
    const ipWrp = document.getElementById('js_ip_wording_wrp')!;
    const ipWording = document.getElementById('js_ip_wording')!;
    const ipWordingMatchResult = html.match(/window\.ip_wording = (?<data>{\s+countryName: '[^']+',[^}]+})/s);
    if (ipWrp && ipWording && ipWordingMatchResult && ipWordingMatchResult.groups && ipWordingMatchResult.groups.data) {
      const json = ipWordingMatchResult.groups.data;
      // eslint-disable-next-line no-eval
      eval('window.ip_wording = ' + json);
      const ipWordingDisplay = getIpWoridng((window as any).ip_wording);
      if (ipWordingDisplay !== '') {
        ipWording.innerHTML = ipWordingDisplay;
        ipWrp.style.display = 'inline-block';
      }
    }

    // 渲染 标题已修改
    function __setTitleModify(isTitleModified: boolean) {
      const wrp = document.getElementById('js_title_modify_wrp')!;
      const titleModifyNode = document.getElementById('js_title_modify')!;
      if (!wrp) return;
      if (isTitleModified) {
        titleModifyNode.innerHTML = '标题已修改';
        wrp.style.display = 'inline-block';
      } else {
        wrp.parentNode?.removeChild(wrp);
      }
    }
    const titleModifiedMatchResult = html.match(/window\.isTitleModified = "(?<data>\d*)" \* 1;/);
    if (titleModifiedMatchResult && titleModifiedMatchResult.groups && titleModifiedMatchResult.groups.data) {
      __setTitleModify(titleModifiedMatchResult.groups.data === '1');
    }

    // 文章引用
    const js_share_source = document.getElementById('js_share_source');
    const contentTpl = document.getElementById('content_tpl');
    if (js_share_source && contentTpl) {
      const html = contentTpl.innerHTML
        .replace(/<img[^>]*>/g, '<p>[图片]</p>')
        .replace(
          /<iframe [^>]*?class=\"res_iframe card_iframe js_editor_card\"[^>]*?data-cardid=[\'\"][^\'\"]*[^>]*?><\/iframe>/gi,
          '<p>[卡券]</p>'
        )
        .replace(/<mpvoice([^>]*?)js_editor_audio([^>]*?)><\/mpvoice>/g, '<p>[语音]</p>')
        .replace(/<mpgongyi([^>]*?)js_editor_gy([^>]*?)><\/mpgongyi>/g, '<p>[公益]</p>')
        .replace(/<qqmusic([^>]*?)js_editor_qqmusic([^>]*?)><\/qqmusic>/g, '<p>[音乐]</p>')
        .replace(/<mpshop([^>]*?)js_editor_shop([^>]*?)><\/mpshop>/g, '<p>[小店]</p>')
        .replace(/<iframe([^>]*?)class=[\'\"][^\'\"]*video_iframe([^>]*?)><\/iframe>/g, '<p>[视频]</p>')
        .replace(/(<iframe[^>]*?js_editor_vote_card[^<]*?<\/iframe>)/gi, '<p>[投票]</p>')
        .replace(/<mp-weapp([^>]*?)weapp_element([^>]*?)><\/mp-weapp>/g, '<p>[小程序]</p>')
        .replace(/<mp-miniprogram([^>]*?)><\/mp-miniprogram>/g, '<p>[小程序]</p>')
        .replace(/<mpproduct([^>]*?)><\/mpproduct>/g, '<p>[商品]</p>')
        .replace(/<mpcps([^>]*?)><\/mpcps>/g, '<p>[商品]</p>');
      const div = document.createElement('div');
      div.innerHTML = html;
      let content = div.innerText;
      content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
      if (content.length > 140) {
        content = content.substr(0, 140) + '...';
      }
      const digest = content.split('\n').map(function (line) {
        return '<p>' + line + '</p>';
      });
      document.getElementById('js_content')!.innerHTML = digest.join('');

      // 替换url
      const sourceURL = js_share_source.getAttribute('data-url');
      if (sourceURL) {
        const link = document.createElement('a');
        link.href = sourceURL;
        link.className = js_share_source.className;
        link.innerHTML = js_share_source.innerHTML;
        js_share_source.replaceWith(link);
      }
    }

    // 渲染阅读量
    const metadata = await getMetadataCache(cachedHtml.url);
    const $interaction_bar = document.querySelector('#js_article_bottom_bar .interaction_bar');
    if ($interaction_bar) {
      $interaction_bar.insertAdjacentHTML(
        'afterbegin',
        '<button id="js_temp_sns_sc_readnum_btn" aria-labelledby="js_a11y_zan_btn_txt readNum" style="-webkit-text-size-adjust:  100% ;" class="sns_opr_btn sns_view_btn weui-wa-hotarea js_wx_tap_highlight wx_tap_link">' +
          `<span class="sns_opr_gap" aria-hidden="true" id="js_bar_readnum_btn">${metadata?.readNum}</span></button>`
      );
    }

    // 渲染留言
    let commentHTML = '';
    if ((preferences.value as Preferences).exportConfig.exportHtmlIncludeComments) {
      commentHTML = await renderComments(cachedHtml.url);
    }

    // 文本分享消息
    const $js_text_desc = $jsArticleContent.querySelector('#js_text_desc') as HTMLElement | null;
    if ($js_text_desc) {
      // 文本分享页面样式
      bodyCls += ' page_share_text';

      // 顶部作者栏
      const qmtplTextMatchResult = html.match(/(?<code>window\.__QMTPL_SSR_DATA__\s*=\s*\{.+?};)/s);
      if (qmtplTextMatchResult && qmtplTextMatchResult.groups && qmtplTextMatchResult.groups.code) {
        const code = qmtplTextMatchResult.groups.code;
        // eslint-disable-next-line no-eval
        eval(code);
        const data = (window as any).__QMTPL_SSR_DATA__;
        if (data && typeof data.title === 'string' && !$js_text_desc.innerHTML.trim()) {
          let text = data.title as string;
          text = text.replace(/\r/g, '').replace(/\n/g, '<br>');
          $js_text_desc.innerHTML = text;
        }
        $jsArticleContent.querySelector('#js_top_profile')?.classList.remove('profile_area_hide');
      }

      // 正文内容
      if (!$js_text_desc.innerHTML.trim()) {
        const textContentMatch = html.match(
          /var\s+TextContentNoEncode\s*=\s*window\.a_value_which_never_exists\s*\|\|\s*(?<value>'[^']*')/s
        );
        const contentMatch = html.match(
          /var\s+ContentNoEncode\s*=\s*window\.a_value_which_never_exists\s*\|\|\s*(?<value>'[^']*')/s
        );

        let desc: string | null = null;
        const assignFromMatch = (match: RegExpMatchArray | null, key: string) => {
          if (match && match.groups && match.groups.value) {
            const code = `window.${key} = ${match.groups.value}`;
            // eslint-disable-next-line no-eval
            eval(code);
            // @ts-ignore
            return (window as any)[key] as string;
          }
          return null;
        };

        desc = assignFromMatch(textContentMatch, '__WX_TEXT_NO_ENCODE__');
        if (!desc) {
          desc = assignFromMatch(contentMatch, '__WX_CONTENT_NO_ENCODE__');
        }

        if (desc) {
          desc = desc.replace(/\r/g, '').replace(/\n/g, '<br>');
          $js_text_desc.innerHTML = desc;
        }
      }
    }

    // 图片分享消息
    const $js_image_desc = $jsArticleContent.querySelector('#js_image_desc');
    if ($js_image_desc) {
      bodyCls += 'pages_skin_pc page_share_img';

      function decode_html(data: string, encode: boolean) {
        const replace = [
          '&#39;',
          "'",
          '&quot;',
          '"',
          '&nbsp;',
          ' ',
          '&gt;',
          '>',
          '&lt;',
          '<',
          '&yen;',
          '¥',
          '&amp;',
          '&',
        ];
        const replaceReverse = [
          '&',
          '&amp;',
          '¥',
          '&yen;',
          '<',
          '&lt;',
          '>',
          '&gt;',
          ' ',
          '&nbsp;',
          '"',
          '&quot;',
          "'",
          '&#39;',
        ];

        let target = encode ? replaceReverse : replace;
        let str = data;
        for (let i = 0; i < target.length; i += 2) {
          str = str.replace(new RegExp(target[i], 'g'), target[i + 1]);
        }
        return str;
      }

      const qmtplMatchResult = html.match(/(?<code>window\.__QMTPL_SSR_DATA__\s*=\s*\{.+?)<\/script>/s);
      if (qmtplMatchResult && qmtplMatchResult.groups && qmtplMatchResult.groups.code) {
        const code = qmtplMatchResult.groups.code;
        eval(code);
        const data = (window as any).__QMTPL_SSR_DATA__;
        let desc = data.desc.replace(/\r/g, '').replace(/\n/g, '<br>').replace(/\s/g, '&nbsp;');
        desc = decode_html(desc, false);
        $js_image_desc.innerHTML = desc;

        $jsArticleContent.querySelector('#js_top_profile')!.classList.remove('profile_area_hide');
      }
      const pictureMatchResult = html.match(/(?<code>window\.picture_page_info_list\s*=.+\.slice\(0,\s*20\);)/s);
      if (pictureMatchResult && pictureMatchResult.groups && pictureMatchResult.groups.code) {
        const code = pictureMatchResult.groups.code;
        eval(code);
        const picture_page_info_list = (window as any).picture_page_info_list;
        const containerEl = $jsArticleContent.querySelector('#js_share_content_page_hd')!;
        let innerHTML =
          '<div style="display: flex;flex-direction: column;align-items: center;gap: 10px;padding-block: 20px;">';
        for (const picture of picture_page_info_list) {
          innerHTML += `<img src="${picture.cdn_url}" alt="" style="display: block;border: 1px solid gray;border-radius: 5px;max-width: 90%;" onclick="window.open(this.src, '_blank', 'popup')" />`;
        }
        innerHTML += '</div>';
        containerEl.innerHTML = innerHTML;
      }
    }

    // 替换图片路径为本地路径
    const imgs = document.querySelectorAll<HTMLImageElement>('img');
    for (const img of imgs) {
      const imgUrl = img.getAttribute('src') || img.getAttribute('data-src');
      if (imgUrl && urlmap.has(imgUrl)) {
        img.src = urlmap.get(imgUrl)!;
      }
    }

    // 所有图片都替换完成后，重新解析得到最终的主内容和bottom内容
    const newDocument = parser.parseFromString(document.documentElement.outerHTML, 'text/html');
    const pageContentHTML = newDocument.querySelector('#js_article')!.outerHTML;
    const jsArticleBottomBarHTML = newDocument.querySelector('#js_article_bottom_bar')?.outerHTML;

    // 替换样式路径为本地路径
    let localLinks: string = '';
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
    for (const link of links) {
      let linkUrl = link.href;
      if (linkUrl && urlmap.has(linkUrl)) {
        localLinks += `<link rel="stylesheet" href="${urlmap.get(linkUrl)}">\n`;
      }
    }

    return `<!DOCTYPE html>
<html lang="zh_CN">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0,viewport-fit=cover">
    <title>${cachedHtml.title}</title>
    ${localLinks}
    <style>
        #page-content,
        #js_article_bottom_bar,
        .__page_content__ {
            max-width: 667px;
            margin: 0 auto;
        }
        img {
            max-width: 100%;
        }
        .sns_opr_btn::before {
            width: 16px;
            height: 16px;
            margin-right: 3px;
        }
    </style>
</head>
<body class="${bodyCls}">
${pageContentHTML}
${jsArticleBottomBarHTML}

<!-- 评论数据 -->
${commentHTML}
</body>
</html>`;
  }

  // 获取文件存储目录
  private async acquireExportDirectoryHandle(): Promise<void> {
    if (!this.exportRootDirectoryHandle) {
      // 检查是否在 Electron 环境中运行
      if (window.electronAPI) {
        // 在 Electron 中使用保存对话框选择目录
        const result = await window.electronAPI.showOpenDialog({
          title: '选择导出目录',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) {
          throw new Error('未选择导出目录');
        }
        // 将路径存储为字符串（自定义类型标记为 Electron 目录）
        this.exportRootDirectoryHandle = result.filePaths[0] as unknown as FileSystemDirectoryHandle;
      } else {
        // 在浏览器中使用 FileSystemDirectoryHandle API
        // @ts-ignore
        this.exportRootDirectoryHandle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'downloads',
        });
      }
    }
  }

  // 写入文件
  public async writeFile(path: string, file: Blob): Promise<void> {
    // 检查是否在 Electron 环境中运行
    if (window.electronAPI && typeof this.exportRootDirectoryHandle === 'string') {
      // Electron 模式：使用 fs API 写入文件
      const basePath = this.exportRootDirectoryHandle as string;
      const fullPath = path.includes('/') || path.includes('\\')
        ? path
        : `${basePath}/${path}`;

      // 将 Blob 转换为 base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const result = await window.electronAPI.writeFileFromBlob(fullPath, base64, file.type);
      if (!result.success) {
        throw new Error(`写入文件失败: ${result.error}`);
      }
    } else {
      // 浏览器模式：使用 FileSystemDirectoryHandle API
      const segment = path.split('/');
      const filename = segment[segment.length - 1];
      let directory = this.exportRootDirectoryHandle as FileSystemDirectoryHandle;
      if (segment.length > 1) {
        // 创建目录
        for (const name of segment.slice(0, -1)) {
          directory = await directory.getDirectoryHandle(name, { create: true }).catch(e => {
            console.warn(`路径(${path})(${name})中包含非法字符，不能作为文件系统的路径名`);
            throw e;
          });
        }
      }
      const fileHandle = await directory.getFileHandle(filename, { create: true });
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
    }
  }

  // 确定导出文件的目录名
  private async exportDirName(articleUrl: string): Promise<string> {
    let dirnameTpl = (preferences.value as Preferences).exportConfig.dirname;
    const maxlength = (preferences.value as Preferences).exportConfig.maxlength;

    const article = await getArticleByLink(articleUrl);
    const articleUpdateTime = dayjs.unix(article.update_time);
    const account = this.allAccountInfo.find(account => account.fakeid === article.fakeid);
    if (account && account.nickname) {
      dirnameTpl = dirnameTpl.replace(/\$\{account}/g, filterInvalidFilenameChars(account.nickname));
    }

    dirnameTpl = dirnameTpl.replace(/\$\{title}/g, filterInvalidFilenameChars(article.title));
    dirnameTpl = dirnameTpl.replace(/\$\{aid}/g, article.aid);
    dirnameTpl = dirnameTpl.replace(/\$\{author}/g, article.author_name);
    dirnameTpl = dirnameTpl.replace(/\$\{YYYY}/g, articleUpdateTime.format('YYYY'));
    dirnameTpl = dirnameTpl.replace(/\$\{MM}/g, articleUpdateTime.format('MM'));
    dirnameTpl = dirnameTpl.replace(/\$\{DD}/g, articleUpdateTime.format('DD'));
    dirnameTpl = dirnameTpl.replace(/\$\{HH}/g, articleUpdateTime.format('HH'));
    dirnameTpl = dirnameTpl.replace(/\$\{mm}/g, articleUpdateTime.format('mm'));

    if (maxlength) {
      return dirnameTpl.slice(0, maxlength);
    }
    return dirnameTpl;
  }
}
