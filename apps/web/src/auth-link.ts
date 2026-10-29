export type AuthLink = { purpose: 'verify-email' | 'reset-password'; token: string };
export function readAuthLink(): AuthLink | null {
  const params = new URLSearchParams(location.hash.slice(1)),
    purpose = params.get('auth'),
    token = params.get('token');
  return purpose === 'verify-email' || purpose === 'reset-password'
    ? { purpose, token: token || '' }
    : null;
}
