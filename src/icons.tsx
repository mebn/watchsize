import type { SVGProps } from 'react'

const paths = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  ghost: 'M12 5C7 5 3 12 3 12s4 7 9 7 9-7 9-7-4-7-9-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12l5 5 9-10',
  front: 'M8 8h12v12H8zM4 16V4h12',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h0',
  back: 'M15 6l-6 6 6 6',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8.5h0',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  )
}

/** Brand mark: a tiny watch with a sweeping seconds hand */
export function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M9 2h6M9 22h6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="7.5" />
      <line className="sweep" x1="12" y1="12" x2="12" y2="6.5" strokeLinecap="round" strokeWidth={1.6} />
    </svg>
  )
}
