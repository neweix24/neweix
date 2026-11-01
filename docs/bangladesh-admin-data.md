# Bangladesh administrative address data

This checked-in offline snapshot powers the checkout's cascading location selectors.

- Snapshot source: [sohag-pro/BD-JSON](https://github.com/sohag-pro/BD-JSON), licensed MIT; contains bilingual labels and government portal hostnames.
- Snapshot counts: 8 divisions, 64 districts, 491 upazilas, 4,540 unions.
- Official cross-check: [Bangladesh National Portal division list](https://bangladesh.gov.bd/views/division-list/division-list/), [district list](https://bangladesh.gov.bd/views/district-list/District-List/), [upazila list](https://bangladesh.gov.bd/views/upazila-list), and [union list](https://bangladesh.gov.bd/views/union-list).

**Data freshness caveat:** the National Portal currently reports 8 divisions, 64 districts, 500 upazilas and 4,568 unions, which differs from this snapshot (491 / 4,540). The selector therefore includes manual “not listed / other” fallbacks at both the upazila and union levels, plus a “municipality / city corporation” option, rather than silently blocking addresses. This file is not represented as an official government export. Before enabling automated courier booking, reconcile the missing/newly created administrative areas against the current National Portal / relevant government authority and map Pathao's own city/zone/area IDs separately. Source dataset IDs are internal source identifiers, not Pathao IDs or guaranteed BBS codes.
