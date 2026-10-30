<script setup lang="ts">
import type {
  NavEntryId,
  NavigationConfig,
  NavPageId,
} from '../../../../../shared/miniapp-navigation';
import type { MiniappRoleCode } from '../../../../../shared/miniapp-roles';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElColorPicker,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTag,
} from 'element-plus';

import {
  getMiniappNavigation,
  publishMiniappNavigation,
} from '#/api/system/miniapp-navigation';

import {
  addNavigationItem,
  availableNavigationPages,
  bindNavigationTarget,
  canMoveNavigationItem,
  defaultNavigation,
  demoRoleNavigation,
  MINIAPP_NAV_AUTH,
  moveNavigationItem,
  NAV_ICONS,
  NAV_PAGES,
  navigationRemovalReason,
  removeNavigationItem,
  validateNavigation,
  visibleNavigationItems,
} from '../../../../../shared/miniapp-navigation';
import { MINIAPP_ROLES } from '../../../../../shared/miniapp-roles';
import { requireDefined } from '../../../../../shared/require-defined';

/**
 * 页面职责：编辑一份导航草稿 → 实时预览 → 点击发布后保存到后端。
 * 阅读顺序：下面的状态 → load（读取）→ addEntry/changeTarget（编辑）→ publish（发布）。
 * 接口在 #/api/system/miniapp-navigation；目标白名单与校验规则在 apps/shared/miniapp-navigation.ts。
 * 完整阅读指南见仓库根目录《业务代码阅读指南.md》。
 */

const { hasAccessByCodes } = useAccess();
// 当前登录管理员是否有“发布导航”权限。computed 会在依赖的权限数据变化时重新计算。
// 这里只控制界面能否编辑；后端发布接口仍会独立校验权限。
const canEdit = computed(() => hasAccessByCodes([MINIAPP_NAV_AUTH.edit]));
// 当前正在编辑的草稿；默认值让页面在接口返回前也有完整数据结构。修改它不会立即发布。
// ref<NavigationConfig>：用 ref 保存响应式数据，尖括号约束数据结构，不会发送请求。
const form = ref<NavigationConfig>(defaultNavigation());
// 最近一次成功读取或发布时的配置快照（JSON 字符串），用于判断草稿有没有改动。
const baseline = ref('');
// 是否至少成功读取过一次配置；读取失败时不允许拿默认值覆盖服务器配置。
const loaded = ref(false);
// 当前是否正在读接口、等待删除/发布确认或保存；用于防止操作互相冲突。
const busy = ref(false);
// 页面顶部错误提示；空字符串表示没有需要显示的错误。
const error = ref('');
// 右侧预览选中的入口编号，默认尝试 home；只影响预览，不跳转小程序页面。
const previewTab = ref<NavEntryId>('home');
// 只显示开启的入口；隐藏项仍保留在 form.items 中，便于重新开启。
const previewRole = ref<MiniappRoleCode>('resident');
const allEnabledItems = computed(() =>
  form.value.items.filter((item) => item.enabled),
);
const visibleItems = computed(() =>
  visibleNavigationItems(form.value, previewRole.value),
);
// 配置不足时仍允许编辑草稿，但发布前必须为每个角色保留至少两项和账户入口。
const roleSummary = computed(() =>
  MINIAPP_ROLES.map((role) => ({
    ...role,
    count: visibleNavigationItems(form.value, role.code).length,
  })),
);
async function loadDemo() {
  if (locked.value || !(await confirmDiscard())) return;
  form.value = {
    ...demoRoleNavigation(),
    revision: form.value.revision,
    updatedAt: form.value.updatedAt,
  };
  ElMessage.success('已载入角色演示草稿，保存并发布后才会生效');
}
// 预览当前选中的入口。它被隐藏或删除后，回退到第一个可见入口。
const selected = computed(
  () =>
    visibleItems.value.find((item) => item.id === previewTab.value) ||
    visibleItems.value[0],
);
// 有未发布改动才为 true；控制发布按钮、状态提示，以及离开页面前的提醒。
const dirty = computed(
  () => loaded.value && JSON.stringify(form.value) !== baseline.value,
);
// 统一的界面禁用条件：正忙、还没读到服务器配置，或当前管理员没有编辑权限。
const locked = computed(() => busy.value || !loaded.value || !canEdit.value);
// 尚未被任何入口绑定的本地页面；决定“新增入口”能否点击。
const unusedPages = computed(() => availableNavigationPages(form.value));
// 把服务器保存的时间转为界面文字，不修改真正的发布时间。
const publishedTime = computed(() =>
  form.value.updatedAt
    ? new Date(form.value.updatedAt).toLocaleString('zh-CN')
    : '尚未发布，使用默认配置',
);
const pageLabel = (id: NavPageId) =>
  NAV_PAGES.find((page) => page.id === id)?.label;
// 预览按目标展示说明，导航名称仍可由管理员自由修改。
const previewContent = computed(() => {
  switch (selected.value?.target) {
    case 'account': {
      return { title: '我的账户', description: '账户信息与服务说明' };
    }
    case 'favorites': {
      return {
        title: '房源收藏',
        description: '按地址查询房源、查看详情，并管理我的收藏。',
      };
    }
    case 'services': {
      return {
        title: '服务中心',
        description: '流程与协议服务，随时在你手边。',
      };
    }
    case 'test': {
      return {
        title: '测试页面',
        description: '测试导航新增、删除、排序和页面切换。',
      };
    }
    default: {
      return {
        title: '重要的事，轻松办。',
        description: '协议与流程服务，随时在你手边。',
      };
    }
  }
});

// 只改变这一项打开哪个页面；公共规则拒绝重复绑定，不会交换其他入口。
function changeTarget(id: NavEntryId, target: NavPageId) {
  if (locked.value) return;
  try {
    form.value = bindNavigationTarget(form.value, id, target);
  } catch (error) {
    ElMessage.warning((error as Error).message);
  }
}

// 查找“哪个其他入口已经占用了这个目标”，供下拉框禁用选项和显示原因。
function targetOccupant(target: NavPageId, id: NavEntryId) {
  return form.value.items.find(
    (item) => item.id !== id && item.target === target,
  );
}

// 新增只写入本地草稿，生成稳定编号并选中预览；真正保存要等 publish。
function addEntry() {
  if (locked.value) return;
  try {
    const id = `nav-${window.crypto.randomUUID()}`;
    form.value = addNavigationItem(form.value, id);
    previewTab.value = id;
    ElMessage.success('已在我的账户前加入草稿，可编辑名称和图标，发布后生效');
  } catch (error) {
    ElMessage.warning((error as Error).message);
  }
}

// 先检查账户保留/最少两项规则，再弹框确认；这里删除的是草稿入口，不是页面文件。
async function deleteEntry(id: NavEntryId) {
  if (locked.value) return;
  const reason = navigationRemovalReason(form.value, id);
  if (reason) {
    ElMessage.warning(reason);
    return;
  }
  const item = requireDefined(
    form.value.items.find((entry) => entry.id === id),
  );
  busy.value = true;
  try {
    try {
      await ElMessageBox.confirm(
        `从草稿中删除“${item.text}”入口？保存并发布后小程序会移除该入口，页面和业务数据会保留。`,
        '删除导航入口',
        {
          type: 'warning',
          confirmButtonText: '删除入口',
          cancelButtonText: '取消',
        },
      );
    } catch {
      return;
    }
    form.value = removeNavigationItem(form.value, id);
    ElMessage.success('已从草稿删除，发布后生效');
  } catch (error) {
    ElMessage.warning((error as Error).message);
  } finally {
    busy.value = false;
  }
}

// 给重新加载、站内切页共用的确认：true 表示可以继续，false 表示用户想保留草稿。
async function confirmDiscard() {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      '当前修改尚未发布，确定放弃这些修改吗？',
      '未保存的修改',
      {
        type: 'warning',
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑',
      },
    );
    return true;
  } catch {
    return false;
  }
}
// 首次进入或点击“重新加载”时读取后端；已有改动时先确认，避免覆盖未发布草稿。
async function load() {
  if (busy.value || !(await confirmDiscard())) return;
  busy.value = true;
  error.value = '';
  try {
    const data = validateNavigation(await getMiniappNavigation());
    form.value = data;
    // 与服务器成功同步后更新比较基准，此时 dirty 会自动变为 false。
    baseline.value = JSON.stringify(data);
    loaded.value = true;
  } catch {
    error.value = '加载失败，请检查后端服务与当前账号权限，然后重新加载。';
  } finally {
    busy.value = false;
  }
}
// 账户固定在最右；只调整其他入口的相对顺序，编号、目标和角色不变。
function move(id: NavEntryId, offset: number) {
  if (locked.value) return;
  form.value = moveNavigationItem(form.value, id, offset);
}
// 恢复的是草稿内容；保留当前 revision，发布时后端才能检测版本冲突。
async function reset() {
  if (locked.value) return;
  try {
    await ElMessageBox.confirm(
      '将编辑内容恢复为默认值，发布后才会影响小程序。',
      '恢复默认',
      {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  form.value = {
    ...defaultNavigation(),
    revision: form.value.revision,
    updatedAt: form.value.updatedAt,
  };
}
// 保存链路：校验草稿 → 管理员确认 → PUT 接口 → 用后端返回的新版本更新草稿和基准。
async function publish() {
  if (locked.value || !dirty.value) return;
  let data: NavigationConfig;
  try {
    data = validateNavigation(form.value);
  } catch (error) {
    ElMessage.warning((error as Error).message);
    return;
  }
  busy.value = true;
  try {
    try {
      await ElMessageBox.confirm(
        '发布后，小程序用户下次进入或点击“更新导航”时会看到新配置。',
        '发布底部导航',
        { confirmButtonText: '确认发布', cancelButtonText: '继续编辑' },
      );
    } catch {
      return;
    }
    // 必须等接口成功后再更新 baseline；失败时保留草稿，用户可以继续编辑或重试。
    const saved = validateNavigation(await publishMiniappNavigation(data));
    form.value = saved;
    baseline.value = JSON.stringify(saved);
    error.value = '';
    ElMessage.success('已发布，小程序可刷新查看');
  } catch {
    error.value =
      '发布失败，修改已保留。若提示版本冲突，请重新加载最新配置后编辑。';
  } finally {
    busy.value = false;
  }
}
// 浏览器刷新、关闭标签页或整页离开时，提醒用户存在未发布修改。
// 这不是自动保存：用户确认离开仍会丢失草稿；弹框文字由浏览器决定，部分场景可能不弹出。
function protectReload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    // 请求浏览器先询问用户，而不是直接离开。
    event.preventDefault();
    // 兼容仍依赖 returnValue 的浏览器；空字符串不是自定义提示文案。
    event.returnValue = '';
  }
}
// Vue Router 站内切页与浏览器刷新是两种离开方式，需要分别处理。
// 正在操作时不切走；否则用我们自己的弹框确认是否放弃草稿。
onBeforeRouteLeave(async () => !busy.value && (await confirmDiscard()));
onMounted(() => {
  // 组件挂载后读配置，并注册“刷新/关闭”的浏览器事件。
  load();
  window.addEventListener('beforeunload', protectReload);
});
// 页面销毁时撤销监听，避免离开编辑页后还出现这张页面的提醒。
onBeforeUnmount(() =>
  window.removeEventListener('beforeunload', protectReload),
);
</script>

<template>
  <Page
    title="小程序底部导航"
    description="配置配套小程序的一级入口，发布后由小程序读取。"
  >
    <div class="nav-editor">
      <div class="editor-heading">
        <div>
          <h2>把常用服务，放在顺手的位置</h2>
          <p>新增、删除或编辑导航入口，右侧可实时预览，发布后生效。</p>
        </div>
        <ElTag :type="dirty ? 'warning' : 'success'">
          {{ dirty ? '有未发布修改' : `当前版本 v${form.revision}` }}
        </ElTag>
      </div>
      <ElAlert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        class="mb-4"
      />
      <ElAlert
        v-if="loaded && !canEdit"
        title="当前账号可查看配置，没有发布权限。请联系管理员分配“小程序导航 / 发布导航”权限。"
        type="info"
        :closable="false"
        class="mb-4"
      />
      <div class="editor-layout">
        <div class="editor-form">
          <section class="editor-card">
            <h3>应用与颜色</h3>
            <label class="field-label">应用名称
              <ElInput
                v-model="form.title"
                :disabled="locked"
                maxlength="16"
                show-word-limit
                placeholder="签约助手"
              />
            </label>
            <div class="color-fields">
              <label><span>默认文字</span>
                <ElColorPicker
                  v-model="form.color"
                  :disabled="locked"
                /><code>{{ form.color }}</code>
              </label>
              <label><span>选中颜色</span>
                <ElColorPicker
                  v-model="form.activeColor"
                  :disabled="locked"
                /><code>{{ form.activeColor }}</code>
              </label>
              <label><span>导航背景</span>
                <ElColorPicker
                  v-model="form.backgroundColor"
                  :disabled="locked"
                /><code>{{ form.backgroundColor }}</code>
              </label>
            </div>
          </section>
          <section class="editor-card">
            <div class="card-heading">
              <h3>导航入口</h3>
              <ElButton
                type="primary"
                :disabled="locked || unusedPages.length === 0"
                @click="addEntry"
              >
                新增入口
              </ElButton>
            </div>
            <p class="helper-text entry-rules">
              每个角色至少显示 2 项 ·
              我的账户对所有角色可见并固定在最右。新增入口排在我的账户之前，其余入口可上移、下移。角色仅控制导航展示，不代表业务操作权限。
            </p>
            <p
              v-if="unusedPages.length === 0"
              class="helper-text available-hint"
            >
              暂无可用目标页面：已有页面均已绑定。删除一个非账户入口可释放目标；隐藏入口仍占用目标。
            </p>
            <p v-else class="helper-text available-hint">
              可用目标：{{
                unusedPages.map((page) => page.label).join('、')
              }}。新增时默认选用第一个可用目标，可继续编辑。
            </p>
            <div
              v-for="(item, index) in form.items"
              :key="item.id"
              class="entry-row"
            >
              <div class="entry-top">
                <strong>导航入口 {{ index + 1 }}</strong><span>{{
                  NAV_PAGES.find((page) => page.id === item.target)?.description
                }}</span>
                <ElSwitch
                  v-model="item.enabled"
                  :disabled="
                    locked ||
                    item.target === 'account' ||
                    (item.enabled && allEnabledItems.length <= 2)
                  "
                  :active-text="item.enabled ? '显示' : '隐藏'"
                />
              </div>
              <div class="role-visibility">
                <span>可见角色</span>
                <ElCheckboxGroup
                  v-model="item.visibleRoles"
                  :disabled="locked || item.target === 'account'"
                >
                  <ElCheckbox
                    v-for="role in MINIAPP_ROLES"
                    :key="role.code"
                    :value="role.code"
                    :label="role.code"
                  >
                    {{ role.name }}
                  </ElCheckbox>
                </ElCheckboxGroup>
              </div>
              <div class="entry-fields">
                <label>导航名称
                  <ElInput
                    v-model="item.text"
                    :disabled="locked"
                    maxlength="6"
                    show-word-limit
                  />
                </label>
                <label>目标页面<ElSelect
                    :model-value="item.target"
                    :disabled="locked || item.target === 'account'"
                    @change="changeTarget(item.id, $event)"
                  >
                    <ElOption
                      v-for="page in NAV_PAGES"
                      :key="page.id"
                      :label="
                        targetOccupant(page.id, item.id)
                          ? `${page.label}（已由“${targetOccupant(page.id, item.id)?.text}”使用）`
                          : page.label
                      "
                      :disabled="!!targetOccupant(page.id, item.id)"
                      :value="page.id"
                    /> </ElSelect><small class="target-path">{{
                    NAV_PAGES.find((page) => page.id === item.target)?.path
                  }}</small></label>
                <label>图标<ElSelect v-model="item.icon" :disabled="locked">
                    <ElOption
                      v-for="icon in NAV_ICONS"
                      :key="icon.value"
                      :label="icon.label"
                      :value="icon.value"
                    /> </ElSelect></label>
                <p
                  v-if="item.target === 'account'"
                  class="helper-text account-position-note"
                >
                  账户入口固定在最右侧，始终保留；可修改名称和图标。
                </p>
                <div v-else class="order-buttons">
                  <ElButton
                    :disabled="
                      locked || !canMoveNavigationItem(form, item.id, -1)
                    "
                    @click="move(item.id, -1)"
                  >
                    上移
                  </ElButton>
                  <ElButton
                    :disabled="
                      locked || !canMoveNavigationItem(form, item.id, 1)
                    "
                    @click="move(item.id, 1)"
                  >
                    下移
                  </ElButton>
                  <ElButton
                    type="danger"
                    plain
                    :disabled="
                      locked || !!navigationRemovalReason(form, item.id)
                    "
                    :title="
                      navigationRemovalReason(form, item.id) ||
                      '从草稿删除入口，发布后生效'
                    "
                    @click="deleteEntry(item.id)"
                  >
                    删除
                  </ElButton>
                </div>
              </div>
            </div>
            <p class="helper-text">
              名称决定底部文字，目标页面决定打开的内容。已占用的目标不可重复选择，不会自动交换。删除仅移除导航入口，不删除页面或业务数据；导航开关不代表业务权限。
            </p>
          </section>
          <section class="editor-card">
            <h3>角色检查</h3>
            <div class="role-summary">
              <ElTag
                v-for="role in roleSummary"
                :key="role.code"
                :type="role.count >= 2 ? 'success' : 'danger'"
              >
                {{ role.name }}：{{ role.count }} 项
              </ElTag>
            </div>
            <p class="helper-text">
              尚未定义的业务操作和数据范围不在本页授权。可载入现有页面组成的演示方案，先预览再决定是否发布。
            </p>
            <ElButton :disabled="locked" @click="loadDemo">
              载入三角色演示草稿
            </ElButton>
          </section>
          <div class="publish-bar">
            <div>
              <strong>发布到小程序</strong>
              <p>{{ publishedTime }}</p>
            </div>
            <ElButton :disabled="busy" @click="load">重新加载</ElButton>
            <ElButton :disabled="locked" @click="reset">恢复默认</ElButton>
            <ElButton
              type="primary"
              :loading="busy"
              :disabled="locked || !dirty"
              @click="publish"
            >
              保存并发布
            </ElButton>
          </div>
        </div>
        <aside class="preview-area">
          <div class="preview-label">小程序预览 <span>点击底部切换</span></div>
          <ElSelect
            v-model="previewRole"
            aria-label="预览身份"
            class="role-preview-select"
          >
            <ElOption
              v-for="role in MINIAPP_ROLES"
              :key="role.code"
              :label="role.name"
              :value="role.code"
            />
          </ElSelect>
          <div class="phone">
            <div class="phone-status">9:41 <span>● ▰</span></div>
            <div class="phone-title">
              {{ form.title || '签约助手' }}<span>••• ◉</span>
            </div>
            <div class="phone-content">
              <span class="preview-eyebrow">YOUR DAILY COMPANION</span>
              <h2>{{ previewContent.title }}</h2>
              <p>{{ previewContent.description }}</p>
              <p class="preview-destination">
                目标页面：{{ selected ? pageLabel(selected.target) : '无' }}
              </p>
              <div class="preview-feature">
                <span class="preview-feature-icon">✓</span><strong>{{ selected?.text || '服务入口' }}</strong>
                <p>
                  {{
                    selected?.target === 'test'
                      ? '这是独立页面的导航预览'
                      : '便捷连接，安心使用'
                  }}
                </p>
              </div>
              <div class="preview-placeholder"></div>
              <div class="preview-placeholder short"></div>
            </div>
            <div
              class="preview-tabs"
              :style="{ background: form.backgroundColor }"
            >
              <button
                v-for="item in visibleItems"
                :key="item.id"
                type="button"
                :aria-label="item.text || '未命名'"
                :aria-pressed="selected?.id === item.id"
                :style="{
                  color:
                    selected?.id === item.id ? form.activeColor : form.color,
                }"
                @click="previewTab = item.id"
              >
                <span
                  class="mini-nav-icon"
                  :class="`mini-nav-${item.icon}`"
                  aria-hidden="true"
                ></span><span class="preview-tab-label">{{
                  item.text || '未命名'
                }}</span>
              </button>
            </div>
            <div
              class="phone-safe"
              :style="{ background: form.backgroundColor }"
            >
              <span></span>
            </div>
          </div>
          <p class="preview-note">
            预览身份只影响右侧效果，不改变登录用户角色。实际业务内容以小程序为准。
          </p>
        </aside>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.role-visibility,
.role-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin: 12px 0;
}

.role-visibility > span {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.role-preview-select {
  width: 100%;
  margin-bottom: 16px;
}

.nav-editor {
  max-width: 1360px;
  padding: 8px 8px 28px;
  margin: auto;
}

.editor-heading {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.editor-heading h2 {
  font-size: 22px;
  font-weight: 600;
}

.editor-heading p {
  margin-top: 8px;
  color: #7d897f;
}

.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 32px;
}

.editor-card {
  padding: 24px;
  margin-bottom: 18px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
}

.editor-card h3 {
  margin-bottom: 20px;
  font-size: 16px;
  font-weight: 600;
}

.field-label {
  display: grid;
  gap: 10px;
  max-width: 400px;
}

.color-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  margin-top: 24px;
}

.color-fields label {
  display: grid;
  grid-template-columns: 36px auto;
  gap: 8px;
  align-items: center;
}

.color-fields label > span {
  grid-column: span 2;
  color: var(--el-text-color-secondary);
}

.color-fields code {
  font-size: 12px;
}

.card-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.entry-rules {
  margin-bottom: 8px;
}

.available-hint {
  margin-bottom: 16px;
}

.card-heading > span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.entry-row {
  padding: 20px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.entry-top {
  display: flex;
  gap: 12px;
  align-items: center;
}

.entry-top > span {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.entry-fields {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(160px, 1.3fr) minmax(
      90px,
      0.8fr
    );
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}

.entry-fields label {
  display: grid;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.account-position-note {
  grid-column: 1 / -1;
  margin: 0;
}

.order-buttons {
  display: flex;
  grid-column: 1 / -1;
}

.target-path {
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.helper-text {
  font-size: 12px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
}

.publish-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 18px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.publish-bar > div {
  margin-right: auto;
}

.publish-bar p {
  margin-top: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.preview-area {
  position: sticky;
  top: 20px;
  align-self: start;
}

.preview-label {
  display: flex;
  justify-content: space-between;
  padding: 0 8px 16px;
  font-weight: 600;
}

.preview-label span {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.phone {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #24382e;
  background: #f6f8f5;
  border: 7px solid #27382e;
  border-radius: 40px;
  box-shadow: 0 18px 40px #24382e14;
}

.phone-status {
  display: flex;
  justify-content: space-between;
  padding: 15px 20px 12px;
  font-size: 12px;
  font-weight: 600;
}

.phone-title {
  display: flex;
  justify-content: space-between;
  padding: 12px 18px 18px;
  font-size: 14px;
  font-weight: 600;
}

.phone-title span {
  font-weight: 400;
  color: #869184;
}

.phone-content {
  box-sizing: border-box;
  height: 390px;
  padding: 24px 24px 28px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.preview-eyebrow {
  font-size: 9px;
  color: #869184;
  letter-spacing: 2px;
}

.phone-content h2 {
  margin: 16px 0 12px;
  font-size: 25px;
  font-weight: 600;
}

.phone-content p {
  font-size: 12px;
  line-height: 1.8;
  color: #85927e;
}

.preview-feature {
  padding: 20px;
  margin-top: 24px;
  background: #e9efdf;
  border-radius: 18px;
}

.preview-feature strong {
  display: block;
  margin: 10px 0;
}

.preview-feature-icon {
  font-size: 30px;
  color: #246b55;
}

.preview-placeholder {
  height: 9px;
  margin-top: 26px;
  background: #e5eadf;
  border-radius: 5px;
}

.preview-placeholder.short {
  width: 65%;
  margin-top: 12px;
}

.preview-tabs {
  display: flex;
  flex: none;
  align-items: stretch;
  padding: 12px 4px 5px;
  border-top: 1px solid #e5eadf;
}

.preview-tabs button {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0 2px;
  margin: 0;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.preview-tab-label {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  white-space: nowrap;
}

.preview-tabs button:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 2px;
  border-radius: 6px;
}

.phone-safe {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
}

.phone-safe > span {
  width: 95px;
  height: 4px;
  background: #27382e;
  border-radius: 5px;
}

.preview-note {
  margin-top: 18px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.mini-nav-icon {
  position: relative;
  display: block;
  flex: none;
  align-self: center;
  width: 24px;
  height: 24px;
  font-size: 24px;
  color: inherit;
}

.mini-nav-icon::before,
.mini-nav-icon::after {
  position: absolute;
  box-sizing: border-box;
  content: '';
}

.mini-nav-home::before {
  top: 10px;
  left: 5px;
  width: 15px;
  height: 13px;
  border: 1.8px solid currentcolor;
  border-top: 0;
  border-radius: 2px;
}

.mini-nav-home::after {
  top: 3px;
  left: 5px;
  width: 14px;
  height: 14px;
  border-top: 1.8px solid currentcolor;
  border-left: 1.8px solid currentcolor;
  border-radius: 2px;
  transform: rotate(45deg);
}

.mini-nav-grid::before {
  top: 3px;
  left: 3px;
  width: 7px;
  height: 7px;
  background: currentcolor;
  border-radius: 1px;
  box-shadow:
    11px 0 currentcolor,
    0 11px currentcolor,
    11px 11px currentcolor;
}

.mini-nav-user::before {
  top: 2px;
  left: 8px;
  width: 9px;
  height: 9px;
  border: 1.8px solid currentcolor;
  border-radius: 50%;
}

.mini-nav-user::after {
  top: 14px;
  left: 3px;
  width: 18px;
  height: 10px;
  border: 1.8px solid currentcolor;
  border-radius: 12px 12px 3px 3px;
}

.mini-nav-file::before {
  top: 2px;
  left: 4px;
  width: 17px;
  height: 21px;
  border: 1.8px solid currentcolor;
  border-radius: 3px;
}

.mini-nav-file::after {
  top: 9px;
  left: 8px;
  width: 9px;
  height: 2px;
  background: currentcolor;
  box-shadow: 0 5px currentcolor;
}

.mini-nav-star::before {
  top: -2px;
  left: 0;
  font-size: 28px;
  line-height: 1;
  content: '☆';
}

@media (max-width: 1100px) {
  .editor-layout {
    grid-template-columns: minmax(0, 1fr) 290px;
    gap: 20px;
  }

  .entry-fields {
    grid-template-columns: 1fr 1fr;
  }

  .order-buttons {
    grid-column: span 2;
  }

  .color-fields {
    gap: 18px;
  }
}

@media (max-width: 1000px) {
  .editor-layout {
    grid-template-columns: 1fr;
  }

  .preview-area {
    position: static;
    width: 320px;
    max-width: 100%;
    margin: auto;
  }

  .editor-heading h2 {
    font-size: 18px;
  }

  .entry-top {
    flex-wrap: wrap;
  }

  .card-heading {
    display: block;
  }

  .editor-card {
    padding: 18px;
  }
}
</style>
