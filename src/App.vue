<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElButton } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import { board, features, menu, navigation, pages, transactionPage, transactionTotalPage } from '../shared/pages.ts'
import AnnouncementsPage from './AnnouncementsPage.vue'
import BoardPage from './BoardPage.vue'
import LedgerPage from './LedgerPage.vue'
import { ApiError, renewalPath, request } from './request'

const current = pages.find(({ path }) => path === window.location.pathname) ?? board
const activePage = current.path === transactionTotalPage.path ? transactionPage : current
const error = ref('')
const signingOut = ref(false)
document.title = current.label + ' · 海獺盒子'

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

onMounted(async () => {
  if (current.path !== menu.path) return
  try {
    await request(renewalPath, 'POST')
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) window.location.replace('/login')
    else error.value = '目前無法更新登入效期，請稍後再試。'
  }
})
</script>

<template>
  <header class="app-header">
    <a :href="board.path" aria-label="海獺盒子，Board 首頁">
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
      >{{ page.label }}</a>
    </nav>
    <div class="app-content">
      <p v-if="error" class="page" role="alert">{{ error }}</p>
      <BoardPage v-if="current.path === board.path" />
      <AnnouncementsPage v-else-if="current.path === '/announcements'" />
      <LedgerPage v-else-if="activePage.path === transactionPage.path" />
      <main v-else class="page">
        <h1>功能表</h1>
        <ul class="feature-list">
          <li v-for="feature in features" :key="feature.path">
            <a class="panel" :href="feature.path">{{ feature.label }} <span aria-hidden="true">›</span></a>
          </li>
        </ul>
      </main>
    </div>
  </div>
</template>
