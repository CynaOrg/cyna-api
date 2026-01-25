/**
 * Order Type Enum
 * @see docs/Data_Model.md - ORDER entity
 */
export enum OrderType {
  /** SaaS subscription order */
  SAAS = 'saas',
  /** Digital product order */
  DIGITAL = 'digital',
  /** Physical product order */
  PHYSICAL = 'physical',
  /** Mixed order (multiple product types) */
  MIXED = 'mixed',
}
