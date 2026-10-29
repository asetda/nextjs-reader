import { Agent } from 'undici';

let insecureAgent: Agent | undefined;

export function fetchRemotePage(url: string, init?: RequestInit): Promise<Response> {
  if (process.env.READER_SKIP_SSL_VERIFICATION !== 'true' || new URL(url).protocol !== 'https:') {
    return fetch(url, init);
  }

  insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
  const requestInit = { ...init, dispatcher: insecureAgent };
  return fetch(url, requestInit);
}
