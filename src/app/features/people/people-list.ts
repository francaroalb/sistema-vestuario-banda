import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { PersonKind, PersonRow } from '../../core/config/database.types';
import { PeopleRepository } from '../../core/people/people-repository';
import {
  PeopleFilters,
  peopleError,
  PEOPLE_PAGE_SIZE,
  personKinds,
  personKindLabel,
} from '../../core/people/people';
import { Icon } from '../../shared/ui/icon';
@Component({
  selector: 'app-people-list',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './people-list.html',
  styleUrls: ['../inventory/inventory.scss', './people.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeopleList {
  private readonly repository = inject(PeopleRepository);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly kinds = personKinds;
  readonly kindLabel = personKindLabel;
  readonly people = signal<PersonRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() =>
    Math.max(1, Math.ceil(this.total() / PEOPLE_PAGE_SIZE)),
  );
  readonly form = inject(FormBuilder).nonNullable.group({
    q: '',
    kind: '',
    instrument: '',
    archive: 'active',
  });
  readonly advanced = signal(false);
  private controller?: AbortController;
  private filters: PeopleFilters = {
    q: '',
    kind: '',
    instrument: '',
    archive: 'active',
    page: 1,
  };

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const kind = params.get('tipo') ?? '';
      const archive = params.get('archivo');
      const page = Number(params.get('pagina'));
      this.filters = {
        q: (params.get('buscar') ?? '').slice(0, 120),
        instrument: (params.get('instrumento') ?? '').slice(0, 80),
        kind: personKinds.some((item) => item.value === kind)
          ? (kind as PersonKind)
          : '',
        archive:
          archive === 'archived' || archive === 'all' ? archive : 'active',
        page:
          Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1,
      };
      this.page.set(this.filters.page);
      this.advanced.set(
        Boolean(
          this.filters.kind ||
          this.filters.instrument ||
          this.filters.archive !== 'active',
        ),
      );
      this.form.patchValue(this.filters, { emitEvent: false });
      void this.load();
    });
    this.form.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => this.navigate(1));
    inject(DestroyRef).onDestroy(() => this.controller?.abort());
  }
  async load(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.repository.list(
        this.filters,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.people.set(result.rows);
      this.total.set(result.count);
      if (this.page() > this.pages()) this.navigate(this.pages());
    } catch (error) {
      if (!controller.signal.aborted) {
        this.error.set(peopleError(error).message);
        this.people.set([]);
      }
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }
  navigate(page: number): void {
    const filters = this.form.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        buscar: filters.q.trim() || null,
        tipo: filters.kind || null,
        instrumento: filters.instrument.trim() || null,
        archivo: filters.archive === 'active' ? null : filters.archive,
        pagina: page > 1 ? page : null,
      },
    });
  }
  clear(): void {
    this.form.reset({
      q: '',
      kind: '',
      instrument: '',
      archive: 'active',
    });
  }
}
