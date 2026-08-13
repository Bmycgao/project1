import { eventHandler, getQuery } from 'h3';
import { pageSchemaStore } from '~/utils/mock-page-schema';
import {
  assertSystemAccess,
  SYSTEM_AUTH,
} from '~/utils/system-api-auth';
import { useResponseSuccess } from '~/utils/response';

/** 页面配置列表（供菜单关联、配置管理） */
export default eventHandler(async (event) => {
  const auth = assertSystemAccess(event, SYSTEM_AUTH.pageSchemaList);
  if (!auth.ok) return auth.response;

  const { keyword, status } = getQuery(event);
  let list = structuredClone(pageSchemaStore);

  if (keyword) {
    const kw = String(keyword);
    list = list.filter(
      (item) =>
        item.title.includes(kw) ||
        item.name.includes(kw) ||
        item.id.includes(kw),
    );
  }
  if (['0', '1'].includes(status as string)) {
    list = list.filter((item) => item.status === Number(status));
  }

  return useResponseSuccess(list);
});
