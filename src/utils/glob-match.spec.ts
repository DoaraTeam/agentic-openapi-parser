import { matchesGlob } from './glob-match';

describe('matchesGlob', () => {
  it('matches an exact literal pattern', () => {
    expect(matchesGlob('getPets', 'getPets')).toBe(true);
    expect(matchesGlob('getPets', 'getDogs')).toBe(false);
  });

  it('matches * against a single path segment', () => {
    expect(matchesGlob('/users/123', '/users/*')).toBe(true);
    expect(matchesGlob('/users/123/orders', '/users/*')).toBe(false);
  });

  it('matches ** across multiple path segments', () => {
    expect(matchesGlob('/admin/users/123', '/admin/**')).toBe(true);
    expect(matchesGlob('/admin', '/admin/**')).toBe(false);
  });

  it('matches ? against a single character', () => {
    expect(matchesGlob('getPet1', 'getPet?')).toBe(true);
    expect(matchesGlob('getPet12', 'getPet?')).toBe(false);
  });

  it('escapes regex-special characters in the literal portion', () => {
    expect(matchesGlob('get.pets', 'get.pets')).toBe(true);
    expect(matchesGlob('getXpets', 'get.pets')).toBe(false);
  });
});
