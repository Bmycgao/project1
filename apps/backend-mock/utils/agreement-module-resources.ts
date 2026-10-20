import {
  agreementModuleAuthCode,
  isCustomAgreementModule,
} from '../../shared/agreement-module-access';
import { pageSchemaStore } from './mock-page-schema';
import { readPersistJson, writePersistJson } from './mock-persist';

interface ModuleResource {
  key: string;
  label: string;
}

const PERSIST_FILE = 'agreement-module-resources.json';
const RESOURCE_PREFIX = 'agree-module:';

/** Keep retired module keys so published workflow instances remain authorizable. */
export function listCustomAgreementModuleResources(): ModuleResource[] {
  const saved = readPersistJson<ModuleResource[]>(PERSIST_FILE);
  const resources = new Map<string, ModuleResource>();
  for (const item of Array.isArray(saved) ? saved : []) {
    if (isCustomAgreementModule(String(item.key))) {
      resources.set(item.key, { key: item.key, label: item.label || item.key });
    }
  }
  for (const page of pageSchemaStore) {
    for (const module of page.modules || []) {
      const key = String(module.key || '');
      if (!isCustomAgreementModule(key)) continue;
      resources.set(key, { key, label: String(module.label || key) });
    }
  }
  const result = [...resources.values()].toSorted(
    (a, b) =>
      a.label.localeCompare(b.label, 'zh-CN') || a.key.localeCompare(b.key),
  );
  if (JSON.stringify(result) !== JSON.stringify(saved || [])) {
    writePersistJson(PERSIST_FILE, result);
  }
  return result;
}

export function customModuleResourceId(key: string) {
  return `${RESOURCE_PREFIX}${key}`;
}

export function customModuleCodesForPermissionIds(ids: Set<string>) {
  return listCustomAgreementModuleResources()
    .filter((item) => ids.has(customModuleResourceId(item.key)))
    .map((item) => agreementModuleAuthCode(item.key));
}

/** Role editor only: append virtual resources without modifying menu management. */
export function rolePermissionResourceTree(menus: any[]) {
  const custom = listCustomAgreementModuleResources();
  const copy = structuredClone(menus);
  function attach(nodes: any[]): boolean {
    for (const node of nodes) {
      if (node.name === 'BizAgreementDetail') {
        const children = (node.children ||= []);
        const existing = new Set(children.map((item: any) => String(item.id)));
        for (const item of custom) {
          const id = customModuleResourceId(item.key);
          if (existing.has(id)) continue;
          children.push({
            id,
            pid: node.id,
            name: `AgreeModule_${item.key}`,
            status: 1,
            type: 'button',
            authCode: agreementModuleAuthCode(item.key),
            meta: { title: item.label },
          });
        }
        return true;
      }
      if (node.children?.length && attach(node.children)) return true;
    }
    return false;
  }
  attach(copy);
  return copy;
}
