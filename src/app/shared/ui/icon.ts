import { ChangeDetectionStrategy, Component, input } from '@angular/core';
const paths = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  calendar:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 14h2M15 14h2M7 17h2',
  hanger: 'M9 6a3 3 0 1 1 4 3v2l8 6a1 1 0 0 1-.6 2H3.6a1 1 0 0 1-.6-2l10-6',
  people:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  exchange: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5ZM12 14v3',
  logout: 'M9 3H4v18h5M10 12h11m-4-4 4 4-4 4',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  check: 'm5 12 4 4L19 6',
} as const;
export type IconName = keyof typeof paths;
@Component({
  selector: 'app-icon',
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="paths[name()]" /></svg>',
  styles:
    ':host{display:inline-flex;flex-shrink:0;width:1.35rem;height:1.35rem}svg{width:100%;height:100%}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly paths = paths;
}
