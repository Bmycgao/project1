<script setup lang="ts">
import type { MiniappRoleCode } from '../../../../../shared/miniapp-roles';

import type { MiniappUserRow } from '#/api/system/miniapp-users';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  ElAlert,
  ElButton,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import {
  getMiniappUsers,
  updateMiniappUserRole,
} from '#/api/system/miniapp-users';

import {
  MINIAPP_ROLES,
  MINIAPP_USER_AUTH,
} from '../../../../../shared/miniapp-roles';
import { requireDefined } from '../../../../../shared/require-defined';

// 此列表是微信登录后创建的小程序账户，与 PC 后台登录用户分别管理。
const { hasAccessByCodes } = useAccess();
// PC 管理员是否有“分配角色”按钮权限，后端还会再次校验。
const canEdit = computed(() => hasAccessByCodes([MINIAPP_USER_AUTH.edit]));
// rows 是服务器已保存的数据；drafts 是下拉框临时选择，点击保存前不会生效。
const rows = ref<MiniappUserRow[]>([]);
const drafts = ref<Record<string, MiniappRoleCode>>({});
// 两个筛选条件只在当前列表中过滤，不修改账户数据。
const keyword = ref('');
const roleFilter = ref<'' | MiniappRoleCode>('');
// busy 表示列表加载中；savingId 表示正在保存哪一行，防止重复提交。
const busy = ref(false);
const savingId = ref('');
// 空字符串不显示错误条；失败时保留用户选择，便于检查后重试。
const error = ref('');
const filtered = computed(() =>
  rows.value.filter(
    (row) =>
      (!roleFilter.value || row.roleCode === roleFilter.value) &&
      `${row.id} ${row.nickname} ${row.appid}`
        .toLowerCase()
        .includes(keyword.value.trim().toLowerCase()),
  ),
);
async function load() {
  if (busy.value || savingId.value) return;
  busy.value = true;
  error.value = '';
  try {
    const responseValue1 = await getMiniappUsers();
    rows.value = responseValue1.items;
    drafts.value = Object.fromEntries(
      rows.value.map((row) => [row.id, row.roleCode]),
    );
  } catch {
    error.value = '用户列表加载失败，请检查服务和“小程序用户”查看权限。';
  } finally {
    busy.value = false;
  }
}
async function saveRole(id: string) {
  const row = rows.value.find((item) => item.id === id);
  if (!row) return;
  const roleCode = drafts.value[row.id];
  if (
    !canEdit.value ||
    savingId.value ||
    busy.value ||
    !roleCode ||
    roleCode === row.roleCode
  )
    return;
  savingId.value = row.id;
  try {
    try {
      await ElMessageBox.confirm(
        `将此小程序用户的导航角色调整为“${requireDefined(MINIAPP_ROLES.find((role) => role.code === roleCode)).name}”？用户下次显示页面或更新导航时生效。`,
        '分配小程序角色',
        { confirmButtonText: '确认分配', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
    // 携带角色版本，避免覆盖另一位管理员刚刚做出的修改。
    const updated = await updateMiniappUserRole(row, roleCode);
    rows.value = rows.value.map((item) =>
      item.id === updated.id ? updated : item,
    );
    drafts.value[updated.id] = updated.roleCode;
    error.value = '';
    ElMessage.success('角色已保存，小程序刷新导航后生效');
  } catch {
    error.value =
      '分配失败，选择已保留。角色可能已被修改，请刷新列表确认后重试。';
  } finally {
    savingId.value = '';
  }
}
onMounted(load);
</script>

<template>
  <Page
    title="小程序用户"
    description="给微信登录的小程序账户分配导航角色，与 PC 登录角色分别管理。"
  >
    <section class="users-panel">
      <ElAlert
        title="本期角色控制导航展示；具体业务操作、数据范围尚待需求确认。新用户默认居民。"
        type="info"
        :closable="false"
        show-icon
      />
      <ElAlert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        class="mt-4"
      />
      <div class="filters">
        <ElInput
          v-model="keyword"
          clearable
          placeholder="搜索昵称、用户编号或 AppID"
          aria-label="搜索小程序用户"
        />
        <ElSelect
          v-model="roleFilter"
          clearable
          placeholder="全部角色"
          aria-label="按角色筛选"
        >
          <ElOption
            v-for="role in MINIAPP_ROLES"
            :key="role.code"
            :label="role.name"
            :value="role.code"
          />
        </ElSelect>
        <ElButton :loading="busy" :disabled="!!savingId" @click="load">
          刷新列表
        </ElButton>
      </div>
      <ElTable
        :data="filtered"
        row-key="id"
        empty-text="暂无用户。请先在微信小程序登录一次，再刷新本列表。"
        style="width: 100%"
      >
        <ElTableColumn prop="nickname" label="昵称" min-width="110" />
        <ElTableColumn
          prop="id"
          label="小程序用户编号"
          min-width="240"
          show-overflow-tooltip
        />
        <ElTableColumn prop="appid" label="所属 AppID" min-width="185" />
        <ElTableColumn label="当前角色" width="145">
          <template #default="{ row }">
            <ElTag>{{ row.roleName }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="注册时间" min-width="175">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString('zh-CN') }}
          </template>
        </ElTableColumn>
        <ElTableColumn v-if="canEdit" label="分配导航角色" min-width="250">
          <template #default="{ row }">
            <div class="role-actions">
              <ElSelect
                v-model="drafts[row.id]"
                :disabled="busy || !!savingId"
                aria-label="分配导航角色"
              >
                <ElOption
                  v-for="role in MINIAPP_ROLES"
                  :key="role.code"
                  :label="role.name"
                  :value="role.code"
                />
              </ElSelect>
              <ElButton
                type="primary"
                :loading="savingId === row.id"
                :disabled="
                  busy || !!savingId || drafts[row.id] === row.roleCode
                "
                @click="saveRole(row.id)"
              >
                保存
              </ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
      <p class="footnote">
        共 {{ filtered.length }} / {{ rows.length }} 个账户。此处不展示 OpenID
        和登录 token。可用同一微信账户分次测试三个角色，无需新增微信 AppID。
      </p>
    </section>
  </Page>
</template>

<style scoped>
.users-panel {
  padding: 24px;
  margin: 0 auto;
  background: var(--el-bg-color);
  border-radius: 14px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 20px 0;
}

.filters > .el-input {
  max-width: 360px;
}

.filters > .el-select {
  width: 190px;
}

.role-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.role-actions .el-select {
  width: 160px;
}

.footnote {
  margin-top: 18px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
}
</style>
