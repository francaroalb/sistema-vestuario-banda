import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AppConfig {
  supabaseUrl = '';
  supabasePublishableKey = '';
  get configured(): boolean {
    return Boolean(this.supabaseUrl && this.supabasePublishableKey);
  }

  async load(): Promise<void> {
    try {
      const response = await fetch('/app-config.json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') return;
      const config = data as Record<string, unknown>;
      const url = config['supabaseUrl'];
      const key = config['supabasePublishableKey'];
      if (typeof url !== 'string' || typeof key !== 'string' || !url || !key)
        return;
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' &&
        !['127.0.0.1', 'localhost'].includes(parsed.hostname)
      )
        return;
      let safe = key.startsWith('sb_publishable_');
      if (!safe) {
        try {
          safe =
            JSON.parse(
              atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
            ).role === 'anon';
        } catch {
          /* invalid key */
        }
      }
      if (!safe) return;
      this.supabaseUrl = parsed.origin;
      this.supabasePublishableKey = key;
    } catch {
      /* A missing configuration never enables access. */
    }
  }
}
