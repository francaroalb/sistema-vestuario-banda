import { TestBed } from '@angular/core/testing';
import { AuthService, loginError } from './auth.service';
import { SupabaseService } from '../config/supabase';

describe('Autorización de acceso', () => {
  const profile = {
    user_id: 'admin',
    display_name: 'Fran',
    active: true,
    role: 'ADMIN',
  };
  let client: any;
  let lookup: ReturnType<typeof vi.fn>;
  let callback: (event: string, session: unknown) => void;
  beforeEach(() => {
    lookup = vi.fn().mockResolvedValue({ data: profile, error: null });
    client = {
      auth: {
        onAuthStateChange: vi.fn((fn) => {
          callback = fn;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'admin' } } },
          error: null,
        }),
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: lookup }) }) }),
      })),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client } }],
    });
  });
  it('restaura y vuelve a comprobar el perfil, sin autorización memorizada indefinidamente', async () => {
    const auth = TestBed.inject(AuthService);
    expect(await auth.restore()).toBe(true);
    lookup.mockResolvedValue({ data: null, error: null });
    expect(await auth.restore()).toBe(false);
    expect(auth.authenticated()).toBe(false);
    expect(client.auth.signOut).toHaveBeenCalled();
  });
  it('no autoriza con perfil ausente ni cuando la verificación falla', async () => {
    lookup.mockResolvedValue({ data: null, error: { message: 'network' } });
    expect(await TestBed.inject(AuthService).restore()).toBe(false);
  });
  it('descarta una respuesta tardía después de cerrar sesión', async () => {
    let resolve!: (result: unknown) => void;
    lookup.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const auth = TestBed.inject(AuthService);
    const pending = auth.restore();
    await vi.waitFor(() => expect(lookup).toHaveBeenCalled());
    callback('SIGNED_OUT', null);
    resolve({ data: profile, error: null });
    expect(await pending).toBe(false);
    expect(auth.authenticated()).toBe(false);
  });
  it('no muestra mensajes internos del servidor', () => {
    expect(loginError({ code: 'invalid_credentials' })).toContain(
      'correo o la contraseña',
    );
    expect(loginError({ status: 429 })).toContain('Demasiados intentos');
    expect(loginError({ message: 'postgres internal secret' })).not.toContain(
      'postgres',
    );
  });
  it('traduce fallos inesperados y permite reintentar', async () => {
    client.auth.signInWithPassword.mockRejectedValue(
      new Error('internal storage failure'),
    );
    const auth = TestBed.inject(AuthService);
    await expect(
      auth.signIn('prueba@example.test', 'test-only'),
    ).rejects.toThrow('No hemos podido conectar');
    expect(auth.busy()).toBe(false);
  });
});
