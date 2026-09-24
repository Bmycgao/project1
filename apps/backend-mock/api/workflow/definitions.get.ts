import { eventHandler } from 'h3';
import { runtimeRequest } from '~/utils/workflow-runtime-api';
import { listWorkflows } from '~/utils/workflow-store';
export default eventHandler((event) =>
  runtimeRequest(event, () =>
    listWorkflows()
      .filter((d) => d.status === 'published')
      .map((d) => ({
        id: d.id,
        name: d.name,
        base: d.base,
        version: d.version,
        category: d.category,
        businessTable: d.businessTable,
      })),
  ),
);
