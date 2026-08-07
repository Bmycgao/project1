import { eventHandler, getQuery } from 'h3';
import {
  findPageSchema,
  getDynamicRows,
} from '~/utils/mock-page-schema';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  usePageResponseSuccess,
  useResponseError,
} from '~/utils/response';

/**
 * 按页面配置拉取列表数据（通用动态列表页使用）
 * query: schemaId, page, pageSize, 以及配置中的查询字段
 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);
  const schemaId = String(query.schemaId || '');
  const schema = findPageSchema(schemaId);
  if (!schema || schema.status === 0) {
    return useResponseError('页面配置不存在或已禁用');
  }

  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  let list = structuredClone(getDynamicRows(schema));

  for (const qf of schema.queryFields) {
    const val = query[qf.field];
    if (val === undefined || val === null || val === '') continue;
    list = list.filter((row) => {
      const cell = row[qf.field];
      if (qf.component === 'Select') {
        return String(cell) === String(val);
      }
      return String(cell ?? '').includes(String(val));
    });
  }

  return usePageResponseSuccess(page as string, pageSize as string, list);
});
