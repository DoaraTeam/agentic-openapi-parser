jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import axios from 'axios';
import { Oauth2RefreshTokenRefresher } from './oauth2-token-refresher';
import { OAuth2TokenState } from '@/types';

describe('Oauth2RefreshTokenRefresher', () => {
  const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function futureState(msFromNow: number, overrides: Partial<OAuth2TokenState> = {}): OAuth2TokenState {
    return {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      tokenUrl: 'https://provider.example.com/oauth/token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      tokenExpiresAt: new Date(Date.now() + msFromNow),
      ...overrides,
    };
  }

  it('does not refresh when expiry is well beyond the threshold', async () => {
    const refresher = new Oauth2RefreshTokenRefresher({ logger });
    const result = await refresher.refreshIfNeeded(futureState(60 * 60 * 1000));
    expect(result).toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('does not refresh when refreshToken or tokenUrl is missing', async () => {
    const refresher = new Oauth2RefreshTokenRefresher({ logger });
    await expect(refresher.refreshIfNeeded(futureState(1000, { refreshToken: undefined }))).resolves.toBeUndefined();
    await expect(refresher.refreshIfNeeded(futureState(1000, { tokenUrl: undefined }))).resolves.toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refreshes when within the threshold, using the refresh_token grant', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 },
    });
    const refresher = new Oauth2RefreshTokenRefresher({ logger, refreshThresholdMs: 5 * 60 * 1000 });

    const result = await refresher.refreshIfNeeded(futureState(60 * 1000));

    expect(axios.post).toHaveBeenCalledWith(
      'https://provider.example.com/oauth/token',
      {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
        refreshToken: 'refresh-token',
        client_id: 'client-id',
        clientId: 'client-id',
        client_secret: 'client-secret',
        clientSecret: 'client-secret',
      },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    expect(result?.accessToken).toBe('new-token');
    expect(result?.refreshToken).toBe('new-refresh');
  });

  it('omits client_id/client_secret entirely (both conventions) when the provider has none — no client credentials required', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'new-token', expires_in: 3600 } });
    const refresher = new Oauth2RefreshTokenRefresher({ logger });

    await refresher.refreshIfNeeded(futureState(1000, { clientId: undefined, clientSecret: undefined }));

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
        refreshToken: 'refresh-token',
      },
      expect.anything(),
    );
  });

  it('calls onRefreshed with the new state after a successful refresh', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { access_token: 'new-token', expires_in: 3600 },
    });
    const onRefreshed = jest.fn();
    const refresher = new Oauth2RefreshTokenRefresher({ logger, onRefreshed });

    await refresher.refreshIfNeeded(futureState(1000));

    expect(onRefreshed).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'new-token' }));
  });

  it('swallows refresh errors, logs them, and returns undefined instead of throwing', async () => {
    (axios.post as jest.Mock).mockRejectedValue(new Error('network down'));
    const refresher = new Oauth2RefreshTokenRefresher({ logger });

    await expect(refresher.refreshIfNeeded(futureState(1000))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('network down'));
  });

  it('defaults to a form-urlencoded body when requestFormat is not given', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'new-token', expires_in: 3600 } });
    const refresher = new Oauth2RefreshTokenRefresher({ logger });

    await refresher.refreshIfNeeded(futureState(1000));

    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  });

  it('sends a JSON body with the same fields when requestFormat is "json" (e.g. Atlassian)', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'new-token', expires_in: 3600 } });
    const refresher = new Oauth2RefreshTokenRefresher({ logger, requestFormat: 'json' });

    const result = await refresher.refreshIfNeeded(futureState(1000));

    expect(axios.post).toHaveBeenCalledWith(
      'https://provider.example.com/oauth/token',
      {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
        refreshToken: 'refresh-token',
        client_id: 'client-id',
        clientId: 'client-id',
        client_secret: 'client-secret',
        clientSecret: 'client-secret',
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    expect(result?.accessToken).toBe('new-token');
  });

  describe('lenient response parsing (non-SaaS / hand-rolled internal auth endpoints)', () => {
    it('reads camelCase response fields when snake_case is absent', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { accessToken: 'new-token', refreshToken: 'new-refresh', expiresIn: 1800 },
      });
      const refresher = new Oauth2RefreshTokenRefresher({ logger });

      const result = await refresher.refreshIfNeeded(futureState(1000));

      expect(result?.accessToken).toBe('new-token');
      expect(result?.refreshToken).toBe('new-refresh');
      expect(result?.tokenExpiresAt?.getTime()).toBeCloseTo(Date.now() + 1800 * 1000, -2);
    });

    it('unwraps a 1-level "data" envelope', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { data: { access_token: 'new-token', expires_in: 900 } },
      });
      const refresher = new Oauth2RefreshTokenRefresher({ logger });

      const result = await refresher.refreshIfNeeded(futureState(1000));

      expect(result?.accessToken).toBe('new-token');
    });

    it('unwraps a 1-level "result" envelope (camelCase inside)', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { result: { accessToken: 'new-token' } },
      });
      const refresher = new Oauth2RefreshTokenRefresher({ logger });

      const result = await refresher.refreshIfNeeded(futureState(1000));

      expect(result?.accessToken).toBe('new-token');
    });

    it('accepts expires_in as a numeric string', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'new-token', expires_in: '900' },
      });
      const refresher = new Oauth2RefreshTokenRefresher({ logger });

      const result = await refresher.refreshIfNeeded(futureState(1000));

      expect(result?.tokenExpiresAt?.getTime()).toBeCloseTo(Date.now() + 900 * 1000, -2);
    });

    it('falls back to defaultExpiresInSecs when no expiry field is found anywhere', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { access_token: 'new-token' } });
      const refresher = new Oauth2RefreshTokenRefresher({ logger, defaultExpiresInSecs: 300 });

      const result = await refresher.refreshIfNeeded(futureState(1000));

      expect(result?.tokenExpiresAt?.getTime()).toBeCloseTo(Date.now() + 300 * 1000, -2);
    });

    it('fails cleanly (returns undefined, logs, does not store an empty accessToken) when no access token is found anywhere', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { some_other_field: 'x' } });
      const refresher = new Oauth2RefreshTokenRefresher({ logger });

      const result = await refresher.refreshIfNeeded(futureState(1000));

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('no access token found'));
    });

    it('lets responseAccessTokenPath/responseRefreshTokenPath/responseExpiresInPath override auto-detection for fully custom shapes', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { payload: { token: { at: 'new-token', rt: 'new-refresh', ttl: 120 } } },
      });
      const refresher = new Oauth2RefreshTokenRefresher({
        logger,
        responseAccessTokenPath: 'payload.token.at',
        responseRefreshTokenPath: 'payload.token.rt',
        responseExpiresInPath: 'payload.token.ttl',
      });

      const result = await refresher.refreshIfNeeded(futureState(1000));

      expect(result?.accessToken).toBe('new-token');
      expect(result?.refreshToken).toBe('new-refresh');
      expect(result?.tokenExpiresAt?.getTime()).toBeCloseTo(Date.now() + 120 * 1000, -2);
    });
  });
});
