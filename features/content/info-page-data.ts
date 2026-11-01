export type InfoSection = { title: string; body: string[] };
export type InfoPageData = { eyebrow: string; title: string; description: string; sections: InfoSection[] };

export const infoPages: Record<string, InfoPageData> = {
  about: {
    eyebrow: "ABOUT NEWEIX",
    title: "Simple, transparent, and reliable online shopping",
    description: "NEWEIX is building a modern digital commerce experience.",
    sections: [
      { title: "Our mission", body: ["To make every step—from discovering products to tracking orders—simple and clear.", "Our priority is to deliver a user-friendly experience on both mobile and desktop."] },
      { title: "Our commitment", body: ["To present product information, pricing, stock, and order status as clearly as possible.", "To protect customer information and make support easy to access."] }
    ]
  },
  contact: {
    eyebrow: "CONTACT",
    title: "Contact NEWEIX",
    description: "If you need help with an order, product, or the website, have your order number ready.",
    sections: [
      { title: "Order support", body: ["First, check your order status on the order tracking page using your order number and phone number.", "Keep your order number, phone number used for the order, and a brief description of the issue together."] },
      { title: "Contact information", body: ["Verified phone numbers, email addresses, and office addresses have not yet been published in this version. We will add them after verification rather than display inaccurate contact information."] }
    ]
  },
  faq: {
    eyebrow: "HELP CENTER",
    title: "Frequently asked questions",
    description: "Basic help with shopping and order management on NEWEIX.",
    sections: [
      { title: "How do I place an order?", body: ["Select a product from the catalog and add it to your cart, or use Buy Now. Then enter the required details at checkout and submit your order."] },
      { title: "How do I track my order?", body: ["Search on the order tracking page using your order number and the phone number used when placing the order."] },
      { title: "Which payment methods are available?", body: ["Choose an enabled payment method shown at checkout: Cash on Delivery, bKash, Nagad, or Rocket. Mobile payments are not confirmed until the transaction ID has been verified."] },
      { title: "Does adding a product to the cart reserve stock?", body: ["No. The server rechecks the current price and available stock when you submit an order."] }
    ]
  },
  privacy: {
    eyebrow: "PRIVACY",
    title: "Privacy policy",
    description: "NEWEIX uses personal information to fulfil orders, provide customer support, and manage accounts. Customers can control optional preferences and marketing communications.",
    sections: [
      { title: "Information we collect", body: [
        "When you place an order, we may collect your name, mobile number, delivery address, ordered products, quantities, payment method, and, where applicable, payment transaction ID.",
        "When you use an account, we process your login email, profile name and phone number, and saved delivery addresses.",
        "Customers may optionally save preferred clothing sizes and colours. Providing these preferences is not required.",
        "If you consent to marketing emails or SMS, we record the consent and any changes or withdrawal."
      ] },
      { title: "How we use information", body: [
        "We use necessary information to process orders, verify payments, arrange delivery, manage returns and refunds, provide support, manage accounts, and prevent fraud or security risks.",
        "Saved sizes and colours may be used to recommend relevant products.",
        "Promotional emails or SMS should only be sent with separate consent for that channel. Essential order and delivery messages are separate from marketing consent."
      ] },
      { title: "Payments and security", body: [
        "NEWEIX will never ask for your bKash or Nagad PIN, OTP, card CVV, or bank password. For mobile payment verification, we may request only the transaction ID.",
        "Owner-based database access controls are applied to customer addresses, preferences, and consent records."
      ] },
      { title: "Service providers and data sharing", body: [
        "Information may be processed or shared with relevant service providers, only as necessary for hosting, databases, account security, payment verification, and courier delivery.",
        "NEWEIX does not collect personal information for sale. The actual role and data location of each service provider should be verified against the business configuration."
      ] },
      { title: "Your controls and rights", body: [
        "Signed-in customers can view and update their profile, saved addresses, and preferences from their account.",
        "You can enable or withdraw marketing email/SMS consent from the Privacy & Preferences page.",
        "You may request access, correction, withdrawal of consent, or deletion. Records required for orders, accounting, or legal obligations may need to be retained for the applicable period."
      ] },
      { title: "Retention, cookies, and policy updates", body: [
        "Order and transaction records are retained according to applicable law and business obligations. Other account information should not be kept longer than necessary.",
        "Technical data may be used for login and security. Optional analytics or advertising tracking should only be enabled with appropriate notices and consent mechanisms.",
        "This policy is an initial publication draft. Before it takes effect, NEWEIX's actual contact details, service-provider list, data-retention periods, and applicable legal requirements should be reviewed by local counsel."
      ] }
    ]
  },
  terms: {
    eyebrow: "TERMS OF SERVICE",
    title: "Terms of service",
    description: "The initial terms that apply when using NEWEIX and placing orders.",
    sections: [
      { title: "Product information and pricing", body: ["Product prices, images, descriptions, and stock may change. The information stored on the server when an order is accepted is used for final verification."] },
      { title: "Orders and payments", body: ["Submitting an order does not mean a mobile payment has been verified. The transaction ID must be checked against the relevant payment record."] },
      { title: "Delivery and returns", body: ["Details about delivery fees, timelines, cancellations, returns, and refunds will be published here once the business policies have been approved."] },
      { title: "Legal review", body: ["This page is an initial draft and must be reviewed against applicable consumer-protection and e-commerce laws in Bangladesh before publication."] }
    ]
  }
};
