export type Seniority = 'intern' | 'new_grad' | 'mid' | 'any' | 'senior' | 'unknown';
export type WorkMode = 'onsite' | 'hybrid' | 'remote' | 'any' | 'unknown';
export type VisaPreference = 'needs_sponsorship' | 'no' | 'any';
export type VisaSignal = 'sponsors' | 'no_sponsor' | 'unknown';

export interface ProfileRow { user_id: string; display_name: string; profession: string; headline: string; created_at: string; updated_at: string; }
export interface PreferenceRow { user_id: string; role: string; profession: string; location_label: string; location_country_code: string; seniority: Exclude<Seniority, 'senior' | 'unknown'>; work_mode: Exclude<WorkMode, 'unknown'>; visa: VisaPreference; keywords: string[]; filters: Record<string, unknown>; updated_at: string; }
export interface WalletRow { user_id: string; credits: number; tinyfish_key: string | null; updated_at: string; }
export interface ResumeRow { id: string; user_id: string; file_name: string; mime: string; bytes: number; extracted_text: string; uploaded_at: string; }
export interface SearchRow { id: string; user_id: string; preference_snapshot: Record<string, unknown>; status: 'running' | 'done' | 'error'; error: string | null; cache_hit: boolean; search_count: number; fetch_count: number; agent_count: number; created_at: string; finished_at: string | null; }
export interface SearchEventRow { id: number; search_id: string; step: 'search' | 'fetch' | 'agent' | 'parse' | 'rank'; host: string | null; url: string | null; ok: boolean; detail: string; created_at: string; }
export interface ListingRow { id: string; search_id: string; user_id: string; dedupe_key: string; title: string; company: string; location: string; seniority: Seniority; work_mode: WorkMode; visa_signal: VisaSignal; snippet: string; apply_url: string; source_url: string; source_name: string; score: number; match_reasons: string[]; uncertainties: string[]; facts: Record<string, unknown>; fetched_at: string; hidden: boolean; hidden_reason: string | null; }
export interface SourceHealthRow { host: string; last_ok_at: string | null; last_error_at: string | null; last_error: string | null; ok_count: number; error_count: number; skipped: boolean; }

export interface DbListingInput { userId: string; searchId: string; dedupeKey: string; title: string; company: string; location: string; seniority: string; workMode: string; visaSignal: string; snippet: string; applyUrl: string; sourceUrl: string; sourceName: string; score: number; matchReasons: string[]; uncertainties?: string[]; facts?: Record<string, unknown>; fetchedAt?: string; }
export interface SearchHistoryRow { id: string; status: 'running' | 'done' | 'error'; error: string | null; cache_hit: boolean; created_at: string; finished_at: string | null; preference_snapshot: Record<string, unknown>; found: number; best: number | null; }
export interface BestMatchRow extends ListingRow { search_role: string; search_created_at: string; }
export interface SearchInput { userId: string; preferenceSnapshot: Record<string, unknown>; cacheHit?: boolean; }
