import { backendUnavailable, backendUrl, proxyHeaders } from '../_proxy';

export async function GET(request:Request) {
  const url = backendUrl('/api/dashboard');
  if (!url) return backendUnavailable();
  const input = new URL(request.url);
  for (const key of [ 'folder', 'account' ]) {
    const value = input.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  try {
    const response = await fetch(url, { headers:proxyHeaders(request) });
    return new Response(response.body, { status:response.status, headers:{ 'content-type':'application/json', 'cache-control':'no-store' } });
  } catch {
    return backendUnavailable();
  }
}
