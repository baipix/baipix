import { describe, expect, it } from 'vitest';
import { MOBILE_PINNED_TOOLS, MOBILE_TOOL_GROUPS, TOOL_LIST } from '../src/ui/tools';

describe('the tools on a phone', () => {
  const inSheet = MOBILE_TOOL_GROUPS.flatMap((g) => g.tools);

  it('are all in the sheet, each once', () => {
    expect([...inSheet].sort()).toEqual(TOOL_LIST.map((t) => t.id).sort());
  });

  it('pins tools that exist', () => {
    for (const id of MOBILE_PINNED_TOOLS) expect(inSheet).toContain(id);
  });
});
