<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElForm, ElFormItem, ElInput, ElPopconfirm } from 'element-plus'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/popconfirm/style/css'
import { ApiError, request } from './request'

type Announcement = { id: number; text: string }

const announcements = ref<Announcement[]>([])
const draft = ref('')
const editId = ref<number | null>(null)
const editText = ref('')
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const collection = '/api/announcements'

function isAnnouncement(value: unknown): value is Announcement {
  return value !== null && typeof value === 'object' &&
    'id' in value && typeof value.id === 'number' &&
    'text' in value && typeof value.text === 'string'
}

async function load() {
  const response = await request(collection)
  const items: unknown = await response.json()
  if (!Array.isArray(items) || !items.every(isAnnouncement)) {
    throw new Error('公告資料格式不正確。')
  }
  announcements.value = items
  loaded.value = true
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      window.location.replace('/login')
      return
    }
    error.value = cause instanceof Error ? cause.message : '目前無法完成操作。'
  } finally {
    busy.value = false
  }
}

function createAnnouncement() {
  return run(async () => {
    await request(collection, 'POST', { text: draft.value })
    draft.value = ''
    await load()
  })
}

function beginEdit(item: Announcement) {
  editId.value = item.id
  editText.value = item.text
}

function saveEdit(id: number) {
  return run(async () => {
    await request(collection + '/' + id, 'PATCH', { text: editText.value })
    editId.value = null
    await load()
  })
}

function remove(id: number) {
  return run(async () => {
    await request(collection + '/' + id, 'DELETE')
    if (editId.value === id) editId.value = null
    await load()
  })
}

function move(index: number, step: number) {
  return run(async () => {
    const previousIds = announcements.value.map(({ id }) => id)
    const other = index + step
    const currentId = previousIds[index]
    const otherId = previousIds[other]
    if (currentId === undefined || otherId === undefined) return

    const ids = [...previousIds]
    ids[index] = otherId
    ids[other] = currentId
    try {
      await request(collection + '/order', 'PUT', { ids, previousIds })
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) await load()
      throw cause
    }
    await load()
  })
}

function logout() {
  return run(async () => {
    await request('/api/sessions/current', 'DELETE')
    window.location.replace('/login')
  })
}

onMounted(() => run(load))
</script>

<template>
  <main class="page">
    <header class="page-header">
      <h1>海獺公告欄</h1>
      <ElButton :disabled="busy" @click="logout">登出</ElButton>
    </header>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />

    <ElForm class="panel" label-position="top" @submit.prevent="createAnnouncement">
      <ElFormItem label="新增公告" for="announcement-text">
        <ElInput
          id="announcement-text"
          v-model="draft"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
        />
      </ElFormItem>
      <ElButton type="primary" native-type="submit" :disabled="busy || !draft.trim()">
        新增
      </ElButton>
    </ElForm>

    <section aria-labelledby="announcements-title" :aria-busy="busy">
      <div class="page-header">
        <h2 id="announcements-title">公告</h2>
        <ElButton text :disabled="busy" @click="run(load)">重新整理</ElButton>
      </div>
      <p v-if="!loaded && !error" role="status">載入中…</p>
      <ElEmpty v-else-if="loaded && announcements.length === 0" description="目前沒有公告" />
      <ol v-else class="announcements">
        <li v-for="(item, index) in announcements" :key="item.id" class="panel">
          <ElForm v-if="editId === item.id" label-position="top" @submit.prevent="saveEdit(item.id)">
            <ElFormItem label="編輯公告" for="edit-text">
              <ElInput
                id="edit-text"
                v-model="editText"
                type="textarea"
                :rows="3"
                :maxlength="500"
                show-word-limit
              />
            </ElFormItem>
            <div class="actions">
              <ElButton type="primary" native-type="submit" :disabled="busy || !editText.trim()">
                儲存
              </ElButton>
              <ElButton :disabled="busy" @click="editId = null">取消</ElButton>
            </div>
          </ElForm>
          <template v-else>
            <p class="announcement-text">{{ item.text }}</p>
            <div class="actions">
              <ElButton :disabled="busy || index === 0" @click="move(index, -1)">上移</ElButton>
              <ElButton :disabled="busy || index === announcements.length - 1" @click="move(index, 1)">
                下移
              </ElButton>
              <ElButton :disabled="busy" @click="beginEdit(item)">修改</ElButton>
              <ElPopconfirm
                title="確定刪除這則公告？"
                confirm-button-text="刪除"
                cancel-button-text="取消"
                @confirm="remove(item.id)"
              >
                <template #reference>
                  <ElButton type="danger" plain :disabled="busy">刪除</ElButton>
                </template>
              </ElPopconfirm>
            </div>
          </template>
        </li>
      </ol>
    </section>
  </main>
</template>
