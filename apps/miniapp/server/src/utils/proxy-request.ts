/**
 * 简化版的微信API代理请求
 * 用于miniapp-server独立部署
 */

export interface RequestOptions {
  method: 'GET' | 'POST';
  endpoint: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  cookie?: string;
  parseJson?: boolean;
  action?: string;
}

/**
 * 代理微信公众号请求
 */
export async function proxyMpRequest(options: RequestOptions) {
  const headers = new Headers({
    Referer: 'https://mp.weixin.qq.com/',
    Origin: 'https://mp.weixin.qq.com',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity',
  });

  if (options.cookie) {
    headers.set('Cookie', options.cookie);
  }

  const requestInit: RequestInit = {
    method: options.method,
    headers: headers,
    redirect: 'follow',
  };

  let endpoint = options.endpoint;

  if (options.query) {
    endpoint += '?' + new URLSearchParams(options.query as Record<string, string>).toString();
  }

  if (options.method === 'POST' && options.body) {
    requestInit.body = new URLSearchParams(options.body as Record<string, string>).toString();
  }

  const response = await fetch(endpoint, requestInit);

  if (!options.parseJson) {
    return response;
  }

  return response.json();
}
