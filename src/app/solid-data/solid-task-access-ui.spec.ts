import { T } from '../t.const';
import { solidTaskAccessUi } from './solid-task-access-ui';

describe('solidTaskAccessUi', () => {
  it('uses the read-only label only for explicit denial', () => {
    expect(solidTaskAccessUi({ state: 'read-only' })).toEqual(
      jasmine.objectContaining({
        blocked: true,
        explicitlyReadOnly: true,
        tooltip: T.F.TASK.CMP.SOLID_READ_ONLY,
      }),
    );

    for (const state of ['unknown', 'checking', 'unavailable', 'rate-limited'] as const) {
      const ui = solidTaskAccessUi({ state });
      expect(ui.blocked).toBe(true);
      expect(ui.explicitlyReadOnly).toBe(false);
      expect(ui.tooltip).not.toBe(T.F.TASK.CMP.SOLID_READ_ONLY);
    }
  });

  it('does not block app-owned or writable tasks', () => {
    expect(solidTaskAccessUi(null).blocked).toBe(false);
    expect(solidTaskAccessUi({ state: 'writable' }).blocked).toBe(false);
  });
});
