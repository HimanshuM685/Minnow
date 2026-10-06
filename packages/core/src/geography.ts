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

// Radius filtering uses this fixed city table; cities outside it are "unknown" and never dropped.
const cities: Record<string, [number, number]> = {
  bengaluru: [12.97, 77.59], hyderabad: [17.39, 78.49], mumbai: [19.08, 72.88], pune: [18.52, 73.86], delhi: [28.61, 77.21], 'new delhi': [28.61, 77.21],
  gurgaon: [28.46, 77.03], gurugram: [28.46, 77.03], noida: [28.54, 77.39], chennai: [13.08, 80.27], kolkata: [22.57, 88.36], ahmedabad: [23.02, 72.57],
  london: [51.51, -0.13], manchester: [53.48, -2.24], edinburgh: [55.95, -3.19], dublin: [53.35, -6.26], 'new york': [40.71, -74.01], brooklyn: [40.68, -73.94],
  'san francisco': [37.77, -122.42], 'palo alto': [37.44, -122.14], 'mountain view': [37.39, -122.08], 'san jose': [37.34, -121.89], oakland: [37.8, -122.27],
  seattle: [47.61, -122.33], austin: [30.27, -97.74], boston: [42.36, -71.06], cambridge: [42.37, -71.11], chicago: [41.88, -87.63], 'los angeles': [34.05, -118.24],
  denver: [39.74, -104.99], atlanta: [33.75, -84.39], miami: [25.76, -80.19], toronto: [43.65, -79.38], vancouver: [49.28, -123.12], montreal: [45.5, -73.57],
  berlin: [52.52, 13.4], munich: [48.14, 11.58], hamburg: [53.55, 9.99], paris: [48.86, 2.35], amsterdam: [52.37, 4.9], madrid: [40.42, -3.7], barcelona: [41.39, 2.17],
  lisbon: [38.72, -9.14], zurich: [47.38, 8.54], stockholm: [59.33, 18.07], singapore: [1.35, 103.82], tokyo: [35.68, 139.69], sydney: [-33.87, 151.21],
  melbourne: [-37.81, 144.96], 'sao paulo': [-23.55, -46.63], dubai: [25.2, 55.27], 'tel aviv': [32.09, 34.78],
};
export function cityCoords(location: string): [number, number] | undefined {
  const value = ` ${location.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\bbangalore\b/g, 'bengaluru').replace(/[^a-z0-9]+/g, ' ')} `;
  const name = Object.keys(cities).sort((a, b) => b.length - a.length).find(city => value.includes(` ${city} `));
  return name ? cities[name] : undefined;
}
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
