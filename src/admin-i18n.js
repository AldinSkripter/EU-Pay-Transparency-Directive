import {createContext,useContext} from 'react';
import {deUi} from './admin-de.js';

// Owner panel languages: English (default) and German. English text is the lookup key,
// so the JSX stays readable; German lives in `de`. tests/admin-i18n.test.js checks that
// every literal passed to t() and every error message has a German entry.
export const AdminLang=createContext({lang:'en',t:key=>key,setLang(){}});
export const useAdminLang=()=>useContext(AdminLang);
const STORAGE='equitensa_admin_lang';
export const initialLang=()=>{
  try{const saved=localStorage.getItem(STORAGE);if(saved==='de'||saved==='en')return saved;}catch{}
  return (typeof navigator!=='undefined'&&navigator.language||'').toLowerCase().startsWith('de')?'de':'en';
};
export const saveLang=lang=>{try{localStorage.setItem(STORAGE,lang);}catch{}};
export const makeT=lang=>(key,vars={})=>(lang==='de'?de[key]??key:key).replace(/\{(\w+)\}/g,(match,name)=>vars[name]??match);

export const errorMessages={
  EMAIL_SETTINGS_CHANGED:'Email settings changed. Reload before saving.',
  INVALID_EMAIL_SETTINGS:'Check the sender, SMTP settings and brand colors.',
  INVALID_EMAIL_TEMPLATE:'Complete every template field for DE, AT and SI.',
  SMTP_SETTINGS_INCOMPLETE:'Enter the SMTP host, username and password.',
  SMTP_CONNECTION_FAILED:'SMTP connection failed. Check the host, port, TLS and credentials.',
  EMAIL_DELIVERY_FAILED:'Email delivery failed. Check the SMTP settings and delivery log.',
  OWNER_LOGIN_MFA_REQUIRED:'This account has two-factor sign-in enabled. Enter an authenticator or recovery code.',
  INVALID_GOOGLE_SETTINGS:'Check the Google client ID, secret and redirect addresses.',
  INVALID_GOOGLE_REDIRECT:'Only exact HTTPS Equitensa redirect addresses are allowed, plus local addresses in a test environment.',
  GOOGLE_SETTINGS_INCOMPLETE:'To enable Google sign-in, enter the client ID, client secret and redirect addresses.',
  OWNER_AUTH_REQUIRED:'Sign in with an owner account.',
  INVALID_OWNER_LOGIN:'Check the email, password and 2FA code. A recovery code can only be used once.',
  INVALID_OWNER_SETUP:'The setup link is invalid or has expired. Create a new one on the server.',
  OWNER_WRITE_REQUIRED:'This account has read-only access.',
  OWNER_PASSWORD_REQUIRED:'Enter your current owner password.',
  OWNER_MFA_REQUIRED:'Turn on two-factor sign-in to access the production panel.',
  INVALID_OWNER:'Enter a valid email and a password of at least 14 characters.',
  EMAIL_EXISTS:'An account with this email already exists.',
  INVALID_PAYMENT_SETTINGS:'Check the billing mode and the price IDs.',
  INVALID_RETURN_ORIGIN:'The return address must be an HTTPS Equitensa domain of the matching country.',
  PAYMENT_MODE_UNAVAILABLE:'Simulation is only available locally. Real billing requires production, HTTPS and a database.',
  STRIPE_SETTINGS_INCOMPLETE:'Enter the key and webhook secret for the chosen billing mode and all six Stripe prices.',
  DUPLICATE_STRIPE_PRICE:'Every package and billing period needs its own Stripe price ID.',
  STRIPE_CONNECTION_FAILED:'The Stripe connection could not be confirmed. Check the key and that Stripe is reachable.',
  STRIPE_PRICE_MISMATCH:'Stripe prices must be active, in EUR, with the matching amount and a monthly or yearly period. Use prices without tax included.',
  STRIPE_ACCOUNT_NOT_READY:'The Stripe account is not yet ready to take payments.',
  STRIPE_ACCOUNT_LOCKED:'Stripe orders exist. Changing the account, mode or price mapping requires the existing orders to be completed first.',
  SETTINGS_CHANGED:'Another owner changed the settings. Refresh the panel before saving.',
  ROTATION_CONFIRMATION_REQUIRED:'Confirm the key rotation before saving.',
  LAST_OWNER:'The last active owner must keep access.',
  INVALID_MFA_CODE:'The code is not valid or the setup has expired.',
  MFA_ALREADY_ENABLED:'Two-factor sign-in is already turned on.',
  INVALID_ACCESS_CHANGE:'To block a company, enter a reason of at least five characters.',
};
export const fallbackError='The action was not completed. Try again or check the server configuration.';

const deErrors={
  'Email settings changed. Reload before saving.':'E-Mail-Einstellungen wurden geändert. Laden Sie die Seite vor dem Speichern neu.',
  'Check the sender, SMTP settings and brand colors.':'Prüfen Sie Absender, SMTP-Einstellungen und Markenfarben.',
  'Complete every template field for DE, AT and SI.':'Füllen Sie alle Vorlagenfelder für DE, AT und SI aus.',
  'Enter the SMTP host, username and password.':'Geben Sie SMTP-Host, Benutzername und Passwort ein.',
  'SMTP connection failed. Check the host, port, TLS and credentials.':'SMTP-Verbindung fehlgeschlagen. Prüfen Sie Host, Port, TLS und Zugangsdaten.',
  'Email delivery failed. Check the SMTP settings and delivery log.':'E-Mail-Versand fehlgeschlagen. Prüfen Sie SMTP-Einstellungen und Versandprotokoll.',
  // Errors
  'Check the Google client ID, secret and redirect addresses.':'Prüfen Sie Google-Client-ID, Secret und Weiterleitungsadressen.',
  'Only exact HTTPS Equitensa redirect addresses are allowed, plus local addresses in a test environment.':'Erlaubt sind nur exakte HTTPS-Weiterleitungsadressen von Equitensa sowie lokale Adressen in einer Testumgebung.',
  'To enable Google sign-in, enter the client ID, client secret and redirect addresses.':'Zum Aktivieren der Google-Anmeldung Client-ID, Client-Secret und Weiterleitungsadressen eingeben.',
  'Sign in with an owner account.':'Melden Sie sich mit einem Inhaberkonto an.',
  'Check the email, password and 2FA code. A recovery code can only be used once.':'Prüfen Sie E-Mail, Passwort und 2FA-Code. Ein Wiederherstellungscode kann nur einmal verwendet werden.',
  'The setup link is invalid or has expired. Create a new one on the server.':'Der Einrichtungslink ist ungültig oder abgelaufen. Erstellen Sie auf dem Server einen neuen.',
  'This account has read-only access.':'Dieses Konto hat nur Lesezugriff.',
  'Enter your current owner password.':'Geben Sie Ihr aktuelles Inhaberpasswort ein.',
  'Turn on two-factor sign-in to access the production panel.':'Aktivieren Sie die Zwei-Faktor-Anmeldung, um auf das Produktivpanel zuzugreifen.',
  'Enter a valid email and a password of at least 14 characters.':'Geben Sie eine gültige E-Mail-Adresse und ein Passwort mit mindestens 14 Zeichen ein.',
  'An account with this email already exists.':'Ein Konto mit dieser E-Mail-Adresse existiert bereits.',
  'Check the billing mode and the price IDs.':'Prüfen Sie den Abrechnungsmodus und die Preis-IDs.',
  'The return address must be an HTTPS Equitensa domain of the matching country.':'Die Rücksprungadresse muss eine HTTPS-Domain von Equitensa im passenden Land sein.',
  'Simulation is only available locally. Real billing requires production, HTTPS and a database.':'Die Simulation ist nur lokal verfügbar. Echte Abrechnung erfordert Produktion, HTTPS und eine Datenbank.',
  'Enter the key and webhook secret for the chosen billing mode and all six Stripe prices.':'Geben Sie Schlüssel und Webhook-Secret für den gewählten Modus sowie alle sechs Stripe-Preise ein.',
  'Every package and billing period needs its own Stripe price ID.':'Jedes Paket und jeder Abrechnungszeitraum braucht eine eigene Stripe-Preis-ID.',
  'The Stripe connection could not be confirmed. Check the key and that Stripe is reachable.':'Die Stripe-Verbindung konnte nicht bestätigt werden. Prüfen Sie den Schlüssel und die Erreichbarkeit von Stripe.',
  'Stripe prices must be active, in EUR, with the matching amount and a monthly or yearly period. Use prices without tax included.':'Stripe-Preise müssen aktiv sein, in EUR lauten, den passenden Betrag und einen monatlichen oder jährlichen Zeitraum haben. Verwenden Sie Preise ohne enthaltene Steuer.',
  'The Stripe account is not yet ready to take payments.':'Das Stripe-Konto ist noch nicht für Zahlungen bereit.',
  'Stripe orders exist. Changing the account, mode or price mapping requires the existing orders to be completed first.':'Es gibt Stripe-Bestellungen. Konto, Modus oder Preiszuordnung können erst nach Abschluss der bestehenden Bestellungen geändert werden.',
  'Another owner changed the settings. Refresh the panel before saving.':'Ein anderer Inhaber hat die Einstellungen geändert. Aktualisieren Sie das Panel vor dem Speichern.',
  'Confirm the key rotation before saving.':'Bestätigen Sie die Schlüsselrotation vor dem Speichern.',
  'The last active owner must keep access.':'Der letzte aktive Inhaber muss den Zugriff behalten.',
  'The code is not valid or the setup has expired.':'Der Code ist ungültig oder die Einrichtung ist abgelaufen.',
  'Two-factor sign-in is already turned on.':'Die Zwei-Faktor-Anmeldung ist bereits aktiviert.',
  'To block a company, enter a reason of at least five characters.':'Zum Sperren eines Unternehmens geben Sie einen Grund mit mindestens fünf Zeichen ein.',
  'The action was not completed. Try again or check the server configuration.':'Die Aktion wurde nicht abgeschlossen. Versuchen Sie es erneut oder prüfen Sie die Serverkonfiguration.',
};
export const de={...deErrors,...deUi,'This account has two-factor sign-in enabled. Enter an authenticator or recovery code.':'Für dieses Konto ist die Zwei-Faktor-Anmeldung aktiviert. Geben Sie einen Authenticator- oder Wiederherstellungscode ein.'};
