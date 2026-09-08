import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  input,
  signal,
  viewChild,
  inject,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Task, TaskWithSubTasks } from '../task.model';
import { TaskContextMenuInnerComponent } from './task-context-menu-inner/task-context-menu-inner.component';
import { SolidTaskAccessService } from '../../../solid-data/solid-task-access.service';

@Component({
  selector: 'task-context-menu',
  imports: [TranslateModule, TaskContextMenuInnerComponent],
  templateUrl: './task-context-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskContextMenuComponent {
  private _cd = inject(ChangeDetectorRef);
  private readonly _solidTaskAccess = inject(SolidTaskAccessService);

  task = input.required<TaskWithSubTasks | Task>();
  isAdvancedControls = input<boolean>(false);
  readonly isReadOnly = computed(() => this._solidTaskAccess.isReadOnly(this.task().id));

  readonly isOpen = signal(false);

  readonly taskContextMenuInner = viewChild('taskContextMenuInner', {
    read: TaskContextMenuInnerComponent,
  });

  open(
    ev?: MouseEvent | KeyboardEvent | TouchEvent,
    isOpenedFromKeyBoard = false,
    restoreFocusTo?: HTMLElement,
  ): void {
    this.isOpen.set(true);
    this._cd.detectChanges();
    this.taskContextMenuInner()?.open(ev, isOpenedFromKeyBoard, restoreFocusTo);
  }

  onClose(): void {
    this.isOpen.set(false);
  }
}
