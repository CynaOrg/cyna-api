import { Language } from '../enums/language.enum';

/**
 * Stripe can surface issuer-controlled error strings via
 * `last_payment_error.message`. Echoing those verbatim into a customer
 * email can leak internal metadata or, in rare cases, arbitrary text
 * chosen by the card issuer. We map the well-known decline_codes to a
 * curated bilingual string and fall back to a generic message when the
 * code is unknown. The raw Stripe message stays in internal logs only.
 *
 * @see https://docs.stripe.com/declines/codes
 */
const DECLINE_MESSAGES: Record<string, Record<Language, string>> = {
  insufficient_funds: {
    [Language.FR]: 'Fonds insuffisants sur la carte.',
    [Language.EN]: 'Your card has insufficient funds.',
  },
  card_declined: {
    [Language.FR]: 'Votre carte a été refusée.',
    [Language.EN]: 'Your card was declined.',
  },
  expired_card: {
    [Language.FR]: 'Votre carte est expirée.',
    [Language.EN]: 'Your card has expired.',
  },
  incorrect_cvc: {
    [Language.FR]: 'Le code de sécurité (CVC) est incorrect.',
    [Language.EN]: 'The security code (CVC) is incorrect.',
  },
  processing_error: {
    [Language.FR]: 'Une erreur est survenue lors du traitement du paiement.',
    [Language.EN]: 'A processing error occurred while handling your payment.',
  },
  authentication_required: {
    [Language.FR]: 'Votre banque demande une authentification supplémentaire.',
    [Language.EN]: 'Your bank requires additional authentication.',
  },
  do_not_honor: {
    [Language.FR]: 'Votre banque a refusé la transaction. Contactez-la pour en savoir plus.',
    [Language.EN]: 'Your bank declined the transaction. Contact them for details.',
  },
  generic_decline: {
    [Language.FR]: 'Votre paiement a été refusé.',
    [Language.EN]: 'Your payment was declined.',
  },
};

const GENERIC_FALLBACK: Record<Language, string> = {
  [Language.FR]:
    'Votre paiement a été refusé. Contactez votre banque ou essayez un autre moyen de paiement.',
  [Language.EN]:
    'Your payment was declined. Please contact your bank or try another payment method.',
};

export function translateStripeDecline(
  declineCode: string | null | undefined,
  language: Language,
): string {
  if (declineCode && DECLINE_MESSAGES[declineCode]) {
    return DECLINE_MESSAGES[declineCode][language];
  }
  return GENERIC_FALLBACK[language];
}
