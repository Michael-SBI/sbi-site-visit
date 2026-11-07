// Small line icons (24px grid, drawn with currentColor).
const P: Record<string, string> = {
  pen: "M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3",
  line: "M5 19L19 5",
  highlighter: "M9 14l-4 4v2h6l2-2M9 14l7-9 4 4-7 9-4-4zM12 11l2 2",
  stamp: "M8 12h8M9 4h6l-1 8h-4L9 4zM5 15h14v3H5zM4 21h16",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z",
  unlock: "M7 11V8a5 5 0 019.6-2M6 11h12v9H6z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z",
  plus: "M12 5v14M5 12h14",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  send: "M4 12l16-8-6 16-2-6-8-2zM12 14l8-10",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  folder: "M3 7h6l2 2h10v10H3z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  down: "M6 9l6 6 6-6",
  up: "M12 19V5M5 12l7-7 7 7",
  link: "M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1",
  close: "M6 6l12 12M18 6L6 18",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 00-2-1.2L14 3h-4l-.5 2.5a7 7 0 00-2 1.2l-2.4-.9-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-.9a7 7 0 002 1.2L10 21h4l.5-2.5a7 7 0 002-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  pdf: "M6 3h8l4 4v14H6zM14 3v4h4M8.5 16h7M8.5 13h7",
  drawing: "M6 3h8l4 4v14H6zM14 3v4h4M8 17c2-4 4 0 6-3",
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.file} />
    </svg>
  );
}
