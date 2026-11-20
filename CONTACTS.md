# Načtení kontaktů

Přímý výběr zůstává přes Contact Picker API. Na Androidu 17 s Chrome 157 byl na skutečném telefonu potvrzen prázdný návrat (K2-EMPTY), zatímco Chrome Beta na stejném telefonu předání dokončil. Náhradní načtení ze souboru neopravuje nativní chybu Chromu.

U telefonu je tlačítko **Načíst kontakt ze souboru (.vcf)**. Uživatel vyexportuje kontakt nebo kontakty v aplikaci Kontakty do úložiště telefonu a soubor vybere v Evidenci. Více zákazníků nabídne vyhledávání; více telefonů vyžádá výběr čísla. Jméno a telefon se předvyplní až po výběru a případném potvrzení přepsání. Adresa se nemění a jízda se sama neuloží.

Soubor se zpracuje pouze v zařízení, nikam se neposílá a neukládá se jako příloha ani adresář. Jen vybraný zákazník se po ručním uložení stane součástí běžné jízdy. Parser je statický modul `contact-vcard.js` a součást offline shellu.

Základní FN/N a TEL: vCard 2.1/3.0/4.0, UTF-8, UTF-16 s BOM, quoted-printable/base64 jména, deklarované starší kódování kódovaných jmen, složené řádky a tel URI. Ostatní údaje se ignorují. Limit 10 MB a 5 000 vizitek. Neplatné a telefonními čísly nevybavené soubory se odmítají. Zrušení formulář nemění.

Volba zobrazení: Nastavení → Kontakty a zákazníci → Náhradní načtení kontaktu ze souboru (.vcf).

Ověření: 27 testů parseru a skutečného JS modulu s DOM fixture (`node --test tests/contact-picker.test.cjs tests/contact-vcard.test.cjs`). Pokrývají češtinu, vyhledání, prázdný nativní výsledek, předvyplnění, zrušení, více čísel a chyby souboru. Chromium zde nelze spustit kvůli omezení systémových socketů; rozšířený `tests/contact-picker-browser.cjs` zde nebyl spuštěn. Skutečný Android file picker je nutné ověřit na telefonu.
