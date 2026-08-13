import { eventHandler, readBody } from 'h3';
import { assertAgreeAction } from '~/utils/agree-api-auth';
import { getOrCreateAgreementDetail } from '~/utils/mock-agreement-detail';
import { createAgreeListRow } from '~/utils/mock-agreement-list';
import { useResponseSuccess } from '~/utils/response';

/** POST /api/biz/agreement/create 新建草稿协议并返回列表行 */
export default eventHandler(async (event) => {
  const auth = assertAgreeAction(event, 'add');
  if (!auth.ok) return auth.response;

  const body = await readBody(event);
  const row = createAgreeListRow({
    compensatee: body?.compensatee,
    houseAddress: body?.houseAddress,
  });
  // 同步初始化详情缓存，便于立刻进详情编辑
  getOrCreateAgreementDetail(row.agreementNo, {
    id: row.id,
    compensatee: row.compensatee,
    houseAddress: row.houseAddress,
  });
  return useResponseSuccess(row);
});
