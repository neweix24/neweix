# Pathao 64-district coverage and NEWEIX integration

## Official coverage

Pathao's published courier coverage says home delivery is available in all 64 districts of Bangladesh, including upazila-level destinations. Its coverage help article excludes Bhasanchar, St. Martin's Island and Chheradwip. Pathao also reports that delivery timing is not uniform: some urban corridors have faster service while other districts take longer.

Sources:
- Pathao, [Courier delivering in 64 districts](https://pathao.com/blog/pathao-courier-delivering-in-64-districts/) (3 July 2024).
- Pathao Help Center, [Where is Pathao's service available?](https://help.pathao.com/pathao-service-availability/) (updated 3 November 2024).
- Pathao Help Center, [Coverage area](https://help.pathao.com/coverage-area-of-pathao/) (updated 13 November 2024).

The official nationwide statement is not a promise that every island, union, village or road is serviceable. Pathao specifically excludes the three areas above; a final parcel booking remains subject to Pathao's live address resolution.

## NEWEIX administrative district register

The list below is generated from `data/bangladesh-admin-areas.json`, which drives the NEWEIX checkout address selector. Counts reflect the repository dataset, not a new Pathao operational guarantee.

### চট্টগ্রাম (Chattagram) — 11 districts

- কুমিল্লা (Comilla)
- ফেনী (Feni)
- ব্রাহ্মণবাড়িয়া (Brahmanbaria)
- রাঙ্গামাটি (Rangamati)
- নোয়াখালী (Noakhali)
- চাঁদপুর (Chandpur)
- লক্ষ্মীপুর (Lakshmipur)
- চট্টগ্রাম (Chattogram)
- কক্সবাজার (Coxsbazar)
- খাগড়াছড়ি (Khagrachhari)
- বান্দরবান (Bandarban)

### রাজশাহী (Rajshahi) — 8 districts

- সিরাজগঞ্জ (Sirajganj)
- পাবনা (Pabna)
- বগুড়া (Bogura)
- রাজশাহী (Rajshahi)
- নাটোর (Natore)
- জয়পুরহাট (Joypurhat)
- চাঁপাইনবাবগঞ্জ (Chapainawabganj)
- নওগাঁ (Naogaon)

### খুলনা (Khulna) — 10 districts

- যশোর (Jashore)
- সাতক্ষীরা (Satkhira)
- মেহেরপুর (Meherpur)
- নড়াইল (Narail)
- চুয়াডাঙ্গা (Chuadanga)
- কুষ্টিয়া (Kushtia)
- মাগুরা (Magura)
- খুলনা (Khulna)
- বাগেরহাট (Bagerhat)
- ঝিনাইদহ (Jhenaidah)

### বরিশাল (Barisal) — 6 districts

- ঝালকাঠি (Jhalakathi)
- পটুয়াখালী (Patuakhali)
- পিরোজপুর (Pirojpur)
- বরিশাল (Barisal)
- ভোলা (Bhola)
- বরগুনা (Barguna)

### সিলেট (Sylhet) — 4 districts

- সিলেট (Sylhet)
- মৌলভীবাজার (Moulvibazar)
- হবিগঞ্জ (Habiganj)
- সুনামগঞ্জ (Sunamganj)

### ঢাকা (Dhaka) — 13 districts

- নরসিংদী (Narsingdi)
- গাজীপুর (Gazipur)
- শরীয়তপুর (Shariatpur)
- নারায়ণগঞ্জ (Narayanganj)
- টাঙ্গাইল (Tangail)
- কিশোরগঞ্জ (Kishoreganj)
- মানিকগঞ্জ (Manikganj)
- ঢাকা (Dhaka)
- মুন্সিগঞ্জ (Munshiganj)
- রাজবাড়ী (Rajbari)
- মাদারীপুর (Madaripur)
- গোপালগঞ্জ (Gopalganj)
- ফরিদপুর (Faridpur)

### রংপুর (Rangpur) — 8 districts

- পঞ্চগড় (Panchagarh)
- দিনাজপুর (Dinajpur)
- লালমনিরহাট (Lalmonirhat)
- নীলফামারী (Nilphamari)
- গাইবান্ধা (Gaibandha)
- ঠাকুরগাঁও (Thakurgaon)
- রংপুর (Rangpur)
- কুড়িগ্রাম (Kurigram)

### ময়মনসিংহ (Mymensingh) — 4 districts

- শেরপুর (Sherpur)
- ময়মনসিংহ (Mymensingh)
- জামালপুর (Jamalpur)
- নেত্রকোণা (Netrokona)

Total in the NEWEIX selector: **64 districts**, **491 upazila records**.

## How NEWEIX resolves coverage and prices

- The customer enters division, district, upazila, union/area and village/ward.
- NEWEIX uses verified Pathao City/Zone IDs for the `price-plan` endpoint. A quote is never derived from a guessed area name.
- The admin Pathao panel can scan all eight divisions against the live Pathao City/Zone catalog. It stores only a unique exact normalized city + zone match. Ambiguous names, missing cities, missing zones and unmatched upazilas are returned for manual review.
- The mapping table is server-only, RLS-enabled and accessible to the service role. Customers cannot read or alter mapping IDs.
- The booking API sends the full structured destination address. Pathao's July 2025 API update says merchants should omit `recipient_city`, `recipient_zone` and `recipient_area` from order creation so Pathao can resolve those from the full address.
- A quote mapping does not itself guarantee the final village/road is serviceable. Pathao's booking response is the final acceptance check.

## Pricing

Use Pathao's live `price-plan` response when available. The merchant pricing schedule supplied to NEWEIX is documented separately as a fallback policy; never silently claim a fallback amount is a live Pathao quote. COD fee, return fee, promotions and excess-weight surcharges remain provider-dependent and should be refreshed from the merchant panel.

## Initial production state and operations

The production mapping table was created on 6 November 2026 and starts empty. An admin/Supreme user must open Admin → Pathao Courier Management → Checkout Delivery Area Mapping and select **Sync Pathao coverage for all 64 districts** after the updated Worker is deployed. The sync checks each division in a separate request and reports full, partial, missing and ambiguous matches. Manually review any skipped areas before enabling them for live checkout.