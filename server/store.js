import { randomUUID } from 'node:crypto';
import pg from 'pg';

const userFields=['email_verified_at','password_hash','mfa_secret_enc','mfa_pending_enc','mfa_backup_hashes','mfa_last_step'];
export class MemoryStore {
  userTokens = new Map();
  async findUserById(id) {return this.users.get(id)||null;}
  async companyCountry(companyId) {return this.companies.get(companyId)?.country||null;}
  async updateUser(id,fields) {
    const user=this.users.get(id);if(!user)throw new Error('USER_NOT_FOUND');
    for(const [key,value] of Object.entries(fields)){if(!userFields.includes(key))throw new Error('INVALID_USER_FIELD');user[key]=structuredClone(value);}
  }
  async saveUserToken(hash,userId,purpose,expiresAt) {
    for(const [key,t] of this.userTokens)if(t.expiresAt<=Date.now()||(t.userId===userId&&t.purpose===purpose))this.userTokens.delete(key);
    this.userTokens.set(hash,{userId,purpose,expiresAt:expiresAt.getTime()});
  }
  async consumeUserToken(hash,purpose) {
    const t=this.userTokens.get(hash);if(!t||t.purpose!==purpose)return null;
    this.userTokens.delete(hash);return t.expiresAt>Date.now()?t.userId:null;
  }
  async deleteUserSessions(userId,keepHash=null) {for(const [hash,session] of this.sessions)if(session.userId===userId&&hash!==keepHash)this.sessions.delete(hash);}
  async advanceMfaStep(userId,step) {const user=this.users.get(userId);if(!user||step<=Number(user.mfa_last_step||0))return false;user.mfa_last_step=step;return true;}
  async consumeBackupCode(userId,hash) {const user=this.users.get(userId),list=user?.mfa_backup_hashes||[];if(!list.includes(hash))return false;user.mfa_backup_hashes=list.filter(h=>h!==hash);return true;}
  payrollLedgers = new Map();
  async payrollLedger(companyId,year) {return structuredClone(this.payrollLedgers.get(`${companyId}:${year}`)||{version:0,document:null});}
  async savePayrollLedger(companyId,year,version,document,actor,action='payroll_staged') {
    const key=`${companyId}:${year}`,previous=this.payrollLedgers.get(key);
    if((previous?.version||0)!==version)throw new Error('PAYROLL_VERSION_CONFLICT');
    const next={version:version+1,document:structuredClone(document)};this.payrollLedgers.set(key,next);
    this.auditEvents.push({company_id:companyId,action,metadata:{actor,year,version:next.version},created_at:new Date().toISOString()});return structuredClone(next);
  }
  importProfiles = new Map(); importBatches = [];
  async importProfile(companyId,structureHash) {return structuredClone(this.importProfiles.get(`${companyId}:${structureHash}`) || null);}
  async importHistory(companyId,year) {return structuredClone(this.importBatches.filter(b=>b.company_id===companyId && b.reporting_year===year).slice(-50).reverse());}
  companies = new Map(); users = new Map(); sessions = new Map(); snapshots = []; workflows = new Map(); orders = new Map(); billingEvents = new Set();
  async getWorkflow(companyId, year) { return this.workflows.get(`${companyId}:${year}`) || {}; }
  async saveWorkflow(companyId, year, document) { this.workflows.set(`${companyId}:${year}`, structuredClone(document)); }
  async createOrder(order) { this.orders.set(order.id,{...order,created_at:new Date().toISOString(),event_created:0}); }
  async linkOrder(id, session) { this.orders.get(id).provider_session = session; }
  async activeOrder(companyId) { return [...this.orders.values()].findLast(o=>o.company_id===companyId && o.status !== 'pending') || null; }
  async order(id) { return this.orders.get(id)||null; }
  async adminCompanyExists(id) { return this.companies.has(id); }
  async retireTestOrders() {let count=0;for(const order of this.orders.values())if(order.mode==='stripe' && order.stripe_environment==='test' && order.status!=='test_retired'){order.status='test_retired';count++;}return count;}
  async adminCompanies(query='',page=1) {
    const companies=[...this.companies.values()].filter(c=>c.name.toLowerCase().includes(query.toLowerCase())).reverse();
    return {total:companies.length,page,companies:await Promise.all(companies.slice((page-1)*25,page*25).map(async c=>({...c,users:[...this.users.values()].filter(u=>u.company_id===c.id).length,verified_users:[...this.users.values()].filter(u=>u.company_id===c.id&&u.email_verified_at).length,employees:this.snapshots.findLast(s=>s.company_id===c.id)?.rows.length||0,order:[...this.orders.values()].findLast(o=>o.company_id===c.id)||null})))};
  }
  async adminOverview() {
    const companyOrders=await Promise.all([...this.companies.keys()].map(id=>this.activeOrder(id)));
    const groups=new Map();for(const o of companyOrders.filter(Boolean)){const key=[o.plan,o.interval,o.mode,o.status,o.stripe_environment].join(':');const g=groups.get(key)||{plan:o.plan,interval:o.interval,mode:o.mode,stripe_environment:o.stripe_environment,status:o.status,count:0};g.count++;groups.set(key,g);}
    return {companies:this.companies.size,users:this.users.size,snapshots:this.snapshots.length,byCountry:Object.fromEntries(['DE','AT','SI'].map(c=>[c,[...this.companies.values()].filter(v=>v.country===c).length])),subscriptions:[...groups.values()],stripeOrders:[...this.orders.values()].filter(o=>o.mode==='stripe'&&!['cancelled','canceled','incomplete_expired','test_retired'].includes(o.status)).length};
  }
  async applyBillingEvent(eventId, update) {
    const order=[...this.orders.values()].find(o=> (update.orderId ? o.id===update.orderId && o.company_id===update.companyId : update.session ? o.provider_session===update.session : o.provider_subscription===update.subscription));
    if (!order) return false;
    if (this.billingEvents.has(eventId)) return true;
    this.billingEvents.add(eventId);
    if(order.status==='test_retired')return true;
    if ((update.created || 0) >= order.event_created) Object.assign(order,{status:update.status,event_created:update.created || 0,...(update.subscription?{provider_subscription:update.subscription}:{}),...(update.plan?{plan:update.plan,interval:update.interval}:{})});
    return true;
  }
  async createAccount(company, user) {
    if ([...this.users.values()].some(u => u.email === user.email)) throw new Error('EMAIL_EXISTS');
    if(user.google_sub && [...this.users.values()].some(u=>u.google_sub===user.google_sub))throw new Error('GOOGLE_IDENTITY_EXISTS');
    this.companies.set(company.id, company); this.users.set(user.id, user);
  }
  authFlows = new Map();
  async saveAuthFlow(token, binding, document) {
    for(const [key,value] of this.authFlows)if(value.expiresAt<=Date.now())this.authFlows.delete(key);
    this.authFlows.set(token,{binding,document:structuredClone(document),expiresAt:Date.now()+600_000});
  }
  async authFlow(token,binding,consume=false) {
    const flow=this.authFlows.get(token);
    if(!flow || flow.binding!==binding || flow.expiresAt<=Date.now())return null;
    if(consume)this.authFlows.delete(token);
    return structuredClone(flow.document);
  }
  async findGoogleUser(sub) {return [...this.users.values()].find(u=>u.google_sub===sub);}
  async attachGoogle(userId,sub) {
    const user=this.users.get(userId);
    if(!user || (user.google_sub && user.google_sub!==sub) || [...this.users.values()].some(u=>u.google_sub===sub && u.id!==userId))throw new Error('GOOGLE_IDENTITY_EXISTS');
    user.google_sub=sub;
  }
  async findUser(email) { return [...this.users.values()].find(u => u.email === email); }
  async createSession(tokenHash, userId, expiresAt) { this.sessions.set(tokenHash, { userId, expiresAt }); }
  async session(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= new Date()) { this.sessions.delete(tokenHash); return null; }
    const user = this.users.get(session.userId);
    return user ? { user: {...user,mfa_enabled:!!user.mfa_secret_enc}, company: this.companies.get(user.company_id) } : null;
  }
  async deleteSession(tokenHash) { this.sessions.delete(tokenHash); }
  async saveSnapshot(companyId, year, rows, source, importData) {
    const finalizePayroll=id=>{
      if(!importData?.payroll)return;
      const key=`${companyId}:${year}`,previous=this.payrollLedgers.get(key);
      if((previous?.version||0)!==importData.payroll.expectedVersion)throw new Error('PAYROLL_VERSION_CONFLICT');
      this.payrollLedgers.set(key,{version:previous.version+1,document:{...structuredClone(importData.payroll.document),finalizedSnapshot:id,finalizedFingerprint:importData.fingerprint}});
    };
    if(importData) {
      const latest=this.snapshots.findLast(s=>s.company_id===companyId && s.reporting_year===year);
      if(latest && this.importBatches.some(b=>b.snapshot_id===latest.id && b.fingerprint===importData.fingerprint)) {finalizePayroll(latest.id);return {...latest,replayed:true};}
    }
    const snapshot = { id: randomUUID(), company_id: companyId, reporting_year: year, source, created_at: new Date().toISOString(), rows };
    finalizePayroll(snapshot.id);
    if(importData) {
      const key=`${companyId}:${importData.structureHash}`,previous=this.importProfiles.get(key);
      const version=previous ? previous.version+(JSON.stringify(previous.document)!==JSON.stringify(importData.profile)?1:0) : 1;
      this.importProfiles.set(key,{version,document:structuredClone(importData.profile),approved_by:importData.actor});
      this.importBatches.push({id:randomUUID(),company_id:companyId,snapshot_id:snapshot.id,reporting_year:year,fingerprint:importData.fingerprint,file_hash:importData.fileHash,format:source,structure_hash:importData.structureHash,mapping_version:version,mapping:structuredClone(importData.profile),created_by:importData.actor,created_at:snapshot.created_at});
      this.auditEvents.push({company_id:companyId,action:'import_completed',metadata:{snapshot_id:snapshot.id,actor:importData.actor,file_hash:importData.fileHash,mapping_version:version},created_at:snapshot.created_at});
    }
    this.snapshots.push(snapshot); return snapshot;
  }
  async latestSnapshot(companyId, year) { return this.snapshots.findLast(s => s.company_id === companyId && s.reporting_year === year) || null; }
  auditEvents = [];
  async audit(companyId, action, metadata) { this.auditEvents.push({company_id:companyId,action,metadata:structuredClone(metadata),created_at:new Date().toISOString()}); }
  async close() {}
}

export class PostgresStore {
  constructor(connectionString) { this.pool = new pg.Pool({ connectionString, max: 10 }); }
  async findUserById(id) {return (await this.pool.query('SELECT * FROM users WHERE id=$1',[id])).rows[0]||null;}
  async companyCountry(companyId) {return (await this.pool.query('SELECT country FROM companies WHERE id=$1',[companyId])).rows[0]?.country||null;}
  async updateUser(id,fields) {
    const entries=Object.entries(fields);if(entries.some(([key])=>!userFields.includes(key)))throw new Error('INVALID_USER_FIELD');
    if(!entries.length)return;
    const values=entries.map(([key,value])=>key==='mfa_backup_hashes'?JSON.stringify(value):value instanceof Date?value.toISOString():value);
    await this.pool.query(`UPDATE users SET ${entries.map(([key],i)=>`${key}=$${i+2}`).join(',')} WHERE id=$1`,[id,...values]);
  }
  async saveUserToken(hash,userId,purpose,expiresAt) {
    const client=await this.pool.connect();try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_tokens WHERE expires_at<=now() OR (user_id=$1 AND purpose=$2)',[userId,purpose]);
      await client.query('INSERT INTO user_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,$4)',[hash,userId,purpose,expiresAt]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async consumeUserToken(hash,purpose) {return (await this.pool.query('DELETE FROM user_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id',[hash,purpose])).rows[0]?.user_id||null;}
  async deleteUserSessions(userId,keepHash=null) {await this.pool.query('DELETE FROM sessions WHERE user_id=$1 AND ($2::text IS NULL OR token_hash<>$2)',[userId,keepHash]);}
  async advanceMfaStep(userId,step) {return (await this.pool.query('UPDATE users SET mfa_last_step=$2 WHERE id=$1 AND mfa_last_step<$2',[userId,step])).rowCount>0;}
  async consumeBackupCode(userId,hash) {return (await this.pool.query('UPDATE users SET mfa_backup_hashes=mfa_backup_hashes-$2::text WHERE id=$1 AND mfa_backup_hashes ? $2::text',[userId,hash])).rowCount>0;}
  async payrollLedger(companyId,year) {return (await this.pool.query('SELECT version,document FROM payroll_ledgers WHERE company_id=$1 AND reporting_year=$2',[companyId,year])).rows[0]||{version:0,document:null};}
  async savePayrollLedger(companyId,year,version,document,actor,action='payroll_staged') {
    const client=await this.pool.connect();try {
      await client.query('BEGIN');
      const result=await client.query(`INSERT INTO payroll_ledgers(company_id,reporting_year,version,document) SELECT $1,$2,1,$3 WHERE $4=0
        ON CONFLICT(company_id,reporting_year) DO NOTHING RETURNING version,document`,[companyId,year,JSON.stringify(document),version]);
      const next=result.rows[0] || (await client.query('UPDATE payroll_ledgers SET version=version+1,document=$3,updated_at=clock_timestamp() WHERE company_id=$1 AND reporting_year=$2 AND version=$4 RETURNING version,document',[companyId,year,JSON.stringify(document),version])).rows[0];
      if(!next)throw new Error('PAYROLL_VERSION_CONFLICT');
      await client.query('INSERT INTO audit_events(company_id,action,metadata) VALUES($1,$2,$3)',[companyId,action,JSON.stringify({actor,year,version:next.version})]);
      await client.query('COMMIT');return next;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async importProfile(companyId,structureHash) {return (await this.pool.query('SELECT version,document,approved_by FROM import_profiles WHERE company_id=$1 AND structure_hash=$2',[companyId,structureHash])).rows[0]||null;}
  async importHistory(companyId,year) {return (await this.pool.query('SELECT * FROM import_batches WHERE company_id=$1 AND reporting_year=$2 ORDER BY created_at DESC,id DESC LIMIT 50',[companyId,year])).rows;}
  async getWorkflow(companyId, year) { return (await this.pool.query('SELECT document FROM report_workflows WHERE company_id=$1 AND reporting_year=$2',[companyId,year])).rows[0]?.document || {}; }
  async saveWorkflow(companyId, year, document) { await this.pool.query('INSERT INTO report_workflows(company_id,reporting_year,document) VALUES($1,$2,$3) ON CONFLICT(company_id,reporting_year) DO UPDATE SET document=$3,updated_at=now()',[companyId,year,JSON.stringify(document)]); }
  async createOrder(o) { await this.pool.query('INSERT INTO billing_orders(id,company_id,plan,mode,status,interval,stripe_environment) VALUES($1,$2,$3,$4,$5,$6,$7)',[o.id,o.company_id,o.plan,o.mode,o.status,o.interval,o.stripe_environment||null]); }
  async linkOrder(id, session) { await this.pool.query('UPDATE billing_orders SET provider_session=$2 WHERE id=$1',[id,session]); }
  async activeOrder(companyId) { return (await this.pool.query("SELECT * FROM billing_orders WHERE company_id=$1 AND status <> 'pending' ORDER BY created_at DESC LIMIT 1",[companyId])).rows[0] || null; }
  async order(id) { return (await this.pool.query('SELECT * FROM billing_orders WHERE id=$1',[id])).rows[0]||null; }
  async adminCompanyExists(id) { return !!(await this.pool.query('SELECT id FROM companies WHERE id=$1',[id])).rowCount; }
  async retireTestOrders() {return (await this.pool.query("UPDATE billing_orders SET status='test_retired' WHERE mode='stripe' AND stripe_environment='test' AND status<>'test_retired'")).rowCount;}
  async adminCompanies(query='',page=1) {
    const [count,rows]=await Promise.all([
      this.pool.query('SELECT count(*)::int AS total FROM companies WHERE position(lower($1) in lower(name))>0',[query]),
      this.pool.query(`SELECT c.id,c.name,c.country,c.created_at,
        (SELECT count(*)::int FROM users u WHERE u.company_id=c.id) AS users,(SELECT count(*)::int FROM users u WHERE u.company_id=c.id AND u.email_verified_at IS NOT NULL) AS verified_users,
        (SELECT count(*)::int FROM employees e WHERE e.company_id=c.id AND e.snapshot_id=(SELECT s.id FROM snapshots s WHERE s.company_id=c.id ORDER BY s.created_at DESC,s.id DESC LIMIT 1)) AS employees,
        (SELECT row_to_json(o) FROM (SELECT id,plan,interval,mode,stripe_environment,status,created_at FROM billing_orders WHERE company_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) o) AS "order"
        FROM companies c WHERE position(lower($1) in lower(c.name))>0 ORDER BY c.created_at DESC,c.id DESC LIMIT 25 OFFSET $2`,[query,(page-1)*25])
    ]);return {total:count.rows[0].total,page,companies:rows.rows};
  }
  async adminOverview() {
    const [totals,countries,orders]=await Promise.all([
      this.pool.query(`SELECT (SELECT count(*)::int FROM companies) AS companies,(SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM snapshots) AS snapshots,(SELECT count(*)::int FROM billing_orders WHERE mode='stripe' AND status NOT IN ('cancelled','canceled','incomplete_expired','test_retired')) AS "stripeOrders"`),
      this.pool.query('SELECT country,count(*)::int AS count FROM companies GROUP BY country'),
      this.pool.query(`SELECT plan,interval,mode,stripe_environment,status,count(*)::int AS count FROM (SELECT DISTINCT ON(company_id) plan,interval,mode,stripe_environment,status FROM billing_orders WHERE status<>'pending' ORDER BY company_id,created_at DESC,id DESC) o GROUP BY plan,interval,mode,stripe_environment,status`)
    ]);return {...totals.rows[0],byCountry:{DE:0,AT:0,SI:0,...Object.fromEntries(countries.rows.map(r=>[r.country,r.count]))},subscriptions:orders.rows};
  }
  async applyBillingEvent(eventId,u) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const filter=u.orderId ? 'id=$1 AND company_id=$2' : u.session ? 'provider_session=$1' : 'provider_subscription=$1';
      const values=u.orderId ? [u.orderId,u.companyId] : [u.session || u.subscription];
      const o=(await client.query(`SELECT * FROM billing_orders WHERE ${filter} FOR UPDATE`,values)).rows[0];
      if (!o) { await client.query('ROLLBACK'); return false; }
      const event=await client.query('INSERT INTO billing_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[eventId]);
      if (event.rowCount && o.status!=='test_retired' && (u.created || 0) >= Number(o.event_created)) await client.query('UPDATE billing_orders SET status=$2,provider_subscription=COALESCE($3,provider_subscription),event_created=$4,plan=COALESCE($5,plan),interval=COALESCE($6,interval) WHERE id=$1',[o.id,u.status,u.subscription || null,u.created || 0,u.plan || null,u.interval || null]);
      await client.query('COMMIT'); return true;
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async createAccount(company, user) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO companies(id,name,country) VALUES($1,$2,$3)', [company.id, company.name, company.country]);
      await client.query('INSERT INTO users(id,company_id,email,password_hash,google_sub,email_verified_at) VALUES($1,$2,$3,$4,$5,$6)', [user.id, company.id, user.email, user.password_hash,user.google_sub||null,user.email_verified_at||null]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') throw new Error('EMAIL_EXISTS'); throw error; }
    finally { client.release(); }
  }
  async findUser(email) { return (await this.pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0]; }
  async saveAuthFlow(token,binding,document) {
    await this.pool.query('DELETE FROM auth_flows WHERE expires_at<=now()');
    await this.pool.query("INSERT INTO auth_flows(token_hash,binding_hash,document,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[token,binding,JSON.stringify(document)]);
  }
  async authFlow(token,binding,consume=false) {
    return (await this.pool.query(consume?'DELETE FROM auth_flows WHERE token_hash=$1 AND binding_hash=$2 AND expires_at>now() RETURNING document':'SELECT document FROM auth_flows WHERE token_hash=$1 AND binding_hash=$2 AND expires_at>now()',[token,binding])).rows[0]?.document||null;
  }
  async findGoogleUser(sub) {return (await this.pool.query('SELECT * FROM users WHERE google_sub=$1',[sub])).rows[0];}
  async attachGoogle(userId,sub) {
    try {const r=await this.pool.query('UPDATE users SET google_sub=$2 WHERE id=$1 AND (google_sub IS NULL OR google_sub=$2)',[userId,sub]);if(!r.rowCount)throw new Error('GOOGLE_IDENTITY_EXISTS');}
    catch(e){if(e.code==='23505')throw new Error('GOOGLE_IDENTITY_EXISTS');throw e;}
  }
  async createSession(tokenHash, userId, expiresAt) {
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    await this.pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [tokenHash, userId, expiresAt]);
  }
  async session(tokenHash) {
    const result = await this.pool.query('SELECT u.id,u.company_id,u.email,u.role,u.email_verified_at,(u.mfa_secret_enc IS NOT NULL) AS mfa_enabled,c.name,c.country FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id WHERE s.token_hash=$1 AND s.expires_at>now()', [tokenHash]);
    const row = result.rows[0];
    return row ? { user: { id: row.id, company_id: row.company_id, email: row.email, role: row.role, email_verified_at: row.email_verified_at, mfa_enabled: row.mfa_enabled }, company: { id: row.company_id, name: row.name, country: row.country } } : null;
  }
  async deleteSession(tokenHash) { await this.pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]); }
  async saveSnapshot(companyId, year, rows, source, importData) {
    const client = await this.pool.connect(), id = randomUUID();
    const finalizePayroll=async snapshotId=>{
      if(!importData?.payroll)return;
      const result=await client.query('UPDATE payroll_ledgers SET version=version+1,document=$3,updated_at=clock_timestamp() WHERE company_id=$1 AND reporting_year=$2 AND version=$4 RETURNING version',[companyId,year,JSON.stringify({...importData.payroll.document,finalizedSnapshot:snapshotId,finalizedFingerprint:importData.fingerprint}),importData.payroll.expectedVersion]);
      if(!result.rows.length)throw new Error('PAYROLL_VERSION_CONFLICT');
    };
    try {
      await client.query('BEGIN');
      if(importData) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${companyId}:${year}`]);
        const previous=(await client.query('SELECT s.* FROM snapshots s JOIN import_batches b ON b.snapshot_id=s.id AND b.company_id=s.company_id WHERE s.company_id=$1 AND s.reporting_year=$2 AND b.fingerprint=$3 AND s.id=(SELECT id FROM snapshots WHERE company_id=$1 AND reporting_year=$2 ORDER BY created_at DESC,id DESC LIMIT 1)',[companyId,year,importData.fingerprint])).rows[0];
        if(previous){await finalizePayroll(previous.id);await client.query('COMMIT');return {...previous,replayed:true};}
      }
      await finalizePayroll(id);
      const snapshot = (await client.query('INSERT INTO snapshots(id,company_id,reporting_year,source) VALUES($1,$2,$3,$4) RETURNING *', [id, companyId, year, source])).rows[0];
      await client.query(`INSERT INTO employees(company_id,snapshot_id,anonymized_id,gender,job_title,worker_category,job_category_kv,base_annual,bonuses_annual,paid_hours_annual,hours_per_week,base_hourly,variable_hourly,total_hourly,fte_hourly_rate)
        SELECT $1::uuid,$2::uuid,r.* FROM jsonb_to_recordset($3::jsonb) AS r(anonymized_id text,gender text,job_title text,worker_category text,job_category_kv text,base_annual numeric,bonuses_annual numeric,paid_hours_annual numeric,hours_per_week numeric,base_hourly numeric,variable_hourly numeric,total_hourly numeric,fte_hourly_rate numeric)`, [companyId, id, JSON.stringify(rows)]);
      await client.query('INSERT INTO audit_events(company_id,action,metadata) VALUES($1,$2,$3)', [companyId, 'snapshot_created', JSON.stringify({ snapshot_id: id, reporting_year: year, count: rows.length, source })]);
      if(importData) {
        const profile=(await client.query(`INSERT INTO import_profiles(company_id,structure_hash,document,approved_by) VALUES($1,$2,$3,$4)
          ON CONFLICT(company_id,structure_hash) DO UPDATE SET version=import_profiles.version+CASE WHEN import_profiles.document<>EXCLUDED.document THEN 1 ELSE 0 END,document=EXCLUDED.document,approved_by=EXCLUDED.approved_by,updated_at=now() RETURNING version`,[companyId,importData.structureHash,JSON.stringify(importData.profile),importData.actor])).rows[0];
        await client.query('INSERT INTO import_batches(id,company_id,snapshot_id,reporting_year,fingerprint,file_hash,format,structure_hash,mapping_version,mapping,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),companyId,id,year,importData.fingerprint,importData.fileHash,source,importData.structureHash,profile.version,JSON.stringify(importData.profile),importData.actor]);
        await client.query('INSERT INTO audit_events(company_id,action,metadata) VALUES($1,$2,$3)',[companyId,'import_completed',JSON.stringify({snapshot_id:id,actor:importData.actor,file_hash:importData.fileHash,mapping_version:profile.version})]);
      }
      await client.query('COMMIT'); return snapshot;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async latestSnapshot(companyId, year) {
    const snapshot = (await this.pool.query('SELECT * FROM snapshots WHERE company_id=$1 AND reporting_year=$2 ORDER BY created_at DESC,id DESC LIMIT 1', [companyId, year])).rows[0];
    if (!snapshot) return null;
    const rows = (await this.pool.query('SELECT anonymized_id,gender,job_title,worker_category,job_category_kv,base_annual,bonuses_annual,paid_hours_annual,hours_per_week,base_hourly,variable_hourly,total_hourly,fte_hourly_rate FROM employees WHERE company_id=$1 AND snapshot_id=$2 ORDER BY anonymized_id', [companyId, snapshot.id])).rows;
    const numeric = ['base_annual','bonuses_annual','paid_hours_annual','hours_per_week','base_hourly','variable_hourly','total_hourly','fte_hourly_rate'];
    snapshot.rows = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, numeric.includes(key) ? Number(value) : value])));
    return snapshot;
  }
  async audit(companyId, action, metadata) { await this.pool.query('INSERT INTO audit_events(company_id,action,metadata) VALUES($1,$2,$3)', [companyId, action, JSON.stringify(metadata)]); }
  async close() { await this.pool.end(); }
}
