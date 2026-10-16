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
      [class.unavailable]="state() === 'NO_DISPONIBLE'"
      ><app-icon
        [name]="
          held()
            ? 'people'
            : state() === 'DISPONIBLE'
              ? 'check'
              : state() === 'DANADA' || state() === 'NO_DISPONIBLE'
                ? 'warning'
                : 'wash'
        "
      />{{ held() ? 'Cedida' : label(state()) }}</span
    >
    @if (held() && state() !== 'DISPONIBLE') {
      <span class="condition">Estado físico: {{ label(state()) }}</span>
    }
    @if (state() === 'NO_DISPONIBLE' && observation()) {
      <span class="condition unavailable-note"><strong>Observación:</strong> {{ observation() }}</span>
    }`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
      min-width: 0;
    }
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
    .state.unavailable {
      background: #b42318;
      color: #fff;
      border: 2px solid #7a271a;
      box-shadow: 0 0 0 2px rgb(180 35 24 / 18%);
      text-transform: uppercase;
      letter-spacing: 0.035em;
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
    .unavailable-note {
      max-width: 28rem;
      padding: var(--space-2) var(--space-3);
      border-left: 3px solid #b42318;
      border-radius: var(--radius-sm);
      background: #fef3f2;
      color: #7a271a;
      line-height: 1.45;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GarmentStatus {
  readonly state = input.required<PhysicalState>();
  readonly held = input(false);
  readonly observation = input<string | null>(null);
  readonly label = stateLabel;
}
