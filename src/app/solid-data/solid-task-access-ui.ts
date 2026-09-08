import { T } from '../t.const';
import type { SolidAccessDecision } from './solid-access.model';

export interface SolidTaskAccessUi {
  blocked: boolean;
  explicitlyReadOnly: boolean;
  icon: string | null;
  tooltip: string | null;
}

const WRITABLE_UI: SolidTaskAccessUi = {
  blocked: false,
  explicitlyReadOnly: false,
  icon: null,
  tooltip: null,
};

export const solidTaskAccessUi = (
  decision: SolidAccessDecision | null,
): SolidTaskAccessUi => {
  switch (decision?.state) {
    case undefined:
    case 'writable':
      return WRITABLE_UI;
    case 'read-only':
      return {
        blocked: true,
        explicitlyReadOnly: true,
        icon: 'lock',
        tooltip: T.F.TASK.CMP.SOLID_READ_ONLY,
      };
    case 'checking':
      return {
        blocked: true,
        explicitlyReadOnly: false,
        icon: 'hourglass_empty',
        tooltip: T.F.TASK.CMP.SOLID_ACCESS_CHECKING,
      };
    case 'rate-limited':
      return {
        blocked: true,
        explicitlyReadOnly: false,
        icon: 'hourglass_top',
        tooltip: T.F.TASK.CMP.SOLID_ACCESS_RATE_LIMITED,
      };
    case 'unavailable':
      return {
        blocked: true,
        explicitlyReadOnly: false,
        icon: 'cloud_off',
        tooltip: T.F.TASK.CMP.SOLID_ACCESS_UNAVAILABLE,
      };
    case 'unknown':
      return {
        blocked: true,
        explicitlyReadOnly: false,
        icon: 'lock_clock',
        tooltip: T.F.TASK.CMP.SOLID_ACCESS_UNKNOWN,
      };
  }
};
