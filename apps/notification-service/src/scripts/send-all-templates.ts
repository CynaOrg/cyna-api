/**
 * Sends every email template in FR + EN to a single recipient so a human can
 * visually QA each rendering (Gmail-web + Gmail-iOS/Android + OVH webmail).
 *
 * Run from `cyna-api/`:
 *   npx ts-node apps/notification-service/src/scripts/send-all-templates.ts
 *
 * Override the recipient with TO_EMAIL=foo@bar.com.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.development') });

const TO = process.env.TO_EMAIL || 'neqoo.mah@gmail.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
const TEMPLATES_DIR = path.resolve(__dirname, '../templates');

type SampleVars = Record<string, unknown> | ((lang: 'fr' | 'en') => Record<string, unknown>);

interface Sample {
  subject: { fr: string; en: string };
  vars: SampleVars;
}

const FOOTER_I18N: Record<'fr' | 'en', { copyright: string; tagline: string }> = {
  fr: {
    copyright: 'Tous droits réservés.',
    tagline: 'Solutions de cybersécurité pour les entreprises',
  },
  en: {
    copyright: 'All rights reserved.',
    tagline: 'Cybersecurity solutions for businesses',
  },
};

const baseLayout = Handlebars.compile(
  fs.readFileSync(path.join(TEMPLATES_DIR, 'layouts', 'base.hbs'), 'utf-8'),
);

function renderTemplate(
  templateName: string,
  language: 'fr' | 'en',
  vars: Record<string, unknown>,
): string {
  const file = path.join(TEMPLATES_DIR, language, `${templateName}.hbs`);
  const content = Handlebars.compile(fs.readFileSync(file, 'utf-8'))(vars);
  const footer = FOOTER_I18N[language];
  return baseLayout({
    language,
    year: new Date().getFullYear(),
    frontendUrl: FRONTEND_URL,
    footerCopyright: footer.copyright,
    footerTagline: footer.tagline,
    content,
    ...vars,
  });
}

const licensesSample = [
  {
    licenseKey: 'CYNA-AAAA-BBBB-CCCC-DDDD',
    productName: 'Antivirus Pro',
    activationUrl: `${FRONTEND_URL}/licenses/activate?token=sample-token-xyz-1`,
  },
  {
    licenseKey: 'CYNA-1111-2222-3333-4444',
    productName: 'EDR Enterprise',
    activationUrl: `${FRONTEND_URL}/licenses/activate?token=sample-token-xyz-2`,
  },
];

const samples: Record<string, Sample> = {
  welcome: {
    subject: { fr: 'Bienvenue chez CYNA', en: 'Welcome to CYNA' },
    vars: {},
  },
  'email-verification': {
    subject: {
      fr: 'Vérifiez votre adresse email - CYNA',
      en: 'Verify your email address - CYNA',
    },
    vars: {
      firstName: 'Claire',
      lastName: 'Martin',
      verificationLink: `${FRONTEND_URL}/auth/verify-email?token=sample-verification-token`,
    },
  },
  'password-reset': {
    subject: {
      fr: 'Réinitialisation de votre mot de passe',
      en: 'Reset your password',
    },
    vars: {
      firstName: 'Claire',
      resetLink: `${FRONTEND_URL}/auth/reset-password?token=sample-reset-token`,
    },
  },
  'password-reset-success': {
    subject: { fr: 'Mot de passe réinitialisé', en: 'Password reset successful' },
    vars: { firstName: 'Claire' },
  },
  'password-changed': {
    subject: { fr: 'Votre mot de passe a été modifié', en: 'Your password was changed' },
    vars: { firstName: 'Claire' },
  },
  'admin-2fa-code': {
    subject: { fr: 'Code de vérification admin', en: 'Admin verification code' },
    vars: { code: '438712' },
  },
  'order-confirmation': {
    subject: {
      fr: 'Confirmation de votre commande CYN-2026-00042',
      en: 'Your order CYN-2026-00042 is confirmed',
    },
    vars: {
      orderNumber: 'CYN-2026-00042',
      total: '129,97 €',
      itemsSummary: 'SOC Pro x1, Antivirus x2',
      invoiceUrl: 'https://pay.stripe.com/receipts/payment/sample_ch_abc',
    },
  },
  'order-shipped': {
    subject: {
      fr: 'Votre commande CYN-2026-00042 est expédiée',
      en: 'Your order CYN-2026-00042 has shipped',
    },
    vars: {
      orderNumber: 'CYN-2026-00042',
      trackingNumber: 'FR0123456789',
      trackingUrl: 'https://www.chronopost.fr/tracking?FR0123456789',
    },
  },
  'refund-confirmation': {
    subject: {
      fr: 'Remboursement traité - CYN-2026-00042',
      en: 'Refund processed - CYN-2026-00042',
    },
    vars: {
      orderNumber: 'CYN-2026-00042',
      refundAmount: '50,00 €',
    },
  },
  'payment-failed': {
    subject: {
      fr: 'Échec du paiement pour CYN-2026-00042',
      en: 'Payment failed for order CYN-2026-00042',
    },
    // The real `error` string is produced by translateStripeDecline(declineCode, lang),
    // so we mirror that here — a pre-translated string per language.
    vars: (lang) => ({
      orderNumber: 'CYN-2026-00042',
      error:
        lang === 'en'
          ? 'Your card was declined by the bank. Please try again with another payment method.'
          : 'Votre carte a été refusée par la banque. Merci de réessayer avec un autre moyen.',
    }),
  },
  'subscription-welcome': {
    subject: {
      fr: 'Bienvenue - Abonnement SOC Pro',
      en: 'Welcome - Subscription SOC Pro',
    },
    vars: {
      productName: 'SOC Pro',
      billingPeriod: 'monthly',
      price: '49,99 €',
    },
  },
  'subscription-renewal': {
    subject: {
      fr: 'Renouvellement de votre abonnement SOC Pro',
      en: 'Subscription SOC Pro renewed',
    },
    vars: {
      productName: 'SOC Pro',
      newPeriodEnd: '23 mai 2026',
      invoiceUrl: 'https://invoice.stripe.com/i/sample_invoice',
    },
  },
  'subscription-past-due': {
    subject: {
      fr: 'Paiement en attente - SOC Pro',
      en: 'Payment past due - SOC Pro',
    },
    vars: { productName: 'SOC Pro' },
  },
  'subscription-cancellation': {
    subject: {
      fr: 'Annulation confirmée - SOC Pro',
      en: 'Subscription cancelled - SOC Pro',
    },
    vars: { productName: 'SOC Pro' },
  },
  'license-delivery': {
    subject: {
      fr: 'Vos licences CYNA sont prêtes (CYN-2026-00042)',
      en: 'Your CYNA licenses are ready (CYN-2026-00042)',
    },
    vars: {
      orderNumber: 'CYN-2026-00042',
      licenseCount: licensesSample.length,
      hasSingleLicense: false,
      licenses: licensesSample,
    },
  },
  'contact-auto-reply': {
    subject: {
      fr: 'Nous avons bien reçu votre message',
      en: "We've received your message",
    },
    vars: {
      name: 'Claire Martin',
      subject: 'Demande de devis SOC Pro pour 50 postes',
    },
  },
  'cart-abandoned': {
    subject: {
      fr: 'Votre panier vous attend sur CYNA',
      en: 'Your cart is waiting at CYNA',
    },
    vars: {
      itemsSummary: 'SOC Pro x1, Antivirus x2',
      itemCount: 2,
    },
  },
};

async function main() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be set (load .env.development first)');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'ssl0.ovh.net',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    auth: { user, pass },
  });
  await transporter.verify();
  console.log(`✓ SMTP ready (${process.env.SMTP_HOST}), sending to ${TO}`);

  const fromName = process.env.SMTP_FROM_NAME ?? 'CYNA';
  const fromEmail = process.env.SMTP_FROM_EMAIL ?? 'noreply@cyna.it';

  const templateNames = Object.keys(samples);
  const languages: Array<'fr' | 'en'> = ['fr', 'en'];

  let sent = 0;
  let failed = 0;
  for (const name of templateNames) {
    const sample = samples[name];
    for (const lang of languages) {
      const prefix = `[${lang.toUpperCase()}][${name}]`;
      try {
        const resolvedVars = typeof sample.vars === 'function' ? sample.vars(lang) : sample.vars;
        const html = renderTemplate(name, lang, resolvedVars);
        const subject = `${prefix} ${sample.subject[lang]}`;
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: TO,
          subject,
          html,
        });
        sent++;
        console.log(`  ✓ ${prefix} sent`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${prefix} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(
    `\nDone: ${sent} sent, ${failed} failed (${templateNames.length} templates × 2 languages)`,
  );
  transporter.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
