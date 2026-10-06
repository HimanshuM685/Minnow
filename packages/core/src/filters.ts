import { z } from 'zod';

// Every value here is either a query input, a hard filter, or a soft rank signal in a hunt (see matching.ts).
export const experienceBands = ['any', 'intern', 'entry', '1-3', '3-5', '5-8', '8+', 'custom'] as const;
export const employmentTypes = ['any', 'full_time', 'part_time', 'contract', 'freelance', 'temporary', 'internship', 'apprenticeship'] as const;
export const postedWindows = ['any', '24h', '3d', '7d', '30d'] as const;
export const radiusOptions = [0, 10, 25, 50] as const;
export const visaOptions = ['any', 'needs_sponsorship', 'no_sponsorship_needed', 'relocation_ok', 'open_globally'] as const;
export const companySizes = ['any', 'startup_1_10', '11_50', '51_200', '201_1000', 'enterprise'] as const;
export const companyStages = ['any', 'pre_seed', 'seed', 'series_a', 'series_b', 'growth', 'public'] as const;
export const industries = ['any', 'ai', 'fintech', 'web3', 'healthcare', 'gaming', 'edtech', 'cybersecurity', 'saas', 'robotics', 'climate'] as const;
export const departments = ['any', 'engineering', 'product', 'design', 'data', 'marketing', 'sales', 'operations'] as const;
export const benefitOptions = ['visa_support', 'equity', 'relocation', 'health'] as const;
export const educationLevels = ['any', 'none', 'bachelor', 'master', 'phd'] as const;
export const languages = ['any', 'en', 'de', 'fr', 'es', 'pt', 'it', 'nl'] as const;
export const salaryPeriods = ['hourly', 'monthly', 'annual'] as const;
export const filterSources = ['careers', 'greenhouse', 'lever', 'ashby', 'workday', 'portal'] as const;

const list = (max: number, length = 80) => z.array(z.string().trim().min(1).max(length)).max(max).default([]);
const years = z.number().int().min(0).max(40).nullable().default(null);

export const huntFiltersSchema = z.object({
  experience: z.object({ band: z.enum(experienceBands).default('any'), min: years, max: years }).default({ band: 'any', min: null, max: null }),
  employmentType: z.enum(employmentTypes).default('any'),
  postedWithin: z.enum(postedWindows).default('any'),
  radiusKm: z.union([z.literal(0), z.literal(10), z.literal(25), z.literal(50)]).default(0),
  skills: list(20),
  skillMode: z.enum(['any', 'all']).default('any'),
  visa: z.enum(visaOptions).default('any'),
  salary: z.object({
    min: z.number().min(0).max(1e9).nullable().default(null), max: z.number().min(0).max(1e9).nullable().default(null),
    currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), period: z.enum(salaryPeriods).default('annual'),
  }).default({ min: null, max: null, currency: 'USD', period: 'annual' }),
  companiesInclude: list(10, 80), companiesExclude: list(20, 80), excludeKeywords: list(20, 60),
  companySize: z.enum(companySizes).default('any'), companyStage: z.enum(companyStages).default('any'),
  industry: z.enum(industries).default('any'), department: z.enum(departments).default('any'),
  benefits: z.array(z.enum(benefitOptions)).max(4).default([]),
  sources: z.array(z.enum(filterSources)).min(1).max(6).default(['careers', 'greenhouse', 'lever', 'ashby', 'portal']),
  education: z.enum(educationLevels).default('any'),
  language: z.enum(languages).default('any'),
});
export type HuntFilters = z.infer<typeof huntFiltersSchema>;
export const defaultFilters: HuntFilters = huntFiltersSchema.parse({});
// Unknown or old stored shapes fall back to defaults field by field, never throw.
export const normalizeFilters = (value: unknown): HuntFilters => huntFiltersSchema.safeParse(value).data ?? defaultFilters;

export type ExperienceRange = { kind: 'any' | 'intern' | 'range'; min: number | null; max: number | null };
export function experienceRange(experience: HuntFilters['experience']): ExperienceRange {
  switch (experience.band) {
    case 'any': return { kind: 'any', min: null, max: null };
    case 'intern': return { kind: 'intern', min: 0, max: 0 };
    case 'entry': return { kind: 'range', min: 0, max: 1 };
    case '1-3': return { kind: 'range', min: 1, max: 3 };
    case '3-5': return { kind: 'range', min: 3, max: 5 };
    case '5-8': return { kind: 'range', min: 5, max: 8 };
    case '8+': return { kind: 'range', min: 8, max: null };
    default: return experience.min === null && experience.max === null ? { kind: 'any', min: null, max: null } : { kind: 'range', min: experience.min, max: experience.max };
  }
}
// The old single "seniority" field is derived from experience, never edited separately.
export function seniorityFor(experience: HuntFilters['experience']): 'any' | 'intern' | 'new_grad' | 'mid' | 'senior' {
  const range = experienceRange(experience);
  if (range.kind === 'any') return 'any';
  if (range.kind === 'intern') return 'intern';
  if ((range.max ?? 99) <= 1) return 'new_grad';
  if ((range.min ?? 0) >= 8) return 'senior';
  return (range.max ?? 99) <= 5 ? 'mid' : 'any';
}
export const storedSeniority = (experience: HuntFilters['experience']): 'any' | 'intern' | 'new_grad' | 'mid' => { const value = seniorityFor(experience); return value === 'senior' ? 'any' : value; };
export const storedVisa = (visa: HuntFilters['visa']): 'any' | 'needs_sponsorship' | 'no' => visa === 'needs_sponsorship' ? 'needs_sponsorship' : visa === 'no_sponsorship_needed' ? 'no' : 'any';
export const postedLimitMs: Record<typeof postedWindows[number], number> = { any: Infinity, '24h': 86_400_000, '3d': 3 * 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };

// Count of drawer filters in use, for the "More filters" badge.
export function activeDrawerCount(filters: HuntFilters, profession = ''): number {
  const d = defaultFilters;
  return [
    profession.trim() !== '', filters.skills.length > 0, filters.visa !== d.visa,
    filters.salary.min !== null || filters.salary.max !== null, filters.companiesInclude.length > 0, filters.companiesExclude.length > 0,
    filters.excludeKeywords.length > 0, filters.companySize !== 'any', filters.companyStage !== 'any', filters.industry !== 'any',
    filters.department !== 'any', filters.benefits.length > 0, [...filters.sources].sort().join() !== [...d.sources].sort().join(),
    filters.education !== 'any', filters.language !== 'any',
  ].filter(Boolean).length;
}
