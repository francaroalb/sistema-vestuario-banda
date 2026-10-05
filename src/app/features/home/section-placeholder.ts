import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { navigation } from '../../layout/navigation';
import { Icon } from '../../shared/ui/icon';
@Component({
  selector: 'app-section-placeholder',
  imports: [Icon, RouterLink],
  template: `
    <p class="eyebrow">Gestión de trajes</p>
    <h1>{{ section()?.label }}</h1>
    <p class="page-intro">{{ section()?.description }}</p>
    <section class="card empty-state">
      <span class="empty-icon"
        ><app-icon [name]="section()?.icon ?? 'hanger'"
      /></span>
      <h2>Estamos preparando esta sección</h2>
      <p>
        Pronto podrás gestionar aquí
        {{ section()?.label?.toLowerCase() }}.<br />Por ahora, puedes recorrer
        tu espacio de trabajo.
      </p>
      <a class="btn btn-secondary" routerLink="/inicio"
        >Volver al inicio <app-icon name="arrow"
      /></a>
    </section>
  `,
  styles: `
    .empty-state {
      text-align: center;
      margin-top: 2rem;
      padding: 3rem 1.25rem;
      display: flex;
      align-items: center;
      flex-direction: column;
    }
    .empty-icon {
      display: grid;
      place-items: center;
      background: var(--color-primary-soft);
      color: var(--color-primary);
      width: 4rem;
      height: 4rem;
      border-radius: 50%;
      app-icon {
        width: 1.8rem;
        height: 1.8rem;
      }
    }
    h2 {
      font: 700 var(--text-section)/var(--leading-heading) var(--font-body);
      margin: 1.5rem 0 0.75rem;
    }
    p {
      font-size: var(--text-sm);
      color: var(--color-muted);
      line-height: 1.8;
      margin: 0 0 1.75rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionPlaceholder {
  readonly section = toSignal(
    inject(ActivatedRoute).data.pipe(
      map((data) =>
        navigation.find((item) => item.path === '/' + data['section']),
      ),
    ),
  );
}
