// Geographic aliases help interpret user input; these are not job/source inventories.
export const countryAliases: Record<string, string[]> = {
  US: ['united states', 'usa', 'us only', 'u.s.', 'san francisco', 'new york', 'seattle', 'austin', 'boston', 'california'],
  IN: ['india', 'bengaluru', 'bangalore', 'hyderabad', 'mumbai', 'pune', 'delhi', 'chennai'],
  GB: ['united kingdom', 'uk', 'london', 'england', 'edinburgh', 'manchester'],
  CA: ['canada', 'toronto', 'vancouver', 'montreal'], DE: ['germany', 'berlin', 'munich'],
  FR: ['france', 'paris'], AU: ['australia', 'sydney', 'melbourne'], SG: ['singapore'],
  NL: ['netherlands', 'amsterdam'], IE: ['ireland', 'dublin'], JP: ['japan', 'tokyo'], BR: ['brazil', 'sao paulo'],
};

export function countryFromLocation(location: string): string | undefined {
  const value = ` ${location.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ')} `;
  return Object.entries(countryAliases).find(([, names]) => names.some(name => value.includes(` ${name.replace(/[^a-z0-9]+/g, ' ')} `)))?.[0];
}
