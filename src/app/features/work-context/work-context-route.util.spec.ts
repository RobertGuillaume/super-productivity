import { DefaultUrlSerializer } from '@angular/router';
import { TODAY_TAG } from '../tag/tag.const';
import { WorkContextType } from './work-context.model';
import { parseRoutedWorkContext } from './work-context-route.util';

describe('parseRoutedWorkContext', () => {
  const serializer = new DefaultUrlSerializer();
  const router = { parseUrl: (url: string) => serializer.parse(url) };

  it('decodes a URI-shaped tag id through the Angular URL parser', () => {
    expect(
      parseRoutedWorkContext(
        router,
        '/tag/https:%2F%2Fpod.example%2Fsuper-productivity%2Ftags%2FTODAY.ttl%23it/tasks',
      ),
    ).toEqual({
      activeId: 'https://pod.example/super-productivity/tags/TODAY.ttl#it',
      activeType: WorkContextType.TAG,
    });
  });

  it('decodes a URI-shaped project id', () => {
    expect(
      parseRoutedWorkContext(
        router,
        '/project/https:%2F%2Fpod.example%2Fprojects%2Flegacy.ttl%23it',
      ),
    ).toEqual({
      activeId: 'https://pod.example/projects/legacy.ttl#it',
      activeType: WorkContextType.PROJECT,
    });
  });

  it('keeps ordinary ids and ignores query parameters and fragments', () => {
    expect(parseRoutedWorkContext(router, '/tag/tag-1/tasks?view=list#focus')).toEqual({
      activeId: 'tag-1',
      activeType: WorkContextType.TAG,
    });
  });

  it('preserves timeline routing to TODAY', () => {
    expect(parseRoutedWorkContext(router, '/timeline')).toEqual({
      activeId: TODAY_TAG.id,
      activeType: WorkContextType.TAG,
    });
  });

  it('ignores incomplete, unrelated, and malformed routes', () => {
    expect(parseRoutedWorkContext(router, '/tag')).toBeNull();
    expect(parseRoutedWorkContext(router, '/project/')).toBeNull();
    expect(parseRoutedWorkContext(router, '/settings/tag-1')).toBeNull();
    expect(parseRoutedWorkContext(router, '/tag/%E0%A4%A')).toBeNull();
  });

  it('decodes literal percent sequences exactly once', () => {
    expect(parseRoutedWorkContext(router, '/tag/literal%252Fsegment')).toEqual({
      activeId: 'literal%2Fsegment',
      activeType: WorkContextType.TAG,
    });
  });
});
