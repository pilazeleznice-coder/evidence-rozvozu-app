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
