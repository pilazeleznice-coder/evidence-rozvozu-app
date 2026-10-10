# Evidence rozvozů – Pila Železnice

Původní aplikace doplněná o systémová Web Push upozornění pro Android a Windows.

Každý zákazník dostává samostatnou připomínku s **jménem, typem dopravy, adresou a částkou bez DPH**:

- 24 hodin před časem doručení;
- v den jízdy v 7:00 českého času (pouze pokud jízda není dříve);
- hodinu před časem doručení;
- 5, 10 a 15 minut po čase doručení.

START, dokončení, zrušení a odstranění jízdy další připomínky zastaví. Sloučené jízdy mají připomínku pro každého zákazníka, používají datum a vozidlo společného rozvozu. Bez určeného data/času se nic neplánuje. Připomínky, které již proběhly před uložením, se neposílají zpětně.

## Stav aktivace

Kód je připraven. Dokud nejsou nasazeny databáze, odesílací funkce, plánovač a veřejná konfigurace, aplikace ukazuje **„Zatím neaktivní“**. Samotné nahrání na GitHub oznámení nespustí.

## Nasazení do nového projektu

Použít vlastní oddělený Supabase projekt v požadovaném evropském regionu. Před vytvořením ověřit dostupnost bezplatného tarifu.

1. Aplikovat migraci v `supabase/migrations/` do nového projektu.
2. Vytvořit jeden účet pro řidiče v Supabase Auth. Zakázat veřejnou registraci. Telefon a PC používají stejný účet.
3. Vygenerovat VAPID klíče pomocí `web-push.generateVAPIDKeys()` a dlouhý náhodný cron secret. Soukromé hodnoty uchovat pouze v Supabase Vault; nezapisovat je do repozitáře, odpovědí, klienta ani zálohy Evidence.
4. V soukromém SQL editoru spustit `supabase/setup-cron.sql` s vyplněnými hodnotami. Funkce `pz_push_runtime_config` je dostupná pouze roli `service_role`; klient ji nesmí volat.
5. Nasadit `supabase/functions/push-dispatch/index.ts` jako `push-dispatch`. `verify_jwt=false` je záměrné: funkce ověřuje vlastní náhodný cron secret před odesláním. Platforma dodává `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` automaticky.
6. Doplnit `push-config.js`: URL nového projektu, jeho **publishable** klíč a **veřejný** VAPID klíč. Nikdy tam nedávat service_role ani soukromý VAPID klíč.
7. Na každém zařízení otevřít HTTPS Evidenci → Nastavení → Upozornění na jízdy → přihlásit účet Evidence → Připojit oznámení. Povolení oznámení vyžaduje jednorázovou akci uživatele.
8. Ověřit testovací jízdu při zavřeném okně PWA na telefonu i PC. Tlačítko „Zkusit oznámení“ ověřuje pouze místní zobrazení, nikoli průchod serverem.

## Chování a meze

Plánovač kontroluje připomínky každou minutu. Doručení může zpozdit internet, úspora baterie, vypnutý prohlížeč, režim Nerušit nebo nastavení systému. Není to přesný nativní offline budík. Připomínky starší než 5 minut se neodesílají; server ani service worker nehromadí stará upozornění po návratu online. Selhání se opakuje nejvýše třikrát; zaniklé odběry se odstraní.

Jízdy zůstávají místně uložené. Do Supabase se přenáší jen minimum údajů pro upozornění, nikoli PDF, kontaktní seznam nebo celá záloha. Připojená zařízení stejného účtu dostávají připomínky všech odeslaných jízd, ale tento doplněk sám nesynchronizuje celý obsah Evidence. Detail lze otevřít jen na zařízení, které danou jízdu obsahuje. Změny bez internetu se odešlou při návratu do otevřené Evidence s připojením. Změna provedená offline nemůže okamžitě zrušit starý plán na serveru.

## Ověření

`npm ci && npm test` kontroluje data samostatných/sloučených jízd a skutečnou SQL migraci v PostgreSQL (PGlite): český čas, DST, ranní jízdy, více zařízení, změny, zrušení, oprávnění a ochranu proti souběžnému odeslání. `npx playwright install chromium && npm run test:browser` ověřuje nastavení a původní formulář nové jízdy.
