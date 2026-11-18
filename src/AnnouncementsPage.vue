<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElForm, ElFormItem, ElInput, ElPopconfirm } from 'element-plus'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/popconfirm/style/css'
import { collection, readAnnouncements, type Announcement } from './announcements'
import { ApiError, request } from './request'

const announcements = ref<Announcement[]>([])
const newDraft = ref({ text: '' })
const editDraft = ref<Announcement | null>(null)
const draft = computed(() => editDraft.value ?? newDraft.value)
const textInput = ref<InstanceType<typeof ElInput> | null>(null)
const heading = ref<HTMLElement | null>(null)
const busy = ref(false)
const loaded = ref(false)
const error = ref('')

async function load() {
  announcements.value = await readAnnouncements()
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

async function openEdit(item: Announcement) {
  editDraft.value = { ...item }
  await nextTick()
  textInput.value?.focus()
}

async function closeEdit() {
  editDraft.value = null
  await nextTick()
  heading.value?.focus()
}

function save() {
  return run(async () => {
    const editing = editDraft.value
    const body = { text: draft.value.text }
    if (editing) {
      await request(collection + '/' + editing.id, 'PATCH', body)
      await closeEdit()
    } else {
      await request(collection, 'POST', body)
      newDraft.value.text = ''
    }
    await load()
  })
}

function remove(id: number) {
  return run(async () => {
    await request(collection + '/' + id, 'DELETE')
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

onMounted(() => run(load))
</script>

<template>
  <main class="page management-page">
    <header class="page-header management-heading">
      <h1 ref="heading" tabindex="-1">公告</h1>
    </header>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />

    <ElForm class="panel panel-form" label-position="top" @submit.prevent="save">
      <h2>{{ editDraft ? '編輯公告' : '新增公告' }}</h2>
      <ElFormItem label="公告內容" for="announcement-text">
        <ElInput
          id="announcement-text"
          ref="textInput"
          v-model="draft.text"
          type="textarea"
          :rows="3"
          :maxlength="500"
          :disabled="busy"
          show-word-limit
        />
      </ElFormItem>
      <div class="actions">
        <ElButton
          type="primary"
          native-type="submit"
          :loading="busy"
          :disabled="!draft.text.trim()"
        >{{ editDraft ? '儲存' : '新增' }}</ElButton>
        <ElButton v-if="editDraft" :disabled="busy" @click="closeEdit">取消</ElButton>
      </div>
    </ElForm>

    <section aria-labelledby="announcements-title" :aria-busy="busy">
      <div class="page-header management-section-heading">
        <h2 id="announcements-title">公告清單</h2>
        <ElButton :disabled="busy" @click="run(load)">重新整理</ElButton>
      </div>
      <p v-if="!loaded && !error" role="status">載入中…</p>
      <ElEmpty v-else-if="loaded && announcements.length === 0" description="目前沒有公告" />
      <table v-else-if="loaded" class="record-table announcements-table" role="table">
        <caption>公告清單</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">公告內容</th>
            <th scope="col" role="columnheader">操作</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="(item, index) in announcements" :key="item.id" role="row">
            <td class="announcement-text" role="cell">{{ item.text }}</td>
            <td role="cell">
              <div class="actions record-actions">
                <ElButton :disabled="busy || index === 0" @click="move(index, -1)">上移</ElButton>
                <ElButton :disabled="busy || index === announcements.length - 1" @click="move(index, 1)">
                  下移
                </ElButton>
                <ElButton :disabled="busy || !!editDraft" @click="openEdit(item)">編輯</ElButton>
                <ElPopconfirm
                  title="確定刪除這則公告？"
                  confirm-button-text="刪除"
                  cancel-button-text="取消"
                  @confirm="remove(item.id)"
                >
                  <template #reference>
                    <ElButton type="danger" plain :disabled="busy || !!editDraft">刪除</ElButton>
                  </template>
                </ElPopconfirm>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<style scoped>
.announcements-table th:last-child { width: 19rem; }
</style>
