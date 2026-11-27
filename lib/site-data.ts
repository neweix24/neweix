export type ServiceStatus = "active" | "in-development" | "planned";

export type NeweixService = {
  id: string;
  name: string;
  category: string;
  description: string;
  href: string;
  tone: "blue";
  status: ServiceStatus;
  statusLabel: string;
  actionLabel: string;
};

export const services: NeweixService[] = [
  {
    id: "shop",
    name: "Neweix Shop",
    category: "Shopping",
    description: "Neweix-এর নিজস্ব অনলাইন স্টোর। স্টোরফ্রন্ট চালু আছে; ক্যাটালগ, অর্ডার ও চেকআউট চালুর কাজ এখনো বাকি।",
    href: "https://www.shop.neweix.com",
    tone: "blue",
    status: "active",
    statusLabel: "স্টোরফ্রন্ট চালু",
    actionLabel: "Shop খুলুন",
  },
  {
    id: "account",
    name: "Neweix Account",
    category: "Identity",
    description: "একটি Neweix Account-এর মাধ্যমে পরিচয়, ব্যক্তিগত প্রোফাইল ও ব্যবসায়িক পরিচয় পরিচালনার কেন্দ্রীয় ব্যবস্থা।",
    href: "https://www.accounts.neweix.com",
    tone: "blue",
    status: "in-development",
    statusLabel: "উন্নয়নাধীন",
    actionLabel: "Account পোর্টাল",
  },
  {
    id: "eixon",
    name: "Eixon",
    category: "Ecosystem utility",
    description: "Neweix-এর নিজস্ব পণ্য ও সেবা কেনা সহজ করার EIX token এবং সংশ্লিষ্ট Wallet অভিজ্ঞতা।",
    href: "/coming-soon?service=eixon",
    tone: "blue",
    status: "in-development",
    statusLabel: "উন্নয়নাধীন",
    actionLabel: "বিস্তারিত দেখুন",
  },
  {
    id: "connect",
    name: "Neweix Connect",
    category: "Communication",
    description: "ব্যক্তিগত বার্তা ও যোগাযোগের জন্য Neweix-এর নিজস্ব messaging service। MVP উন্নয়নাধীন।",
    href: "/coming-soon?service=connect",
    tone: "blue",
    status: "in-development",
    statusLabel: "MVP উন্নয়নাধীন",
    actionLabel: "বিস্তারিত দেখুন",
  },
  {
    id: "neweix-plus",
    name: "Neweix+",
    category: "Membership",
    description: "সাবস্ক্রিপশন, বিশেষ সংগ্রহ, অগ্রাধিকার সুবিধা ও সদস্যদের জন্য নির্ধারিত অভিজ্ঞতা।",
    href: "/coming-soon?service=neweix-plus",
    tone: "blue",
    status: "planned",
    statusLabel: "পরিকল্পনাধীন",
    actionLabel: "বিস্তারিত দেখুন",
  },
  {
    id: "eixora",
    name: "Eixora",
    category: "Social",
    description: "পোস্ট, আলোচনা, Home Feed ও কমিউনিটি-কেন্দ্রিক সামাজিক প্ল্যাটফর্মের পরিকল্পনা।",
    href: "/coming-soon?service=eixora",
    tone: "blue",
    status: "planned",
    statusLabel: "পরিকল্পনাধীন",
    actionLabel: "বিস্তারিত দেখুন",
  },
  {
    id: "employees",
    name: "Employees",
    category: "Administration",
    description: "Admin ও কর্মীদের পরিচয়, দায়িত্ব এবং অনুমোদিত কর্মপরিচালনার অভ্যন্তরীণ ব্যবস্থা। এখনো পরিকল্পনাধীন।",
    href: "/coming-soon?service=employees",
    tone: "blue",
    status: "planned",
    statusLabel: "পরিকল্পনাধীন",
    actionLabel: "বিস্তারিত দেখুন",
  },
];

export const pages = [
  { title: "Home", description: "Neweix-এর মূল পাতা", href: "/", keywords: ["home", "হোম", "homepage", "মূল পাতা", "neweix"], category: "Page" },
  { title: "All Services", description: "Neweix-এর সব সার্ভিস ও তাদের বর্তমান অবস্থা", href: "/services", keywords: ["services", "সার্ভিস", "সেবা", "সব সার্ভিস"], category: "Directory" },
  { title: "Ecosystem", description: "Supreme, Admin এবং প্রতিটি সার্ভিসের দায়িত্ব ও সম্পর্ক", href: "/ecosystem", keywords: ["ecosystem", "ইকোসিস্টেম", "supreme", "admin", "কর্তৃত্ব", "পরিচালনা"], category: "Guide" },
  { title: "Neweix Shop", description: "Neweix-এর অনলাইন স্টোরফ্রন্ট", href: "https://www.shop.neweix.com", keywords: ["shop", "সপ", "shopping", "কেনাকাটা"], category: "Service" },
  { title: "Neweix Account", description: "Central account ও identity management", href: "https://www.accounts.neweix.com", keywords: ["account", "অ্যাকাউন্ট", "login", "পরিচয়"], category: "Service" },
  { title: "Eixon", description: "EIX token ও Neweix Wallet experience", href: "/coming-soon?service=eixon", keywords: ["eixon", "wallet", "ওয়ালেট", "eix"], category: "Service" },
  { title: "Neweix Connect", description: "Messaging ও communication service", href: "/coming-soon?service=connect", keywords: ["connect", "কানেক্ট", "chat", "message", "মেসেজ"], category: "Service" },
  { title: "Neweix+", description: "Premium subscription ও membership সুবিধা", href: "/coming-soon?service=neweix-plus", keywords: ["plus", "premium", "membership", "সদস্যতা"], category: "Service" },
  { title: "Eixora", description: "Social platform, Home Feed ও community", href: "/coming-soon?service=eixora", keywords: ["eixora", "social", "সোশ্যাল"], category: "Service" },
  { title: "Employees", description: "Admin ও workforce identity এবং দায়িত্ব ব্যবস্থাপনা", href: "/coming-soon?service=employees", keywords: ["employees", "কর্মী", "admin", "workforce", "প্রশাসন"], category: "Internal Service" },
];
