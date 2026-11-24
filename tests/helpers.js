// Registration leaves the account unverified. Tests that are not about verification mark every user verified.
export const verifyAll = store => { for (const user of store.users.values()) user.email_verified_at ??= new Date(); };

// Explicit synthetic employer evidence, never generated from a calculated compliance result.
export const documentedEvaluation = categories => ({ mode: 'documented', methodology: 'Synthetic objective comparison of skills, effort, responsibility and working conditions', reference: 'Synthetic evaluation v1', assessedBy: 'Synthetic HR evaluator', assessedOn: '2026-01-01', genderNeutralConfirmed: true,
  categories: Object.fromEntries(categories.map(category => [category, { rationale: 'Synthetic roles have comparable demands under the documented four-factor methodology.', evidence: 'Synthetic role descriptions and evaluation record v1.' }])) });
export const completedRemediation = snapshotId => ({ completedOn: '2020-03-01', evidence: 'Synthetic payroll correction reference', verifiedBy: 'Synthetic HR', verifiedOn: '2020-04-01', verification: 'Synthetic before/after comparison confirms correction', targetSnapshotId: snapshotId });

// Minimal ZIP writer for tests (the project only ships a reader). `flags` lets a test mark an entry encrypted.
import { deflateRawSync, crc32 } from 'node:zlib';
export function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data, flags = 0, method = 8 } of entries) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data), body = method === 8 ? deflateRawSync(raw) : raw, nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body); centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
