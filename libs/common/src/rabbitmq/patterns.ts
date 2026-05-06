/**
 * RabbitMQ Message and Event Patterns
 * @see docs/Event_Catalog_RabbitMQ.md
 */

/**
 * Service names for ClientProxy injection
 */
export const SERVICE_NAMES = {
  AUTH: 'AUTH_SERVICE',
  CATALOG: 'CATALOG_SERVICE',
  ORDER: 'ORDER_SERVICE',
  PAYMENT: 'PAYMENT_SERVICE',
  USER: 'USER_SERVICE',
  NOTIFICATION: 'NOTIFICATION_SERVICE',
  CONTENT: 'CONTENT_SERVICE',
  ANALYTICS: 'ANALYTICS_SERVICE',
} as const;

/**
 * Message Patterns (Request/Response - synchronous)
 * Used with @MessagePattern() decorator
 */
export const MESSAGE_PATTERNS = {
  // Auth Service
  AUTH: {
    VALIDATE_USER: { cmd: 'auth.validate_user' },
    REGISTER_USER: { cmd: 'auth.register_user' },
    VERIFY_EMAIL: { cmd: 'auth.verify_email' },
    RESEND_VERIFICATION: { cmd: 'auth.resend_verification' },
    REFRESH_TOKEN: { cmd: 'auth.refresh_token' },
    LOGOUT: { cmd: 'auth.logout' },
    FORGOT_PASSWORD: { cmd: 'auth.forgot_password' },
    RESET_PASSWORD: { cmd: 'auth.reset_password' },
    ADMIN_LOGIN: { cmd: 'auth.admin_login' },
    ADMIN_VERIFY_2FA: { cmd: 'auth.admin_verify_2fa' },
    ADMIN_RESEND_2FA: { cmd: 'auth.admin_resend_2fa' },
    ADMIN_REFRESH_TOKEN: { cmd: 'auth.admin_refresh_token' },
    ADMIN_LOGOUT: { cmd: 'auth.admin_logout' },
    ADMIN_GET_ADMINS: { cmd: 'auth.admin_get_admins' },
    ADMIN_GET_ADMIN: { cmd: 'auth.admin_get_admin' },
    ADMIN_CREATE_ADMIN: { cmd: 'auth.admin_create_admin' },
    ADMIN_UPDATE_ADMIN: { cmd: 'auth.admin_update_admin' },
    ADMIN_DELETE_ADMIN: { cmd: 'auth.admin_delete_admin' },
  },

  // User Service
  USER: {
    GET_PROFILE: { cmd: 'user.get_profile' },
    UPDATE_PROFILE: { cmd: 'user.update_profile' },
    UPDATE_EMAIL: { cmd: 'user.update_email' },
    UPDATE_PASSWORD: { cmd: 'user.update_password' },
    UPDATE_LANGUAGE: { cmd: 'user.update_language' },
    DELETE_ACCOUNT: { cmd: 'user.delete_account' },
    GET_ADDRESSES: { cmd: 'user.get_addresses' },
    CREATE_ADDRESS: { cmd: 'user.create_address' },
    UPDATE_ADDRESS: { cmd: 'user.update_address' },
    DELETE_ADDRESS: { cmd: 'user.delete_address' },
    GET_SUBSCRIPTIONS: { cmd: 'user.get_subscriptions' },
    // Added for user-service extraction
    CREATE: { cmd: 'user.create' },
    FIND_BY_EMAIL: { cmd: 'user.find_by_email' },
    FIND_BY_EMAIL_FOR_LOGIN: { cmd: 'user.find_by_email_for_login' },
    GET_BY_ID: { cmd: 'user.get_by_id' },
    MARK_VERIFIED: { cmd: 'user.mark_verified' },
    UPDATE_PASSWORD_HASH: { cmd: 'user.update_password_hash' },
    UPDATE_STRIPE_CUSTOMER_ID: { cmd: 'user.update_stripe_customer_id' },
    ADMIN_LIST: { cmd: 'user.admin_list' },
    ADMIN_GET: { cmd: 'user.admin_get' },
    ADMIN_UPDATE_STATUS: { cmd: 'user.admin_update_status' },
  },

  // Catalog Service - Categories
  CATALOG: {
    // Categories
    CATEGORY_CREATE: { cmd: 'catalog.category.create' },
    CATEGORY_UPDATE: { cmd: 'catalog.category.update' },
    CATEGORY_DELETE: { cmd: 'catalog.category.delete' },
    CATEGORY_FIND_ALL: { cmd: 'catalog.category.findAll' },
    CATEGORY_FIND_ALL_ADMIN: { cmd: 'catalog.category.findAllAdmin' },
    CATEGORY_FIND_BY_SLUG: { cmd: 'catalog.category.findBySlug' },
    CATEGORY_FIND_BY_ID: { cmd: 'catalog.category.findById' },
    CATEGORY_REORDER: { cmd: 'catalog.category.reorder' },
    // Products
    PRODUCT_CREATE: { cmd: 'catalog.product.create' },
    PRODUCT_UPDATE: { cmd: 'catalog.product.update' },
    PRODUCT_DELETE: { cmd: 'catalog.product.delete' },
    PRODUCT_BULK_DELETE: { cmd: 'catalog.product.bulk_delete' },
    PRODUCT_FIND_ALL: { cmd: 'catalog.product.findAll' },
    PRODUCT_FIND_ALL_ADMIN: { cmd: 'catalog.product.findAllAdmin' },
    PRODUCT_FIND_BY_SLUG: { cmd: 'catalog.product.findBySlug' },
    PRODUCT_FIND_BY_ID: { cmd: 'catalog.product.findById' },
    PRODUCT_FIND_BY_ID_ADMIN: { cmd: 'catalog.product.findByIdAdmin' },
    PRODUCT_SEARCH: { cmd: 'catalog.product.search' },
    PRODUCT_FIND_FEATURED: { cmd: 'catalog.product.findFeatured' },
    PRODUCT_FIND_BY_CATEGORY: { cmd: 'catalog.product.findByCategory' },
    // Product Images
    PRODUCT_ADD_IMAGE: { cmd: 'catalog.product.addImage' },
    PRODUCT_DELETE_IMAGE: { cmd: 'catalog.product.deleteImage' },
    PRODUCT_SET_PRIMARY_IMAGE: { cmd: 'catalog.product.setPrimaryImage' },
    PRODUCT_REORDER_IMAGES: { cmd: 'catalog.product.reorderImages' },
    PRODUCT_REQUEST_UPLOAD_URL: { cmd: 'catalog.product.requestUploadUrl' },
    PRODUCT_CONFIRM_IMAGE_UPLOAD: { cmd: 'catalog.product.confirmImageUpload' },
    // Stock
    STOCK_UPDATE: { cmd: 'catalog.stock.update' },
    STOCK_GET_INFO: { cmd: 'catalog.stock.getInfo' },
    STOCK_GET_ALERTS: { cmd: 'catalog.stock.getAlerts' },
    STOCK_CHECK_AVAILABILITY: { cmd: 'catalog.stock.checkAvailability' },
    STOCK_RESERVE: { cmd: 'catalog.stock.reserve' },
    STOCK_RELEASE: { cmd: 'catalog.stock.release' },
    STOCK_CONFIRM: { cmd: 'catalog.stock.confirm' },
    // Legacy aliases (backward compatibility)
    GET_CATEGORIES: { cmd: 'catalog.category.findAll' },
    GET_CATEGORY: { cmd: 'catalog.category.findBySlug' },
    GET_PRODUCTS: { cmd: 'catalog.product.findAll' },
    GET_PRODUCT: { cmd: 'catalog.product.findBySlug' },
    GET_FEATURED_PRODUCTS: { cmd: 'catalog.product.findFeatured' },
    SEARCH_PRODUCTS: { cmd: 'catalog.product.search' },
    GET_STOCK: { cmd: 'catalog.stock.getInfo' },
    RESERVE_STOCK: { cmd: 'catalog.stock.reserve' },
    RELEASE_STOCK: { cmd: 'catalog.stock.release' },
    CONFIRM_STOCK: { cmd: 'catalog.stock.confirm' },
  },

  // Order Service
  ORDER: {
    GET_CART: { cmd: 'order.get_cart' },
    ADD_CART_ITEM: { cmd: 'order.add_cart_item' },
    UPDATE_CART_ITEM: { cmd: 'order.update_cart_item' },
    REMOVE_CART_ITEM: { cmd: 'order.remove_cart_item' },
    CLEAR_CART: { cmd: 'order.clear_cart' },
    MERGE_CART: { cmd: 'order.merge_cart' },
    MERGE_GUEST_CART: { cmd: 'order.merge_guest_cart' },
    VALIDATE_CHECKOUT: { cmd: 'order.validate_checkout' },
    START_CHECKOUT: { cmd: 'order.start_checkout' },
    SET_BILLING_ADDRESS: { cmd: 'order.set_billing_address' },
    SET_SHIPPING_ADDRESS: { cmd: 'order.set_shipping_address' },
    COMPLETE_CHECKOUT: { cmd: 'order.complete_checkout' },
    GET_ORDERS: { cmd: 'order.get_orders' },
    GET_ORDER: { cmd: 'order.get_order' },
    CREATE_ORDER: { cmd: 'order.create_order' },
    UPDATE_ORDER_STATUS: { cmd: 'order.update_order_status' },
    GET_ORDER_BY_PAYMENT_INTENT: { cmd: 'order.get_order_by_payment_intent' },
    SUBSCRIBE: { cmd: 'order.subscribe' },
    ADMIN_GET_ORDERS: { cmd: 'order.admin_get_orders' },
    ADMIN_UPDATE_STATUS: { cmd: 'order.admin_update_status' },
  },

  // Payment Service
  PAYMENT: {
    GET_PAYMENT_METHODS: { cmd: 'payment.get_payment_methods' },
    SETUP_PAYMENT_METHOD: { cmd: 'payment.setup_payment_method' },
    DELETE_PAYMENT_METHOD: { cmd: 'payment.delete_payment_method' },
    SET_DEFAULT_PAYMENT_METHOD: { cmd: 'payment.set_default_payment_method' },
    GET_SUBSCRIPTIONS: { cmd: 'payment.get_subscriptions' },
    GET_SUBSCRIPTION: { cmd: 'payment.get_subscription' },
    UPDATE_BILLING_PERIOD: { cmd: 'payment.update_billing_period' },
    CANCEL_SUBSCRIPTION: { cmd: 'payment.cancel_subscription' },
    REACTIVATE_SUBSCRIPTION: { cmd: 'payment.reactivate_subscription' },
    ADMIN_UPDATE_SUBSCRIPTION_TERMS: { cmd: 'payment.admin_update_subscription_terms' },
    CREATE_CHECKOUT_SESSION: { cmd: 'payment.create_checkout_session' },
    CREATE_PAYMENT_INTENT: { cmd: 'payment.create_payment_intent' },
    CREATE_SUBSCRIPTION: { cmd: 'payment.create_subscription' },
    GET_USER_LICENSES: { cmd: 'payment.get_user_licenses' },
    GET_LICENSE_BY_ID: { cmd: 'payment.get_license_by_id' },
    ACTIVATE_LICENSE: { cmd: 'payment.activate_license' },
  },

  // Content Service
  CONTENT: {
    // Public
    GET_HOMEPAGE: { cmd: 'content.get_homepage' },
    GET_CAROUSEL: { cmd: 'content.get_carousel' },
    GET_TOP_SERVICES: { cmd: 'content.get_top_services' },
    GET_TOP_PRODUCTS: { cmd: 'content.get_top_products' },
    CREATE_CONTACT_MESSAGE: { cmd: 'content.create_contact_message' },
    // Admin - Carousel
    ADMIN_GET_CAROUSEL: { cmd: 'content.admin_get_carousel' },
    ADMIN_CREATE_SLIDE: { cmd: 'content.admin_create_slide' },
    ADMIN_UPDATE_SLIDE: { cmd: 'content.admin_update_slide' },
    ADMIN_DELETE_SLIDE: { cmd: 'content.admin_delete_slide' },
    ADMIN_REORDER_CAROUSEL: { cmd: 'content.admin_reorder_carousel' },
    // Admin - Carousel Image Upload
    CAROUSEL_REQUEST_UPLOAD_URL: { cmd: 'content.admin_carousel_request_upload_url' },
    // Admin - Hero & Top Products
    ADMIN_GET_HERO_TEXT: { cmd: 'content.admin_get_hero_text' },
    ADMIN_UPDATE_HERO_TEXT: { cmd: 'content.admin_update_hero_text' },
    ADMIN_GET_TOP_SERVICES: { cmd: 'content.admin_get_top_services' },
    ADMIN_UPDATE_TOP_SERVICES: { cmd: 'content.admin_update_top_services' },
    ADMIN_GET_TOP_PRODUCTS: { cmd: 'content.admin_get_top_products' },
    ADMIN_UPDATE_TOP_PRODUCTS: { cmd: 'content.admin_update_top_products' },
    // Admin - Contact Messages
    ADMIN_GET_CONTACT_MESSAGES: { cmd: 'content.admin_get_contact_messages' },
    ADMIN_UPDATE_CONTACT_MESSAGE: { cmd: 'content.admin_update_contact_message' },
    ADMIN_DELETE_CONTACT_MESSAGE: { cmd: 'content.admin_delete_contact_message' },
  },

  // Analytics Service
  ANALYTICS: {
    GET_DASHBOARD: { cmd: 'analytics.get_dashboard' },
    GET_SALES: { cmd: 'analytics.get_sales' },
    GET_SALES_BY_CATEGORY: { cmd: 'analytics.get_sales_by_category' },
    GET_SALES_BY_PRODUCT_TYPE: { cmd: 'analytics.get_sales_by_product_type' },
    GET_AVERAGE_CART: { cmd: 'analytics.get_average_cart' },
    GET_AVERAGE_CART_BY_PRODUCT_TYPE: { cmd: 'analytics.get_average_cart_by_product_type' },
    GET_MRR: { cmd: 'analytics.get_mrr' },
    GET_STOCK_STATUS: { cmd: 'analytics.get_stock_status' },
    EXPORT_SALES: { cmd: 'analytics.export_sales' },
    EXPORT_ORDERS: { cmd: 'analytics.export_orders' },
    EXPORT_SUBSCRIPTIONS: { cmd: 'analytics.export_subscriptions' },
  },
} as const;

/**
 * Event Patterns (Fire-and-forget - asynchronous)
 * Used with @EventPattern() decorator
 * Routing key format: <domain>.<entity>.<action>
 */
export const EVENT_PATTERNS = {
  // Auth Events
  AUTH: {
    USER_REGISTERED: 'auth.user.registered',
    USER_VERIFIED: 'auth.user.verified',
    USER_LOGIN: 'auth.user.login',
    ADMIN_LOGIN: 'auth.admin.login',
    ADMIN_2FA_CODE_REQUESTED: 'auth.admin.2fa_code_requested',
    PASSWORD_RESET_REQUESTED: 'auth.password.reset.requested',
    PASSWORD_RESET_COMPLETED: 'auth.password.reset.completed',
    PASSWORD_CHANGED: 'auth.password.changed',
    ACCOUNT_DELETED: 'auth.account.deleted',
  },

  // User Events
  USER: {
    UPDATED: 'user.user.updated',
    DELETED: 'user.user.deleted',
    PASSWORD_CHANGED: 'user.password.changed',
  },

  // Catalog Events
  CATALOG: {
    PRODUCT_CREATED: 'catalog.product.created',
    PRODUCT_UPDATED: 'catalog.product.updated',
    PRODUCT_DELETED: 'catalog.product.deleted',
    STOCK_RESERVED: 'catalog.stock.reserved',
    STOCK_RELEASED: 'catalog.stock.released',
    STOCK_CONFIRMED: 'catalog.stock.confirmed',
    STOCK_LOW: 'catalog.stock.low',
  },

  // Order Events
  ORDER: {
    CART_UPDATED: 'order.cart.updated',
    CHECKOUT_STARTED: 'order.checkout.started',
    CHECKOUT_EXPIRED: 'order.checkout.expired',
    CREATED: 'order.order.created',
    PAID: 'order.order.paid',
    SHIPPED: 'order.order.shipped',
    DELIVERED: 'order.order.delivered',
    CANCELLED: 'order.order.cancelled',
    SUBSCRIPTION_INITIATED: 'order.subscription.initiated',
  },

  // Payment Events
  PAYMENT: {
    PROCESSING: 'payment.payment.processing',
    CONFIRMED: 'payment.payment.confirmed',
    FAILED: 'payment.payment.failed',
    REFUNDED: 'payment.payment.refunded',
    WEBHOOK_RECEIVED: 'payment.webhook.received',
    LICENSES_ISSUED: 'payment.licenses.issued',
    SUBSCRIPTION_CREATED: 'payment.subscription.created',
    SUBSCRIPTION_RENEWED: 'payment.subscription.renewed',
    SUBSCRIPTION_CANCELLED: 'payment.subscription.cancelled',
    SUBSCRIPTION_PAST_DUE: 'payment.subscription.past_due',
  },

  // Content Events
  CONTENT: {
    CONTACT_MESSAGE_RECEIVED: 'content.contact.message.received',
  },
} as const;

/**
 * Retry configuration for message processing
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  multiplier: 2, // Exponential backoff
} as const;
