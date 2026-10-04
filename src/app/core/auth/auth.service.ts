import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { SupabaseService } from '../config/supabase';
import { AdminProfile } from '../config/database.types';

class AccessError extends Error {}

export function loginError(error: unknown): string {
  const info = error as {
    code?: string;
    status?: number;
    name?: string;
  } | null;
  if (info?.status === 429)
    return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
  if (
    info?.code === 'invalid_credentials' ||
    info?.code === 'email_not_confirmed'
  )
    return 'El correo o la contraseña no son correctos, o el acceso aún no está activado.';
  return 'No hemos podido conectar. Comprueba tu conexión y vuelve a intentarlo.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  readonly profile = signal<AdminProfile | null>(null);
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly notice = signal('');
  readonly authenticated = computed(() => this.profile() !== null);
  readonly configured = this.supabase.client !== null;
  private pending: Promise<boolean> | null = null;
  private generation = 0;

  constructor() {
    const client = this.supabase.client;
    if (!client) {
      this.ready.set(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!session) {
        this.generation++;
        this.profile.set(null);
        this.ready.set(true);
        return;
      }
      // Never await Supabase calls inside its auth callback (it holds an auth lock).
      if (event !== 'INITIAL_SESSION' && !this.busy()) {
        clearTimeout(timer);
        timer = setTimeout(() => void this.restore(), 0);
      }
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !this.busy())
        void this.restore();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      data.subscription.unsubscribe();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  restore(): Promise<boolean> {
    if (!this.pending) {
      this.pending = this.loadSession().finally(() => {
        this.pending = null;
        this.ready.set(true);
      });
    }
    return this.pending;
  }

  private async loadSession(): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const generation = this.generation;
    try {
      const { data: session, error: sessionError } =
        await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session.session) {
        this.profile.set(null);
        return false;
      }
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      const { data: profile, error: profileError } = await client
        .from('admin_profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .eq('active', true)
        .maybeSingle();
      if (profileError) throw profileError;
      if (generation !== this.generation) return false;
      if (!profile || profile.role !== 'ADMIN') {
        this.notice.set(
          'Tu usuario no tiene acceso activo. Contacta con un responsable de la Banda.',
        );
        this.profile.set(null);
        await client.auth.signOut({ scope: 'local' });
        return false;
      }
      this.profile.set(profile);
      this.notice.set('');
      return true;
    } catch {
      if (generation === this.generation) {
        this.profile.set(null);
        this.notice.set(
          'No hemos podido verificar tu acceso. Comprueba la conexión y vuelve a entrar.',
        );
      }
      return false;
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const client = this.supabase.client;
    if (!client)
      throw new Error(
        'El acceso todavía no está configurado. Contacta con un responsable.',
      );
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set('');
    try {
      if (this.pending) await this.pending;
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new AccessError(loginError(error));
      if (!(await this.restore()))
        throw new AccessError(
          this.notice() || 'No se ha podido verificar tu acceso.',
        );
    } catch (error) {
      throw error instanceof AccessError
        ? error
        : new AccessError(loginError(error));
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.busy.set(true);
    this.generation++;
    this.profile.set(null);
    this.notice.set('');
    try {
      const result = await this.supabase.client?.auth.signOut({
        scope: 'local',
      });
      if (result?.error) throw result.error;
    } catch {
      // Clear this application's persisted session even if the network is unavailable.
      try {
        localStorage.removeItem('bml-vestuario-auth');
      } catch {
        /* restricted storage */
      }
      this.notice.set('Sesión cerrada en este dispositivo.');
    } finally {
      this.busy.set(false);
    }
  }
}
