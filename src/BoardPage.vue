<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElAlert, ElEmpty } from 'element-plus'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/empty/style/css'
import { readAnnouncements, type Announcement } from './announcements'
import { ApiError } from './request'

const announcements = ref<Announcement[] | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    announcements.value = await readAnnouncements('?view=recent')
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      window.location.replace('/login')
      return
    }
    error.value = cause instanceof Error ? cause.message : '目前無法載入公告。'
  }
})
</script>

<template>
  <main class="page">
    <h1>Board</h1>
    <section aria-labelledby="latest-announcements">
      <h2 id="latest-announcements">最新公告</h2>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      <p v-else-if="!announcements" role="status">載入中…</p>
      <ElEmpty v-else-if="announcements.length === 0" description="目前沒有公告" />
      <div v-else class="panel">
        <ol class="announcements">
          <li v-for="item in announcements" :key="item.id">
            <p class="announcement-text">{{ item.text }}</p>
          </li>
        </ol>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page { margin-block-start: 1rem; }
h2 { font-size: 1.125rem; }
.panel { padding-block: .75rem; }
.announcements { gap: .5rem; }
.announcements li + li {
  border-top: 1px solid #d6e4de;
  padding-block-start: .5rem;
}
.announcement-text { margin: 0; line-height: 1.6; }
</style>
