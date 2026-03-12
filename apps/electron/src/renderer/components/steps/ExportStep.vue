<template>
  <div class="step-content">
    <!-- Export Form -->
    <div v-if="!isExporting && !exportComplete">
      <div class="article-count">
        <span>📝</span>
        <span>已选择 {{ articleCount }} 篇文章</span>
      </div>

      <div class="input-group">
        <label>书名</label>
        <input
          type="text"
          class="input"
          v-model="bookTitle"
          placeholder="微信文章精选"
        />
      </div>

      <div class="input-group">
        <label>作者</label>
        <input
          type="text"
          class="input"
          v-model="author"
          placeholder="公众号名称"
        />
      </div>

      <div class="input-group">
        <label>导出格式</label>
        <div class="format-list">
          <div
            class="format-item"
            :class="{ selected: format === 'epub' }"
            @click="format = 'epub'"
          >
            <div class="format-icon">📖</div>
            <div class="format-name">EPUB</div>
          </div>
          <div
            class="format-item"
            :class="{ selected: format === 'pdf' }"
            @click="format = 'pdf'"
          >
            <div class="format-icon">📄</div>
            <div class="format-name">PDF</div>
          </div>
          <div
            class="format-item"
            :class="{ selected: format === 'docx' }"
            @click="format = 'docx'"
          >
            <div class="format-icon">📝</div>
            <div class="format-name">DOCX</div>
          </div>
        </div>
      </div>

      <div v-if="error" class="message error">{{ error }}</div>
    </div>

    <!-- Exporting -->
    <div v-if="isExporting" class="exporting">
      <div class="result-card" style="justify-content: center; flex-direction: column; text-align: center;">
        <div style="font-size: 18px; margin-bottom: 8px;">📚 正在生成电子书...</div>
        <div style="font-size: 13px; color: var(--text-secondary);">
          {{ progressPercent }}%
        </div>
      </div>

      <div class="progress-bar" style="margin: 20px 0;">
        <div class="progress" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <p style="font-size: 13px; color: var(--text-secondary); text-align: center;">
        正在整合文章内容...
      </p>
    </div>

    <!-- Export Complete -->
    <div v-if="exportComplete" class="export-complete">
      <div class="success-result">
        <div class="icon">✓</div>
        <div class="title">导出成功！</div>
        <div class="message">文件已保存至：{{ savePath }}</div>

        <div class="file-info">
          <div class="item">
            <span>文件名</span>
            <span>{{ fileName }}</span>
          </div>
          <div class="item">
            <span>格式</span>
            <span>{{ format.toUpperCase() }}</span>
          </div>
          <div class="item">
            <span>文章数</span>
            <span>{{ articleCount }} 篇</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer" v-if="!isExporting">
    <template v-if="exportComplete">
      <button class="btn btn-secondary" @click="reset">导出更多</button>
      <button class="btn btn-primary" @click="finish">完成</button>
    </template>
    <template v-else>
      <button class="btn btn-secondary" @click="prev">上一步</button>
      <button class="btn btn-primary" :disabled="isExporting" @click="startExport">开始导出</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import JSZip from 'jszip';

declare global {
  interface Window {
    electronAPI: {
      getArticlesFromDb: () => Promise<any[]>;
      selectSavePath: () => Promise<string>;
      saveFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

const emit = defineEmits<{
  prev: [];
  done: [];
}>();

const bookTitle = ref('微信文章精选');
const author = ref('');
const format = ref<'epub' | 'pdf' | 'docx'>('epub');
const articleCount = ref(0);
const isExporting = ref(false);
const exportComplete = ref(false);
const progressPercent = ref(0);
const savePath = ref('');
const fileName = ref('');
const error = ref('');

const progress = ref(0);

async function loadArticles() {
  try {
    const articles = await window.electronAPI.getArticlesFromDb();
    articleCount.value = articles.length;
  } catch (err) {
    console.error('Failed to load articles:', err);
  }
}

async function startExport() {
  if (isExporting.value) return;

  // Select save path
  const path = await window.electronAPI.selectSavePath();
  if (!path) return;

  savePath.value = path;
  fileName.value = path.split(/[/\\]/).pop() || '微信文章精选.epub';

  isExporting.value = true;
  error.value = '';
  progress.value = 0;

  try {
    const articles = await window.electronAPI.getArticlesFromDb();
    if (articles.length === 0) {
      error.value = '没有可导出的文章';
      return;
    }

    progressPercent.value = 10;

    // Generate file based on format
    let fileData: string;

    if (format.value === 'epub') {
      fileData = await generateEpub(articles);
    } else if (format.value === 'pdf') {
      fileData = await generatePdf(articles);
    } else {
      fileData = await generateDocx(articles);
    }

    progressPercent.value = 90;

    // Save file
    const result = await window.electronAPI.saveFile(path, fileData);

    if (result.success) {
      progressPercent.value = 100;
      exportComplete.value = true;
    } else {
      error.value = result.error || '保存文件失败';
    }
  } catch (err: any) {
    error.value = '导出失败: ' + err.message;
    console.error(err);
  } finally {
    isExporting.value = false;
  }
}

async function generateEpub(articles: any[]): Promise<string> {
  const zip = new JSZip();

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  progressPercent.value = 30;

  // OEBPS/content.opf
  const manifest: string[] = [];
  const spine: string[] = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const id = `article${i}`;
    manifest.push(`    <item id="${id}" href="Text/chap${i}.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`    <itemref idref="${id}"/>`);

    // Convert HTML content to XHTML
    let content = article.content || '';
    // Simple HTML to XHTML conversion
    content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(article.title)}</title>
</head>
<body>
  <h1>${escapeXml(article.title)}</h1>
  ${content}
</body>
</html>`;

    zip.file(`OEBPS/Text/chap${i}.xhtml`, content);
  }

  progressPercent.value = 60;

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(bookTitle.value)}</dc:title>
    <dc:creator>${escapeXml(author.value || '微信公众号')}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:rights>Creative Commons</dc:rights>
  </metadata>
  <manifest>
    ${manifest.join('\n')}
  </manifest>
  <spine>
    ${spine.join('\n')}
  </spine>
</package>`;

  zip.file('OEBPS/content.opf', contentOpf);

  // nav.xhtml
  const navItems = articles.map((a, i) => `<li><a href="Text/chap${i}.xhtml">${escapeXml(a.title)}</a></li>`).join('\n');
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>目录</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
      ${navItems}
    </ol>
  </nav>
</body>
</html>`;

  zip.file('OEBPS/nav.xhtml', nav);
  manifest.push('    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');

  progressPercent.value = 80;

  // Generate zip
  const buffer = await zip.generateAsync({ type: 'base64' });
  return buffer;
}

async function generatePdf(articles: any[]): Promise<string> {
  // For PDF, we'll create a simple HTML file for now
  // In production, you'd use a proper PDF library
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(bookTitle.value)}</title>
  <style>
    body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; padding: 40px; }
    h1 { text-align: center; }
    article { margin-bottom: 40px; page-break-after: always; }
    h2 { color: #333; }
    .meta { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${escapeXml(bookTitle.value)}</h1>`;

  for (const article of articles) {
    html += `
  <article>
    <h2>${escapeXml(article.title)}</h2>
    <div class="meta">作者: ${escapeXml(article.author || '未知')} | 日期: ${article.publish_date || '未知'}</div>
    ${article.content || ''}
  </article>`;
  }

  html += `</body></html>`;

  // Return as base64 - for actual PDF, you'd need a proper converter
  return btoa(unescape(encodeURIComponent(html)));
}

async function generateDocx(articles: any[]): Promise<string> {
  // For DOCX, create a simple HTML file
  // In production, you'd use the docx library properly
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(bookTitle.value)}</title>
  <style>
    body { font-family: "Times New Roman", serif; padding: 40px; }
    h1 { text-align: center; }
    article { margin-bottom: 30px; }
    h2 { color: #333; }
  </style>
</head>
<body>
  <h1>${escapeXml(bookTitle.value)}</h1>
  <p style="text-align:center">作者: ${escapeXml(author.value || '微信公众号')}</p>`;

  for (const article of articles) {
    html += `
  <article>
    <h2>${escapeXml(article.title)}</h2>
    <p style="color:#666;font-size:12px">作者: ${escapeXml(article.author || '未知')} | 发布日期: ${article.publish_date || '未知'}</p>
    ${article.content || ''}
  </article>`;
  }

  html += `</body></html>`;

  return btoa(unescape(encodeURIComponent(html)));
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function reset() {
  exportComplete.value = false;
  savePath.value = '';
  fileName.value = '';
  progress.value = 0;
}

function prev() {
  emit('prev');
}

function finish() {
  emit('done');
}

onMounted(() => {
  loadArticles();
});
</script>

<style scoped>
.exporting,
.export-complete {
  padding: 20px 0;
}
</style>