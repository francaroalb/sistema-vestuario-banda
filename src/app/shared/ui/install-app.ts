import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Icon } from './icon';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
@Component({
  selector: 'app-install-app',
  imports: [Icon],
  template: `
    @if (!installed()) {
      @if (promptEvent()) {
        <button class="btn btn-quiet" type="button" (click)="install()">
          <app-icon name="download" /> Instalar aplicación
        </button>
      } @else {
        <details>
          <summary>Añadir a la pantalla de inicio</summary>
          <p>
            En iPhone, abre esta página en Safari y pulsa Compartir → Añadir a
            pantalla de inicio. En Android, abre el menú de Chrome y elige
            Instalar aplicación o Añadir a pantalla de inicio.
          </p>
          <p>Necesitarás conexión para iniciar sesión y guardar operaciones.</p>
        </details>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    details {
      font-size: var(--text-xs);
      color: var(--color-muted);
    }
    summary {
      cursor: pointer;
      min-height: 2.75rem;
      align-content: center;
      text-underline-offset: 0.2em;
    }
    p {
      line-height: 1.65;
      max-width: 38rem;
    }
    .btn {
      font-size: var(--text-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallApp {
  readonly installed = signal(
    matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  readonly promptEvent = signal<InstallPrompt | null>(null);
  constructor() {
    const before = (event: Event) => {
      event.preventDefault();
      this.promptEvent.set(event as InstallPrompt);
    };
    const installed = () => {
      this.installed.set(true);
      this.promptEvent.set(null);
    };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', installed);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', installed);
    });
  }
  async install(): Promise<void> {
    const event = this.promptEvent();
    if (!event) return;
    try {
      await event.prompt();
      await event.userChoice;
    } finally {
      this.promptEvent.set(null);
    }
  }
}
