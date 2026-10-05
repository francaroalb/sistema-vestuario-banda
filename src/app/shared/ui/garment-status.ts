import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PhysicalState } from '../../core/config/database.types';
import { stateLabel } from '../../core/inventory/inventory';
import { Icon } from './icon';
@Component({
  selector: 'app-garment-status',
  imports: [Icon],
  template: `<span
    class="state"
    [class.laundry]="state() === 'PENDIENTE_LAVANDERIA'"
    [class.damaged]="state() === 'DANADA'"
    ><app-icon
      [name]="
        state() === 'DISPONIBLE'
          ? 'check'
          : state() === 'DANADA'
            ? 'warning'
            : 'wash'
      "
    />{{ label(state()) }}</span
  >`,
  styles: `
    .state {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      border-radius: var(--radius-pill);
      padding: 0.4rem 0.65rem;
      font-size: 0.7rem;
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
      background: var(--color-accent-soft);
      color: var(--color-accent-dark);
      border-color: var(--color-accent-border);
    }
    .damaged {
      background: #fae7e5;
      color: #941e24;
      border-color: #e8b9b4;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GarmentStatus {
  readonly state = input.required<PhysicalState>();
  readonly label = stateLabel;
}
