import { ensureMenuStoreHydrated } from './menu-store';
import { MOCK_MENU_LIST } from './mock-data';
import { pageSchemaStore } from './mock-page-schema';
import { collectPageSchemaUsage } from './page-schema-usage';
import { listWorkflows } from './workflow-store';

export function getPageSchemaUsage(id: string) {
  ensureMenuStoreHydrated();
  return collectPageSchemaUsage(
    id,
    pageSchemaStore,
    MOCK_MENU_LIST,
    listWorkflows(),
  );
}
