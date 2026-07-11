import { applyNamespace, stripNamespace } from './tool-namespace';

describe('applyNamespace', () => {
  it('returns the name unchanged when no namespace is given', () => {
    expect(applyNamespace('getUsers')).toBe('getUsers');
  });

  it('prefixes the name with the namespace', () => {
    expect(applyNamespace('getUsers', 'github')).toBe('github__getUsers');
  });
});

describe('stripNamespace', () => {
  it('returns the name unchanged when no namespace is given', () => {
    expect(stripNamespace('github__getUsers')).toBe('github__getUsers');
  });

  it('removes a matching namespace prefix', () => {
    expect(stripNamespace('github__getUsers', 'github')).toBe('getUsers');
  });

  it('returns the name unchanged when the prefix does not match', () => {
    expect(stripNamespace('stripe__getUsers', 'github')).toBe('stripe__getUsers');
  });

  it('round-trips with applyNamespace', () => {
    const namespaced = applyNamespace('getUsers', 'github');
    expect(stripNamespace(namespaced, 'github')).toBe('getUsers');
  });
});
