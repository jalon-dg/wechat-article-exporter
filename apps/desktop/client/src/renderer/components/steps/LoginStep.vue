<template>
  <div class="step-content">
    <!-- 未激活/激活码输入 -->
    <div v-if="!isLicensed" class="license-container">
      <div class="license-header">
        <div class="license-icon">🔐</div>
        <div class="license-title">软件授权</div>
        <div class="license-subtitle">请输入激活码激活软件</div>
      </div>

      <div class="license-form">
        <input
          v-model="licenseCode"
          type="text"
          class="license-input"
          placeholder="请输入40位激活码"
          maxlength="40"
          @keyup.enter="activate"
        />
        <button
          class="btn btn-primary btn-full"
          :disabled="activating || !licenseCode"
          @click="activate"
        >
          {{ activating ? '激活中...' : '激活' }}
        </button>
      </div>

      <div v-if="licenseError" class="message error">{{ licenseError }}</div>

      <!-- 激活状态展示 -->
      <div v-if="licenseStatus" class="license-status" :class="licenseStatus.valid ? 'valid' : 'invalid'">
        <template v-if="licenseStatus.valid">
          <div class="status-icon">✓</div>
          <div class="status-info">
            <div class="status-title">已激活</div>
            <div class="status-meta">有效期至 {{ formatDate(licenseStatus.expires_at) }}</div>
            <div class="status-meta" v-if="licenseStatus.days_left && licenseStatus.days_left > 0">
              剩余 {{ licenseStatus.days_left }} 天
            </div>
          </div>
          <button class="btn btn-secondary btn-small" @click="handleLogout">解绑</button>
        </template>
        <template v-else>
          <div class="status-icon">✕</div>
          <div class="status-info">
            <div class="status-title">授权失效</div>
            <div class="status-meta">{{ licenseStatus.error }}</div>
          </div>
        </template>
      </div>
    </div>

    <!-- QR Code (已激活但未登录) -->
    <div v-else-if="!isLoggedIn" class="login-container">
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
        <div class="license-badge">
          <span class="badge-icon">✓</span>
          <span>已授权，有效期至 {{ formatDate(licenseStatus?.expires_at) }}</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 13px;">
          已保存登录信息，下次打开将自动登录
        </p>
      </div>

      <div style="display: flex; gap: 12px;">
        <button class="btn btn-secondary" style="flex: 1;" @click="handleLogout">切换账号</button>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer" v-if="isLoggedIn">
    <button class="btn btn-primary btn-full" @click="next">下一步</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';

declare global {
  interface Window {
    electronAPI: {
      getQrcode: () => Promise<any>;
      checkScan: (uuid: string) => Promise<any>;
      confirmLogin: (cookie: string) => Promise<any>;
      getAccount: () => Promise<any>;
      saveAccount: (account: any) => Promise<any>;
      deleteAccount: () => Promise<any>;
      license: {
        getDeviceId: () => Promise<string>;
        activate: (code: string, deviceId: string) => Promise<any>;
        validate: (deviceId: string) => Promise<any>;
        logout: (deviceId: string) => Promise<any>;
      };
    };
  }
}

const emit = defineEmits<{
  next: [];
}>();

// License state
const isLicensed = ref(false);
const licenseCode = ref('');
const licenseError = ref('');
const licenseStatus = ref<{
  valid: boolean;
  expires_at?: string;
  days_left?: number;
  error?: string;
  expired?: boolean;
} | null>(null);
const activating = ref(false);
const deviceId = ref('');

// Login state
const qrcodeUrl = ref('');
const isLoggedIn = ref(false);
const account = ref<any>(null);
const error = ref('');
const scanned = ref(false);

let uuid = '';
let checkInterval: number | null = null;

// License functions
async function getDeviceId() {
  try {
    deviceId.value = await window.electronAPI.license.getDeviceId();
    return deviceId.value;
  } catch (err) {
    console.error('Failed to get device ID:', err);
    throw err;
  }
}

async function checkLicense() {
  try {
    const did = await getDeviceId();
    const result = await window.electronAPI.license.validate(did);
    licenseStatus.value = result;
    isLicensed.value = result.valid;
    return result.valid;
  } catch (err: any) {
    console.error('License check failed:', err);
    licenseError.value = '网络错误，请检查网络连接';
    return false;
  }
}

async function activate() {
  if (!licenseCode.value) return;
  if (!deviceId.value) {
    try {
      await getDeviceId();
    } catch (e) {
      licenseError.value = '无法获取设备 ID';
      return;
    }
  }
  if (!deviceId.value) {
    licenseError.value = '无法获取设备 ID，请重试';
    return;
  }

  activating.value = true;
  licenseError.value = '';

  try {
    const result = await window.electronAPI.license.activate(licenseCode.value.toUpperCase(), deviceId.value);
    if (result.success) {
      isLicensed.value = true;
      licenseStatus.value = {
        valid: true,
        expires_at: result.expires_at,
        days_left: Math.ceil((new Date(result.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      };
      licenseCode.value = '';
    } else {
      licenseError.value = result.error || '激活失败';
    }
  } catch (err: any) {
    licenseError.value = err.message || '激活失败，请稍后重试';
  } finally {
    activating.value = false;
  }
}

async function handleLogout() {
  if (!deviceId.value) {
    deviceId.value = await getDeviceId();
  }

  try {
    await window.electronAPI.license.logout(deviceId.value);
    isLicensed.value = false;
    licenseStatus.value = null;
    licenseCode.value = '';
  } catch (err: any) {
    console.error('Logout failed:', err);
  }
}

// Login functions
async function getQrcode() {
  try {
    error.value = '';
    const result = await window.electronAPI.getQrcode();
    const imgPath = result?.img || result?.qrcode_url;
    if (result && imgPath) {
      const path = String(imgPath);
      qrcodeUrl.value = path.startsWith('http') || path.startsWith('data:') ? path : `https://mp.weixin.qq.com${path}`;
      uuid = result.uuid ?? result.qr_code ?? '';
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
      if (!result) return;
      // 与 Web 一致：4/6=已扫码待确认，1=登录成功带 cookies
      if (result.status === 4 || result.status === 6) {
        scanned.value = true;
      } else if (result.status === 1) {
        scanned.value = false;
        const cookies = result.cookies || result.cookie || '';
        await confirmLogin(cookies);
      } else if (result.status === 2 || result.status === 3) {
        scanned.value = false;
        getQrcode();
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
      const raw = result.redirect_url as string;
      const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://mp.weixin.qq.com');
      const token = url.searchParams.get('token') || '';

      const fakeidMatch = cookie.match(/fakeid=([^;]+)/);
      const fakeid = fakeidMatch ? fakeidMatch[1] : '';

      await window.electronAPI.saveAccount({
        nickname: '公众号',
        fakeid,
        cookie,
        token,
        appmsg_token: '',
        weixin_2021_1: 1,
      });

      isLoggedIn.value = true;
      account.value = { nickname: '公众号' };
      // 扫码登录成功后自动进入下一阶段
      emit('next');
    }
  } catch (err: any) {
    error.value = '登录确认失败，请重试';
    console.error(err);
  }
}

async function doLogout() {
  await window.electronAPI.deleteAccount();
  isLoggedIn.value = false;
  account.value = null;
  getQrcode();
}

function next() {
  emit('next');
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 激活成功后进入扫码登录区域时，自动拉取二维码（onMounted 时若未激活不会调 getQrcode）
watch(
  () => isLicensed.value && !isLoggedIn.value,
  (needQrcode) => {
    if (needQrcode && !qrcodeUrl.value) getQrcode();
  },
  { immediate: true }
);

onMounted(async () => {
  // First check license
  const licensed = await checkLicense();

  if (!licensed) {
    // Not licensed, show license input
    return;
  }

  // Already licensed, check if logged in（二维码由下方 watch 在「已授权且未登录」时统一拉取）
  try {
    const savedAccount = await window.electronAPI.getAccount();
    if (savedAccount) {
      isLoggedIn.value = true;
      account.value = savedAccount;
    }
  } catch (_err) {
    // 忽略，由 watch 拉取二维码
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

/* License styles */
.license-container {
  padding: 20px;
}

.license-header {
  text-align: center;
  margin-bottom: 30px;
}

.license-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.license-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}

.license-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
}

.license-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.license-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  font-family: monospace;
  letter-spacing: 2px;
  text-transform: uppercase;
  background: var(--bg-color);
  color: var(--text-color);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.license-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.license-input::placeholder {
  text-transform: none;
  letter-spacing: normal;
  font-family: inherit;
}

.license-status {
  margin-top: 24px;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  gap: 12px;
}

.license-status.valid {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.license-status.invalid {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.license-status .status-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  flex-shrink: 0;
}

.license-status.valid .status-icon {
  background: #22c55e;
  color: white;
}

.license-status.invalid .status-icon {
  background: #ef4444;
  color: white;
}

.license-status .status-info {
  flex: 1;
}

.license-status .status-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.license-status .status-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.license-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 20px;
  font-size: 12px;
  color: #22c55e;
  margin-bottom: 12px;
}

.license-badge .badge-icon {
  font-size: 12px;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
}
</style>