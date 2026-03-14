<script setup lang="ts">
definePageMeta({ layout: 'default' })

const activeTab = ref('codes')
const username = ref('')
const password = ref('')
const isLoggedIn = ref(false)

const generateCount = ref(1)
const generatedCodes = ref<string[]>([])
const generateLoading = ref(false)
const codes = ref<any[]>([])
const codesLoading = ref(false)
const devices = ref<any[]>([])
const devicesLoading = ref(false)
const error = ref('')
const copiedId = ref<string | number | null>(null)

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function login() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  isLoggedIn.value = true
  error.value = ''
  await loadData()
}

async function loadData() {
  if (!isLoggedIn.value) return
  await Promise.all([loadCodes(), loadDevices()])
}

async function loadCodes() {
  codesLoading.value = true
  try {
    const res = await $fetch('/api/license/list', {
      query: { username: username.value, password: password.value },
    })
    if (res.success) codes.value = res.codes
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    codesLoading.value = false
  }
}

async function loadDevices() {
  devicesLoading.value = true
  try {
    const res = await $fetch('/api/license/devices', {
      query: { username: username.value, password: password.value },
    })
    if (res.success) devices.value = res.devices
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    devicesLoading.value = false
  }
}

async function generateCodes() {
  generateLoading.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/license/generate', {
      method: 'POST',
      body: { username: username.value, password: password.value, count: generateCount.value },
    })
    if (res.success) {
      generatedCodes.value = res.codes.map((c: any) => c.code)
      await loadCodes()
    } else {
      error.value = res.error || '生成失败'
    }
  } catch (e: any) {
    error.value = e.message || '生成失败'
  } finally {
    generateLoading.value = false
  }
}

async function toggleCode(id: number, currentStatus: string) {
  const action = currentStatus === 'disabled' ? 'enable' : 'disable'
  try {
    const res = await $fetch('/api/license/toggle', {
      method: 'POST',
      query: { username: username.value, password: password.value },
      body: { id, action },
    })
    if (res.success) await loadCodes()
    else error.value = res.error || '操作失败'
  } catch (e: any) {
    error.value = e.message || '操作失败'
  }
}

async function copyCode(code: string, id: string | number) {
  await navigator.clipboard.writeText(code)
  copiedId.value = id
  setTimeout(() => { copiedId.value = null }, 2000)
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = { unused: '未使用', used: '已使用', disabled: '已禁用' }
  return map[status] ?? status
}

function getStatusColor(status: string) {
  switch (status) {
    case 'unused': return 'success'
    case 'used': return 'warning'
    case 'disabled': return 'error'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- 登录 -->
    <div v-if="!isLoggedIn" class="flex min-h-[60vh] items-center justify-center">
      <div class="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/50">
        <h2 class="mb-1 text-center text-xl font-semibold text-slate-800">管理员登录</h2>
        <p class="mb-6 text-center text-sm text-slate-500">使用管理员账号登录以管理激活码</p>
        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700">用户名</label>
            <UInput
              v-model="username"
              placeholder="默认 admin"
              size="lg"
              class="rounded-lg"
              :ui="{ rounded: 'rounded-lg' }"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700">密码</label>
            <UInput
              v-model="password"
              type="password"
              placeholder="默认 admin123"
              size="lg"
              class="rounded-lg"
              :ui="{ rounded: 'rounded-lg' }"
            />
          </div>
          <UAlert v-if="error" color="error" :message="error" class="rounded-lg" />
          <UButton
            block
            size="lg"
            color="primary"
            class="mt-2 rounded-lg font-medium"
            @click="login"
          >
            登录
          </UButton>
        </div>
      </div>
    </div>

    <!-- 已登录：标签 + 内容 -->
    <template v-else>
      <!-- 标签 -->
      <div class="flex gap-1 rounded-xl bg-slate-100/80 p-1">
        <button
          type="button"
          class="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          :class="activeTab === 'codes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'"
          @click="activeTab = 'codes'"
        >
          激活码管理
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          :class="activeTab === 'devices' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'"
          @click="activeTab = 'devices'"
        >
          设备列表
        </button>
      </div>

      <!-- 激活码管理 -->
      <div v-if="activeTab === 'codes'" class="space-y-6">
        <!-- 生成区域 -->
        <div class="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <h3 class="mb-4 text-base font-semibold text-slate-800">生成激活码</h3>
          <div class="flex flex-wrap items-end gap-4">
            <div class="min-w-[120px]">
              <label class="mb-1.5 block text-sm font-medium text-slate-600">数量</label>
              <UInputNumber v-model="generateCount" :min="1" :max="50" size="md" class="rounded-lg" />
            </div>
            <UButton
              color="primary"
              size="md"
              :loading="generateLoading"
              class="rounded-lg font-medium"
              @click="generateCodes"
            >
              生成
            </UButton>
          </div>
          <div v-if="generatedCodes.length" class="mt-5 space-y-2">
            <p class="text-sm font-medium text-slate-600">本次生成的激活码</p>
            <div class="space-y-2">
              <div
                v-for="(code, i) in generatedCodes"
                :key="code"
                class="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
              >
                <code class="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{{ code }}</code>
                <UButton
                  size="xs"
                  variant="soft"
                  color="primary"
                  class="shrink-0 rounded-md"
                  @click="copyCode(code, `gen-${i}`)"
                >
                  {{ copiedId === `gen-${i}` ? '已复制' : '复制' }}
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- 激活码列表 -->
        <div class="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h3 class="text-base font-semibold text-slate-800">激活码列表</h3>
            <UButton size="sm" variant="soft" color="neutral" class="rounded-lg" @click="loadCodes">
              刷新
            </UButton>
          </div>
          <UAlert v-if="error" color="error" :message="error" class="mx-6 mt-4 rounded-lg" />
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-slate-100 bg-slate-50/60">
                  <th class="px-6 py-3 text-left font-medium text-slate-600">ID</th>
                  <th class="px-6 py-3 text-left font-medium text-slate-600">激活码</th>
                  <th class="px-6 py-3 text-left font-medium text-slate-600">状态</th>
                  <th class="px-6 py-3 text-left font-medium text-slate-600">使用时间</th>
                  <th class="px-6 py-3 text-left font-medium text-slate-600">过期时间</th>
                  <th class="px-6 py-3 text-left font-medium text-slate-600">设备ID</th>
                  <th class="px-6 py-3 text-left font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="codesLoading" class="border-b border-slate-100">
                  <td colspan="7" class="px-6 py-12 text-center text-slate-500">加载中…</td>
                </tr>
                <tr
                  v-else-if="!codes.length"
                  class="border-b border-slate-100"
                >
                  <td colspan="7" class="px-6 py-12 text-center text-slate-500">暂无激活码</td>
                </tr>
                <tr
                  v-for="row in codes"
                  :key="row.id"
                  class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                >
                  <td class="px-6 py-3 text-slate-700">{{ row.id }}</td>
                  <td class="max-w-[200px] px-6 py-3">
                    <div class="flex items-center gap-2">
                      <code class="truncate font-mono text-xs text-slate-700">{{ row.code }}</code>
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        class="shrink-0"
                        @click="copyCode(row.code, row.id)"
                      >
                        {{ copiedId === row.id ? '已复制' : '复制' }}
                      </UButton>
                    </div>
                  </td>
                  <td class="px-6 py-3">
                    <UBadge :color="getStatusColor(row.status)" size="sm" variant="subtle">
                      {{ getStatusLabel(row.status) }}
                    </UBadge>
                  </td>
                  <td class="px-6 py-3 text-slate-600">{{ formatDate(row.used_at) }}</td>
                  <td class="px-6 py-3 text-slate-600">{{ formatShortDate(row.expires_at) }}</td>
                  <td class="px-6 py-3">
                    <span v-if="row.device_id" class="font-mono text-xs text-slate-600">{{ row.device_id.slice(0, 8) }}…</span>
                    <span v-else class="text-slate-400">—</span>
                  </td>
                  <td class="px-6 py-3">
                    <UButton
                      size="xs"
                      :variant="row.status === 'disabled' ? 'soft' : 'solid'"
                      :color="row.status === 'disabled' ? 'success' : 'error'"
                      class="rounded-md"
                      @click="toggleCode(row.id, row.status)"
                    >
                      {{ row.status === 'disabled' ? '启用' : '禁用' }}
                    </UButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 设备列表 -->
      <div v-if="activeTab === 'devices'" class="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 class="text-base font-semibold text-slate-800">已激活设备</h3>
          <UButton size="sm" variant="soft" color="neutral" class="rounded-lg" @click="loadDevices">
            刷新
          </UButton>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 bg-slate-50/60">
                <th class="px-6 py-3 text-left font-medium text-slate-600">设备ID</th>
                <th class="px-6 py-3 text-left font-medium text-slate-600">激活码</th>
                <th class="px-6 py-3 text-left font-medium text-slate-600">IP地址</th>
                <th class="px-6 py-3 text-left font-medium text-slate-600">绑定时间</th>
                <th class="px-6 py-3 text-left font-medium text-slate-600">过期时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="devicesLoading" class="border-b border-slate-100">
                <td colspan="5" class="px-6 py-12 text-center text-slate-500">加载中…</td>
              </tr>
              <tr v-else-if="!devices.length" class="border-b border-slate-100">
                <td colspan="5" class="px-6 py-12 text-center text-slate-500">暂无设备</td>
              </tr>
              <tr
                v-for="row in devices"
                :key="row.device_id"
                class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
              >
                <td class="px-6 py-3 font-mono text-xs text-slate-700">{{ row.device_id.slice(0, 12) }}…</td>
                <td class="px-6 py-3 font-mono text-xs text-slate-700">{{ row.code }}</td>
                <td class="px-6 py-3 text-slate-600">{{ row.ip_address || '—' }}</td>
                <td class="px-6 py-3 text-slate-600">{{ formatDate(row.bound_at) }}</td>
                <td class="px-6 py-3 text-slate-600">{{ formatShortDate(row.expires_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
