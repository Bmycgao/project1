import { agreementStore, findAgreeListRow } from './mock-agreement-list';

/** 所有普通协议写接口在读取客户端资料之前，检查服务端的最新状态。 */
export function assertAgreementEntryWrite(reference: string) {
  const access = agreementStore.entryWriteAccess(reference);
  if (!access.editable) throw new Error(access.reason);
}

/** 正文可编辑不代表可删除历史流程关联的业务记录。 */
export function assertAgreementEntryDelete(reference: string) {
  assertAgreementEntryWrite(reference);
  if (agreementStore.hasWorkflowHistory(reference))
    throw new Error('协议有关联流程历史，不能直接删除，请保留业务及审批记录。');
}

/** 旧版列表复核不能接管配置流程，也不能重新打开已审批完成的协议。 */
export function assertAgreementLegacyReview(reference: string) {
  const row = findAgreeListRow(reference);
  if (!row) throw new Error('协议不存在或已删除，请刷新列表');
  const workflowReason = agreementStore.workflowReadonlyReason(row.id);
  if (workflowReason) throw new Error(workflowReason);
  const detail = agreementStore.detail(row.id);
  if (
    row.isSigned === '已签约' ||
    ['approved', 'completed'].includes(String(detail?.status))
  )
    throw new Error('协议已审批完成或已签约，不能从列表直接修改审批结果。');
}
