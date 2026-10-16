# Aufgaben-Detail neben der Liste

Stand: 3. Oktober 2026, überarbeiteter Ansatz.

## Aufbau

Der zusätzliche SwiftUI `NavigationSplitView` ist entfernt. Der bestehende Expo Router / UIKit Native Stack bleibt für Titel, Duo-Seitenleiste, Filter, Profil und Navigation zuständig. Auch das vorhandene `UITabAccessory` mit Plus bleibt aktiv. Es gibt keine zweite Toolbar und kein Sidebar-Ein-/Ausblenden-Symbol.

`components/tasks/task-workspace.ios.tsx` ordnet native React-Native-Views nebeneinander an, sobald die native Größenklasse regular ist und mindestens 680 Punkte nutzbare Breite vorhanden sind. Erst mit einer ausgewählten Aufgabe öffnet sich das Detail. Die Liste erhält 40 Prozent der Breite, begrenzt auf 300 bis 420 Punkte; das Detail nutzt den restlichen Platz. Ohne Auswahl verwendet die Liste die gesamte Breite.

Die Detailfläche hat kontinuierliche Rundungen mit 32 Punkten Radius und einen Abstand zum Titel, zu den Systemleisten und zur Nachbarspalte. Der gemeinsame Editor, Store, Form-Sheets, Swipe- und Drag-Aktionen bleiben erhalten. `PagePane` liefert jeder Spalte ihre tatsächlichen Maße.

Ein nativer UIKit-Header-Button mit `chevron.backward` schließt die Auswahl. Auf dem Duo sitzt er in der bestehenden nativen Leiste, gemeinsam mit den bisherigen Aktionen. Er blendet keine Sidebar aus. Auf kompakten Displays öffnen normale Aufgabentipps weiterhin den bisherigen Detail-Stack. Beim Verkleinern eines bereits geöffneten Spaltendetails bleibt derselbe Editor gemountet und verwendet die volle Inhaltsbreite; Zurück zeigt wieder die Liste.

## Prüfungen

- Release-Build inklusive Widget-Erweiterung und TypeScript erfolgreich.
- Duo-Außendisplay: ursprüngliche Filter-/Profil-Aktionen und Bottom Accessory sichtbar.
- Duo-Innendisplay: Aufgaben-Tipp öffnet Liste und gerundetes Detail nebeneinander; nativer Zurück-Button schließt das Detail und stellt die volle Listenbreite wieder her.
- Finale Prüfung des Titelabstands sowie des iPad-Layouts läuft.

Screenshots liegen in `.expo/qa/task-split-view`, Build- und Prüflogs in `/tmp/reminds-sdk58-upgrade`. Die frühere SwiftUI-Prüfung gilt nicht als Beleg für diesen überarbeiteten Aufbau. Bildschirmtastatur, große Schrift und alle Deep-Link-Kombinationen sind noch nicht vollständig geprüft.
