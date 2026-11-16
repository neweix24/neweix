# Neweix Public Website

First runnable public website foundation for the Neweix ecosystem.

## Stack
- Next.js 15 App Router, React 19, TypeScript
- Next.js Route Handlers for the initial backend API
- Responsive custom CSS

## First-phase features
- Public homepage and service directory
- Header with Neweix wordmark, Connect and hamburger menu
- Full-width search bar directly below the header
- Server-side search endpoint at /api/search
- Health endpoint at /api/health
- Persistent four-item bottom navigation: Home, Shop, Wallet, Account
- Sidebar with services, Explore, Information, Preferences and Legal
- Eixora featured on Home
- Responsive mobile and desktop layouts
- Initial theme and language controls

## Developer-facing products

Neweix does not provide a Developer Marketplace, Developer Portal/Dashboard, third-party Developer API Platform, developer onboarding, developer subscriptions/billing, or developer integration/publishing program. These capabilities are cancelled under Supreme governance policy. See the [Supreme cancellation policy](https://github.com/neweix24/supreme/blob/main/docs/developer-program-cancellation.md).

## Local development
Requires Node.js 20.9+.

1. npm install
2. npm run dev
3. Open http://localhost:3000

## Optional service destinations
NEXT_PUBLIC_SHOP_URL, NEXT_PUBLIC_ACCOUNT_URL, NEXT_PUBLIC_CONNECT_URL, NEXT_PUBLIC_EIXORA_URL and NEXT_PUBLIC_PLUS_URL may be configured when final service domains are approved. Eixon currently links to https://eixon.neweix.com.

## Backend status
Search currently uses a server-side catalogue and does not require a database. Authentication, CMS, notifications, persistent user preferences and service integrations are later phases. This is not a production launch.
