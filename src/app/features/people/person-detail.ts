import { LoanHistory } from '../loans/loan-history';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Connectivity } from '../../core/connectivity';
import { Feedback } from '../../core/feedback';
import { PersonRow } from '../../core/config/database.types';
import { formatTimestamp } from '../../core/inventory/inventory';
import {
  peopleError,
  peopleReturnUrl,
  personKindLabel,
} from '../../core/people/people';
import { PeopleRepository } from '../../core/people/people-repository';
import { Icon } from '../../shared/ui/icon';
@Component({
  selector: 'app-person-detail',
  imports: [LoanHistory, RouterLink, Icon],
  templateUrl: './person-detail.html',
  styleUrls: ['../inventory/inventory.scss', './people.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(PeopleRepository);
  private readonly feedback = inject(Feedback);
  readonly connection = inject(Connectivity);
  readonly person = signal<PersonRow | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly saving = signal(false);
  readonly conflict = signal(false);
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('archiveDialog');
  readonly timestamp = formatTimestamp;
  readonly kindLabel = personKindLabel;
  readonly returnTo = peopleReturnUrl(
    this.route.snapshot.queryParamMap.get('volver'),
  );
  readonly backLink = inject(Router).parseUrl(this.returnTo);
  private request = 0;
  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.load());
  }
  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.person.set(null);
    try {
      const person = await this.repository.get(
        this.route.snapshot.paramMap.get('id') ?? '',
      );
      if (request === this.request) this.person.set(person);
    } catch (error) {
      if (request === this.request) this.error.set(peopleError(error).message);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  confirmArchive(): void {
    this.actionError.set('');
    this.conflict.set(false);
    this.dialog()?.nativeElement.showModal();
  }
  cancelDialog(event?: Event): void {
    if (this.saving()) event?.preventDefault();
    else this.dialog()?.nativeElement.close();
  }
  reload(): void {
    this.dialog()?.nativeElement.close();
    void this.load();
  }
  async archive(): Promise<void> {
    const person = this.person();
    if (!person || this.saving() || !this.connection.online()) return;
    this.saving.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const row = await this.repository.archive(person, !person.archived_at);
      this.person.set(row);
      this.dialog()?.nativeElement.close();
      this.feedback.success(
        row.full_name +
          (row.archived_at
            ? ' archivada. Su información se conserva.'
            : ' reactivada en Personas.'),
      );
    } catch (error) {
      const failure = peopleError(error);
      this.actionError.set(failure.message);
      this.conflict.set(failure.conflict);
    } finally {
      this.saving.set(false);
    }
  }
}
