import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { navigation } from '../../layout/navigation';
@Component({
  selector: 'app-home',
  imports: [Icon, RouterLink],
  template: `
    <p class="eyebrow">Tu espacio de trabajo</p>
    <h1>Hola, {{ auth.profile()?.display_name }}.</h1>
    <p class="page-intro">Bienvenido a la gestión de vestuario de la Banda.</p>
    <section class="welcome-card card" aria-labelledby="welcome-title">
      <div class="welcome-icon"><app-icon name="hanger" /></div>
      <div>
        <span class="eyebrow">Vestuario BML</span>
        <h2 id="welcome-title">
          Un espacio para cuidar<br />lo que nos identifica.
        </h2>
        <p>
          El acceso ya está preparado. Aquí encontrarás las prendas, las
          personas y el vestuario de cada actuación a medida que se habiliten
          las secciones.
        </p>
      </div>
      <span class="welcome-monogram" aria-hidden="true">BML</span>
    </section>
    <div class="section-heading">
      <h2>Las secciones de tu espacio</h2>
      <span>En preparación</span>
    </div>
    <div class="section-grid">
      @for (item of sections; track item.path) {
        <a class="section-card card" [routerLink]="item.path"
          ><app-icon [name]="item.icon" />
          <div>
            <h3>{{ item.label }}</h3>
            <p>{{ item.description }}</p>
          </div>
          <app-icon name="arrow"
        /></a>
      }
    </div>
  `,
  styles: `
    .welcome-card {
      position: relative;
      overflow: hidden;
      display: flex;
      gap: 1.5rem;
      padding: 1.75rem;
      margin: 2rem 0;
      background: linear-gradient(120deg, #fffdf8, #faf1df);
      border-color: var(--color-accent-border);
    }
    .welcome-icon {
      display: none;
    }
    .welcome-card h2 {
      font: 500 2.25rem/1.08 var(--font-display);
      letter-spacing: -0.025em;
      margin: 0.75rem 0 1rem;
    }
    .welcome-card p {
      font-size: var(--text-sm);
      line-height: 1.8;
      max-width: 32rem;
      color: var(--color-muted);
      margin: 0;
    }
    .welcome-monogram {
      display: none;
    }
    .section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin: 2.25rem 0 1rem;
    }
    .section-heading h2 {
      font-size: var(--text-sm);
      margin: 0;
    }
    .section-heading span {
      font-size: 0.65rem;
      color: var(--color-muted);
    }
    .section-grid {
      display: grid;
      gap: 0.85rem;
    }
    .section-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      text-decoration: none;
      color: var(--color-text);
      transition:
        border-color 0.15s,
        background 0.15s;
    }
    .section-card:hover {
      border-color: var(--color-accent);
      background: #fff;
    }
    .section-card > app-icon:first-child {
      color: var(--color-primary);
    }
    .section-card > app-icon:last-child {
      margin-left: auto;
      width: 1rem;
      color: var(--color-muted);
    }
    h3 {
      font-size: var(--text-sm);
      margin: 0 0 0.4rem;
    }
    .section-card p {
      font-size: var(--text-xs);
      color: var(--color-muted);
      margin: 0;
      line-height: 1.6;
    }
    @media (min-width: 44rem) {
      .section-grid {
        grid-template-columns: 1fr 1fr;
      }
      .welcome-card {
        padding: 2.5rem;
        gap: 1.75rem;
      }
      .welcome-icon {
        display: grid;
        place-items: center;
        width: 4rem;
        height: 4rem;
        flex-shrink: 0;
        border: 1px solid var(--color-accent-border);
        border-radius: 50%;
        color: var(--color-primary);
        app-icon {
          height: 2rem;
          width: 2rem;
        }
      }
      .welcome-card h2 {
        font-size: 2.75rem;
      }
    }
    @media (min-width: 80rem) {
      .welcome-monogram {
        display: block;
        position: absolute;
        right: 2.5rem;
        bottom: 0.3rem;
        font: 500 8rem var(--font-display);
        color: rgb(196 129 19 / 10%);
        pointer-events: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  readonly auth = inject(AuthService);
  readonly sections = navigation.slice(1);
}
