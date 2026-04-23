/**
 * Language Enum
 * @see docs/Data_Model.md - USER entity (preferred_language)
 */
export enum Language {
  /** French */
  FR = 'fr',
  /** English */
  EN = 'en',
}

/**
 * Validate an unknown value against the Language enum and fall back to FR.
 * Use at every trust boundary where a language string arrives from an untyped
 * source (RabbitMQ payload, DB column, HTTP header) to prevent path-traversal
 * or tampering via the string reaching template lookup or file-system paths.
 */
export function coerceLanguage(value: unknown): Language {
  if (typeof value === 'string' && (Object.values(Language) as string[]).includes(value)) {
    return value as Language;
  }
  return Language.FR;
}
