# Závěrečný code review — kompletní UI refaktor

Datum: 2026-06-28

## Rozsah

Refaktor nahrazuje původní vizuální vrstvu systémem Training Brief napříč dashboardem, aktivitami, kalendářem, plánováním, trendy, eventy, heatmapou, trasami, reporty a nastavením. Původní datové dotazy, mutace, routy a integrační workflow zůstávají dostupné.

## Review

### Funkčnost

- Všechny původní hlavní routy zůstaly zachované.
- Dashboard staví na datech z dashboard API a transparentně rozlišuje planned, completed a synced data.
- Dnešní headline vybírá pouze workout se `scheduled_date` odpovídajícím dnešnímu datu v časové zóně vlastníka; budoucí workout ani workout z vedlejšího UTC dne už není prezentován jako dnešní.
- Stejnou owner-local definici dne používá desktopová Today karta; zrušené workouty zůstávají dostupné v detailu a exportu, ale nevstupují do Calendar/Plans UI, kopírování týdnů, dashboardu, trendů, reportů ani event readiness agregací.
- Activities používají na desktopu tabulku a na mobilu přehledný seznam nad stejnými daty a filtry.
- Mobilní měsíční kalendář zachovává celý měsíc v kompaktním sedmisloupcovém gridu a otevírá detail přes celou plochu dne.
- Planning zachovává týden, outlook, knihovnu, editor dne, šablony, přesuny, více session i read-only demo stav.
- UI neobsahuje ruční „Start Workout“ ani ruční dokončování; dokončené aktivity zůstávají integrační data.

### Bezpečnost a data

- Refaktor nepřidává veřejné backend endpointy ani nemění autentizaci a owner scoping.
- Strava tokeny ani integrační tajemství nejsou přenesena do frontendu.
- V repozitáři nejsou přidána tajemství; lokální QA `.env` je ignorovaný.
- Výpočty load, distance, duration a adherence zůstaly na existujících transparentních metrikách a formátovacích funkcích.

### Udržovatelnost

- Navigační struktura je centralizovaná v `components/layout/navigation.ts`.
- Nové styly jsou oddělené na tokens, base, layout, components a pages a načítají se až po legacy stylesheetu.
- Dashboard a mobile activities používají malé samostatné komponenty.
- React implementace zachovává existující query cache a lazy-loaded routy; nevznikly nové paralelní datové requesty pro stejné informace.
- Nové funkční chování je pokryté regresními testy včetně mobilní šířky, navigace, plan tabs, integrační provenance a správného výběru dnešního workoutu.

### Nálezy

- Critical: žádné.
- Important: poslední nezávislý nález k nekonzistentnímu započítání cancelled workoutů je opraven napříč všemi aktivními plánovacími read/agregačními cestami a čeká na finální nezávislý gate.
- Minor: Vitest/jsdom vypisuje existující upozornění k canvas a `--localstorage-file`; testy přesto končí bez failure. Backend hlásí existující Starlette deprecation warning.
- Minor: Legacy `styles.css` zůstává dočasně základem kvůli zachování všech méně častých stavů; nové vrstvy jsou nad ním a mohou být v samostatné budoucí práci postupně konsolidovány.

## Verifikace

- Frontend testy: 23 souborů, 166 testů včetně regresního pokrytí owner-local timezone rolloveru v plánování, dashboardovém Today i shell kartě, zrušeného dnešního workoutu, zarovnaných plánovacích rozsahů, přístupného přesunu mezi týdny, mobilního řazení a lazy Outlook dotazů.
- Frontend production build: TypeScript a Vite build bez chyby.
- Backend testy: 177 testů bez failure při explicitně produkčně bezpečných testovacích overrides (`DEMO_ACCOUNT_ENABLED=false`, `ROUTING_ENABLED=false`, `ROUTING_PROVIDER=valhalla`), včetně vyloučení cancelled workoutů z Calendar/Plans, dashboardu, trendů, reportů, event readiness a week-copy cest.
- `git diff --check`: bez whitespace chyb.
- Browser QA: 10 desktop rout a 6 mobilních rout bez overflow; mobilní month calendar má při 390 px 42 buněk v 7 sloupcích, výšku gridu 343 px a nulový horizontální overflow; 0 console errors/warnings.

## Hodnocení

Dokumentace si nepřiděluje vlastní release rating. Akceptační kritérium je nezávislý Staff Engineer gate alespoň 8/10 bez P0–P2; výsledek se eviduje v review PR.
