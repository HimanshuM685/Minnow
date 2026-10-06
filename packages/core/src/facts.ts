import type { ListingFacts } from './contracts';

// Only what a page states is recorded. Anything unstated stays undefined, never guessed.
const plain = (value: string) => value.replace(/\s+/g, ' ').trim();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeSkill = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

function employmentType(title: string, text: string): ListingFacts['employment_type'] {
  if (/\b(intern(ship)?|co[ -]?op)\b/i.test(title)) return 'internship';
  if (/\bapprentice(ship)?\b/i.test(title)) return 'apprenticeship';
  const head = text.slice(0, 3000);
  const labelled = head.match(/(?:employment|job|position|contract)\s*type\s*[:：|\-]?\s*(full[- ]?time|part[- ]?time|contract(?:or)?|freelance|temporary|temp|internship|apprentice(?:ship)?|permanent)/i)
    ?? head.match(/\b(full[- ]time|part[- ]time|fixed[- ]term contract|freelance|temporary|contractor)\b/i);
  if (!labelled) return undefined;
  const value = labelled[1].toLowerCase().replace(/[- ]/g, '');
  const found: Record<string, ListingFacts['employment_type']> = { fulltime: 'full_time', permanent: 'full_time', parttime: 'part_time', contract: 'contract', contractor: 'contract', fixedtermcontract: 'contract', freelance: 'freelance', temporary: 'temporary', temp: 'temporary', internship: 'internship', apprentice: 'apprenticeship', apprenticeship: 'apprenticeship' };
  return found[value];
}

function education(text: string): ListingFacts['education'] {
  const s = plain(text);
  if (/(?:no|without)\s+(?:formal\s+)?degree\s+(?:is\s+)?required|degree\s+(?:is\s+)?not\s+required/i.test(s)) return 'none';
  const need = (level: string) => new RegExp(`(?:${level})[^.]{0,70}\\b(?:required|must|minimum|is needed)\\b|\\b(?:requires?|required|must (?:have|hold)|minimum)\\b[^.]{0,50}(?:${level})`, 'i').test(s);
  if (need("ph\\.?d|doctorate|doctoral")) return 'phd';
  if (need("master'?s|msc|m\\.s\\.|mba")) return 'master';
  if (need("bachelor'?s|b\\.?sc|b\\.?s\\.|undergraduate degree|bachelors?")) return 'bachelor';
  return undefined;
}

function yearsRequired(text: string): { min: number | null; max: number | null } {
  const match = plain(text).match(/\b(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?\+?\s*years?\s+(?:of\s+)?(?:[\w-]+\s+){0,3}?experience/i);
  return match ? { min: Number(match[1]), max: match[2] ? Number(match[2]) : null } : { min: null, max: null };
}

const symbols: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', USD: 'USD', EUR: 'EUR', GBP: 'GBP', INR: 'INR', CAD: 'CAD', AUD: 'AUD' };
function salary(text: string): ListingFacts['salary'] {
  const s = plain(text);
  const money = /([$€£₹]|USD|EUR|GBP|INR|CAD|AUD)\s?(\d[\d,.]*)\s?(k)?\s*(?:-|–|—|to|and)\s*(?:[$€£₹]|USD|EUR|GBP|INR|CAD|AUD)?\s?(\d[\d,.]*)\s?(k)?/i;
  const match = s.match(money);
  if (!match) return undefined;
  const parse = (value: string, k?: string) => Number(value.replace(/,/g, '')) * (k ? 1000 : 1);
  const lo = parse(match[2], match[3] ?? (match[5] && Number(match[2]) < 1000 ? 'k' : undefined));
  const hi = parse(match[4], match[5]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return undefined;
  const around = s.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + match[0].length + 60);
  const period = /per hour|\/\s?h(ou)?r|hourly/i.test(around) ? 'hourly' : /per month|\/\s?mo(nth)?|monthly/i.test(around) ? 'monthly' : 'annual';
  return { min: lo, max: hi, currency: symbols[match[1].toUpperCase()] ?? symbols[match[1]] ?? 'USD', period };
}

function benefits(text: string): ListingFacts['benefits'] {
  const found: NonNullable<ListingFacts['benefits']> = [];
  if (/\b(equity|stock options?|rsus?)\b/i.test(text)) found.push('equity');
  if (/\brelocation\s+(?:assistance|package|support|bonus|allowance|budget)\b|\bwe (?:offer|provide) relocation\b/i.test(text)) found.push('relocation');
  if (/\bhealth(?:care)?\s+(?:insurance|benefits|coverage|plan)\b|\bmedical\s+(?:insurance|coverage|benefits)\b/i.test(text)) found.push('health');
  return found;
}

const departmentRules: [ListingFacts['department'], RegExp][] = [
  ['product', /\bproduct (manager|owner|lead)\b|\bproduct management\b/i],
  ['design', /\b(designer|design lead|ux|ui|user experience|brand design)\b/i],
  ['data', /\b(data (scientist|analyst|engineer)|machine learning|ml engineer|analytics|research scientist)\b/i],
  ['marketing', /\b(marketing|growth|seo|content (writer|strategist)|brand|communications)\b/i],
  ['sales', /\b(sales|account (executive|manager)|sdr|bdr|business development|customer success)\b/i],
  ['operations', /\b(operations|ops manager|people partner|recruiter|finance|accountant|legal|hr\b|supply chain)\b/i],
  ['engineering', /\b(engineer|developer|sre|devops|programmer|architect|software)\b/i],
];
const industryRules: [ListingFacts['industry'], RegExp][] = [
  ['ai', /\b(artificial intelligence|machine learning|generative ai|large language models?|llms?)\b/gi],
  ['fintech', /\b(fintech|payments|banking|lending|neobank|financial technology)\b/gi],
  ['web3', /\b(web3|blockchain|crypto(?:currency)?|defi|smart contracts?)\b/gi],
  ['healthcare', /\b(healthcare|healthtech|digital health|clinical|patients?|medical devices?)\b/gi],
  ['gaming', /\b(video games?|gaming|game studio|game development)\b/gi],
  ['edtech', /\b(edtech|education technology|online learning|students and teachers)\b/gi],
  ['cybersecurity', /\b(cyber ?security|threat detection|security operations|infosec)\b/gi],
  ['saas', /\b(saas|software[- ]as[- ]a[- ]service|b2b software)\b/gi],
  ['robotics', /\b(robotics|autonomous (vehicles?|systems)|drones?)\b/gi],
  ['climate', /\b(climate|clean ?energy|renewable|carbon|sustainability tech)\b/gi],
];
function industry(text: string): ListingFacts['industry'] {
  const scored = industryRules.map(([name, rule]) => [name, (text.match(rule) ?? []).length] as const).sort((a, b) => b[1] - a[1]);
  return scored[0][1] >= 2 ? scored[0][0] : undefined;
}

function companySize(text: string): ListingFacts['company_size'] {
  const range = text.match(/\b(\d[\d,]*)\s*(?:-|–|to)\s*(\d[\d,]*)\s+(?:employees|people|team members)\b/i);
  const single = text.match(/\b(\d[\d,]*)\+?\s+(?:employees|people worldwide|team members)\b/i);
  const upper = range ? Number(range[2].replace(/,/g, '')) : single ? Number(single[1].replace(/,/g, '')) : null;
  if (upper === null || Number.isNaN(upper)) return undefined;
  return upper <= 10 ? 'startup_1_10' : upper <= 50 ? '11_50' : upper <= 200 ? '51_200' : upper <= 1000 ? '201_1000' : 'enterprise';
}
function companyStage(text: string): ListingFacts['company_stage'] {
  if (/\bpre-?seed\b/i.test(text)) return 'pre_seed';
  if (/\bseed[- ](?:round|stage|funded|funding)\b|\bseed-stage\b/i.test(text)) return 'seed';
  if (/\bseries a\b/i.test(text)) return 'series_a';
  if (/\bseries b\b/i.test(text)) return 'series_b';
  if (/\bseries [c-f]\b|\bgrowth[- ]stage\b|\blate[- ]stage\b/i.test(text)) return 'growth';
  if (/\bpublicly[- ](?:traded|listed)\b|\bnasdaq\b|\bnyse\b/i.test(text)) return 'public';
  return undefined;
}

const stopwords: Record<string, string[]> = {
  en: ['the', 'and', 'with', 'you', 'our', 'will', 'for', 'are', 'to', 'of'],
  de: ['und', 'der', 'die', 'das', 'mit', 'für', 'wir', 'sie', 'ist', 'ein'],
  fr: ['et', 'le', 'la', 'les', 'des', 'vous', 'nous', 'pour', 'une', 'avec'],
  es: ['y', 'el', 'la', 'los', 'las', 'con', 'para', 'una', 'nuestro', 'tu'],
  pt: ['e', 'o', 'os', 'as', 'com', 'para', 'uma', 'você', 'nosso', 'não'],
  it: ['e', 'il', 'la', 'gli', 'con', 'per', 'una', 'noi', 'sei', 'che'],
  nl: ['en', 'het', 'de', 'een', 'met', 'voor', 'wij', 'jij', 'van', 'naar'],
};
export function detectLanguage(text: string): ListingFacts['language'] {
  const words = text.slice(0, 2500).toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 30) return undefined;
  const scores = Object.entries(stopwords).map(([code, list]) => [code, words.filter(word => list.includes(word)).length] as const).sort((a, b) => b[1] - a[1]);
  return scores[0][1] >= 5 && scores[0][1] >= scores[1][1] * 1.5 ? scores[0][0] : undefined;
}

export function parsePostedAt(text: string, published?: string | null, now = Date.now()): string | null {
  if (published && !Number.isNaN(Date.parse(published))) return published;
  const iso = text.match(/(?:datePosted|date posted|posted(?: on)?)["'\s:=]*?(\d{4}-\d{2}-\d{2})/i);
  if (iso) return `${iso[1]}T00:00:00.000Z`;
  const ago = text.match(/\bposted\s+(\d+)\s+(hour|day|week|month)s?\s+ago\b/i);
  if (ago) return new Date(now - Number(ago[1]) * { hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000 }[ago[2].toLowerCase() as 'hour']).toISOString();
  if (/\bposted\s+today\b/i.test(text)) return new Date(now).toISOString();
  if (/\bposted\s+yesterday\b/i.test(text)) return new Date(now - 86_400_000).toISOString();
  return null;
}

export function inferFacts(title: string, text: string, skills: string[] = []): ListingFacts {
  const haystack = normalizeSkill(`${title} ${text}`);
  const found = skills.filter(skill => new RegExp(`(^|[^a-z0-9+#])${escape(normalizeSkill(skill))}($|[^a-z0-9+#])`).test(haystack));
  const years = yearsRequired(text);
  const facts: ListingFacts = {
    employment_type: employmentType(title, text), education: education(text), years_min: years.min, years_max: years.max,
    salary: salary(text), benefits: benefits(text), department: departmentRules.find(([, rule]) => rule.test(title))?.[0],
    industry: industry(text), company_size: companySize(text), company_stage: companyStage(text), language: detectLanguage(text), skills_found: found,
  };
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined)) as ListingFacts;
}
