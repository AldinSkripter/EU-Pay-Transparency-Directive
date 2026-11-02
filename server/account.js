import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, hashToken, sessionToken } from './auth.js';
import { encryptControl, decryptControl } from './control-store.js';
import { mfaSecret, verifyTotp } from './owner-auth.js';
import { accountMail } from './mailer.js';

const TOKEN = /^[a-f0-9]{64}$/;
const passwordOk = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const backupFormat = code => String(code || '').toLowerCase().replace(/[^a-f0-9]/g, '');
const backupCodes = () => Array.from({ length: 10 }, () => randomBytes(5).toString('hex'));
const display = code => `${code.slice(0, 5)}-${code.slice(5)}`;

export function createAccountService({ store, mailer, accountKey }) {
  const failures = new Map();
  const sealed = secret => encryptControl({ secret }, accountKey);
  const opened = value => decryptControl(value, accountKey).secret;

  async function sendToken(user, kind, country, origin) {
    const token = randomBytes(32).toString('hex'), verify = kind === 'verify';
    await store.saveUserToken(hashToken(token), user.id, verify ? 'verify_email' : 'reset_password', new Date(Date.now() + (verify ? 24 : 1) * 3600_000));
    try { await mailer.send({ to: user.email, ...accountMail(kind, country, `${origin}/?${verify ? 'verify' : 'reset'}=${token}`) }); }
    catch (error) { console.error('Account email failed:', error.code || error.name); }
  }

  // TOTP codes are single-use per 30 s step; backup codes are single-use for good.
  // Failed attempts are limited per account so rotating IPs cannot grind the 6-digit space.
  async function consumeMfa(user, code) {
    const record = failures.get(user.id);
    if (record && record.until > Date.now() && record.count >= 10) throw new Error('MFA_LOCKED');
    const value = String(code || '').trim();
    let ok = false;
    if (/^\d{6}$/.test(value)) {
      const step = verifyTotp(opened(user.mfa_secret_enc), value);
      ok = step !== null && await store.advanceMfaStep(user.id, step);
    } else if (backupFormat(value).length === 10) ok = await store.consumeBackupCode(user.id, hashToken(backupFormat(value)));
    if (ok) failures.delete(user.id);
    else failures.set(user.id, { count: (record && record.until > Date.now() ? record.count : 0) + 1, until: Date.now() + 15 * 60_000 });
    return ok;
  }

  function publicRoutes(app, authLimit) {
    app.post('/api/auth/verify-email', authLimit, async (req, res) => {
      const { token } = req.body;
      const userId = typeof token === 'string' && TOKEN.test(token) ? await store.consumeUserToken(hashToken(token), 'verify_email') : null;
      if (!userId) return res.status(400).json({ error: 'INVALID_TOKEN' });
      await store.updateUser(userId, { email_verified_at: new Date() });
      res.json({ ok: true });
    });
    // Always answers 200 so the response never reveals whether an address has an account.
    app.post('/api/auth/forgot-password', authLimit, async (req, res) => {
      const { email } = req.body;
      if (typeof email !== 'string' || email.length > 255) return res.status(400).json({ error: 'INVALID_EMAIL' });
      const user = await store.findUser(email.trim().toLowerCase());
      if (user?.password_hash) await sendToken(user, 'reset', req.marketContext.country, req.get('origin'));
      res.json({ ok: true });
    });
    app.post('/api/auth/reset-password', authLimit, async (req, res) => {
      const { token, password } = req.body;
      if (!passwordOk(password)) return res.status(400).json({ error: 'INVALID_PASSWORD' });
      const userId = typeof token === 'string' && TOKEN.test(token) ? await store.consumeUserToken(hashToken(token), 'reset_password') : null;
      if (!userId) return res.status(400).json({ error: 'INVALID_TOKEN' });
      // Receiving the link proves control of the inbox. MFA is deliberately not reset.
      await store.updateUser(userId, { password_hash: await hashPassword(password), email_verified_at: new Date() });
      await store.deleteUserSessions(userId);
      const user = await store.findUserById(userId);
      await store.audit(user.company_id, 'password_reset', { user_id: userId });
      res.json({ ok: true });
    });
  }

  function sessionRoutes(app, authLimit) {
    const keep = req => hashToken(sessionToken(req));
    const reauth = async (req, user) => !user.password_hash || (typeof req.body.password === 'string' && req.body.password.length <= 128 && await verifyPassword(req.body.password, user.password_hash));
    app.post('/api/auth/resend-verification', authLimit, async (req, res) => {
      const user = await store.findUserById(req.session.user.id);
      if (!user.email_verified_at) await sendToken(user, 'verify', req.session.company.country, req.get('origin'));
      res.json({ ok: true });
    });
    app.post('/api/auth/password', authLimit, async (req, res) => {
      const user = await store.findUserById(req.session.user.id);
      if (!user.password_hash || !await reauth(req, user)) return res.status(401).json({ error: 'INVALID_LOGIN' });
      if (!passwordOk(req.body.newPassword)) return res.status(400).json({ error: 'INVALID_PASSWORD' });
      await store.updateUser(user.id, { password_hash: await hashPassword(req.body.newPassword) });
      await store.deleteUserSessions(user.id, keep(req));
      await store.audit(user.company_id, 'password_changed', { user_id: user.id });
      res.json({ ok: true });
    });
    app.get('/api/auth/security', async (req, res) => {
      const user = await store.findUserById(req.session.user.id);
      res.json({ emailVerified: !!user.email_verified_at, mfaEnabled: !!user.mfa_secret_enc, backupCodesLeft: user.mfa_secret_enc ? (user.mfa_backup_hashes || []).length : 0, hasPassword: !!user.password_hash });
    });
    app.post('/api/auth/mfa/setup', authLimit, async (req, res) => {
      const user = await store.findUserById(req.session.user.id);
      if (user.mfa_secret_enc) return res.status(409).json({ error: 'MFA_ALREADY_ENABLED' });
      if (!await reauth(req, user)) return res.status(401).json({ error: 'INVALID_LOGIN' });
      const secret = mfaSecret();
      await store.updateUser(user.id, { mfa_pending_enc: sealed(secret) });
      res.json({ secret, otpauth: `otpauth://totp/Equitensa:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Equitensa` });
    });
    app.post('/api/auth/mfa/enable', authLimit, async (req, res) => {
      const user = await store.findUserById(req.session.user.id);
      if (user.mfa_secret_enc) return res.status(409).json({ error: 'MFA_ALREADY_ENABLED' });
      if (!user.mfa_pending_enc) return res.status(409).json({ error: 'MFA_SETUP_REQUIRED' });
      const step = verifyTotp(opened(user.mfa_pending_enc), req.body.code);
      if (step === null) return res.status(401).json({ error: 'INVALID_MFA_CODE' });
      const codes = backupCodes();
      await store.updateUser(user.id, { mfa_secret_enc: user.mfa_pending_enc, mfa_pending_enc: null, mfa_last_step: step, mfa_backup_hashes: codes.map(hashToken) });
      await store.deleteUserSessions(user.id, keep(req));
      await store.audit(user.company_id, 'mfa_enabled', { user_id: user.id });
      res.json({ ok: true, backupCodes: codes.map(display) });
    });
    app.post('/api/auth/mfa/disable', authLimit, async (req, res) => {
      const user = await store.findUserById(req.session.user.id);
      if (!user.mfa_secret_enc) return res.status(409).json({ error: 'MFA_NOT_ENABLED' });
      if (!await reauth(req, user)) return res.status(401).json({ error: 'INVALID_LOGIN' });
      if (!await consumeMfa(user, req.body.code)) return res.status(401).json({ error: 'INVALID_MFA_CODE' });
      await store.updateUser(user.id, { mfa_secret_enc: null, mfa_pending_enc: null, mfa_backup_hashes: [], mfa_last_step: 0 });
      await store.audit(user.company_id, 'mfa_disabled', { user_id: user.id });
      res.json({ ok: true });
    });
  }
  return { sendToken, consumeMfa, publicRoutes, sessionRoutes };
}
