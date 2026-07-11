jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import axios from 'axios';
import { ClientCredentialsTokenProvider } from './client-credentials-token-provider';
import { AccessTokenError } from '@/errors';

describe('ClientCredentialsTokenProvider', () => {
  const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  const config = {
    tokenUrl: 'https://provider.example.com/oauth/token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches a token via the client_credentials grant on first use', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'token-1', expires_in: 3600 } });
    const provider = new ClientCredentialsTokenProvider(config, { logger });

    const token = await provider.getAccessToken();

    expect(token).toBe('token-1');
    expect(axios.post).toHaveBeenCalledWith(
      config.tokenUrl,
      {
        grant_type: 'client_credentials',
        client_id: 'client-id',
        client_secret: 'client-secret',
      },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  });

  it('includes scope in the request body only when configured', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'token-1', expires_in: 3600 } });
    const provider = new ClientCredentialsTokenProvider({ ...config, scope: 'read write' }, { logger });

    await provider.getAccessToken();

    expect(axios.post).toHaveBeenCalledWith(
      config.tokenUrl,
      expect.objectContaining({ scope: 'read write' }),
      expect.anything()
    );
  });

  it('reuses the cached token while it is well within its expiry', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'token-1', expires_in: 3600 } });
    const provider = new ClientCredentialsTokenProvider(config, { logger });

    await provider.getAccessToken();
    await provider.getAccessToken();
    await provider.getAccessToken();

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('fetches a new token once the cached one is within the refresh threshold of expiry', async () => {
    (axios.post as jest.Mock)
      .mockResolvedValueOnce({ data: { access_token: 'token-1', expires_in: 60 } })
      .mockResolvedValueOnce({ data: { access_token: 'token-2', expires_in: 3600 } });
    const provider = new ClientCredentialsTokenProvider(config, { logger, refreshThresholdMs: 5 * 60 * 1000 });

    const first = await provider.getAccessToken();
    const second = await provider.getAccessToken();

    expect(first).toBe('token-1');
    expect(second).toBe('token-2');
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent calls into a single in-flight request', async () => {
    let resolveFetch!: (value: { data: { access_token: string; expires_in: number } }) => void;
    (axios.post as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const provider = new ClientCredentialsTokenProvider(config, { logger });

    const call1 = provider.getAccessToken();
    const call2 = provider.getAccessToken();
    resolveFetch({ data: { access_token: 'token-1', expires_in: 3600 } });

    const [result1, result2] = await Promise.all([call1, call2]);

    expect(result1).toBe('token-1');
    expect(result2).toBe('token-1');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('throws when the token endpoint response has no access_token', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { expires_in: 3600 } });
    const provider = new ClientCredentialsTokenProvider(config, { logger });

    await expect(provider.getAccessToken()).rejects.toThrow(/did not include an access_token/);
  });

  it('throws an AccessTokenError when there is no cached token and the fetch fails', async () => {
    (axios.post as jest.Mock).mockRejectedValue(new Error('token endpoint down'));
    const provider = new ClientCredentialsTokenProvider(config, { logger });

    await expect(provider.getAccessToken()).rejects.toThrow(/token endpoint down/);
    await expect(provider.getAccessToken()).rejects.toThrow(AccessTokenError);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('token endpoint down'));
  });

  it('falls back to a still-cached token when a renewal fetch fails', async () => {
    (axios.post as jest.Mock)
      .mockResolvedValueOnce({ data: { access_token: 'token-1', expires_in: 60 } })
      .mockRejectedValueOnce(new Error('token endpoint down'));
    const provider = new ClientCredentialsTokenProvider(config, { logger, refreshThresholdMs: 5 * 60 * 1000 });

    const first = await provider.getAccessToken();
    const second = await provider.getAccessToken();

    expect(first).toBe('token-1');
    expect(second).toBe('token-1');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('token endpoint down'));
  });
});
