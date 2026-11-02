import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if(typeof encoded!=='string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded))return false;
  const [salt, digest] = encoded.split(':');
  const derived = await scrypt(password, salt, 64), expected = Buffer.from(digest, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
export function sessionToken(req) {
  const token = (req.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('equitensa_session='))?.split('=')[1];
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function establishSession(store, res, userId, secure) {
  const token = randomBytes(32).toString('hex');
  await store.createSession(hashToken(token), userId, new Date(Date.now() + 8 * 3600_000));
  res.cookie('equitensa_session', token, { httpOnly: true, secure, sameSite: 'strict', maxAge: 8 * 3600_000, path: '/' });
}
