# Kontakty, instalace, přílohy a připomínky odjezdu

Připraveno k revizi. Produkční main ani běžící push služba se tímto návrhem nemění.

- Telefon nové jízdy nabízí výběr z telefonu (podle podpory Chrome/Android) a vyhledávání uložených zákazníků podle čísla; jméno rovněž nabízí zákazníky. Vyplní telefon, jméno a případnou adresu. Přepsání již vyplněných údajů vyžaduje potvrzení. Oba přepínače jsou v Nastavení.
- Našeptávání čte jízdy Evidence a místní Archiv Konfigurátoru na stejné doméně. Nenačítá cloudový Archiv konfigurátoru na jiném zařízení. Koncepty konfigurátoru se nenabízejí.
- Explicitní manifest ID Evidence je `/evidence-rozvozu-app/`; konfigurátor má `/konfigurator-reziva-app/`. Dřívější relativní `./` Evidence se již na standardní Pages URL vyhodnocovalo na odlišnou identitu; nelze proto tvrdit, že samotné ID prokazatelně způsobovalo chybu telefonu. Instalaci obou aplikací musí potvrdit skutečný Android. Instalace zde znamená PWA přes Chrome, nikoli publikaci v Google Play.
- Jeden společný proces ukládá přílohy do IndexedDB pro novou jízdu, úpravu a koncept. Před uložením čeká na zápis souborů. Chyby nejsou zamlčeny; nevalidní formulář nesmí měnit přílohy jiné jízdy. Stávající synchronizace a úplná záloha pracují se stejnou databází souborů.
- Doručení 09:00 a cesta 30 minut znamenají odjezd 08:30. Nastavených 60 minut předstihu znamená 07:30. Nakládka ani rezerva se neodečítají. Přechod do předchozího dne je podporován. Bez známé trasy se oznámení neplánují; formulář to vysvětluje.
- U sloučeného rozvozu vzniká jeden plán oznámení pro odjezd z pily k první aktivní zastávce, ostatní zastávky nevyvolávají duplicitní upozornění na tentýž odjezd. START potlačí celý plán.

## Protokol a nasazení

`push-model.records()` předává serveru i Android mostu ve stávajících polích `date/time` vypočtený místní čas odjezdu. Původní datum/čas doručení v jízdě zůstává nedotčen. Stávající server převádí tento čas v Europe/Prague; databázový sloupec `delivery_at` v protokolu nyní znamená kotvu připomínky. Databázové schéma se nemění. Současně s webem je třeba nasadit upravený `supabase/functions/push-dispatch/index.ts`, který podrobný obsah označuje jako Odjezd. Nenahradit text doručení jen v klientu.

Před vydáním: sloučit schválenou větev, nasadit Edge Function, otevřít Evidenci s internetem pro přepočet existujících připomínek, zavřít staré otevřené verze na ostatních zařízeních. Starý klient by mohl zpět odeslat původní kotvu doručení. APK z Android Studia tento repozitář neobsahuje; její vlastní text notifikace zde nelze ověřit.

Test na skutečném telefonu: současná instalace obou PWA, výběr kontaktu, PDF příloha → uložit → znovu otevřít → záloha/synchronizace a připomínka při zavřené aplikaci. Web Push vyžaduje připojený účet, oprávnění a běžící serverovou službu, nelze garantovat přesný budík bez internetu.

## Doplnění: Archiv konfigurátoru, PDF a Nastavení

- Název i krátký instalační název jsou nyní `Evidence rozvozů`; ID se nemění.
- Kontakt používá totožnou SVG ikonu adresáře jako konfigurátor. Instalace je dostupná v Nastavení, stejně jako přepínače kontaktů, nabídky zákazníků, importu, cloudu, automatického PDF a ručního přikládání dokumentů. Původní Nastavení oznámení a synchronizace zůstává zachované.
- `archive-model.js` mapuje skutečný snapshot v2 konfigurátoru: kontaktní údaje z inputs a metadat, doručovací adresu z položky dopravy, cenu bez DPH včetně individuálních/globálních úprav, vozidlo a poznámky. Archivované datum nikdy není termínem jízdy. Chybějící datum a čas jsou NEURČENO. Platbu a výběr adresy v Mapy.com uživatel kontroluje ručně.
- Cloud se čte stránkovaně z `configurations`, s ověřeným uživatelem a filtrem user_id. Používá existující přihlášení konfigurátoru na stejné doméně, nebo oddělené přihlášení do jeho účtu v Nastavení. Stávající SELECT RLS ověřeno: auth.uid() = user_id. Neprovádí se žádné změny databáze ani konfigurací. Cloudové výsledky se trvale neukládají do lokálního Archivu konfigurátoru. Lokální a cloudové verze se porovnávají podle updatedAt a respektují tombstones. Bez cloudu/internetu je zdroj jasně označen jako místní.
- PDF se rekonstruuje z archivovaného snapshotu stejným rendererem, šablonou a Courier fonty jako v konfigurátoru 923de3b. Nedochází k otevření kalkulace v konfigurátoru, změně čítače KG ani jeho úložiště. Skript pro reprodukci extrakce: `node scripts/build-archive-pdf.cjs /path/to/konfigurator/index.html`.
- Přiložení používá stávající ověřené IndexedDB ukládání a cloudovou synchronizaci dokumentů Evidence. Vytvoření PDF musí uspět před přepsáním formuláře. Zvolená objednávka jízdu nikdy sama neuloží. Metadata sourceConfiguration a číslo KG jsou uložena až s jízdou; koncept uchovává reference i PDF.
- PDF knihovny jsou lokálně přibalené s pevnými verzemi pdf-lib 1.17.1 a @pdf-lib/fontkit 1.1.1. Service worker ukládá import i PDF závislosti pro další použití bez internetu.

Ověření: mapovací unit testy, původní model/SQL suites, původní čtyři browser suites a nový test importu s reálným PDF v IndexedDB, cenami a číslem KG, nastavením NEURČENO, read-only chováním vůči konfigurátoru, vlastníkem cloudového dotazu a ignorováním cloudových smazání/konceptů. PDF bylo nezávisle přečteno pomocí PyMuPDF: KG/042, Novák, cena 2 200 Kč bez DPH a 2 662 Kč s DPH. Cloudové scénáře mají mockované API; reálné uživatelské přihlášení a soukromé zakázky musí potvrdit uživatel na svém zařízení.
