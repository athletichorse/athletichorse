/** Small outline icons (inline SVG, no extra packages). */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  pos: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 8H6.2M9 20.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm9 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z",
  stock: "M21 8 12 3 3 8m18 0v8l-9 5m9-13-9 5m0 8-9-5V8m9 13v-8M3 8l9 5",
  sales: "M4 20V10m6 10V4m6 16v-7m6 7H2",
  products: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm4.5-4.5h.01",
  customers: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m20 0v-1a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  staff: "M15 9h3m-3 4h3M4 20h16a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Zm5-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3 5c.5-1.7 1.6-2.5 3-2.5s2.5.8 3 2.5",
  stockLog: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  audit: "M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Zm-3 9 2 2 4-4",
  company: "M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16m0-10h3a1 1 0 0 1 1 1v9M9 8h2m-2 4h2m-2 4h2",
  locations: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  permissions: "M15 7a3 3 0 1 1-3 3m3-3a3 3 0 0 0-3 3m3-3h.01M12 10 3 19v2h3l1-1v-2h2v-2h2l1.6-1.6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.5 3.5-5.5 3.5-9S14.5 5.5 12 3m0 18c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3M3.5 9h17m-17 6h17",
  logout: "M15 17l5-5-5-5m5 5H9m3 9H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7",
  web: "M3 5h18v14H3V5Zm0 4h18M7 7h.01M10 7h.01",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
