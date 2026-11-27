# Neweix Public Website

First runnable public website foundation for the Neweix ecosystem.

## Stack
- Next.js 15 App Router, React 19, TypeScript
- Next.js Route Handlers for the initial backend API
- Responsive custom CSS

## First-phase features
- Service-first public homepage and a dedicated `/services` directory
- Six Neweix services with current status and direct service entry points
- Header with Neweix wordmark, Connect and hamburger menu
- Full-width search bar directly below the header
- Server-side search endpoint at /api/search
- Health endpoint at /api/health
- Persistent four-item bottom navigation: Home, Services, Shop, Account
- Sidebar with services, Explore, Information, Preferences and Legal
- Unified Neweix navy, electric-blue and cyan visual system
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
The Shop destination is https://www.shop.neweix.com. The homepage and service directory show six services with explicit statuses. Shop's storefront is available, but catalog, order and checkout flows remain incomplete. Account uses https://www.accounts.neweix.com.

## Backend status
Search currently uses a server-side catalogue and does not require a database. Authentication, CMS, notifications, persistent user preferences and service integrations are later phases. This is not a production launch.
