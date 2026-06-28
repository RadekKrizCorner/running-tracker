# Design QA — Training Brief UI refactor

Datum: 2026-06-28

## Porovnávané podklady

- Zdrojové mocky:
  - `docs/ui-refactor-mockups-2026-06-28/01-dashboard-desktop.png`
  - `docs/ui-refactor-mockups-2026-06-28/02-planning-desktop.png`
  - `docs/ui-refactor-mockups-2026-06-28/03-dashboard-mobile.png`
  - `docs/ui-refactor-mockups-2026-06-28/04-activities-mobile.png`
- Implementační snímky:
  - `docs/ui-refactor-implementation/final/dashboard-desktop.png`
  - `docs/ui-refactor-implementation/final/planning-desktop-drawer.png`
  - `docs/ui-refactor-implementation/final/dashboard-mobile.png`
  - `docs/ui-refactor-implementation/final/activities-mobile.png`
- Desktop viewport: 1440 × 1024, otevřený editor dne u plánování.
- Mobilní viewport: 390 × 844, dashboard a activities se zobrazenou spodní navigací.

## Výsledek porovnání

### Dashboard desktop

- Informační hierarchie odpovídá mocku: dnešní stav, skutečnost proti plánu, týdenní agenda, dva analytické grafy a kompaktní přehled dalších dat.
- Sidebar používá schválené seskupení Today, Training, Progress, Tools a Account.
- Detailní week command center zůstává funkční, ale je záměrně až pod přehledovou vrstvou.
- Bez horizontálního overflow při šířce 1440 px.

### Planning desktop

- Zachované jsou Week, Outlook a Library, přehled Actual/Planned/Delta/Sessions, denní řádky a plný editor dne.
- Editor dne je širší a funkčně bohatší než koncept: ponechává rychlé akce, více session a existující plánovací funkce.
- Automaticky importované aktivity jsou označené „Synced from Strava“ a plánovací UI neobsahuje ruční dokončování aktivit.

### Dashboard mobile

- Zachovaná je schválená posloupnost headline → plán → klíčové metriky → týdenní agenda.
- Pevná spodní navigace má Today, Plans, Activities, Progress a More.
- Bez horizontálního overflow při šířce 390 px.

### Activities mobile

- Desktopová tabulka je na mobilu nahrazena samostatným semantickým seznamem.
- Každý řádek zachovává datum, intenzitu, vzdálenost, čas, tempo, původ ze Stravy a odkaz na detail.
- Vyhledávání a všechny původní filtry zůstávají dostupné nad seznamem.

## Ověřené interakce a stavy

- Navigace všech hlavních rout na desktopu i mobilu.
- Mobilní přechod Today → Activities.
- Přepnutí Week → Outlook a vykreslení outlook grafu.
- Otevření Library dialogu.
- Otevření editoru konkrétního dne z týdenního plánu.
- Browser konzole: 0 errors, 0 warnings.
- Desktop routy: dashboard, calendar, plans, activities, trends, events, heatmap, routes, reports a settings bez horizontálního overflow.
- Mobilní routy: dashboard, activities, calendar, plans, trends a settings bez horizontálního overflow.

## Copy diff oproti mockům

- Číselné hodnoty, názvy běhů a eventů odpovídají živým demo datům, ne statickým hodnotám v mocku.
- Finální dashboard frame ukazuje pravdivý stav „No run is planned for today“, protože první budoucí workout je 2026-06-29; vizuální mock zobrazuje alternativní stav s dnešním plánem.
- Sidebar ponechává existující produktový label „Dashboard“, zatímco mobilní navigace používá „Today“.
- „Start Workout“ ani obdobná akce není implementována; podle produktového rozhodnutí přichází dokončené aktivity výhradně z integrací, například Stravy.
- Editor plánování používá existující podrobnější copy a ovládání, aby nebyla ztracena žádná funkce.

## Závažnost nálezů

- P0: žádné.
- P1: žádné.
- P2: žádné.
- P3: volitelně lze v další iteraci doplnit mobilní account/sync summary z konceptu a zkrátit desktopové grafy pro ještě vyšší hustotu první obrazovky.

final result: passed
