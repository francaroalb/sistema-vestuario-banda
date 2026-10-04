import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/auth.guard';
import { Connectivity } from '../../core/connectivity';
import { Icon } from '../../shared/ui/icon';
import { InstallApp } from '../../shared/ui/install-app';
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Icon, InstallApp],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  readonly auth = inject(AuthService);
  readonly connection = inject(Connectivity);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly showPassword = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  async submit(): Promise<void> {
    if (this.auth.busy()) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.connection.online()) return;
    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.signIn(email, password);
      this.form.controls.password.reset();
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'No se ha podido iniciar sesión. Vuelve a intentarlo.',
      );
    }
  }
}
