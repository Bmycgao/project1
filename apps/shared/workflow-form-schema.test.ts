/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import type { RuntimeField } from './workflow-runtime';

import { describe, expect, it } from 'vitest';

import {
  prepareWorkflowFormRules,
  workflowFormCapabilityIssues,
} from './workflow-form-schema';

const field = (key: string, extra = {}): RuntimeField => ({
  key,
  label: key,
  type: 'text',
  required: true,
  readonly: false,
  hidden: false,
  ...extra,
});

describe('node FormCreate rules', () => {
  it('preserves layout, clones rules and strips hidden fields and defaults', () => {
    const input = [
      {
        type: 'row',
        children: [
          {
            type: 'input',
            field: 'visible',
            col: { span: 12 },
            value: 'default',
            validate: [{ required: true }],
          },
          { type: 'input', field: 'secret', value: 'private' },
        ],
      },
    ];
    const result = prepareWorkflowFormRules(input, [
      field('visible', { readonly: true }),
      field('secret', { hidden: true }),
    ]);
    expect(result[0]!.children).toHaveLength(1);
    expect(result[0]!.children[0]).toMatchObject({
      col: { span: 12 },
      props: { disabled: true },
      validate: [],
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result[0]!.children[0]).not.toHaveProperty('value');
    expect(input[0]!.children).toHaveLength(2);
  });
  it('locks protected tables and hides unauthorized columns', () => {
    const result = prepareWorkflowFormRules(
      [
        {
          type: 'tableForm',
          field: 'rows',
          props: {
            columns: [
              { label: '公开', rule: [{ type: 'input', field: 'name' }] },
              {
                label: '私密',
                rule: [{ type: 'input', field: 'secret', value: 'private' }],
              },
            ],
          },
        },
      ],
      [
        field('rows', {
          type: 'table',
          children: [field('name'), field('secret', { hidden: true })],
        }),
      ],
    );
    expect(result[0]!.props.disabled).toBe(true);
    expect(result[0]!.props.columns).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('shares capability hints for static time and transfer, and rejects ranges or scripts', () => {
    expect(
      workflowFormCapabilityIssues([
        { type: 'timePicker', field: 'time' },
        { type: 'elTransfer', field: 'items', props: { data: [] } },
      ]),
    ).toEqual([]);
    expect(
      workflowFormCapabilityIssues([
        { type: 'timePicker', field: 'time', props: { isRange: true } },
        { type: 'input', field: 'x', on: { change: 'script' } },
      ]),
    ).toHaveLength(2);
  });
});
