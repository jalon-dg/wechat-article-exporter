<template>
  <div class="step-content">
    <!-- Search -->
    <div v-if="!isCollecting && !collectComplete">
      <div class="input-group">
        <label>请输入公众号名称</label>
        <input
          type="text"
          class="input"
          v-model="keyword"
          placeholder="输入公众号名称"
          @keyup.enter="search"
        />
      </div>

      <button class="btn btn-primary btn-full" @click="search" :disabled="searching || !keyword">
        {{ searching ? '搜索中...' : '搜索公众号' }}
      </button>

      <div v-if="error" class="message error" style="margin-top: 16px;">{{ error }}</div>

      <!-- Search Results -->
      <div v-if="searchResults.length > 0" style="margin-top: 20px;">
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">搜索结果：</p>

        <div
          v-for="item in searchResults"
          :key="item.fakeid"
          class="account-card"
          @click="startCollect(item)"
        >
          <img class="avatar" :src="item.head_img" :alt="item.nickname" />
          <div class="info">
            <div class="name">{{ item.nickname }}</div>
            <div class="meta">📝 {{ item.article_cnt }} 篇文章</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collecting -->
    <div v-if="isCollecting" class="collecting">
      <div class="result-card" style="justify-content: center; flex-direction: column; text-align: center;">
        <div style="font-size: 18px; margin-bottom: 8px;">正在采集: {{ currentAccount?.nickname }}</div>
        <div style="font-size: 13px; color: var(--text-secondary);">
          {{ progress.current }} / {{ progress.total }} 篇
        </div>
      </div>

      <div class="progress-bar" style="margin: 20px 0;">
        <div class="progress" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <p style="font-size: 13px; color: var(--text-secondary); text-align: center;">
        正在下载: {{ progress.currentTitle }}
      </p>
    </div>

    <!-- Collect Complete -->
    <div v-if="collectComplete && !isCollecting">
      <div class="result-card" style="flex-direction: column; text-align: center; padding: 24px;">
        <div class="icon success" style="font-size: 48px; margin-bottom: 16px;">✓</div>
        <div style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">采集完成！</div>
        <div style="color: var(--text-secondary);">
          已成功采集 {{ articleCount }} 篇文章
        </div>
      </div>

      <div class="card" style="text-align: center;">
        <div style="display: flex; justify-content: space-around;">
          <div>
            <div style="font-size: 24px; font-weight: 500; color: var(--primary-color);">{{ articleCount }}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">文章数</div>
          </div>
          <div>
            <div style="font-size: 24px; font-weight: 500; color: var(--primary-color);">{{ account?.nickname }}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">公众号</div>
          </div>
        </div>
      </div>

      <button class="btn btn-secondary btn-full" @click="reset" style="margin-top: 12px;">
        重新采集
      </button>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer" v-if="!isCollecting">
    <button class="btn btn-secondary" @click="prev">上一步</button>
    <button class="btn btn-primary" :disabled="!collectComplete" @click="next">下一步</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

declare global {
  interface Window {
    electronAPI: {
      getAccount: () => Promise<any>;
      searchBiz: (keyword: string, cookie: string, token: string) => Promise<any>;
      getArticles: (fakeid: string, cookie: string, token: string, appmsgToken: string) => Promise<any>;
      getArticleDetail: (link: string, cookie: string) => Promise<any>;
      saveArticle: (article: any) => Promise<any>;
      clearArticles: () => Promise<any>;
    };
  }
}

const emit = defineEmits<{
  next: [];
  prev: [];
}>();

const keyword = ref('');
const searching = ref(false);
const isCollecting = ref(false);
const collectComplete = ref(false);
const error = ref('');
const searchResults = ref<any[]>([]);
const currentAccount = ref<any>(null);
const account = ref<any>(null);
const articleCount = ref(0);

const progress = ref({
  current: 0,
  total: 0,
  currentTitle: ''
});

const progressPercent = computed(() => {
  if (progress.value.total === 0) return 0;
  return Math.round((progress.value.current / progress.value.total) * 100);
});

async function search() {
  if (!keyword.value || searching.value) return;

  searching.value = true;
  error.value = '';
  searchResults.value = [];

  try {
    const acc = await window.electronAPI.getAccount();
    if (!acc) {
      error.value = '请先登录';
      return;
    }

    account.value = acc;
    const result = await window.electronAPI.searchBiz(keyword.value, acc.cookie, acc.token);

    if (result && result.app_msg_list) {
      searchResults.value = result.app_msg_list;
    } else if (result && result.base_resp && result.base_resp.err_msg === 'ok') {
      // Sometimes the response structure is different
      searchResults.value = result.app_msg_list || [];
    } else {
      error.value = '未找到相关公众号';
    }
  } catch (err: any) {
    error.value = '搜索失败，请重试';
    console.error(err);
  } finally {
    searching.value = false;
  }
}

async function startCollect(biz: any) {
  currentAccount.value = biz;
  isCollecting.value = true;
  error.value = '';
  progress.value = { current: 0, total: 0, currentTitle: '' };

  try {
    const acc = await window.electronAPI.getAccount();
    if (!acc) {
      error.value = '请先登录';
      return;
    }

    // Get article list
    const result = await window.electronAPI.getArticles(
      biz.fakeid,
      acc.cookie,
      acc.token,
      acc.appmsg_token || ''
    );

    if (result && result.app_msg_list) {
      const articles = result.app_msg_list;
      progress.value.total = articles.length;

      // Clear existing articles
      await window.electronAPI.clearArticles();

      // Save each article
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        progress.value.current = i + 1;
        progress.value.currentTitle = article.title || `文章 ${i + 1}`;

        try {
          // Get article detail for content
          let content = '';
          if (article.link) {
            try {
              const detailHtml = await window.electronAPI.getArticleDetail(article.link, acc.cookie);
              // Extract content from HTML (simplified)
              content = article.content || '';
            } catch (e) {
              console.error('Failed to get article detail:', e);
            }
          }

          await window.electronAPI.saveArticle({
            account_id: acc.id,
            fakeid: biz.fakeid,
            title: article.title || '',
            link: article.link || '',
            content,
            author: article.author || '',
            source_url: article.source_url || '',
            cover_image: article.cover || '',
            publish_date: article.update_time ? new Date(article.update_time * 1000).toISOString() : '',
            read_count: article.read_num || 0,
            like_count: article.like_num || 0
          });
        } catch (e) {
          console.error('Failed to save article:', e);
        }
      }

      articleCount.value = articles.length;
      collectComplete.value = true;
    } else {
      error.value = '获取文章列表失败';
    }
  } catch (err: any) {
    error.value = '采集失败，请重试';
    console.error(err);
  } finally {
    isCollecting.value = false;
  }
}

function reset() {
  collectComplete.value = false;
  searchResults.value = [];
  keyword.value = '';
  progress.value = { current: 0, total: 0, currentTitle: '' };
}

function next() {
  emit('next');
}

function prev() {
  emit('prev');
}
</script>

<style scoped>
.collecting {
  padding: 20px 0;
}
</style>