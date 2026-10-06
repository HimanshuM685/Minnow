import { z } from 'zod';
import { defaultPreferences, huntFiltersSchema, seniorityFor, storedSeniority, storedVisa, type Preferences } from '@minnow/core';

// The one shape the search form produces. Experience and visa live only in `filters`; the legacy
// seniority/visa columns are derived from it on the way to the database and to the pipeline.
export const huntInputSchema = z.object({
  role: z.string().trim().min(2, 'Enter a role with at least two characters.').max(120),
  profession: z.string().trim().max(120).default(''),
  location_label: z.string().trim().max(180).default(''),
  location_country_code: z.string().regex(/^[A-Z]{2}$/).or(z.literal('')).default(''),
  work_mode: z.enum(['onsite', 'hybrid', 'remote', 'any']).default('any'),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  filters: huntFiltersSchema,
});
export type HuntInput = z.infer<typeof huntInputSchema>;

export const toRow = (input: HuntInput) => ({
  ...input, seniority: storedSeniority(input.filters.experience), visa: storedVisa(input.filters.visa),
});

export function toPreferences(input: HuntInput, resumeKeywords: string[]): Preferences {
  const city = !/\bremote\b/i.test(input.location_label);
  return {
    ...defaultPreferences, role: input.role, profession: input.profession, location: input.location_label, country: input.location_country_code,
    seniority: seniorityFor(input.filters.experience), workMode: input.work_mode,
    visa: input.filters.visa === 'needs_sponsorship' ? 'needs_sponsorship' : 'any',
    keywords: input.keywords.join(', '), resumeKeywords, sources: input.filters.sources,
    // Radius only means something for a city, never for "Remote".
    filters: { ...input.filters, radiusKm: city ? input.filters.radiusKm : 0 },
  };
}
