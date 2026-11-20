<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { ElButton } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import { board, features, menu, navigation, pages, transactionPage, transactionTotalPage } from '../shared/pages.ts'
import AnnouncementsPage from './AnnouncementsPage.vue'
import BoardPage from './BoardPage.vue'
import LedgerPage from './LedgerPage.vue'
import { ApiError, renewalPath, request } from './request'

const route = shallowRef(new URL(window.location.href))
const current = computed(() => pages.find(({ path }) => path === route.value.pathname) ?? board)
const activePage = computed(() => current.value.path === transactionTotalPage.path ? transactionPage : current.value)
const content = ref<HTMLElement | null>(null)
const error = ref('')
const signingOut = ref(false)

function readLocation() {
  route.value = new URL(window.location.href)
}

function navigate(path: string) {
  if (new URL(path, window.location.href).href === window.location.href) return
  window.history.pushState(null, '', path)
  readLocation()
}

async function followLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const link = event.currentTarget as HTMLAnchorElement
  if (link.href === window.location.href) return
  navigate(link.href)
  await nextTick()
  content.value?.focus({ preventScroll: true })
  window.scrollTo(0, 0)
}

onMounted(() => window.addEventListener('popstate', readLocation))
onUnmounted(() => window.removeEventListener('popstate', readLocation))

async function logout() {
  signingOut.value = true
  error.value = ''
  try {
    await request('/api/sessions/current', 'DELETE')
    window.location.replace('/login')
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) window.location.replace('/login')
    else error.value = '目前無法登出，請稍後再試。'
  } finally {
    signingOut.value = false
  }
}

watch(current, async (page, _previousPage, onCleanup) => {
  document.title = page.label + ' · 海獺盒子'
  error.value = ''
  if (page.path !== menu.path) return
  let leftMenu = false
  onCleanup(() => { leftMenu = true })
  try {
    await request(renewalPath, 'POST')
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) window.location.replace('/login')
    else if (!leftMenu) error.value = '目前無法更新登入效期，請稍後再試。'
  }
}, { immediate: true })
</script>

<template>
  <header class="app-header">
    <a :href="board.path" aria-label="海獺盒子，Board 首頁" @click="followLink">
      <img src="/icons/otter-32.png" width="32" height="32" alt="">
      <span>海獺盒子</span>
    </a>
    <ElButton :loading="signingOut" @click="logout">登出</ElButton>
  </header>
  <div class="app-layout">
    <nav class="app-navigation" aria-label="主要導覽">
      <a
        v-for="page in navigation"
        :key="page.path"
        :href="page.path"
        :aria-current="page.path === activePage.path ? 'page' : undefined"
        @click="followLink"
      >{{ page.label }}</a>
    </nav>
    <div ref="content" class="app-content" tabindex="-1">
      <p v-if="error" class="page" role="alert">{{ error }}</p>
      <BoardPage v-if="current.path === board.path" />
      <AnnouncementsPage v-else-if="current.path === '/announcements'" />
      <LedgerPage v-else-if="activePage.path === transactionPage.path" :route="route" @navigate="navigate" />
      <main v-else class="page">
        <h1>功能表</h1>
        <ul class="feature-list">
          <li v-for="feature in features" :key="feature.path">
            <a class="panel" :href="feature.path" @click="followLink">{{ feature.label }} <span aria-hidden="true">›</span></a>
          </li>
        </ul>
      </main>
    </div>
  </div>
</template>
