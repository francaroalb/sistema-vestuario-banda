import { inject, Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { AppConfig } from './app-config';
import { Database } from './database.types';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly config = inject(AppConfig);
  readonly client = this.config.configured
    ? createClient<Database>(
        this.config.supabaseUrl,
        this.config.supabasePublishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: 'bml-vestuario-auth',
          },
          global: {
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                signal: init?.signal
                  ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
                  : AbortSignal.timeout(15000),
                cache: 'no-store',
              }),
          },
        },
      )
    : null;
}
