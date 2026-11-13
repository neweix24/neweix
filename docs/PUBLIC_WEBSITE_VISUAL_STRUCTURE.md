# Neweix Public Website — Visual Structure

**Status:** Initial implementation on branch `feat/public-website-foundation`; editable Figma composition remains pending.
**Owner:** Neweix
**Authority:** Supreme
**Design workspace:** https://www.figma.com/design/hdBNlibDysREEYPGhcfyRE

## 1. Product direction

Neweix is the central public entry point to the Neweix ecosystem. The root URL (`www.neweix.com`) opens the complete Neweix Homepage, showing the ecosystem overview, services, updates, and information. Each navigation item opens its own page. Neweix Shop has its own `/shop` route. The Home destination returns to `/`.

## 2. Global application shell

### Header notification menu
- The header's right-side action order is Connect, Notification bell, then hamburger menu.
- Selecting the bell opens a compact notification dropdown below the header action.
- The dropdown shows the latest central announcement and links to the News & Updates page.
- A small dot indicates that an announcement is available.
- Initial notification content is static UI. Admin-managed notifications, targeting, scheduling, unread state, and delivery history require a later backend implementation.

### Header
- Left: Neweix wordmark; links to the root URL (Neweix Homepage).
- Right: Connect link, notification bell/menu, then hamburger menu.
- Second row: full-width global search field.

### Persistent bottom navigation
1. Home — Neweix Homepage at `/`.
2. Shop — Neweix Shop at `/shop`.
3. Wallet — Eixon service entry.
4. Account — Central Account entry.

### Hamburger sidebar
Includes primary service destinations, Explore pages, information/help, preferences, and legal links. Admin and Supreme are not exposed in public navigation.

## 3. Public page inventory

- `/` — Complete Neweix Homepage and ecosystem overview.
- `/shop` — Neweix Shop page.
- Eixora Home Feed remains a separate service destination and is not the root Homepage.
- `/services` — All Services.
- `/services/eixon`, `/services/shop`, `/services/neweix-plus`, `/services/connect`, `/services/eixora` — Service information pages.
- `/ecosystem`, `/business`, `/about`, `/updates`, `/contact`, `/help`, `/faq`, `/docs`, and legal pages.

## 4. Neweix Homepage

The root page presents the full public Neweix ecosystem: primary services, service availability states, ecosystem information, announcements, and help links. Navigation items take visitors to dedicated pages. The Homepage must not be replaced by the Shop or an Eixora feed.

## 5. Neweix Shop page

The `/shop` page is the dedicated storefront entry. It introduces Neweix Shop and links back to the wider ecosystem. Product listings, prices, stock, and checkout must only be displayed when backed by real catalog and inventory data; the initial visual foundation must not invent products or availability.

## 6. Eixora Home Feed

The Home navigation item opens `/`, the complete Neweix Homepage. Eixora Home Feed is a separate service destination at its own service entry point. The initial page may show the feed structure and development state, but must not fabricate posts, users, or engagement counts.

## 7. Search and navigation

The global search row remains directly below the header on public pages. Search initially uses a server-side static catalogue of public services/pages. Product search will require a real product catalogue integration.

## 8. Responsive and accessibility requirements

- Mobile-first responsive layout.
- Fixed bottom navigation with four destinations.
- Keyboard-operable sidebar, visible focus, accessible labels, and Escape dismissal.
- Bengali and English text wrapping must be checked.
- Respect reduced motion and maintain readable contrast.

## 9. Implementation boundaries

- Neweix public pages link to independent services; they do not replace service interfaces.
- Eixon remains the financial service.
- Account remains the central customer identity destination.
- Connect remains available in the header and sidebar.
- Eixora Home Feed is separate from the default Shop page.
- No live product, social, authentication, or payment data is claimed until connected.

## 10. Service availability states

- Services not yet started display a clear **Coming Soon / শীঘ্রই চালু হবে** page when selected.
- Services with implementation already underway but not publicly launched display **In Development / উন্নয়নাধীন** instead.
- Eixon and Central Account are marked In Development; Neweix Shop, Neweix+, Connect, and Eixora are marked Coming Soon.
- No unavailable service link should send visitors to an inactive Worker or imply that login, payment, orders, or social actions are live.

## 11. Execution status

- [x] Public shell, header, search row, sidebar, and bottom navigation.
- [x] Root URL set as complete Neweix Homepage.
- [x] Dedicated Neweix Shop page at `/shop`.
- [x] Home navigation returns to the Neweix Homepage.
- [x] Initial Shop and Eixora page structures.
- [x] Public search and health API foundation.
- [x] Public sitemap, robots directives, and social metadata.
- [x] ESLint 9 flat configuration and CI TypeScript check.
- [x] Escape-key dismissal and hidden-drawer focus exclusion for navigation overlays.
- [ ] Build and test validation.
- [ ] Real product catalogue, inventory, and checkout.
- [ ] Real Eixora feed and social interactions.
- [ ] Editable Figma foundations, components, and responsive screens.
- [ ] Confirm remaining service destination URLs.

## 12. Search engine visibility

- `/sitemap.xml` is generated from the public informational route list.
- `/robots.txt` allows public pages and disallows API routes from crawling.
- Coming Soon pages and API endpoints are not included in the sitemap.
- Global metadata defines the canonical public host, Open Graph previews, Twitter summary previews, and crawler directives.
- Private dashboards, authenticated pages, and admin routes must remain outside the public sitemap and must use appropriate no-index/access controls if introduced.

## 13. Continuous integration

The GitHub Actions workflow validates:
1. ESLint.
2. TypeScript with `tsc --noEmit`.
3. Next.js production build.

CI execution is currently blocked before job steps because GitHub has assigned no hosted runner (runner ID 0). This is an infrastructure/runner availability issue; source-code validation remains pending until a runner can start the job.
