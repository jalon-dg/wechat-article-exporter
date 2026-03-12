<template>
  <div class="step-content">
    <!-- QR Code -->
    <div v-if="!isLoggedIn" class="login-container">
      <div class="qrcode-area">
        <div class="qrcode-icon">📱</div>
        <div class="qrcode-img" v-if="qrcodeUrl">
          <img :src="qrcodeUrl" alt="登录二维码" />
        </div>
        <div v-else class="loading">
          <div class="spinner"></div>
        </div>
      </div>

      <p class="login-tip">请用微信扫码登录</p>
      <p class="login-subtip">登录后可采集公众号文章</p>

      <div v-if="error" class="message error">{{ error }}</div>

      <div v-if="scanned" class="message success">扫码成功，请在手机上确认登录</div>
    </div>

    <!-- Logged In -->
    <div v-else class="login-success">
      <div class="result-card">
        <div class="icon success">✓</div>
        <div class="info">
          <div class="name">登录成功！</div>
          <div class="meta">欢迎回来，{{ account?.nickname || '用户' }}</div>
        </div>
      </div>

      <div class="card">
        <p style="color: var(--text-secondary); font-size: 13px;">
          已保存登录信息，下次打开将自动登录
        </p>
      </div>

      <div style="display: flex; gap: 12px;">
        <button class="btn btn-secondary" style="flex: 1;" @click="logout">切换账号</button>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer" v-if="isLoggedIn">
    <button class="btn btn-primary btn-full" @click="next">下一步</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

declare global {
  interface Window {
    electronAPI: {
      getQrcode: () => Promise<any>;
      checkScan: (uuid: string) => Promise<any>;
      confirmLogin: (cookie: string) => Promise<any>;
      getAccount: () => Promise<any>;
      saveAccount: (account: any) => Promise<any>;
      deleteAccount: () => Promise<any>;
    };
  }
}

const emit = defineEmits<{
  next: [];
}>();

const qrcodeUrl = ref('');
const isLoggedIn = ref(false);
const account = ref<any>(null);
const error = ref('');
const scanned = ref(false);

let uuid = '';
let checkInterval: number | null = null;

async function getQrcode() {
  try {
    error.value = '';
    const result = await window.electronAPI.getQrcode();
    if (result && result.img) {
      qrcodeUrl.value = `https://mp.weixin.qq.com${result.img}`;
      uuid = result.uuid;
      startCheck();
    } else {
      error.value = '获取二维码失败，请重试';
    }
  } catch (err: any) {
    error.value = '网络错误，请检查网络连接';
    console.error(err);
  }
}

function startCheck() {
  if (checkInterval) return;

  checkInterval = window.setInterval(async () => {
    if (!uuid) return;

    try {
      const result = await window.electronAPI.checkScan(uuid);
      if (result && result.status === 1) {
        // Scanned, waiting for confirm
        scanned.value = true;
      } else if (result && result.status === 2) {
        // Confirmed - get cookies and save
        scanned.value = false;
        const cookies = result.cookies || '';
        await confirmLogin(cookies);
      }
    } catch (err) {
      console.error('Check scan error:', err);
    }
  }, 2000);
}

function stopCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

async function confirmLogin(cookie: string) {
  stopCheck();

  try {
    const result = await window.electronAPI.confirmLogin(cookie);
    if (result && result.redirect_url) {
      // Parse token from redirect_url
      const url = new URL(result.redirect_url);
      const token = url.searchParams.get('token') || '';

      // Get user info from cookie
      const fakeidMatch = cookie.match(/fakeid=([^;]+)/);
      const fakeid = fakeidMatch ? fakeidMatch[1] : '';

      // Save account
      await window.electronAPI.saveAccount({
        nickname: '公众号',
        fakeid,
        cookie,
        token,
        appmsg_token: '',
        weixin_2021_1: 1
      });

      isLoggedIn.value = true;
      account.value = { nickname: '公众号' };
    }
  } catch (err: any) {
    error.value = '登录确认失败，请重试';
    console.error(err);
  }
}

async function logout() {
  await window.electronAPI.deleteAccount();
  isLoggedIn.value = false;
  account.value = null;
  getQrcode();
}

function next() {
  emit('next');
}

onMounted(async () => {
  // Check if already logged in
  try {
    const savedAccount = await window.electronAPI.getAccount();
    if (savedAccount) {
      isLoggedIn.value = true;
      account.value = savedAccount;
    } else {
      getQrcode();
    }
  } catch (err) {
    getQrcode();
  }
});

onUnmounted(() => {
  stopCheck();
});
</script>

<style scoped>
.login-container {
  text-align: center;
}

.qrcode-area {
  margin: 20px 0;
}

.qrcode-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.qrcode-img img {
  width: 180px;
  height: 180px;
  border: 1px solid var(--border-color);
}

.login-tip {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
}

.login-subtip {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.login-success {
  padding-top: 20px;
}
</style>