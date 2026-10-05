import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PhysicalState } from '../../core/config/database.types';
import { stateLabel } from '../../core/inventory/inventory';
import { Icon } from './icon';
@Component({
  selector: 'app-garment-status',
  imports: [Icon],
  template: `<span
      class="state"
      [class.held]="held()"
      [class.laundry]="!held() && state() === 'PENDIENTE_LAVANDERIA'"
      [class.damaged]="!held() && state() === 'DANADA'"
      ><app-icon
        [name]="
          held()
            ? 'people'
            : state() === 'DISPONIBLE'
              ? 'check'
              : state() === 'DANADA'
                ? 'warning'
                : 'wash'
        "
      />{{ held() ? 'Cedida' : label(state()) }}</span
    >
    @if (held() && state() !== 'DISPONIBLE') {
      <span class="condition">Estado físico: {{ label(state()) }}</span>
    }`,
  styles: `
    .state {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      border-radius: var(--radius-pill);
      min-height: var(--badge-height);
      padding: var(--badge-padding);
      line-height: 1.3;
      font-size: var(--badge-font-size);
      font-weight: 700;
      background: var(--color-success-soft);
      color: var(--color-success);
      border: 1px solid var(--color-success-border);
    }
    app-icon {
      width: 1rem;
      height: 1rem;
    }
    .laundry {
      background: var(--color-laundry-soft);
      color: var(--color-laundry);
      border-color: var(--color-laundry-border);
    }
    .damaged {
      background: var(--color-error-soft);
      color: var(--color-error);
      border-color: var(--color-error-border);
    }
    .held {
      background: var(--color-primary-soft);
      color: var(--color-primary-dark);
      border-color: var(--color-primary-border);
    }
    .condition {
      display: block;
      margin-top: var(--space-2);
      font-size: var(--text-xs);
      color: var(--color-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GarmentStatus {
  readonly state = input.required<PhysicalState>();
  readonly held = input(false);
  readonly label = stateLabel;
}
