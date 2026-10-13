import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-inventory-tabs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav aria-label="Secciones de inventario">
    <a
      routerLink="/inventario"
      [class.active]="section() === 'wardrobe'"
      [attr.aria-current]="section() === 'wardrobe' ? 'page' : null"
      >Vestuario</a
    >
    <a
      routerLink="/inventario/carpetas"
      [class.active]="section() === 'folders'"
      [attr.aria-current]="section() === 'folders' ? 'page' : null"
      >Carpetas</a
    >
  </nav>`,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--space-5);
    }
    nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
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
    }
    a.active {
      background: var(--color-primary);
      color: white;
    }
  `,
})
export class InventoryTabs {
  readonly section = input<'wardrobe' | 'folders'>('wardrobe');
}
