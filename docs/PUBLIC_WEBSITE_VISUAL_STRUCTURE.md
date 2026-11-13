# Neweix Public Website — Visual Structure

**Status:** Initial implementation on branch `feat/public-website-foundation`; editable Figma composition remains pending.
**Owner:** Neweix
**Authority:** Supreme
**Design workspace:** https://www.figma.com/design/hdBNlibDysREEYPGhcfyRE

## 1. Product direction

Neweix is the central public entry point to the Neweix ecosystem. The root URL opens Neweix Shop by default. The persistent Home destination opens the Eixora Home Feed.

## 2. Global application shell

### Central notification bar
- A compact, full-width announcement strip sits at the very top, above the header.
- It carries ecosystem-wide service announcements and links to the News & Updates page.
- Visitors can dismiss the current notice; the dismissal is remembered in that browser.
- Initial copy is static UI content. A central admin-managed notification feed, targeting, scheduling, and delivery history are future backend work.

### Header
- Left: Neweix wordmark; links to the root URL (Neweix Shop).
- Right: Connect link, then hamburger menu.
- Second row: full-width global search field.

### Persistent bottom navigation
1. Home — Eixora Home Feed at `/home`.
2. Shop — Neweix Shop at `/`.
3. Wallet — Eixon at `https://eixon.neweix.com`.
4. Account — Central Account entry.

### Hamburger sidebar
Includes primary service destinations, Explore pages, information/help, preferences, and legal links. Admin and Supreme are not exposed in public navigation.

## 3. Public page inventory

- `/` — Neweix Shop storefront entry (default website page).
- `/home` — Eixora Home Feed.
- `/services` — All Services.
- `/services/eixon`, `/services/shop`, `/services/neweix-plus`, `/services/connect`, `/services/eixora` — Service information pages.
- `/ecosystem`, `/business`, `/about`, `/updates`, `/contact`, `/help`, `/faq`, `/docs`, and legal pages.

## 4. Root Shop page

The root page is the default storefront entry. It introduces Neweix Shop and links to the wider ecosystem. Product listings, prices, stock, and checkout must only be displayed when backed by real catalog and inventory data; the initial visual foundation must not invent products or availability.

## 5. Eixora Home Feed

The bottom-navigation Home item opens `/home`, the Eixora Home Feed. The initial page may show the feed structure and development state, but must not fabricate posts, users, or engagement counts.

## 6. Search and navigation

The global search row remains directly below the header on public pages. Search initially uses a server-side static catalogue of public services/pages. Product search will require a real product catalogue integration.

## 7. Responsive and accessibility requirements

- Mobile-first responsive layout.
- Fixed bottom navigation with four destinations.
- Keyboard-operable sidebar, visible focus, accessible labels, and Escape dismissal.
- Bengali and English text wrapping must be checked.
- Respect reduced motion and maintain readable contrast.

## 8. Implementation boundaries

- Neweix public pages link to independent services; they do not replace service interfaces.
- Eixon remains the financial service.
- Account remains the central customer identity destination.
- Connect remains available in the header and sidebar.
- Eixora Home Feed is separate from the default Shop page.
- No live product, social, authentication, or payment data is claimed until connected.

## 9. Service availability states

- Services not yet started display a clear **Coming Soon / শীঘ্রই চালু হবে** page when selected.
- Services with implementation already underway but not publicly launched display **In Development / উন্নয়নাধীন** instead.
- Eixon and Central Account are marked In Development; Neweix Shop, Neweix+, Connect, and Eixora are marked Coming Soon.
- No unavailable service link should send visitors to an inactive Worker or imply that login, payment, orders, or social actions are live.

## 10. Execution status

- [x] Public shell, header, search row, sidebar, and bottom navigation.
- [x] Root URL set as Neweix Shop entry.
- [x] Home navigation set to Eixora Home Feed.
- [x] Initial Shop and Eixora page structures.
- [x] Public search and health API foundation.
- [ ] Build and test validation.
- [ ] Real product catalogue, inventory, and checkout.
- [ ] Real Eixora feed and social interactions.
- [ ] Editable Figma foundations, components, and responsive screens.
- [ ] Confirm remaining service destination URLs.
