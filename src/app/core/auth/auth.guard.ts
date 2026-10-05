import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export function safeReturnUrl(value: string | null): string {
  return value &&
    /^\/(inicio|actuaciones|inventario|personas|cesiones|conflictos)(?:[/?#]|$)/.test(
      value,
    ) &&
    !value.includes('\\')
    ? value
    : '/inicio';
}
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.restore())
    ? true
    : router.createUrlTree(['/login'], {
        queryParams: { returnUrl: safeReturnUrl(state.url) },
      });
};
export const childAuthGuard: CanActivateChildFn = authGuard;
export const guestGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.restore())
    ? router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')))
    : true;
};
