import { eventHandler, getQuery } from 'h3';
import { queryAgreeListByScene } from '~/utils/mock-agreement-list';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  usePageResponseSuccess,
  useResponseError,
} from '~/utils/response';

/**
 * GET /api/biz/agreement/list
 * 同一接口：用 scene 区分录入 / 律师审核 / 预览 / 查看 的数据范围
 */
export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);
  const scene = String(query.scene || '').trim();
  if (!scene) {
    return useResponseError('缺少 scene 参数（场景码）');
  }

  const list = queryAgreeListByScene({
    scene,
    keyword: query.keyword as string | undefined,
    statusValue: query.statusValue as string | undefined,
  });

  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  return usePageResponseSuccess(page as string, pageSize as string, list);
});
