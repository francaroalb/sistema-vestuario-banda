import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  HostListener,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ImportKind,
  ImportRow,
  ImportPreview,
  parseImport,
  importTemplate,
} from '../../core/productivity/csv';
import {
  ProductivityRepository,
  productivityError,
} from '../../core/productivity/productivity-repository';
import { Connectivity } from '../../core/connectivity';
@Component({
  selector: 'app-import-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../inventory/inventory.scss', './productivity.scss'],
  template: `
    <a
      class="back-link"
      [routerLink]="kind === 'people' ? '/personas' : '/inventario'"
      >Volver al listado</a
    >
    <div class="page-heading">
      <div>
        <p class="eyebrow">Alta conjunta</p>
        <h1>Importar {{ kind === 'people' ? 'personas' : 'prendas' }}</h1>
      </div>
      <button class="btn btn-secondary" (click)="download()">
        Descargar plantilla
      </button>
    </div>
    <p>
      Exporta tu hoja de Excel como CSV UTF-8. Máximo 200 filas y 1 MB. Revisa
      las filas antes de confirmar; se crean fichas nuevas y se señalan las
      coincidencias existentes.
    </p>
    <div class="card bulk-panel">
      <label for="import-file">Archivo CSV</label
      ><input
        id="import-file"
        type="file"
        accept=".csv,text/csv"
        [disabled]="busy()"
        (change)="choose($event)"
      /><small>No importa cesiones ni asignaciones.</small>
    </div>
    @if (error()) {
      <p class="notice notice-error" role="alert">{{ error() }}</p>
    }
    @if (rows().length && !success()) {
      <button
        class="btn btn-secondary"
        [disabled]="busy() || !connection.online()"
        (click)="review()"
      >
        {{ busy() ? 'Procesando…' : 'Revisar archivo' }}
      </button>
    }
    @if (preview(); as p) {
      <section class="card bulk-panel">
        <h2>
          Revisión de {{ p.rows.length }}
          {{ p.rows.length === 1 ? 'fila' : 'filas' }}
        </h2>
        @if (p.errors.length) {
          <div class="notice notice-error" role="alert">
            <strong>Corrige el CSV y vuelve a seleccionarlo.</strong>
            <ul>
              @for (e of p.errors; track $index) {
                <li>Fila {{ e.row }}: {{ e.message }}</li>
              }
            </ul>
          </div>
        }
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fila</th>
                <th>{{ kind === 'people' ? 'Nombre' : 'Código' }}</th>
                <th>Tipo</th>
                <th>{{ kind === 'people' ? 'Instrumento' : 'Talla' }}</th>
                <th>{{ kind === 'people' ? 'Teléfono' : 'Estado' }}</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              @for (
                r of p.rows.slice((page() - 1) * 20, page() * 20);
                track $index
              ) {
                <tr>
                  <td>{{ (page() - 1) * 20 + $index + 2 }}</td>
                  <td>{{ r['name'] || r['code'] }}</td>
                  <td>
                    {{
                      r['kind'] === 'BANDA'
                        ? 'Componente'
                        : r['kind'] === 'REFUERZO'
                          ? 'Refuerzo'
                          : r['type']
                    }}
                  </td>
                  <td>{{ r['instrument'] || r['size'] || '—' }}</td>
                  <td>
                    {{
                      kind === 'people'
                        ? r['phone'] || '—'
                        : stateLabel(r['state'])
                    }}
                  </td>
                  <td>{{ r['notes'] || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (p.rows.length > 20) {
          <div class="bulk-actions">
            <button
              class="btn btn-secondary"
              [disabled]="page() === 1"
              (click)="page.set(page() - 1)"
            >
              Anterior</button
            ><span>Página {{ page() }}</span
            ><button
              class="btn btn-secondary"
              [disabled]="page() * 20 >= p.rows.length"
              (click)="page.set(page() + 1)"
            >
              Siguiente
            </button>
          </div>
        }
        <button
          class="btn btn-primary"
          [disabled]="busy() || p.errors.length > 0 || !connection.online()"
          (click)="apply()"
        >
          Importar {{ p.rows.length }}
          {{
            kind === 'people'
              ? p.rows.length === 1
                ? 'persona'
                : 'personas'
              : p.rows.length === 1
                ? 'prenda'
                : 'prendas'
          }}
        </button>
      </section>
    }
    @if (success()) {
      <p class="notice" role="status">{{ success() }}</p>
      <a
        class="btn btn-primary"
        [routerLink]="kind === 'people' ? '/personas' : '/inventario'"
        [queryParams]="{ vista: 'todas' }"
        >Ver registros</a
      >
    }
  `,
})
export class ImportPage {
  readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as ImportKind;
  readonly connection = inject(Connectivity);
  private readonly repo = inject(ProductivityRepository);
  readonly rows = signal<ImportRow[]>([]);
  readonly preview = signal<ImportPreview | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly page = signal(1);
  private request = crypto.randomUUID();
  stateLabel(state: string) {
    return (
      (
        {
          DISPONIBLE: 'Disponible',
          PENDIENTE_LAVANDERIA: 'Pendiente de lavandería',
          DANADA: 'Dañada',
          NO_DISPONIBLE: 'No disponible',
        } as Record<string, string>
      )[state] ?? state
    );
  }
  download() {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + importTemplate(this.kind)], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download =
      this.kind === 'people'
        ? 'plantilla-personas.csv'
        : 'plantilla-prendas.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  async choose(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.rows.set([]);
    this.preview.set(null);
    this.error.set('');
    this.success.set('');
    this.request = crypto.randomUUID();
    if (!file) return;
    this.busy.set(true);
    try {
      if (file.size > 1000000) throw Error('El archivo supera 1 MB.');
      this.rows.set(parseImport(await file.text(), this.kind));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  async review() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.preview.set(null);
    try {
      this.preview.set(await this.repo.previewImport(this.kind, this.rows()));
      this.page.set(1);
      this.request = crypto.randomUUID();
    } catch (e) {
      this.error.set(productivityError(e));
    } finally {
      this.busy.set(false);
    }
  }
  async apply() {
    const p = this.preview();
    if (!p || p.errors.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.repo.applyImport(p, this.request);
      this.success.set(
        r.count + (r.count === 1 ? ' ficha creada.' : ' fichas creadas.'),
      );
      this.rows.set([]);
      this.preview.set(null);
    } catch (e) {
      this.error.set(productivityError(e));
    } finally {
      this.busy.set(false);
    }
  }
  canLeave() {
    return (
      !this.busy() &&
      (!this.rows().length || confirm('¿Salir sin importar el archivo?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    e: BeforeUnloadEvent,
  ) {
    if (this.rows().length || this.busy()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
}
