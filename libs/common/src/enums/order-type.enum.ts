/**
 * Order Type Enum
 * @see docs/Data_Model.md - ORDER entity
 */
export enum OrderType {
  /** SaaS subscription order */
  SAAS = 'saas',
  /** Physical product order */
  PHYSICAL = 'physical',
  /** License product order */
  LICENSE = 'license',
  /** Mixed order (multiple product types) */
  MIXED = 'mixed',
}
