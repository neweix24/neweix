# Neweix Public Website — Visual Structure

**Status:** Visual specification drafted; Figma canvas created; editable screen composition is pending Figma MCP tool availability.  
**Owner:** Neweix  
**Authority:** Supreme  
**Design workspace:** https://www.figma.com/design/hdBNlibDysREEYPGhcfyRE

This document defines the public-facing Neweix website only. It is a visual and navigation specification, not an implementation claim. No application code, deployment, or service backend is included.

## 1. Product direction

Neweix is the central public entry point to the Neweix ecosystem. The website should feel like a polished, mobile-first digital hub rather than a conventional corporate site with a large desktop navigation menu.

### Brand direction

- Primary: Dark Navy and Electric Blue.
- Supporting surfaces: White and Light Blue.
- Style: modern, minimal, premium digital platform.
- Typography: clear, contemporary, bilingual Bangla and English.
- Responsive targets: mobile, tablet, desktop.
- Use the Neweix wordmark as the header identity; do not invent a finalized logo symbol.

## 2. Global application shell

### Header

- Left: Neweix wordmark; links to Home.
- Right cluster: Connect text link, then hamburger menu.
- Header remains visually compact and consistent across public pages.
- Desktop may expand spacing, but must retain the same information hierarchy.

### Full-width search row

A full-width search bar is the second horizontal row directly below the header on the homepage and remains available across public pages. It searches service and public-page entries through the backend `/api/search` route.

### Persistent bottom navigation

Four destinations, in this exact order:

1. Home — Neweix homepage.
2. Shop — Neweix Shop.
3. Wallet — Eixon.
4. Account — Central Account.

The bottom bar is fixed on mobile and remains available while scrolling. The active destination has a clear active state. On larger screens, preserve the same navigation model in a compact dock or bottom rail rather than silently changing the product's information architecture.

### Hamburger sidebar / drawer

Primary services:
- Home
- Neweix Shop
- Eixon
- Account
- Connect
- Eixora
- Neweix+

Explore:
- All Services
- Ecosystem
- Business

Information:
- About Neweix
- News & Updates
- Help Center
- FAQ
- Contact Us

Settings:
- Language: বাংলা / English
- Theme: Light / Dark

Legal:
- Terms of Service
- Privacy Policy
- Cookie Policy
- Security Policy
- Acceptable Use Policy

The drawer must support keyboard focus, close affordance, Escape dismissal, and accessible labels.

## 3. Public page inventory

### Core pages

- / — Home
- /services — All Services
- /ecosystem — Ecosystem overview
- /business — Business overview
- /about — About Neweix
- /updates — News and announcements
- /contact — Contact
- /help — Help Center
- /faq — Frequently Asked Questions
- /docs — Public documentation index
- /legal — Legal index
- /legal/terms — Terms of Service
- /legal/privacy — Privacy Policy
- /legal/cookies — Cookie Policy
- /legal/security — Security Policy
- /legal/acceptable-use — Acceptable Use Policy
- /login — Central Account sign-in entry
- /register — Central Account registration entry

### Service overview pages

- /services/eixon — Eixon overview; primary service destination: https://eixon.neweix.com
- /services/shop — Neweix Shop overview; service destination: https://shop.neweix.com (proposed URL, not confirmed)
- /services/neweix-plus — Neweix+ overview; service destination: https://plus.neweix.com (proposed URL, not confirmed)
- /services/connect — Connect overview; service destination: https://connect.neweix.com (proposed URL, not confirmed)
- /services/eixora — Eixora overview; service destination: https://eixora.neweix.com (proposed URL, not confirmed)

Each service overview page uses a shared template:
- Service identity and concise value proposition
- Hero visual / product preview
- Key capabilities
- Benefits and intended audience
- Security and privacy summary
- FAQ
- Primary “Open Service” action
- Related ecosystem services

## 4. Homepage composition

Recommended top-to-bottom order:

1. Compact global header.
2. Hero: “One ecosystem. Connected experiences.” with a clear introduction and primary action to explore services.
3. Global search entry.
4. Quick-access service shortcuts, with Eixora featured on Home.
5. Featured service cards: Eixon, Neweix Shop, Neweix+, Connect, Eixora.
6. Ecosystem explainer: how the services relate without implying shared ownership of private service data.
7. Personal and business pathways.
8. Latest announcements / updates.
9. Trust and security summary.
10. Help and support entry.
11. Footer with company, services, resources, and legal links.

The homepage must not become a duplicate dashboard. It is a public discovery and navigation surface.

## 5. Shared visual components

- Header / wordmark
- Connect header action
- Hamburger trigger
- Sidebar / drawer and grouped menu item
- Persistent bottom navigation and active item
- Search field and search results
- Service card and compact service shortcut
- Section heading and “View all” action
- Announcement card
- Trust / security information block
- FAQ accordion
- Breadcrumbs
- Primary, secondary, and text buttons
- Footer link groups
- Language selector
- Theme selector

Use reusable components and variants for active, hover, focus, disabled, loading, and error states where relevant.

## 6. Responsive behavior

### Mobile

- Header remains one compact row.
- Connect and hamburger remain visible in the header.
- Bottom navigation is fixed and has four destinations.
- Content is a single column with readable side padding.
- Sidebar opens as a full-height drawer or overlay.
- Cards stack vertically; avoid horizontal overflow.

### Tablet

- Use a two-column card grid where content allows.
- Drawer remains available.
- Bottom navigation remains the primary global navigation.

### Desktop

- Keep the same product navigation hierarchy.
- Use a centered content container and wider grids.
- Sidebar opens as a drawer, not a permanent competing navigation rail.
- Bottom navigation can become a compact bottom dock/rail while preserving the four primary destinations.

## 7. Accessibility and interaction requirements

- WCAG-minded contrast for text and controls.
- Visible keyboard focus states.
- Semantic headings and landmarks.
- Accessible names for icon-only controls.
- Minimum comfortable touch targets.
- Respect reduced-motion preferences.
- Drawer focus management and Escape handling.
- Do not rely on color alone to show active navigation.
- Bangla and English layouts must both be checked for text wrapping and overflow.

## 8. Design file page plan

The Figma file should contain these named pages:

1. 00 — Foundations: color, typography, spacing, radii, elevation, grids.
2. 01 — Components: header, drawer, bottom navigation, cards, buttons, forms, footer.
3. 02 — Mobile Screens: Home, Services, service overview, Ecosystem, Business, About, Updates, Help, FAQ, Contact, Legal, Login, Register.
4. 03 — Desktop Screens: same public page set with responsive desktop compositions.
5. 04 — Interaction States: open drawer, active navigation, search, language/theme selectors, focus and error states.
6. 05 — Page Map: sitemap and cross-service destination map.

All Figma screens must use editable layers and reusable components, not flattened screenshots.

## 9. Important boundary notes

- Neweix public pages link to independent services; they do not replace their service interfaces.
- Eixon remains the financial service. Neweix Wallet navigation is only the public entry point to Eixon.
- Account is the central customer identity destination.
- Connect is available from the header and drawer.
- Eixora is featured on Home and also listed in the drawer.
- The public site must not expose Admin or Supreme dashboards in public navigation.
- Proposed service subdomains other than the previously established Eixon domain must be confirmed before implementation.

## 10. Current execution status

- [x] Public navigation model captured.
- [x] Public page inventory and visual hierarchy documented.
- [x] Dedicated Figma design file created.
- [ ] Build editable foundations and reusable components in Figma.
- [ ] Compose all mobile public screens in Figma.
- [ ] Compose all desktop public screens in Figma.
- [ ] Validate screenshots, layout, and responsive states.
- [ ] Finalize confirmed service destination URLs.

The Figma canvas was created successfully, but the Figma Starter plan's MCP tool-call limit prevented editable design composition in this session. Do not treat the blank Figma canvas as completed designs.

## 11. Initial implementation status

A first runnable Next.js 15 + React 19 + TypeScript website foundation has been committed on branch `feat/public-website-foundation`. It includes the homepage, shared header/search row/sidebar/bottom navigation, responsive styling, public information and service landing routes, `/api/search`, and `/api/health`. Search currently uses a static server-side catalogue; authentication, database, CMS, persistent notifications, and live service integrations are intentionally deferred.
