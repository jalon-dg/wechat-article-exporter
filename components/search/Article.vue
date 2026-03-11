<template>
  <form @submit.prevent="search">
    <UInput
      icon="i-heroicons-magnifying-glass-20-solid"
      color="white"
      v-model="query"
      size="md"
      class="focus-within:w-[300px] w-[200px] transition-all duration-300 ease-in-out"
      :trailing="false"
      :placeholder="'搜索文章标题 (' + metaSymbol + '+K)'"
      ref="inputRef"
    />
  </form>
</template>

<script setup lang="ts">
const query = defineModel<string>();
const emit = defineEmits(['search']);
const { metaSymbol } = useShortcuts();
const inputRef = ref();

function search() {
  emit('search', query.value);
}

function handleKeydown(event: KeyboardEvent) {
  const isMac = /mac/i.test(navigator.platform);
  const isMeta = isMac ? event.metaKey : event.ctrlKey;

  if (isMeta && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    inputRef.value?.input?.focus();
    return;
  }

  if (event.key === 'Escape') {
    inputRef.value?.input?.blur();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
