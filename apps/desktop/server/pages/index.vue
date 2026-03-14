<script setup lang="ts">
const router = useRouter()

onMounted(() => {
  router.replace('/admin/')
})
</script>

<template>
  <div class="flex items-center justify-center min-h-screen">
    <UButton loading>跳转中...</UButton>
  </div>
</template>