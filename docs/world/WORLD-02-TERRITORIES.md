# WORLD-02 — Territorial policy for the European scenario

| | |
|---|---|
| **Status** | Inventory and recommendations for owner decision (`GAME_DESIGN.md` §2; `TASKS.md` T27). **Nothing here is adopted.** |
| **Principle** | Natural Earth's assignments are cartographic source data with a documented **de facto** default viewpoint. They are not political decisions for Heartland. Where existing game mechanics cannot represent a territory's status faithfully, the first playable version should show it **clearly labelled and non-playable**. |
| **Natural Earth fields** | Read from the repository's pinned Natural Earth 5.1.1 catalogue (`public/geography/natural-earth-5.1.1`): `TYPE`, `SOVEREIGNT`, `NOTE_BRK`, `FCLASS_ISO`, and the per-country viewpoint codes `ADM0_A3_xx` (for example the UK, Türkiye or Greek view) |

**Status of facts.** UN resolutions and treaties cited are long-established public facts. Developments that may have changed recently are marked **(not verified)** and must be checked before any text is shown to players.

## 1. How to read the table

| Column | Meaning |
|---|---|
| Recognised sovereignty | Where there is a clear international position (UN resolutions, treaties, broad recognition) |
| Claims and disputes | Who contests what |
| Effective control | Who administers it in practice |
| Natural Earth | The pinned source's classification and the admin-0/admin-1 entity holding it |
| Proposed handling (v1) | Recommendation for the first playable version; the owner decides |

**Proposed handling, in general:**
- **(a) Normal.** The territory is part of a playable or simulated country as administered. Used only where there is no active international dispute over sovereignty.
- **(b) Labelled, non-playable.** The real outline is shown with a neutral status label. It is owned by **no** playable country in the game, cannot be captured, and has economic representation only through its bloc (or none).
- **(c) Outside the scenario.** Its region is not drawn as part of any playable province. This applies to maritime and airspace disputes, which the game cannot represent at all.

## 2. Territories linked to the six playable countries

| Territory | Recognised sovereignty | Claims and disputes | Effective control | Natural Earth | Proposed handling (v1) |
|---|---|---|---|---|---|
| **Northern Cyprus** | The Republic of Cyprus (an EU member) is the recognised state for the whole island. UN Security Council Resolution 541 (1983) considered the declaration of the "Turkish Republic of Northern Cyprus" legally invalid. | Recognised only by Türkiye. The Republic of Cyprus claims the north. | Turkish Cypriot administration, with Turkish forces present | Separate admin-0 `CYN`, `TYPE` "Sovereign country", `FCLASS_ISO` "Unrecognized", note "Self admin.; Claimed by Cyprus". Every viewpoint except Türkiye's maps it to `CYP` | **(b)** Labelled "Northern Cyprus — administered by Turkish Cypriot authorities; recognised only by Türkiye; claimed by the Republic of Cyprus". Not Turkish territory in the game. Turkish forces are not represented. Economy grouped with the rest of Cyprus in bloc EUR, implying no ownership |
| **Cyprus UN buffer zone** | Part of the Republic of Cyprus | — | UN peacekeeping force (UNFICYP) | `CNM`, "Indeterminate" | **(b)** Labelled; no economy |
| **Akrotiri and Dhekelia** (UK Sovereign Base Areas) | Retained by the UK under the 1960 Treaty of Establishment | Their status is occasionally contested politically in Cyprus | UK | `WSB`, `ESB`, "Dependency", `FCLASS_ISO` "Unrecognized" | **(b)** Labelled "UK Sovereign Base Area". Not part of any UK province; no military representation in v1; economy in bloc EUR |
| **Gibraltar** | British Overseas Territory (ceded by the 1713 Treaty of Utrecht); on the UN list of Non-Self-Governing Territories | Spain claims sovereignty | UK | `GIB`, `TYPE` "Disputed", note "Admin. By U.K.; Claimed by Spain" | **(b)** Labelled "British Overseas Territory; sovereignty claimed by Spain". Not part of UK provinces; economy in bloc EUR |
| **Falkland Islands** | Administered by the UK; on the UN Non-Self-Governing Territories list | Argentina claims sovereignty | UK | `FLK`, "Disputed", note "Admin. by U.K.; Claimed by Argentina" | **(b)** Labelled with both positions; economy in bloc AME |
| **South Georgia and the South Sandwich Islands** | UK | Argentina claims | UK | `SGS`, "Dependency" (no claim note in the source) | **(b)** Labelled with the Argentine claim, although the source omits it; no economy |
| **British Indian Ocean Territory (Chagos)** | 2019 ICJ advisory opinion: the UK should end its administration. UN GA Resolution 73/295. A UK–Mauritius agreement on transferring sovereignty was signed in 2025 **(entry into force not verified)** | Mauritius claims (Natural Earth also lists Seychelles) | UK (and US use of Diego Garcia) | `IOT`, "Disputed" | **(b)** Labelled; no economy. The label text must be checked against the treaty's status at release time |
| **British Antarctic Territory** | Antarctic Treaty (claims held in abeyance) | Overlaps Argentine and Chilean claims | — | Part of `ATA`, "Indeterminate" | **(b)** No economy; not owned in the game |
| **Mayotte** | French department | The Comoros claims it; UN GA resolutions of the 1970s supported Comorian territorial integrity | France | Admin-1 of `FRA` (overseas department, NUTS FRY5) | Part of `FRA-OM` (overseas departments, **not simulated** in v1), labelled "French department; claimed by the Comoros" |
| **Scattered Islands and Tromelin** (in the French Southern and Antarctic Lands) | France | Madagascar claims the Scattered Islands; Mauritius claims Tromelin | France | Inside `ATF`, "Dependency" | **(b)** No economy; labelled |
| **Matthew and Hunter Islands** | France (New Caledonia) | Vanuatu claims | France | Inside `NCL` | Part of New Caledonia (bloc APA); labelled if shown |
| **New Caledonia; French Polynesia** | French collectivities; both on the UN list of Non-Self-Governing Territories | Self-determination processes (New Caledonia held referendums in 2018, 2020 and 2021); current political process **not verified** | France | `NCL`, `PYF`, "Dependency" | **(b)** Labelled French territory; economy in bloc APA; not part of France's provinces |
| **Adélie Land** | Antarctic Treaty | French claim held in abeyance | — | Part of `ATA` | **(b)** No economy |
| **Hatay** (Türkiye) | Turkish province since 1939 | Syria historically disputed the transfer; Syria's **current official position not verified** | Türkiye | Admin-1 of `TUR` (TR-31), in NUTS TR63 (Akdeniz) | **(a)** Recommended: part of `TUR-AKD` as administered, with the history recorded in data notes. **Owner to confirm** |
| **Aegean disputes** (Greece–Türkiye) | Greek sovereignty over the Aegean islands is established by treaty | Maritime boundaries, continental shelf, airspace extent, demilitarisation of islands, sovereignty of some islets (for example Imia/Kardak) | Greece (islands) | Not separate features; islands are Greek admin-1 units | **(c)** Not representable (no maritime zones in the game). Greek islands stay Greek (Greece is simulated) |
| **Cyprus maritime zones** | Republic of Cyprus EEZ | Türkiye disputes parts of it | — | Not mapped | **(c)** Not representable |
| **Turkish military presence in northern Syria and northern Iraq** | Syrian and Iraqi territory | — | Turkish forces present in some areas **(current extent not verified)** | Admin-1 units of `SYR` and `IRQ` | **(c)** Not represented: a neutral start with no active military operations (`GAME_DESIGN.md` §2). Syria and Iraq are in bloc MEA |
| **Northern Ireland** | UK (1998 Good Friday Agreement settles the constitutional position) | No active sovereignty dispute | UK | `GBR` admin-1 (geonunit "Northern Ireland") | **(a)** Province `GBR-NIR` |
| **Corsica, South Tyrol, Alsace-Moselle and other regions with special status** | Undisputed | — | — | Ordinary admin-1 | **(a)** Normal |
| **Crown dependencies** (Isle of Man, Jersey, Guernsey) | Crown dependencies, not part of the UK | — | Self-governing | `IMN`, `JEY`, `GGY`, "Country" | Shown with their real status; not UK provinces; economy in bloc EUR (no dispute) |

## 3. Territories linked to simulated neighbours and blocs

| Territory | Recognised sovereignty | Claims and disputes | Effective control | Natural Earth | Proposed handling (v1) |
|---|---|---|---|---|---|
| **Crimea and Sevastopol** | Ukraine. UN GA Resolution 68/262 (2014) affirmed Ukraine's territorial integrity | Annexed by Russia in 2014; not recognised by the UN General Assembly | Russia | **Admin-1 of `RUS`** (`RUS-283`, `RUS-5482`), although their ISO codes are Ukrainian (UA-43, UA-40) | **(b)** Labelled "Internationally recognised as part of Ukraine; under Russian control since 2014". Owned by no playable country; Russia and Ukraine are in bloc EEC (economy only, no military or diplomacy). **The default Natural Earth drawing (Crimea inside Russia's outline) is itself a viewpoint**: the map should show these units with a distinct "disputed" style (rendering task for Codex) |
| **Donetsk, Luhansk, Zaporizhzhia and Kherson oblasts** | Ukraine. UN GA Resolution ES-11/4 (2022) rejected their claimed annexation | Russia claims annexation (2022) | Partly Russian, partly Ukrainian | **Admin-1 of `UKR`** (whole oblasts; the source has no line of control) | **(b)** Labelled "Partly under Russian military control; annexation not recognised by the UN General Assembly". The game cannot draw a line of control from this source. These are bloc EEC members, so there is no gameplay consequence |
| **Kaliningrad** | Russia | No dispute | Russia | Admin-1 of `RUS` | Bloc EEC; normal display |
| **Transnistria** (Moldova) | Moldova | Breakaway administration | Separatist authorities | Inside `MDA` (admin-1 detail not checked) | Bloc EEC; labelled if separately drawn |
| **Abkhazia, South Ossetia** (Georgia) | Georgia | Recognised by Russia and a few states | Separatist authorities with Russian forces | Inside `GEO` (admin-1 detail not checked) | Bloc EEC; labelled if separately drawn |
| **Kosovo** | Declared independence in 2008; recognised by many states, including all six roster countries; 2010 ICJ advisory opinion | Serbia does not recognise it | Kosovo authorities | `KOS`, "Disputed", `FCLASS_ISO` "Unrecognized"; several viewpoints (UK, Spain, Greece, Russia, Ukraine) map it to `SRB` | **(b)** Labelled "Kosovo — recognised by many states, not by Serbia"; bloc EUR |
| **Ceuta and Melilla** (Spain, a simulated country) | Spain | Morocco claims them | Spain | Admin-1 of `ESP` | Part of Spain's single zone; labelled "claimed by Morocco" |
| **Svalbard** (Norway, simulated) | Norway, under the 1920 Svalbard Treaty | — | Norway | Part of `NOR` | Part of Norway's zone |
| **Åland** (Finland) | Finland (autonomous, demilitarised) | — | Åland government | `ALD`, "Dependency" | Bloc EUR |
| **Western Sahara** | Non-Self-Governing Territory (UN) | Morocco claims it; Polisario / Sahrawi Republic | Mostly Morocco | `SAH`, "Indeterminate", note "Self admin.; Claimed by Morocco" | **(b)** Labelled; bloc MEA |
| **Palestine; Golan Heights** | — | — | — | `PSX` "Indeterminate"; `ISR` "Disputed" | **(b)** Labelled with Natural Earth's notes; bloc MEA |
| **Somaliland** | Part of Somalia (internationally) | Self-declared independence; claimed by Somalia | Somaliland authorities | `SOL`, "Sovereign country", "Unrecognized" | **(b)** Labelled; bloc MEA |
| **Nagorno-Karabakh** | Azerbaijan | Conflict ended with Azerbaijani control in 2023 | Azerbaijan | Inside `AZE` | Bloc EEC; normal display |

## 4. Recommendations for the owner

1. **Adopt the "(b) labelled, non-playable" rule** for every entry marked (b). These territories are shown with their real outline, a neutral status label and economic representation only through their bloc. They are owned by no playable country and cannot be captured or occupied in version 1.
2. **Do not draw Crimea and Sevastopol as plain Russian territory.** Natural Earth's default does exactly that. Use a distinct "disputed" style and label (a rendering change, separate task). Apply the same style to Northern Cyprus, Kosovo, Western Sahara and the other (b) entries.
3. **Confirm Hatay as Turkish** (recommended handling (a)), or treat it as (b).
4. **Exclude maritime and airspace disputes** (Aegean, Cyprus EEZ). The game has no representation for them.
5. **Keep all label wording in one reviewed data file**, so wording can be corrected without code changes. Re-check every "(not verified)" item before release.
6. **Scenario start: no active wars.** No foreign military presence is represented in v1, whether in northern Cyprus, northern Syria, northern Iraq, Transnistria, Abkhazia, South Ossetia or Ukraine.
