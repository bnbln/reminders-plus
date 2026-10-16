# Offene Aufgaben

Stand: 16. Oktober 2026. Grundlage: [Expo-58-Release-Abgleich](expo58-release-audit-2026-10-16.md).

Gespeicherter Paketstand: Expo `58.0.13`, React Native `0.88.0`, Router `58.0.22`, Screens `4.30.0`, Safe Area Context `5.10.1`, UI/Widgets `58.0.20`. Saubere npm-Installation mit regulärer Peer-Auflösung, alle vier Patches, TypeScript und Expo-Paketabgleich sind erfolgreich. Pods und Podfile.lock sind synchronisiert. Expo Doctor meldet allein den bekannten Config-Sync-Hinweis.

## Zuerst: Hinzufügen-Button an der linken Liste ausrichten

- [ ] Sobald rechts das Detail einer Aufgabe geöffnet ist, „Aufgabe hinzufügen“ horizontal in der **linken Listenspalte** zentrieren, etwa unter „Heute“. Der Button ist aktuell am gesamten Fenster ausgerichtet.
- [ ] Die Position aus den tatsächlichen Spaltenmaßen bestimmen; bei iPad-Größenänderungen und Duo-Posewechseln aktualisieren.
- [ ] Ohne geöffnetes Spaltendetail die bisherige Position beibehalten. Beim Tabwechsel keine falsche Spaltenposition übernehmen und keinen zweiten Button anzeigen.
- [ ] Den bisherigen Erstellkontext erhalten: ausgewählter Heute-Tag, Inbox, Routine bzw. Projekt. Zuständig ist derzeit das native `UITabAccessory` im AppDelegate.
- [ ] Auf iPad und Duo prüfen: Detail öffnen → Button links zentriert → Button tippen → korrekter Erstellungsdialog → Detail schließen → bisherige Position wiederhergestellt. Normales iPhone gegenprüfen.

## SDK 58: abschließende native Prüfung

Die finalen Paketversionen sind im Checkout gespeichert. Die vorherige Simulatorprüfung verwendete noch den RC-Paketstand; die finale Kombination bestand separat TypeScript, Paketprüfung, Peer-Auflösung und iOS-JavaScript-Export. Das ersetzt keinen nativen Test der aktualisierten Pods.

- [ ] App **und Widget-Erweiterung** nach dem finalen Paket-/Pod-Update neu bauen. Vorhandene Development Builds mit React Native RC ersetzen.
- [ ] iPhone Duo: außen, innen hoch/quer, Falten/Entfalten und angewinkelte Pose; Safe Areas, native Filter-/Profilmenüs, Day-Slider und Hinzufügen prüfen.
- [ ] iPad: Hoch-/Querformat und schmale Fenster; Liste/Detail, Titelabstände und nativen Zurück-Button prüfen.
- [ ] Normales iPhone: kompakte Aufgabenroute, Suche, Erstellungsdialoge und Bildschirmtastatur prüfen.
- [ ] Datum-/Projekt-/Emoji-/Routinen-Sheets: native Close-/Done-Aktionen antippen; Eingaben über Posewechsel erhalten.
- [ ] Swipe/Drag und Widget-Abhaken nach dem Update prüfen. Der Widget-Speicherpatch bleibt erforderlich.

Device Hub lieferte bei der Prüfung zeitweise `noWindowsAvailable` bzw. Timeouts. Screenshots belegen erfolgreiche Hauptansichten aller drei Geräteklassen und ein geöffnetes iPad-Spaltendetail. Daraus folgt keine vollständige Freigabe aller Interaktionen. Hardwaretastatur-Modus und Bildschirmtastatur bei der Wiederholung ausdrücklich unterscheiden.

## Im Code gefundene Risiken bearbeiten

- [ ] **Tastatur im eingebetteten Detail:** Keyboard-Ausgleich ergänzen oder automatisch angepasste Keyboard-Insets aktivieren. Der Spacer entfällt derzeit bei `embedded`; das Notizfeld unten kann verdeckt werden. Mit eingeblendeter Bildschirmtastatur verifizieren.
- [ ] **Erster Duo-Leistenwechsel:** Den Safe-Area-Wrapper von Anfang an strukturell stabil halten. Der erste Wechsel von „noch nie Leiste“ zu „Leiste vorhanden“ ersetzt aktuell den Kinderbaum; ungespeicherter lokaler Formularzustand kann verloren gehen.
- [ ] **Aufgabenroute / Arbeitskontext:** Den pauschalen Redirect von `/task/[id]` nach `/inbox` auf regular-breiten Geräten prüfen. Suche, Routine, Assist und Widget-Links sollen ihren sinnvollen Kontext und Zurück-Pfad behalten.
- [ ] **Projekt-Modals:** Hintergrund bei „Projekt bearbeiten“ und Projektlimit wie beim Anlegen hinter die Duo-Leiste ausdehnen. Interaktive Inhalte weiter innerhalb der Safe Area halten.
- [ ] **Duo-Split bei 669 pt:** Die aktuelle 680-pt-Grenze zeigt innen hochkant nur eine Spalte. Gewünschtes Verhalten festlegen und bei einer Anpassung die Mindestbreiten beider Spalten beachten. Querformat nicht allein aus den Portrait-Einträgen in Info.plist ableiten: Im Simulator lief das resizable Duo-Innendisplay auch quer.

## Technische Altlasten

- [ ] React-Native-Strict-TypeScript migrieren und erst danach `react-native-legacy-deep-imports` entfernen. Mit finalen Paketen bestehen ohne die Ausnahme noch 69 Typfehler.
- [ ] Bekannte Lint-Befunde bearbeiten: `npm run lint` meldete vor dem finalen Update 107 Fehler / 65 Warnungen; vor allem Hook-/Ref-Regeln. Ein vollständiger `eslint .`-Lauf umfasst mehr Dateien und hatte 119 Fehler / 68 Warnungen.
- [ ] Historische Gerätedokumentation aktualisieren: Swipe-/Drag-Komponenten verwenden bereits `usePageDimensions`; entsprechende ältere offene Punkte sind überholt.
- [ ] Bei nativen Änderungen `app.json`, gepflegtes iOS-Projekt und Config-Plugins abgleichen. **Kein Clean-Prebuild:** Eigener AppDelegate, SceneDelegate und native Bridges sind nicht vollständig aus Plugins reproduzierbar. Der bekannte Expo-Doctor-Hinweis bleibt deshalb bestehen.
