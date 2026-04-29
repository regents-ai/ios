export function isReleaseRuntime(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' || env.REGENTS_RELEASE === 'true';
}
