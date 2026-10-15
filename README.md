# Evidence rozvozů – Pila Železnice

## Verze 85: synchronizace a Android

Synchronizace používá existující projekt Supabase `Evidence-app`, samostatné tabulky `pz_sync_*` a neveřejný bucket `evidence-documents`. Oznámení nadále používají tabulky `pz_push_*`. Nativní Android 1.2 načítá tento web, novou APK pro tuto změnu nepotřebuje.

V aplikaci otevřít **Nastavení → Cloudová synchronizace**, přihlásit existující účet Evidence a počkat na **Synchronizováno**. Stejný účet použít na dalších zařízeních. Heslo se nikde nevkládá do zdrojového kódu. Přihlášení pro synchronizaci a Web Push sdílí jednu obnovovanou relaci; nativní oprávnění k oznámením zůstávají místní.

- Přenášejí se plánované, splněné, zrušené a sloučené jízdy včetně veškerých polí, koncepty, koš, pauzy po dnech, výchozí adresa, aktivní rozvoz a nastavení připomínek. Telefonní čísla a zákaznické údaje jsou součástí jízd a konceptů.
- Změny se posílají automaticky po uložení, po návratu do aplikace a po připojení. Realtime doplňuje kontrola každých 15 sekund při otevřené aplikaci. Pozastavení automatiky je místní; tlačítko ruční synchronizace zůstává dostupné.
- Offline změny přežijí restart. Service worker uchovává lokální aplikační soubory; pro úplně první spuštění je nutný internet. Mapové podklady a vyhledávání adres internet nadále potřebují.
- Zavřený Android WebView neprovádí synchronizaci. Změny z jiného zařízení a nové místní připomínky se přenesou při dalším otevření nebo návratu do Evidence. Již naplánované Android připomínky běží samostatně.
- Přílohy se ukládají soukromě pod SHA-256 otiskem, stahují a ověřují se do IndexedDB; limit jedné přílohy je 50 MiB. Kopie příloh v cloudu se automaticky nemažou, aby zůstala použitelná historie. Chyba či plná kvóta ponechá změny ve frontě a zobrazí chybu.
- Server přiděluje revize; porovnání a zápis jsou v jedné transakci. Souběžné odlišné úpravy zobrazí obě verze k ručnímu výběru. Trvalé odstranění zanechá tombstone. Předešlé úspěšné revize zůstávají v `pz_sync_history`.
- Před první synchronizací se v databázi `EvidenceRozvozuSync`, store `state`, klíči `before-first-sync` uchová místní záchytný bod. Dokumentové bloby se nemění. Běžná záloha JSON je nadále dostupná v Nastavení.
- Při otevřeném editačním formuláři, Timeline, koši, konceptech, průběhu rozvozu nebo obnově zálohy se příchozí data neuplatňují. Existující sdílené pole jízd se aktualizuje na místě, aby zůstaly funkční všechny původní uzávěry UI. Více karet stejného prohlížeče řídí Web Locks.
- Zařízení s daty již přiřazenými účtu nepřijme jiný účet. Odhlášení zachová místní data; nezajišťuje uzamčení telefonu.

### Ověření

`npm ci`, případně `npx playwright install chromium`, potom `npm test` a `npm run test:browser`. V omezeném prostředí lze cestu k Chromiu předat v `PZ_CHROMIUM_EXECUTABLE`.

Testy pokrývají SQL/RLS, opakování požadavků, revize a historii, tombstones, dvě nezávislá zařízení, přihlášení, přenos PDF, Android bridge, offline restart, souběžné úpravy a volbu verze, ochranu otevřeného formuláře, koncepty, vypnutou i posunutou pauzu, výchozí adresu, aktivní rozvoz, mazání a responzivní Nastavení. Starší testy oznámení zůstávají zahrnuté. Databázový test v nasazeném projektu proběhl uvnitř transakce s ROLLBACK, bez testovacích záznamů v uživatelských datech.

Klient Supabase 2.117.3 je přibalen lokálně pro offline použití; aktualizace: `npm run build:vendor`. Verze závislostí a lockfile jsou pevné. Přibalené licence jsou ve `vendor/LICENSES.txt`.

## Původní serverová Web Push část

Původní aplikace doplněná o systémová Web Push upozornění pro Android a Windows.

Každá zastávka má samostatnou připomínku. Výchozí obsah je stručný bez zákaznických údajů; podrobnosti lze zapnout v Nastavení. Výchozí časy:

- 24 hodin před časem doručení;
- v den jízdy v 7:00 českého času (pouze pokud jízda není dříve);
- hodinu před časem doručení;
- 5, 10 a 15 minut po čase doručení.

START, dokončení, zrušení a odstranění jízdy další připomínky zastaví. Sloučené jízdy mají připomínku pro každého zákazníka, používají datum a vozidlo společného rozvozu. Bez určeného data/času se nic neplánuje. Připomínky, které již proběhly před uložením, se neposílají zpětně.

## Stav nasazení (11. 10. 2026)

Projekt **Evidence-app** (`ctlweepsrdjrytisyvsk`, eu-central-1) má nasazenou databázi s RLS, nastavení účtu, VAPID ve Vaultu a Edge Function `push-dispatch`. Cron skutečně volá funkci každou minutu a vrací HTTP 200. Veřejná konfigurace ukazuje výhradně na tento projekt.

Ještě je potřeba vytvořit účet řidiče, připojit skutečný telefon a potvrdit doručení při zavřené aplikaci. Serverový běh bez registrovaného zařízení není potvrzením doručení.

## Nastavení v aplikaci

Nastavení → Upozornění na jízdy obsahuje hlavní přepínač, šest samostatných přepínačů a časů, výchozí hodnoty, stručný/podrobný obsah, adresu, cenu a platbu, přehled zařízení a poslední úspěšnou synchronizaci. Předstih „Den předem“ je v hodinách (24 hodin = 1 den), další relativní časy v minutách (60 minut = 1 hodina). Jízdy bez času mají výslovně nastavené chování „neposílat do vyplnění času“.

Časy a obsah jsou globální pro účet. Připojení a odpojení platí pro aktuální zařízení. Nastavení má revizi: změna ze starého zařízení nepřepíše novější nastavení serveru. Offline změny čekají na otevření aplikace s internetem. Změna nastavení přepočítá čekající úlohy, odeslanou historii zachová. Smazané jízdy se na serveru deaktivují, aby historie zůstala zachovaná.

Tlačítko „Zkusit oznámení“ vytváří **serverovou** testovací úlohu pro aktuální zařízení. Po zařazení zavři PWA a zamkni telefon. Očekávej doručení během dalšího minutového běhu. Informace „Push služba přijala oznámení“ nepotvrzuje zobrazení na fyzickém telefonu. Test lze spustit nejvýše jednou za minutu.

Soukromý klíč a Cron secret nejsou v repozitáři. Přístup k servisním funkcím mají pouze servisní role. Účet přihlášený ve více zařízeních nesynchronizuje tímto doplňkem celou místní Evidenci.

## Nasazení do nového projektu

Použít vlastní oddělený Supabase projekt v požadovaném evropském regionu. Před vytvořením ověřit dostupnost bezplatného tarifu.

1. Aplikovat migraci v `supabase/migrations/` do nového projektu.
2. Vytvořit jeden účet pro řidiče v Supabase Auth. Zakázat veřejnou registraci. Telefon a PC používají stejný účet.
3. Vygenerovat VAPID klíče pomocí `web-push.generateVAPIDKeys()` a dlouhý náhodný cron secret. Soukromé hodnoty uchovat pouze v Supabase Vault; nezapisovat je do repozitáře, odpovědí, klienta ani zálohy Evidence.
4. V soukromém SQL editoru spustit `supabase/setup-cron.sql` s vyplněnými hodnotami. Funkce `pz_push_runtime_config` je dostupná pouze roli `service_role`; klient ji nesmí volat.
5. Nasadit `supabase/functions/push-dispatch/index.ts` jako `push-dispatch`. `verify_jwt=false` je záměrné: funkce ověřuje vlastní náhodný cron secret před odesláním. Platforma dodává `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` automaticky.
6. Doplnit `push-config.js`: URL nového projektu, jeho **publishable** klíč a **veřejný** VAPID klíč. Nikdy tam nedávat service_role ani soukromý VAPID klíč.
7. Na každém zařízení otevřít HTTPS Evidenci → Nastavení → Upozornění na jízdy → přihlásit účet Evidence → Připojit oznámení. Povolení oznámení vyžaduje jednorázovou akci uživatele.
8. Ověřit testovací jízdu při zavřeném okně PWA na telefonu i PC. Tlačítko „Zkusit oznámení“ zařadí serverovou úlohu pro aktuální zařízení.

## Chování a meze

Plánovač kontroluje připomínky každou minutu. Doručení může zpozdit internet, úspora baterie, vypnutý prohlížeč, režim Nerušit nebo nastavení systému. Není to přesný nativní offline budík. Připomínky starší než 5 minut se neodesílají; server ani service worker nehromadí stará upozornění po návratu online. Selhání se opakuje nejvýše třikrát; zaniklé odběry se odstraní.

Jízdy zůstávají místně uložené. Do Supabase se přenáší jen minimum údajů pro upozornění, nikoli PDF, kontaktní seznam nebo celá záloha. Připojená zařízení stejného účtu dostávají připomínky všech odeslaných jízd, ale tento doplněk sám nesynchronizuje celý obsah Evidence. Detail lze otevřít jen na zařízení, které danou jízdu obsahuje. Změny bez internetu se odešlou při návratu do otevřené Evidence s připojením. Změna provedená offline nemůže okamžitě zrušit starý plán na serveru.

## Ověření

`npm ci && npm test` kontroluje data samostatných/sloučených jízd a skutečnou SQL migraci v PostgreSQL (PGlite): český čas, DST, ranní jízdy, více zařízení, změny, zrušení, oprávnění a ochranu proti souběžnému odeslání. `npx playwright install chromium && npm run test:browser` ověřuje nastavení a původní formulář nové jízdy.

## Bezpečnostní kontrola

Advisor upozorňuje na tři záměrná autentizovaná RPC se SECURITY DEFINER: synchronizaci jízd, revizované nastavení a test oznámení. Všechna vyžadují auth.uid(), operují pouze nad jeho záznamy, zamykají účet a mají pevný prázdný search_path. Anonymní přístup je odvolán; servisní claim a Vault konfigurace nejsou dostupné autentizovaným klientům.

## Reálný test telefonu (dosud nepotvrzen)

1. Vytvořit účet řidiče v Auth projektu Evidence-app; veřejné registrace nepovolovat.
2. Na telefonu otevřít HTTPS aplikaci → Nastavení → Upozornění na jízdy, přihlásit účet a připojit oznámení.
3. Stisknout Zkusit oznámení, zavřít PWA a zamknout telefon; potvrdit skutečné zobrazení.
4. Na testovací jízdě dočasně nastavit krátké předstihy a následná upozornění. Ověřit šest typů, START a zrušení. Poté obnovit výchozí hodnoty.

Web Push není přesný budík. Krátký závod mezi poslední serverovou kontrolou a předáním push službě nelze atomicky vyloučit. Při nejednoznačné síťové chybě může proběhnout opakované předání; stabilní tag sdružuje stejné oznámení na zařízení.


## Android aplikace z Android Studia

WebView nemá webová rozhraní PushManager a Notification. Nový klient podporuje důvěryhodný most PZAndroidNative v upravené APK: jízdy a nastavení předává místnímu Android plánovači. Android varianta nevyžaduje webové přihlášení a neposílá falešnou Web Push registraci. Jde o místní připomínky na jednom telefonu, nikoli cloudový push nebo synchronizaci jízd; po zavření fungují bez internetu. Vyžaduje aktualizovanou APK, povolení oznámení a Budíků a připomenutí. Test je naplánovaný za 10 sekund. Android může alarmy v hlubokém spánku zpozdit.

Test mostu: `PZ_CHROMIUM_EXECUTABLE=/cesta/chromium node tests/push-native-browser.cjs`. Skutečné doručení do Android aplikace musí potvrdit uživatel na telefonu.
