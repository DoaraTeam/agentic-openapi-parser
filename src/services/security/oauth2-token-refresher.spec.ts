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
        client_id: 'client-id',
        client_secret: 'client-secret',
      },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    expect(result?.accessToken).toBe('new-token');
    expect(result?.refreshToken).toBe('new-refresh');
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
        client_id: 'client-id',
        client_secret: 'client-secret',
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    expect(result?.accessToken).toBe('new-token');
  });
});
