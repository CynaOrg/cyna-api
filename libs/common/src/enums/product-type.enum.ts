/**
 * Product Type Enum
 * @see docs/Data_Model.md - PRODUCT entity
 */
export enum ProductType {
  /** SaaS subscription product (SOC, EDR, XDR) */
  SAAS = 'saas',
  /** Digital product (licenses, virtual equipment) */
  DIGITAL = 'digital',
  /** Physical product (server rack, hard drive) */
  PHYSICAL = 'physical',
}
