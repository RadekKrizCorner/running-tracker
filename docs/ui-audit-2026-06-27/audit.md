# Audit současného UI Running Trackeru

Datum: 27. 6. 2026

## Rozsah a metoda

Audit pokrývá veřejnou landing page, přihlášení, všechny hlavní chráněné routy a klíčové mobilní varianty. Zachycen byl běžící read-only demo účet s reálným množstvím ukázkových dat.

- Desktop: výchozí viewport vestavěného prohlížeče, 1280 × 720 px.
- Mobil: 390 × 844 px.
- Důkazy: aktuální DOM, chování rout, zdrojový kód React/CSS a lokálně zkontrolované snímky, které nejsou součástí repozitáře.
- Omezení: ze snímků a DOM nelze potvrdit úplnou shodu s WCAG. Ještě je nutné samostatně otestovat klávesnici, čtečky obrazovky, kontrast výpočtem, zoom 200–400 %, high-contrast režim a reálná dotyková zařízení.

## Co aplikace dělá

Running Tracker je osobní single-owner tréninková aplikace, která pokrývá celý běžecký cyklus:

1. Přihlášení vlastníka a veřejný read-only demo účet.
2. Import aktivit ze Stravy, ruční synchronizace a stav synchronizačních úloh.
3. Přehled týdne: vzdálenost, čas, počet běhů, nejdelší běh, převýšení, zátěž a plán vs. skutečnost.
4. Deník aktivit s filtrováním, řazením a detailním pohledem na mapu, streamy, splity, tepové zóny, poznámky a vybavení.
5. Kalendář dokončených aktivit, plánovaných tréninků, vlastních událostí a závodů.
6. Týdenní a dlouhodobé plánování s šablonami, workout poolem, více tréninky za den, kopírováním týdnů a výhledem objemu/času.
7. Závody a cílové události s countdownem, kurzem, posterem, cílovým tempem, readiness metrikami a doporučeními.
8. Trendy objemu, zátěže, intenzity, tepových zón, lehkého tempa, monotónnosti, adherence, odolnosti a osobních rekordů.
9. GPS heatmapu a generátor okruhů přes self-hosted Valhallu.
10. Roční statistiky, týdenní export a editor Instagram reportu se šablonami, náhledem a SVG/PNG exportem.
11. Nastavení jazyka, hustoty dashboardu, Stravy, HR zón, korekce převýšení, exportu dat, avataru a smazání účtu.
12. Notifikace, avatar, češtinu/angličtinu a demo režim blokující mutace.

## Současný design systém a technický stav UI

### Silné stránky

- Aplikace má rozpoznatelný vizuální základ: tmavá borovicová navigace, teplé světlé plochy, zelený primární akcent a modrou pro data.
- Většina stránek používá stejné panely, KPI karty, status pills, tlačítka a typografickou hierarchii.
- Copy je věcné a u odvozených metrik většinou vysvětluje význam i omezení.
- Desktop má sbalitelnou navigaci; mobil má bottom navigation a sekundární sheet.
- Viditelný text je lokalizovaný a DOM často používá popisky, role, nadpisy a tabulkové hlavičky.
- Mapa, streamy, splity, filtry a plánovací nástroje zachovávají vysokou funkční hodnotu.

### Strukturální slabiny

- `frontend/src/styles.css` má 5 303 řádků. Tokeny existují jen pro část barev a radiusů; řada barev je znovu natvrdo v CSS i TSX.
- `PlansPage.tsx` má 2 492 řádků, `EventDetailPage.tsx` 690, `ActivityDetailPage.tsx` 595 a `DashboardPage.tsx` 585 řádků.
- Sdílená UI vrstva obsahuje jen šest jednoduchých komponent. Většina složitějších vzorů je implementována přímo ve stránkách.
- Deset primárních položek navigace tvoří jednu plochou úroveň bez skupin nebo progresivního odhalování.
- Responzivita často pouze převádí grid na jeden sloupec. Nemění informační prioritu ani typ komponenty pro mobil.
- Nenašel se vlastní konzistentní systém `:focus-visible`; část ovladatelnosti tak spoléhá na výchozí styl prohlížeče.

## Kroky auditu a stav

### 1. Veřejná landing page — zdravá

- Silné: jasná hodnota produktu, kvalitní hero obraz, viditelná cesta k přihlášení, srozumitelné privacy zásady.
- Rizika: landing page používá samostatný, výrazně marketingovější jazyk než aplikace. Přechod do produktu působí jako přechod mezi dvěma design systémy.
- Přístupnost: kontrast hero textu je vizuálně dobrý, ale překryv nad fotografií je nutné ověřit výpočtem na celé ploše.

### 2. Přihlášení — zdravé

- Silné: krátký formulář, správný autocomplete, zřetelně oddělené demo bez hesla.
- Rizika: chybí viditelná cesta zpět na landing page a bližší kontext bezpečnosti/session.
- Přístupnost: formulář má popisky; je nutné ověřit error announcement a focus po neúspěchu.

### 3. Dashboard se sbalenou navigací — smíšený

- Silné: data jsou okamžitě dostupná a KPI používají konzistentní komponentu.
- Rizika: první viewport vyplňuje šest rovnocenných KPI a onboarding. Neexistuje titul stránky ani jedna dominantní odpověď na otázku „co mám dnes dělat?“. Ikony ve sbalené navigaci vyžadují zapamatování významu.
- Přístupnost: icon-only navigace má aria-labely, ale vizuální uživatel bez tooltipu musí význam odhadovat.

### 4. Dashboard s rozbalenou navigací — oslabený

- Silné: názvy rout jsou jasné a status dema je viditelný.
- Rizika: deset rovnocenných položek, logout a karta dne se do výšky 720 px nevejdou. Sidebar má `height: 100vh` a `overflow: hidden`, takže část navigace nebo kontextu mizí podle aktivní routy. Horní brand oblast je stísněná.
- Přístupnost: skrytý obsah bez dostupného scrollu je zásadní riziko pro menší notebooky a zoom.

### 5. Deník aktivit na desktopu — smíšený

- Silné: kvalitní filtry, datumové presety, řazení každé metriky, tabulková sémantika.
- Rizika: devět sloupců soupeří o pozornost a seznam nemá viditelné stránkování ani počet výsledků. Všechny metriky jsou zobrazené stále, ačkoli uživatel obvykle porovnává jen několik.
- Přístupnost: řazení má názvy tlačítek, ale stav směru musí být oznámen i přes `aria-sort`.

### 6. Detail aktivity — dobrý základ, vysoká hustota

- Silné: logická kombinace KPI, mapy a streamů; route a datové grafy jsou největší vizuální důkaz aktivity.
- Rizika: šest KPI znovu zabírá celý řádek. Mapa a grafy mají stejnou váhu, přestože pro různé typy běhu je důležitost jiná. Další sekce (splity, zóny, poznámky, vybavení) jsou dlouho pod foldem.
- Přístupnost: grafy jsou v DOM převážně `application`; potřebují textové shrnutí a dostupnou tabulkovou alternativu.

### 7. Měsíční kalendář na desktopu — slabý

- Silné: plánované a dokončené položky jsou rozlišeny stavem a každý den má otevřitelné detaily.
- Rizika: šest týdnů je zobrazeno v sedmi úzkých sloupcích bez jmen dnů v horní liště. Karty mají nestejnou výšku a dlouhé názvy se lámou agresivně. Přepínače, datum a navigace jsou rozptýlené do široké hlavičky.
- Přístupnost: malá tlačítka „Open“ a husté karty mohou být pod doporučenou dotykovou velikostí; význam barevných proužků musí mít redundantní text.

### 8. Dlouhodobé plánování na desktopu — slabé

- Silné: zachovává pokročilé funkce, skutečnost vs. plán, drag/edit koncept a souhrn týdne.
- Rizika: stránka současně zobrazuje navigaci týdne, lock rozsahu, knihovnu šablon, grafy i dvanáct týdnů. Sedm denních karet je tak úzkých, že názvy jsou nečitelné (`Unsc hed...`, `Progr ess...`). Horizontální i vertikální kontext je přetížený.
- Přístupnost: drag-and-drop musí mít plnohodnotnou klávesnicovou alternativu; samotná instrukce „drag“ nestačí.

### 9. Seznam závodů — zdravý

- Silné: dva cíle jsou snadno porovnatelné, countdown i připravenost jsou dobře čitelné a CTA je viditelné.
- Rizika: několik vnořených KPI boxů uvnitř velké karty vytváří více rámečků, než obsah potřebuje.
- Přístupnost: celý card target by měl mít jednoznačný focus a nepřekrývat vnořené odkazy.

### 10. Detail závodu — informačně přetížený

- Silné: transparentní readiness výpočty, cílové tempo, plán do závodu i guidance jsou skutečně užitečné.
- Rizika: horní KPI a readiness panel opakují countdown a target pace. Dále se opakuje snapshot, guidance a preparation. Uživatel nevidí rozdíl mezi „stavem“, „vysvětlením“ a „akcí“.
- Přístupnost: statusy `good`/`on track` nesmí stát jen na barvě; zde mají i text, což je správně.

### 11A. Reporty po načtení — kritický problém

- Pozorované chování: po stabilním načtení se stránka sama posunula přibližně o 2 081 px k tmavému preview iframe. Uživatel nevidí titul, roční statistiky ani kontext editoru.
- Dopad: první dojem vypadá jako prázdná/rozbitá stránka a klávesa Home ani běžný scroll mimo iframe nevracely konzistentně začátek.
- Přístupnost: automatické posunutí/focus do iframe je závažné riziko orientace a čtecího pořadí.

### 11B. Instagram report builder — slabý

- Silné: funkčně kompletní editor, šablony, týdenní prefill, náhled a export.
- Rizika: jeden velmi dlouhý formulář obsahuje styl, copy, metriky, story, template management, save/update a export. Neexistují kroky, sticky preview ani jasné oddělení práce s reportem od exportu.
- Přístupnost: iframe potřebuje popisný title; chyby a výsledek exportu musí být oznamovány live regionem.

### 12. Heatmapa — dobrý základ, slabá priorita mapy

- Silné: transparentně uvádí počet běhů, vzorků a buněk; časové filtry jsou srozumitelné.
- Rizika: KPI a filtry vyplní první viewport, zatímco hlavní důkaz — mapa — začíná až pod foldem. Tři horní metriky z velké části opakují hero badges.
- Přístupnost: mapa potřebuje textovou alternativu s nejčastějšími lokalitami/oblastmi a plně ovladatelné zoom/pan controls.

### 13. Route Explorer — smíšený

- Silné: formulář a výsledek jsou na desktopu vedle sebe; self-hosted provoz a stav bez návrhů jsou jasné.
- Rizika: primární akce „Generate loops“ je pod foldem. Souřadnice jsou exponované dříve než vzdálenost a povrch, přestože jsou pro běžný úkol sekundární. Adresní režim je vizuálně stejně významný jako funkční GPS režimy.
- Přístupnost: mapové kandidáty potřebují paralelní seznam s trasou, vzdáleností, převýšením a textovými varováními.

### 14. Trendy — analyticky bohaté, bez čtecí cesty

- Silné: metriky jsou transparentní, používají vhodné sloupce a čáry, důležité hodnoty nejsou jen v tooltipu.
- Rizika: stránka skládá mnoho rovnocenných grafů za sebe bez globálního období, porovnání, insight headline nebo priorit. Dvojité osy a odlišné palety zvyšují dekódovací náročnost.
- Přístupnost: tooltip-only detaily musí být dostupné přes focus/tap; každý graf potřebuje stručný textový závěr a datovou tabulku na vyžádání.

### 15. Nastavení — smíšené

- Silné: read-only demo je jasné, privacy copy je konkrétní a citlivé volby jsou popsané.
- Rizika: vzhled, jazyk, Strava, HR zóny, převýšení a destruktivní privacy operace jsou v jedné dlouhé stránce. Neexistuje lokální navigace ani grouping podle frekvence/rizika.
- Přístupnost: dlouhé disabled formuláře v demo režimu zůstávají vizuálně dominantní, ale nejsou použitelné; lepší je read-only summary s jasným vysvětlením.

### 16. Mobilní dashboard — slabý

- Silné: bottom navigation je snadno dosažitelná palcem a KPI se nelámou.
- Rizika: šest KPI je změněno na šest plnošířkových karet. Celý první viewport i většina druhého je pouhá metrická stěna, bez názvu stránky, dnešního tréninku nebo akce. Bottom nav částečně překrývá následující obsah.
- Přístupnost: pevná navigace potřebuje bezpečný spodní inset a obsah musí mít dostatečný padding i při zvětšení textu.

### 17. Mobilní aktivity — kritické

- Silné: filtry se skládají čitelně a dotykové chipy mají přiměřenou velikost.
- Rizika: desktopová devítisloupcová tabulka zůstává tabulkou a je horizontálně oříznutá. Není viditelný indikátor horizontálního scrollu ani možnost volby sloupců. Uživatel vidí neúplné hodnoty a pravá část se schovává pod viewport.
- Přístupnost: horizontální tabulka je náročná při zoomu a pro motorická omezení; mobil potřebuje samostatný card/list pattern.

### 18. Mobilní kalendář — slabý

- Silné: denní karty jsou čitelné a zachovávají stavy.
- Rizika: měsíční režim se mění na seznam 42 velkých dní, včetně prázdných. Navigace „Previous / rozsah / Next“ zabírá mnoho vertikálního prostoru a nevysvětluje, že rozsah je šest týdnů.
- Přístupnost: prázdné dny tvoří dlouhou sérii focusovatelných tlačítek bez vysoké informační hodnoty.

### 19. Mobilní plánování — smíšené

- Silné: controls se skládají bez horizontálního přetečení a graf je čitelný.
- Rizika: název týdne, datum, lock range, knihovna a save soutěží o první polovinu viewportu. Dlouhodobý plán je až po dvou grafech a dvanáct týdnů vytváří extrémně dlouhou stránku.
- Přístupnost: sticky save/status a oddělený edit day drawer by snížily ztrátu kontextu při klávesnici i dotyku.

### 20. Mobilní sekundární navigace — dobrý základ

- Silné: všechny sekundární routy mají velké a jasné targets; panel je obsahově jednoduchý.
- Rizika: šest sekundárních sekcí plus logout potvrzuje, že informační architektura je příliš plochá. Chybí viditelné zavírací tlačítko a panel zakrývá bottom nav i obsah.
- Přístupnost: je nutné potvrdit focus trap, návrat focusu na More, zavření Escape a skrytí pozadí před čtečkou.

## Největší UX problémy podle priority

### P0 — před redesignem opravit jako regresní rizika

1. Reporty se po načtení samy posunou k iframe preview.
2. Desktop sidebar nemá bezpečný overflow pro menší výšku/zoom a část navigace mizí.
3. Mobilní tabulka aktivit je oříznutá bez srozumitelné mobilní alternativy.

### P1 — hlavní téma refaktoringu

1. Plochá informační architektura s deseti primárními sekcemi.
2. Dashboard bez dominantního „dnes / tento týden / další akce“.
3. Kalendář a plánování zobrazují příliš mnoho časového rozsahu v jednom gridu.
4. Trendy nemají globální období, insight-first čtecí cestu ani progresivní odhalování.
5. Report builder a nastavení jsou monolitické dlouhé formuláře.

### P2 — design systém a udržitelnost

1. Rozdělit 5 303řádkový stylesheet na tokeny, primitives, layout a feature styles.
2. Rozdělit monolitické stránky podle pracovních úloh a stavů.
3. Zavést jednotné patterns pro page shell, toolbar, responsive data list, chart card, metric summary, drawer, modal a empty/loading/error state.
4. Centralizovat barvy grafů a stavů do sémantických tokenů.
5. Doplnit focus-visible, reduced-motion, touch target a dostupné alternativy pro grafy/mapy/drag-and-drop.

## Co nelze z tohoto auditu tvrdit

- Nelze potvrdit úplnou shodu s WCAG 2.2 AA.
- Nebyly provedeny mutace v owner účtu, Strava OAuth ani destruktivní privacy akce.
- Nebyla hodnocena rychlost na pomalé síti ani velmi velké datové objemy.
- Nebyla ověřena funkce ve skutečné čtečce obrazovky nebo na fyzickém telefonu.
