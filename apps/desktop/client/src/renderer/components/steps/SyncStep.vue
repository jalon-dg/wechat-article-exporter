<template>
  <div class="step-content">
    <div class="sync-success">
      <div class="result-card" style="flex-direction: column; text-align: center; padding: 24px;">
        <div class="icon success" style="font-size: 48px; margin-bottom: 16px;">✓</div>
        <div style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">账号已同步</div>
        <div style="color: var(--text-secondary); font-size: 14px;">
          登录信息已就绪，可以开始采集公众号文章
        </div>
      </div>
      <div class="card" v-if="account" style="text-align: center;">
        <div style="font-size: 13px; color: var(--text-secondary);">
          当前账号：{{ account.nickname || '公众号' }}
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <button class="btn btn-secondary" @click="prev">上一步</button>
    <button class="btn btn-primary" @click="next">下一步</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

declare global {
  interface Window {
    electronAPI: {
      getAccount: () => Promise<any>;
    };
  }
}

const emit = defineEmits<{
  next: [];
  prev: [];
}>();

const account = ref<any>(null);

onMounted(async () => {
  try {
    account.value = await window.electronAPI.getAccount();
  } catch (_err) {
    // ignore
  }
});

function next() {
  emit('next');
}

function prev() {
  emit('prev');
}
</script>

<style scoped>
.sync-success {
  padding-top: 20px;
}
</style>
