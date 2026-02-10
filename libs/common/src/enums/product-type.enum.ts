/**
 * Product Type Enum
 * @see docs/Data_Model.md - PRODUCT entity
 */
export enum ProductType {
  /** SaaS subscription product (SOC, EDR, XDR) */
  SAAS = 'saas',
  /** Physical product (server rack, hard drive) */
  PHYSICAL = 'physical',
  /** License product (Office 365, Adobe, VMware) */
  LICENSE = 'license',
}
