let currentCountry = 'US';
let currentSubdivision = 'CA';

export function getCountry() {
  return currentCountry;
}

export function setCountry(country: string) {
  currentCountry = country;
}

export function getSubdivision() {
  return currentSubdivision;
}

export function setSubdivision(subdivision: string) {
  currentSubdivision = subdivision;
}
