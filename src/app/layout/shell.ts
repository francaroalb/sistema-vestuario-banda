import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Connectivity } from '../core/connectivity';
import { Icon } from '../shared/ui/icon';
import { InstallApp } from '../shared/ui/install-app';
import { navigation } from './navigation';
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, InstallApp],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly connection = inject(Connectivity);
  readonly navigation = navigation;
  private readonly router = inject(Router);
  constructor() {
    effect(() => {
      if (this.auth.ready() && !this.auth.busy() && !this.auth.authenticated())
        void this.router.navigate(['/login'], { replaceUrl: true });
    });
  }
  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login'], { replaceUrl: true });
  }
}
