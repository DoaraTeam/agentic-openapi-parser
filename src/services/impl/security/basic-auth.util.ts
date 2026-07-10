/** Encodes a token as HTTP Basic auth, passing already-base64 tokens through unchanged. */
export function encodeBasicAuthHeader(accessToken: string): string {
  const isBase64 = Buffer.from(accessToken, 'base64').toString('base64') === accessToken;
  const encoded = isBase64 ? accessToken : Buffer.from(accessToken).toString('base64');
  return `Basic ${encoded}`;
}
