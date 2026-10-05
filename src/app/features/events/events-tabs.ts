import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-events-tabs',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Secciones de actuaciones">
      <a
        routerLink="/actuaciones"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
        >Actuaciones</a
      >
      <a
        routerLink="/actuaciones/series"
        routerLinkActive="active"
        ariaCurrentWhenActive="page"
        >Series</a
      >
      <a
        routerLink="/actuaciones/uniformes"
        routerLinkActive="active"
        ariaCurrentWhenActive="page"
        >Uniformes</a
      >
    </nav>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--space-5);
    }
    nav {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 4px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }
    a {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 8px;
      border-radius: var(--radius-sm);
      font-size: var(--text-sm);
      font-weight: 700;
      text-decoration: none;
      color: var(--color-muted);
    }
    a:hover {
      background: var(--color-primary-soft);
      color: var(--color-primary-dark);
    }
    a.active {
      background: var(--color-primary);
      color: white;
    }
  `,
})
export class EventsTabs {}
