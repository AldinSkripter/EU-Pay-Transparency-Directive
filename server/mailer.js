import nodemailer from 'nodemailer';

// Transports share one interface: send({to,subject,text}).
export class MemoryMailer {
  outbox = [];
  async send(message) { this.outbox.push(structuredClone(message)); }
}
export class ConsoleMailer {
  async send({ to, subject, text }) { console.log(`[mail] to=${to} subject="${subject}"\n${text}`); }
}
export class SmtpMailer {
  constructor(url, from) { this.transport = nodemailer.createTransport(url); this.from = from; }
  async send({ to, subject, text }) { await this.transport.sendMail({ from: this.from, to, subject, text }); }
}
export function runtimeMailer({ url, from, production }) {
  if (url) return new SmtpMailer(url, from || 'Equitensa <no-reply@equitensa.de>');
  if (production) throw new Error('SMTP_URL_REQUIRED');
  return new ConsoleMailer();
}

const copy = {
  de: {
    verify: { subject: 'Equitensa: E-Mail-Adresse bestätigen', intro: 'Bitte bestätigen Sie Ihre E-Mail-Adresse, um Equitensa zu nutzen.', note: 'Der Link ist 24 Stunden gültig.' },
    reset: { subject: 'Equitensa: Passwort zurücksetzen', intro: 'Für Ihr Konto wurde das Zurücksetzen des Passworts angefordert.', note: 'Der Link ist 1 Stunde gültig. Haben Sie das nicht angefordert, ignorieren Sie diese E-Mail; Ihr Passwort bleibt unverändert.' },
  },
  sl: {
    verify: { subject: 'Equitensa: potrdite e-poštni naslov', intro: 'Potrdite svoj e-poštni naslov, da lahko uporabljate Equitensa.', note: 'Povezava velja 24 ur.' },
    reset: { subject: 'Equitensa: ponastavitev gesla', intro: 'Za vaš račun je bila zahtevana ponastavitev gesla.', note: 'Povezava velja 1 uro. Če tega niste zahtevali, ta e-pošta ni potrebna; vaše geslo ostane nespremenjeno.' },
  },
};
export function accountMail(kind, country, link) {
  const c = copy[country === 'SI' ? 'sl' : 'de'][kind];
  return { subject: c.subject, text: `${c.intro}\n\n${link}\n\n${c.note}\n` };
}
