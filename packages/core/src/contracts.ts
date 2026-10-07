import { z } from 'zod';
import { defaultFilters, huntFiltersSchema } from './filters';

export const sourceNames = ['careers', 'greenhouse', 'lever', 'ashby', 'workday', 'portal'] as const;
export const seniorities = ['intern', 'new_grad', 'mid', 'senior', 'unknown'] as const;
export const workModes = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export const visaSignals = ['sponsors', 'no_sponsor', 'unknown'] as const;

export const preferencesSchema = z.object({
  role: z.string().trim().min(2, 'Enter a role with at least two characters.').max(120),
  location: z.string().trim().max(180).default(''),
  country: z.string().regex(/^[A-Z]{2}$/).or(z.literal('')).default(''),
  keywords: z.string().trim().max(300).default(''),
  profession: z.string().trim().max(120).default(''),
  resumeKeywords: z.array(z.string().max(80)).max(30).default([]),
  seniority: z.enum(['any', 'intern', 'new_grad', 'mid', 'senior']).default('any'),
  workMode: z.enum(['any', 'remote', 'hybrid', 'onsite']).default('any'),
  visa: z.enum(['any', 'needs_sponsorship', 'confirmed_only']).default('any'),
  sources: z.array(z.enum(sourceNames)).min(1, 'Select at least one source to search.').max(6).default(['careers', 'greenhouse', 'lever', 'ashby', 'portal']),
  careersUrls: z.array(z.string().url().max(1500)).max(3).default([]),
  useAgent: z.boolean().default(true),
  filters: huntFiltersSchema.default(defaultFilters),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const defaultPreferences: Preferences = {
  role: '', location: '', country: '', keywords: '', profession: '', resumeKeywords: [], seniority: 'any',
  workMode: 'any', visa: 'any', sources: ['careers', 'greenhouse', 'lever', 'ashby', 'portal'], careersUrls: [], useAgent: true, filters: defaultFilters,
};

// Facts a posting states about itself. Missing means not stated.
export const listingFactsSchema = z.object({
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'freelance', 'temporary', 'internship', 'apprenticeship']).optional(),
  education: z.enum(['none', 'bachelor', 'master', 'phd']).optional(),
  years_min: z.number().nullable().optional(), years_max: z.number().nullable().optional(),
  salary: z.object({ min: z.number(), max: z.number(), currency: z.string(), period: z.enum(['hourly', 'monthly', 'annual']) }).optional(),
  benefits: z.array(z.enum(['visa_support', 'equity', 'relocation', 'health'])).optional(),
  department: z.enum(['engineering', 'product', 'design', 'data', 'marketing', 'sales', 'operations']).optional(),
  industry: z.enum(['ai', 'fintech', 'web3', 'healthcare', 'gaming', 'edtech', 'cybersecurity', 'saas', 'robotics', 'climate']).optional(),
  company_size: z.enum(['startup_1_10', '11_50', '51_200', '201_1000', 'enterprise']).optional(),
  company_stage: z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'growth', 'public']).optional(),
  language: z.string().optional(), skills_found: z.array(z.string()).optional(),
  // Read from the company's live ATS board (so it is open right now) and which hard filters a near match relaxed.
  open_on_board: z.boolean().optional(), relaxed: z.array(z.string()).optional(),
  // Per-user score parts written by matchListings: earned / possible points per dimension the user set.
  breakdown: z.record(z.object({ earned: z.number(), possible: z.number() })).optional(),
});
export type ListingFacts = z.infer<typeof listingFactsSchema>;

export const listingSchema = z.object({
  id: z.string(), title: z.string().min(2).max(200), company: z.string().min(1).max(120),
  location: z.string().max(250), seniority: z.enum(seniorities), work_mode: z.enum(workModes),
  visa_signal: z.enum(visaSignals), visa_evidence: z.string().max(700),
  snippet: z.string().max(800), apply_url: z.string().url(), source_url: z.string().url(),
  source_name: z.enum(sourceNames), sources: z.array(z.string().url()),
  posted_at: z.string().nullable(), checked_at: z.string(),
  extraction: z.enum(['fetch', 'agent']), verification: z.enum(['detail', 'board']),
  match_score: z.number().min(0).max(100), match_reasons: z.array(z.string()),
  uncertainties: z.array(z.string()),
  facts: listingFactsSchema.default({}),
});
export type Listing = z.infer<typeof listingSchema>;
export type SourceName = typeof sourceNames[number];

export interface SourceReport {
  url: string;
  name: string;
  stage: 'search' | 'fetch' | 'agent';
  status: 'ok' | 'empty' | 'error' | 'skipped';
  message: string;
  count: number;
}
export interface RunStats {
  searchRequests: number;
  fetchRequests: number;
  fetchedPages: number;
  agentRuns: number;
  discoveredUrls: number;
  extracted: number;
  duplicatesRemoved: number;
  filteredOut: number;
  companies: number;
  durationMs: number;
}
export interface SearchResult {
  runId: string;
  preferences: Preferences;
  listings: Listing[];
  reports: SourceReport[];
  stats: RunStats;
  checkedAt: string;
  cached: boolean;
  drops: Record<string, number>;
  strict: number;
  near: number;
  relaxed: string[];
}
export type Stage = 'search' | 'fetch' | 'agent' | 'rank' | 'complete';
export type SearchEvent =
  | { type: 'started'; runId: string }
  | { type: 'progress'; stage: Stage; message: string }
  | { type: 'source'; report: SourceReport }
  | { type: 'partial'; listings: Listing[] }
  | { type: 'complete'; result: SearchResult }
  | { type: 'error'; message: string };

export const labels = {
  seniority: { any: 'Any experience', intern: 'Internship', new_grad: 'New grad', mid: 'Mid-level', senior: 'Senior', unknown: 'Experience not stated' },
  workMode: { any: 'Any work mode', remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite', unknown: 'Work mode not stated' },
  visa: { sponsors: 'Sponsorship mentioned', no_sponsor: 'No sponsorship', unknown: 'Sponsorship not stated' },
  source: { careers: 'Company careers', greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workday: 'Workday', portal: 'Job boards' },
};
