import {
  ChangeDetectionStrategy,
  Component,
  effect,
  computed,
  inject,
} from '@angular/core';
import {
  Router,
  RouterLink,
  NavigationEnd,
  RouterOutlet,
} from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Connectivity } from '../core/connectivity';
import { Icon } from '../shared/ui/icon';
import { InstallApp } from '../shared/ui/install-app';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import {
  navigation,
  folderNavigation,
  folderSection,
  NavigationItem,
} from './navigation';
import { Feedback } from '../core/feedback';
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, Icon, InstallApp],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly connection = inject(Connectivity);

  readonly feedback = inject(Feedback);
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  readonly section = computed(() => folderSection(this.currentUrl()));
  readonly navigation = computed(() =>
    this.section() ? folderNavigation : navigation,
  );
  readonly title = computed(() =>
    this.section() ? 'Carpetas musicales' : 'Gestión de trajes',
  );
  active(item: NavigationItem): boolean {
    if (this.section()) return item.path === this.section();
    const path = this.currentUrl().split(/[?#]/)[0];
    return path === item.path || path.startsWith(item.path + '/');
  }
  constructor() {
    effect(() => {
      if (this.auth.ready() && !this.auth.busy() && !this.auth.authenticated())
        void this.router.navigate(['/login'], { replaceUrl: true });
    });
  }
  async signOut(): Promise<void> {
    this.feedback.dismiss();
    await this.auth.signOut();
    await this.router.navigate(['/login'], { replaceUrl: true });
  }
}
