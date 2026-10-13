import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { folderNavigation } from '../../layout/navigation';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'app-folder-home',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <p class="eyebrow">Material musical</p>
      <h1>Carpetas musicales</h1>
      <p class="intro">Elige qué necesitas gestionar.</p>
    </header>
    <nav class="sections" aria-label="Gestión de carpetas">
      @for (item of sections; track item.path; let index = $index) {
        <a [routerLink]="item.path" [class]="'section tone-' + index">
          <span class="section-icon"><app-icon [name]="item.icon" /></span>
          <span class="copy"
            ><strong>{{ item.label }}</strong
            ><span>{{ item.description }}</span></span
          >
          <app-icon name="arrow" />
        </a>
      }
    </nav>
    <section class="quick" aria-labelledby="quick-title">
      <h2 id="quick-title">Añadir</h2>
      <div class="actions">
        <a class="btn btn-secondary" routerLink="/inventario/carpetas/nueva"
          ><app-icon name="plus" />Carpeta</a
        >
        <a
          class="btn btn-secondary"
          routerLink="/inventario/carpetas/repertorio/nueva"
          ><app-icon name="plus" />Obra al repertorio</a
        >
        <a class="btn btn-primary" routerLink="/cesiones/carpetas/nueva"
          ><app-icon name="exchange" />Cesión o reserva</a
        >
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    header {
      margin-bottom: 1.5rem;
    }
    h1 {
      margin: 0;
    }
    .intro {
      color: var(--color-muted);
      margin: 0.5rem 0 0;
      font-size: 0.875rem;
    }
    .sections {
      display: grid;
      gap: 0.75rem;
    }
    .section {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--tone);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      color: var(--color-text);
      text-decoration: none;
    }
    .section:hover {
      border-color: var(--tone);
      background: var(--color-surface-subtle);
    }
    .tone-0 {
      --tone: var(--color-primary);
      --soft: var(--color-primary-soft);
    }
    .tone-1 {
      --tone: var(--color-accent-dark);
      --soft: var(--color-accent-soft);
    }
    .tone-2 {
      --tone: #99520d;
      --soft: #fff0dc;
    }
    .tone-3 {
      --tone: var(--color-success);
      --soft: var(--color-success-soft);
    }
    .section-icon {
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      flex-shrink: 0;
      border-radius: var(--radius-md);
      background: var(--soft);
      color: var(--tone);
    }
    .copy {
      display: grid;
      gap: 0.25rem;
      flex: 1;
      min-width: 0;
    }
    .copy strong {
      font-size: 1rem;
    }
    .copy > span {
      font-size: 0.8125rem;
      color: var(--color-muted);
      line-height: 1.5;
    }
    .section > app-icon {
      width: 1rem;
      color: var(--tone);
    }
    .quick {
      margin-top: 1.75rem;
    }
    h2 {
      font-size: 0.875rem;
      margin: 0 0 0.75rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    @media (min-width: 42rem) {
      .sections {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 22rem) {
      .section {
        padding: 0.875rem;
        gap: 0.625rem;
      }
    }
  `,
})
export class FolderHome {
  readonly sections = folderNavigation.slice(1);
}
