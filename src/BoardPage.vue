<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElEmpty } from 'element-plus'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/empty/style/css'
import { readAnnouncements, type Announcement } from './announcements'
import { ApiError, request } from './request'
import { parsePrice, transactionCollection } from './transactions'

const announcements = ref<Announcement[] | null>(null)
const error = ref('')
const name = ref('')
const priceInput = ref('')
const saving = ref(false)
const saved = ref(false)
const expenseError = ref('')
const nameField = ref<HTMLInputElement | null>(null)

async function saveExpense() {
  if (saving.value || !name.value.trim()) return
  saving.value = true
  saved.value = false
  expenseError.value = ''
  try {
    await request(transactionCollection, 'POST', {
      name: name.value.trim(),
      price: parsePrice(priceInput.value),
      occurredAt: new Date().toISOString(),
    })
    name.value = ''
    priceInput.value = ''
    saved.value = true
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      window.location.replace('/login')
      return
    }
    expenseError.value = cause instanceof Error ? cause.message : '目前無法新增支出。'
  } finally {
    saving.value = false
  }
  if (saved.value) {
    await nextTick()
    nameField.value?.focus()
  }
}

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
  <main class="page management-page">
    <h1>Board</h1>
    <section class="board-section" aria-labelledby="latest-announcements">
      <h2 id="latest-announcements">最新公告</h2>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      <p v-else-if="!announcements" role="status">載入中…</p>
      <ElEmpty v-else-if="announcements.length === 0" description="目前沒有公告" />
      <div v-else class="panel announcements-panel">
        <ol class="announcements">
          <li v-for="item in announcements" :key="item.id">
            <p class="announcement-text">{{ item.text }}</p>
          </li>
        </ol>
      </div>
    </section>
    <section class="board-section" aria-labelledby="quick-expense-title">
      <h2 id="quick-expense-title">快速記帳</h2>
      <form class="panel panel-form quick-expense" aria-labelledby="quick-expense-title" :aria-busy="saving" @submit.prevent="saveExpense">
        <label class="form-field">名稱
          <input ref="nameField" v-model="name" name="name" maxlength="500" required :disabled="saving">
        </label>
        <label class="form-field">價格（NT$）
          <input v-model="priceInput" name="price" inputmode="decimal" required :disabled="saving">
        </label>
        <div class="actions">
          <ElButton type="primary" native-type="submit" :loading="saving" :disabled="!name.trim() || !priceInput.trim()">新增</ElButton>
        </div>
        <p v-if="saved" class="expense-status" role="status">已新增支出。</p>
        <ElAlert v-if="expenseError" :title="expenseError" type="error" :closable="false" class="expense-status" />
      </form>
    </section>
  </main>
</template>

<style scoped>
.board-section > h2 { font-size: 1.125rem; margin: 0 0 .75rem; }
.board-section + .board-section { margin-block-start: 1rem; }
.quick-expense { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.quick-expense .expense-status { grid-column: 1 / -1; }
.expense-status { margin: 0; }
@media (min-width: 43rem) {
  .quick-expense { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto; align-items: end; }
}
.announcements-panel { padding-block: .75rem; }
.announcements { gap: .5rem; }
.announcements li + li {
  border-top: 1px solid #d6e4de;
  padding-block-start: .5rem;
}
.announcement-text { margin: 0; line-height: 1.6; }
</style>
