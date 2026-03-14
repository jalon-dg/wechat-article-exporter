<template>
  <div class="admin-layout min-h-screen bg-slate-50">
    <header class="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <h1 class="text-lg font-semibold tracking-tight text-slate-800">
          激活码管理
        </h1>
        <div class="flex items-center gap-3">
          <slot name="header-actions" />
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-8">
      <slot />
    </main>
  </div>
</template>
