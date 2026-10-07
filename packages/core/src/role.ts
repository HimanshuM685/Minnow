// Role understanding shared by query building and title matching: typo repair, synonyms, intern-only roles.
const VOCAB = ['engineer', 'engineering', 'developer', 'designer', 'analyst', 'scientist', 'manager', 'intern', 'internship', 'software', 'machine', 'learning', 'backend', 'frontend', 'fullstack', 'product', 'marketing', 'associate', 'researcher', 'architect', 'consultant', 'specialist', 'coordinator', 'administrator', 'devops', 'security', 'platform', 'mobile', 'android', 'cloud', 'quality', 'assurance', 'technical', 'support', 'customer', 'success', 'operations', 'finance', 'accountant', 'recruiter', 'writer', 'content', 'graphic', 'intelligence', 'artificial', 'graduate', 'trainee', 'apprentice', 'programmer', 'generative', 'infrastructure', 'reliability', 'business', 'development', 'sales', 'representative', 'executive'];

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = keep;
    }
  }
  return row[b.length];
}
// "Enginner" -> "engineer". Only touches words that are not already known and are long enough to be unambiguous.
export function fixWord(word: string): string {
  if (word.length < 5 || VOCAB.includes(word)) return word;
  const allowed = word.length >= 8 ? 2 : 1;
  let best = word; let bestDistance = allowed + 1;
  for (const candidate of VOCAB) {
    if (Math.abs(candidate.length - word.length) > allowed) continue;
    const d = distance(word, candidate);
    if (d < bestDistance) { best = candidate; bestDistance = d; }
  }
  return bestDistance <= allowed ? best : word;
}
// Keeps the original spelling and case of every word that did not need repair.
export const fixTypos = (text: string) => text.split(/(\s+)/).map(part => { if (/^\s*$/.test(part)) return part; const clean = part.toLowerCase().replace(/[^a-z0-9+#]/g, ''); const fixed = fixWord(clean); return fixed === clean ? part : fixed; }).join('');

// Words that can stand in for one another in a job title. Matching is on whole words/phrases only.
const alternatives: Record<string, string[]> = {
  ai: ['ai', 'ml', 'machine learning', 'llm', 'genai', 'generative ai', 'artificial intelligence', 'applied scientist', 'deep learning'],
  ml: ['ml', 'machine learning', 'ai', 'llm', 'deep learning'],
  machine: ['machine', 'ml', 'ai'], learning: ['learning', 'ml', 'ai'],
  engineer: ['engineer', 'developer', 'swe', 'sde', 'programmer'], developer: ['developer', 'engineer', 'swe', 'sde', 'programmer'],
  software: ['software', 'swe', 'sde'], frontend: ['frontend', 'front end', 'ui'], backend: ['backend', 'back end', 'server'],
  designer: ['designer', 'design'], analyst: ['analyst', 'analytics'], scientist: ['scientist', 'science', 'researcher'],
};
export const alternativesFor = (word: string) => alternatives[word] ?? [word];
export const INTERN_MARKERS = /\b(intern(?:ship)?s?|co[ -]?op|trainee|apprentice(?:ship)?|working student|werkstudent|summer analyst|student program)\b/i;
export const SENIORITY_WORDS = /\b(senior|sr\.?|staff|principal|lead|head|director|manager|vp|chief|architect)\b/i;
const internOnlyWords = new Set(['intern', 'interns', 'internship', 'internships', 'trainee', 'apprentice', 'graduate', 'entry', 'level', 'junior', 'student', 'fresher']);
// "Intern", "Internship", "Graduate trainee": the role says level only, discipline comes from profession/keywords.
export function isLevelOnlyRole(role: string): boolean {
  const words = role.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.length > 0 && words.every(word => internOnlyWords.has(word));
}
