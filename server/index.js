import { randomBytes } from 'node:crypto';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { MemoryStore, PostgresStore } from './store.js';
import { runtimeControl } from './control-store.js';
import { runtimeMailer } from './mailer.js';
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const demo = !process.env.DATABASE_URL;
if (production && demo) throw new Error('Production requires DATABASE_URL. Demo must stay local.');
if (!demo && !/^[a-f0-9]{64,}$/i.test(process.env.PSEUDONYM_SECRET || '')) throw new Error('Set a random hexadecimal PSEUDONYM_SECRET of at least 32 bytes.');
const origins = (process.env.APP_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
if (!demo && !origins.length) throw new Error('APP_ORIGINS_REQUIRED');
const accountKey = demo ? undefined : Buffer.from(process.env.ACCOUNT_ENCRYPTION_KEY || '', 'hex');
if (!demo && accountKey.length !== 32) throw new Error('ACCOUNT_ENCRYPTION_KEY_REQUIRED');
const mailer = runtimeMailer({ url: process.env.SMTP_URL, from: process.env.MAIL_FROM, production });
const store = demo ? new MemoryStore() : new PostgresStore(process.env.DATABASE_URL);
const billing={secretKey:process.env.STRIPE_SECRET_KEY,webhookSecret:process.env.STRIPE_WEBHOOK_SECRET,origin:process.env.BILLING_ORIGIN,prices:Object.fromEntries(['prepare','growth','scale'].flatMap(plan=>['monthly','annual'].map(interval=>[`${plan}_${interval}`,process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`]])))};
const control=await runtimeControl(store,production);
const app = createApp({ store, demo, secret: process.env.PSEUDONYM_SECRET || randomBytes(32).toString('hex'), secure: production, origins,billing,control,mailer,accountKey,requireOwnerMfa: production && process.env.ADMIN_REQUIRE_MFA !== 'false' });
let vite;
if (production) {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => res.sendFile(`${dist}/index.html`));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const portArgument=process.argv.find(arg=>arg.startsWith('--port='))?.slice(7);
const port = Number(portArgument || process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
if (demo && !['127.0.0.1','localhost','::1'].includes(host)) throw new Error('Demo must bind to loopback.');
const server = app.listen(port, host, () => console.log(`Equitensa: http://${host}:${port} (${demo ? 'isolated synthetic demo' : 'PostgreSQL'})`));
const shutdown = () => server.close(async () => { await vite?.close(); await store.close(); process.exit(0); });
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
