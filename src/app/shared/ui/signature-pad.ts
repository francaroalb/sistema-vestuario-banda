import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
@Component({
  selector: 'app-signature-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="signature-heading">
      <label [for]="canvasId">Firma de la persona</label
      ><button
        class="btn btn-quiet"
        type="button"
        (click)="clear()"
        [disabled]="disabled()"
      >
        Limpiar firma
      </button>
    </div>
    <p [id]="canvasId + '-help'">
      Firma con el dedo o el ratón para confirmar las prendas indicadas. El
      dibujo se descartará al confirmar.
    </p>
    <canvas
      #canvas
      width="1600"
      height="320"
      [id]="canvasId"
      [class.signed]="valid()"
      [class.disabled]="disabled()"
      role="img"
      aria-label="Área de firma"
      [attr.aria-describedby]="canvasId + '-help'"
      (pointerdown)="start($event)"
      (pointermove)="draw($event)"
      (pointerup)="end($event)"
      (pointercancel)="cancel($event)"
    ></canvas>
    <p class="signature-status" [class.confirmed]="valid()" role="status">
      {{ valid() ? 'Firma preparada.' : 'Dibuja la firma antes de confirmar.' }}
    </p>
  `,
  styles: `
    :host {
      display: block;
    }
    .signature-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      flex-wrap: wrap;
      font-size: var(--text-sm);
      label {
        font-weight: 700;
      }
    }
    p {
      font-size: var(--text-xs);
      line-height: 1.7;
      color: var(--color-muted);
    }
    canvas {
      display: block;
      width: 100%;
      height: 10rem;
      border: 1px dashed var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface-subtle);
      touch-action: none;
      scroll-margin-block: 6rem;
      cursor: crosshair;
      transition:
        border-color var(--duration-fast),
        background-color var(--duration-fast);
      &.signed {
        border-color: var(--color-success);
        background: var(--color-surface);
      }
      &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
    .signature-status {
      color: var(--color-muted);
      font-weight: 600;
      &.confirmed {
        color: var(--color-success);
      }
    }
  `,
})
export class SignaturePad implements OnDestroy {
  readonly disabled = input(false);
  readonly signed = output<boolean>();
  readonly valid = signal(false);
  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly canvasId = 'signature-' + crypto.randomUUID();
  private pointer: number | null = null;
  private last = { x: 0, y: 0 };
  private distance = 0;
  private segments = 0;
  clear() {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    this.pointer = null;
    this.distance = 0;
    this.segments = 0;
    this.valid.set(false);
    this.signed.emit(false);
  }
  private point(event: PointerEvent) {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  start(event: PointerEvent) {
    if (this.disabled() || this.pointer !== null || event.button !== 0) return;
    event.preventDefault();
    this.valid.set(false);
    this.signed.emit(false);
    this.pointer = event.pointerId;
    this.last = this.point(event);
    this.canvas().nativeElement.setPointerCapture(event.pointerId);
  }
  draw(event: PointerEvent) {
    if (this.disabled() || event.pointerId !== this.pointer) return;
    event.preventDefault();
    const point = this.point(event),
      ctx = this.canvas().nativeElement.getContext('2d');
    if (!ctx) return;
    const element = this.canvas().nativeElement;
    const rect = element.getBoundingClientRect();
    ctx.setTransform(
      element.width / rect.width,
      0,
      0,
      element.height / rect.height,
      0,
      0,
    );
    ctx.strokeStyle = '#5d0c12';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.last.x, this.last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    this.distance += Math.hypot(point.x - this.last.x, point.y - this.last.y);
    this.segments++;
    this.last = point;
  }
  end(event: PointerEvent) {
    if (event.pointerId !== this.pointer) return;
    this.pointer = null;
    const valid = this.distance >= 25 && this.segments >= 3;
    this.valid.set(valid);
    this.signed.emit(valid);
  }
  cancel(event: PointerEvent) {
    if (event.pointerId === this.pointer) this.clear();
  }
  ngOnDestroy() {
    this.canvas().nativeElement.width = 0;
    this.pointer = null;
  }
}
