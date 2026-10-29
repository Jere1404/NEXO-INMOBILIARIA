// Explicit deployment setting. Never select a provider from URL or browser storage.
export const publicDataConfig = Object.freeze({
  provider: 'supabase',
  apiBaseUrl: 'https://ugrqstsuhamjjewusigh.supabase.co/functions/v1/nexo-public-catalog',
  pageSize: 12,
  // Context for the existing Corrientes zone selector, not an implicit result filter.
  localityId: '00000000-0000-4000-8000-000000000018',
});
