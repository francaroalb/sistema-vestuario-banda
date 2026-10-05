import { NgTemplateOutlet } from '@angular/common';
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
  imports: [ReactiveFormsModule, RouterLink, Icon, NgTemplateOutlet],
  templateUrl: './people-list.html',
  styleUrls: [
    '../inventory/inventory.scss',
    './people.scss',
    '../inventory/inventory-list.scss',
  ],
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
  readonly selectedKind = signal('');
  readonly allKinds = signal(false);
  readonly browsing = signal(true);
  readonly groups = computed(() => {
    const groups = new Map<
      string,
      { key: string; instrument: string; kind: PersonKind; people: PersonRow[] }
    >();
    for (const person of this.people()) {
      const instrument =
        person.instrument?.trim() || 'Sin instrumento indicado';
      const key = person.kind + ':' + instrument.toLocaleLowerCase('es');
      if (!groups.has(key))
        groups.set(key, { key, instrument, kind: person.kind, people: [] });
      groups.get(key)!.people.push(person);
    }
    return [...groups.values()]
      .sort(
        (a, b) =>
          a.kind.localeCompare(b.kind) ||
          a.instrument.localeCompare(b.instrument, 'es'),
      )
      .map((g) => ({
        ...g,
        people: g.people.sort((a, b) =>
          a.full_name.localeCompare(b.full_name, 'es'),
        ),
      }));
  });
  toggleKind(kind: string) {
    this.allKinds.set(false);
    this.form.controls.kind.setValue(this.selectedKind() === kind ? '' : kind, {
      emitEvent: false,
    });
    this.navigate(1);
  }
  showAll() {
    this.allKinds.set(true);
    this.form.controls.kind.setValue('', { emitEvent: false });
    this.navigate(1);
  }
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
      this.selectedKind.set(this.filters.kind);
      this.allKinds.set(params.get('vista') === 'todas');
      this.browsing.set(
        !this.filters.kind &&
          !this.filters.q &&
          !this.filters.instrument &&
          this.filters.archive === 'active' &&
          !this.allKinds() &&
          this.filters.page === 1,
      );
      this.advanced.set(
        Boolean(this.filters.instrument || this.filters.archive !== 'active'),
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
    this.error.set('');
    if (this.browsing()) {
      this.people.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
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
        vista: this.allKinds() ? 'todas' : null,
        buscar: filters.q.trim() || null,
        tipo: filters.kind || null,
        instrumento: filters.instrument.trim() || null,
        archivo: filters.archive === 'active' ? null : filters.archive,
        pagina: page > 1 ? page : null,
      },
    });
  }
  clear(): void {
    this.allKinds.set(false);
    this.form.reset({
      q: '',
      kind: '',
      instrument: '',
      archive: 'active',
    });
  }
}
