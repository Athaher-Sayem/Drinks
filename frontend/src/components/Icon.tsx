const paths = {
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  diagonal: 'M6 18 18 6M6 6h12v12',
  bag: 'M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2',
  search: 'm21 21-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  user: 'M4 21v-2a8 8 0 0 1 16 0v2M12 11a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  box: 'm3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5',
  leaf: 'M20 3c-8-1-16 1-16 9a7 7 0 0 0 7 7c8 0 10-8 9-16ZM3 22 15 10',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  chevron: 'm6 9 6 6 6-6',
  truck: 'M1 4h13v13H1V4Zm13 5h5l4 4v4h-9V9ZM5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Zm-4 10 3 3 5-6',
  back: 'M20 12H5m6-6-6 6 6 6',
} as const;

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function BrandMark() {
  return <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="currentColor" /><path d="M20 7c1.7 7 6 11.3 13 13-7 1.7-11.3 6-13 13-1.7-7-6-11.3-13-13 7-1.7 11.3-6 13-13Z" fill="white" /><circle cx="20" cy="20" r="3" fill="currentColor" /></svg>;
}
