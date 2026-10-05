import { Injectable, signal } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class Feedback {
  readonly message = signal('');
  private timer?: ReturnType<typeof setTimeout>;
  success(message: string): void {
    clearTimeout(this.timer);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(''), 7000);
  }
  dismiss(): void {
    clearTimeout(this.timer);
    this.message.set('');
  }
}
