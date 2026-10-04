# ADR 0020 — Vlastní místo a jeden doprovod

Status: přijato (CD-062, 4. 10. 2026).

Jedna řádka bookings nadále představuje jedno místo. Přidává participant_kind
(self/companion), participant_name a čas explicitního přijetí odpovědnosti.
Dvojice vzniká v jedné transakci s uzamčením profilu i termínu. Unikátní aktivní
kombinace vlastník/termín/druh účastníka zaručí nejvýše dva účastníky.
Původní vlastní řádka zůstává kořenem odpovědi; companionBooking má vlastní ID.
Storno, snapshot ceny, docházka, poplatek a audit zůstávají po místě.

Výhoda: stávající kapacitní výpočty a hromadné změny počítají přímo účastníky;
žádná nekonzistentní quantity ani agregovaný poplatek. Nevýhoda: dvě oznámení
vlastníka a nutnost označit doprovod v klientském/admin seznamu. Nelze bezpečně
rozpoznat tutéž osobu v různých účtech jen podle jména. Staré rezervace se
nemigrují do skupin a nemění se jejich finanční historie.
