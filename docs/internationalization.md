# NEWEIX internationalization

## Default locale

- English (`en`) is the default locale for new visitors.
- The selected locale is saved in `localStorage` under `neweix_locale`.
- Bengali (`bn`) is currently the second supported UI locale.
- Currency, dates, and numbers should be formatted with `Intl` using the active locale and the BDT currency code where appropriate.

## Adding another language

1. Add the BCP 47 locale code to the `Locale` type in `lib/i18n/messages.ts`.
2. Add a complete message dictionary for that locale. English is the fallback for missing keys, but production translations should be complete.
3. Add the language label and locale code to `components/language-switcher.tsx`.
4. Add locale-aware direction handling for right-to-left languages such as Arabic, Persian, Urdu, and Hebrew.
5. Add translated product and category content before publishing that locale. Storefront product names and descriptions are merchant content and must not be machine-translated silently.
6. Verify checkout, payment instructions, address labels, email templates, SEO metadata, and accessibility labels in that locale.

## Current coverage

The English-first language foundation and Bengali/English dictionaries currently cover the storefront home, product catalog, product purchase actions, product details, reviews, cart, checkout, and Bangladesh address selectors. Customer account, authentication, order tracking/history, wishlist, comparison, privacy, data-request, theme, and information screens now use English copy by default, but their strings still need migration to translation keys before Bengali selection can switch those screens too. Administration screens and API error messages also need a separate localization pass.

## Important distinction

The framework is extensible to any language with a maintained translation dictionary. It does not automatically provide complete translations for every language in the world. A language should only be offered as fully supported after its UI and merchant content have been translated and tested.