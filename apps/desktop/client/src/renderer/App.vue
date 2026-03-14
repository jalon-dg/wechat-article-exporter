<template>
  <div class="app">
    <!-- Title Bar -->
    <div class="title-bar">
      <span class="title">微信文章导出器</span>
      <div class="controls">
        <button class="btn-min" @click="minimize">─</button>
        <button class="btn-close" @click="close">×</button>
      </div>
    </div>

    <!-- Step Indicator -->
    <div class="step-indicator">
      <div class="steps">
        <div class="step" :class="{ active: currentStep === 1, completed: currentStep > 1 }">
          <span class="step-num">1</span>
          <span>登录</span>
        </div>
        <div class="step-line" :class="{ completed: currentStep > 1 }"></div>
        <div class="step" :class="{ active: currentStep === 2, completed: currentStep > 2 }">
          <span class="step-num">2</span>
          <span>同步</span>
        </div>
        <div class="step-line" :class="{ completed: currentStep > 2 }"></div>
        <div class="step" :class="{ active: currentStep === 3, completed: currentStep > 3 }">
          <span class="step-num">3</span>
          <span>采集</span>
        </div>
        <div class="step-line" :class="{ completed: currentStep > 3 }"></div>
        <div class="step" :class="{ active: currentStep === 4 }">
          <span class="step-num">4</span>
          <span>导出</span>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <LoginStep v-if="currentStep === 1" @next="goToStep(2)" :key="stepKeys[0]" />
      <SyncStep v-if="currentStep === 2" @next="goToStep(3)" @prev="goToStep(1)" :key="stepKeys[1]" />
      <CollectStep v-if="currentStep === 3" @next="goToStep(4)" @prev="goToStep(2)" :key="stepKeys[2]" />
      <ExportStep v-if="currentStep === 4" @prev="goToStep(3)" @done="finish" :key="stepKeys[3]" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import CollectStep from './components/steps/CollectStep.vue';
import ExportStep from './components/steps/ExportStep.vue';
import LoginStep from './components/steps/LoginStep.vue';
import SyncStep from './components/steps/SyncStep.vue';

declare global {
  interface Window {
    electronAPI: {
      minimize: () => Promise<void>;
      close: () => Promise<void>;
      startDrag: () => Promise<void>;
      getAccount: () => Promise<any>;
      deleteAccount: () => Promise<any>;
    };
  }
}

const currentStep = ref(1);
const stepKeys = ref([0, 1, 2, 3]);

function goToStep(step: number) {
  currentStep.value = step;
  stepKeys.value[step - 1]++;
}

function minimize() {
  window.electronAPI?.minimize();
}

function close() {
  window.electronAPI?.close();
}

function finish() {
  currentStep.value = 1;
  stepKeys.value = [0, 1, 2, 3];
}

onMounted(async () => {
  // Check if already logged in
  try {
    const account = await window.electronAPI?.getAccount();
    if (account) {
      // 已登录：跳到同步步骤（步骤 2）
      currentStep.value = 2;
    }
  } catch (error) {
    console.error('Failed to check account:', error);
  }
});
</script>

<style scoped>
.app {
  width: 420px;
  height: 600px;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
}
</style>