# Neweix Public Website

First runnable public website foundation for the Neweix ecosystem.

## Stack
- Next.js 15 App Router, React 19, TypeScript
- Next.js Route Handlers for the initial backend API
- Responsive custom CSS

## First-phase features
- Service-first public homepage and a dedicated `/services` directory
- Seven listed services, including the internal planned Employees service, with current status and entry points
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
The Shop destination is https://www.shop.neweix.com. The service directory lists six customer-facing services plus the planned internal Employees service with explicit statuses. Shop's storefront is available, but its API and checkout remain disabled. Account uses https://www.accounts.neweix.com.

## Backend status
The public portal is deployed, and search currently uses a server-side catalogue without a database. Authentication, CMS, notifications, persistent user preferences, the unified Admin workspace and service integrations are not yet complete. Do not treat the portal deployment as a full Neweix ecosystem production launch.


## Ecosystem governance

Supreme is the highest and final authority. Admin is the single day-to-day operational authority across services, using Supreme-approved scoped grants and each owning service's authenticated interface/API. A unified Neweix Admin workspace is not yet implemented. Neweix is the public hub and service directory, not the owner of other services' private data.

- Canonical rules: [Supreme Ecosystem Governance Charter](https://github.com/neweix24/supreme/blob/main/docs/ecosystem-governance-charter.md)
- Local ownership: [ECOSYSTEM_ALIGNMENT.md](./ECOSYSTEM_ALIGNMENT.md)
- The public directory lists customer-facing services and the planned workforce service. Supreme's protected authority app is not a public customer service.
