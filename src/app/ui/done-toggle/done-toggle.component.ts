import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'done-toggle',
  templateUrl: './done-toggle.component.html',
  styleUrl: './done-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  /* eslint-disable @typescript-eslint/naming-convention */
  host: {
    '(click)': 'toggle($event)',
    '(keydown.enter)': 'toggle($event)',
    '(keydown.space)': 'toggleFromSpace($event)',
    role: 'checkbox',
    '[attr.aria-checked]': 'isDone()',
    '[attr.aria-disabled]': 'disabled()',
    '[tabindex]': 'disabled() ? -1 : 0',
    '[class.is-disabled]': 'disabled()',
    '[class.is-done]': '(showDoneAnimation() || isDone()) && !showUndoneAnimation()',
    '[class.is-current]': 'isCurrent()',
    '[class.is-scale-up]': 'showDoneAnimation() || showUndoneAnimation()',
  },
  /* eslint-enable @typescript-eslint/naming-convention */
})
export class DoneToggleComponent {
  readonly isDone = input.required<boolean>();
  readonly isCurrent = input<boolean>(false);
  readonly showDoneAnimation = input<boolean>(false);
  readonly showUndoneAnimation = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly toggled = output<void>();

  toggle(event: Event): void {
    event.stopPropagation();
    if (!this.disabled()) {
      this.toggled.emit();
    }
  }

  toggleFromSpace(event: Event): void {
    event.preventDefault();
    this.toggle(event);
  }
}
