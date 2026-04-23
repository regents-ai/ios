import { getBaseUrl } from '@/constants/BASE_URL';

import { authenticatedFetch } from '../authenticatedFetch';

type ProxyRequestInput = {
  authToken?: string;
  body?: unknown;
  context: string;
  method: 'GET' | 'POST';
  url: string;
};

function buildProxyInit(input: ProxyRequestInput): RequestInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (input.authToken) {
    headers.Authorization = `Bearer ${input.authToken}`;
  }

  return {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url: input.url,
      method: input.method,
      ...(input.body !== undefined ? { body: input.body } : {}),
    }),
  };
}

function buildErrorMessage(status: number, responseText: string, responseJson: any) {
  if (responseJson?.errorType && responseJson?.errorMessage) {
    return `${responseJson.errorType}: ${responseJson.errorMessage}`;
  }

  if (responseJson?.errorMessage) {
    return responseJson.errorMessage;
  }

  if (responseJson?.message) {
    return responseJson.message;
  }

  const preview = responseText.trim();
  return preview
    ? `HTTP error! status: ${status} - ${preview.slice(0, 200)}`
    : `HTTP error! status: ${status}`;
}

export async function sendOnrampProxyRequest<T>(input: ProxyRequestInput): Promise<T> {
  const endpoint = `${getBaseUrl()}/server/api`;
  const init = buildProxyInit(input);
  const requester = input.authToken ? fetch : authenticatedFetch;

  if (__DEV__) {
    console.log(`[${input.context}] request`, {
      endpoint,
      targetMethod: input.method,
      targetUrl: input.url,
      hasExplicitToken: !!input.authToken,
    });
  }

  const response = await requester(endpoint, init);
  const responseClone = response.clone();
  const responseText = await responseClone.text().catch(() => '<non-text body>');
  const responseJson = await response.json().catch(() => null);

  if (__DEV__) {
    console.log(`[${input.context}] response`, {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
    });
  }

  if (!response.ok) {
    if (__DEV__) {
      console.warn(`[${input.context}] request failed`, {
        status: response.status,
        bodyPreview: responseText.slice(0, 500),
      });
    }

    throw new Error(buildErrorMessage(response.status, responseText, responseJson));
  }

  return (responseJson ?? {}) as T;
}
