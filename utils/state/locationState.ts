let currentCountry = 'US';
let currentSubdivision = 'CA';
const listeners = new Set<() => void>();

function notifyLocationListeners() {
  listeners.forEach((listener) => listener());
}

export function getCountry() {
  return currentCountry;
}

export function setCountry(country: string) {
  currentCountry = country;
  notifyLocationListeners();
}

export function getSubdivision() {
  return currentSubdivision;
}

export function setSubdivision(subdivision: string) {
  currentSubdivision = subdivision;
  notifyLocationListeners();
}

export function subscribeLocationState(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
