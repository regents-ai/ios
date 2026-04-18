export function getBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_BASE_URL;

  if (!url) {
    throw new Error('EXPO_PUBLIC_BASE_URL is not set');
  }

  return url;
}
