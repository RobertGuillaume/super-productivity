import { PRIMARY_OUTLET, Router } from '@angular/router';
import { TODAY_TAG } from '../tag/tag.const';
import { WorkContextType } from './work-context.model';

export interface RoutedWorkContext {
  activeId: string;
  activeType: WorkContextType;
}

export const parseRoutedWorkContext = (
  router: Pick<Router, 'parseUrl'>,
  url: string,
): RoutedWorkContext | null => {
  try {
    const segments = router.parseUrl(url).root.children[PRIMARY_OUTLET]?.segments ?? [];
    const route = segments[0]?.path;

    if (route === 'timeline') {
      return { activeId: TODAY_TAG.id, activeType: WorkContextType.TAG };
    }

    const id = segments[1]?.path;
    if (!id) return null;

    if (route === 'tag') {
      return { activeId: id, activeType: WorkContextType.TAG };
    }
    if (route === 'project') {
      return { activeId: id, activeType: WorkContextType.PROJECT };
    }
    return null;
  } catch {
    return null;
  }
};
