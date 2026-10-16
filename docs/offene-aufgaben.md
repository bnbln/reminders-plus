# Offene Aufgaben

Stand: 16. Oktober 2026. Grundlage: [Expo-58-Release-Abgleich](expo58-release-audit-2026-10-16.md).

Gespeicherter Paketstand: Expo `58.0.13`, React Native `0.88.0`, Router `58.0.22`, Screens `4.30.0`, Safe Area Context `5.10.1`, UI/Widgets `58.0.20`. Saubere npm-Installation mit regulärer Peer-Auflösung, alle vier Patches, TypeScript und Expo-Paketabgleich sind erfolgreich. Pods und Podfile.lock sind synchronisiert. Expo Doctor meldet allein den bekannten Config-Sync-Hinweis.

## Release-Priorität: Heute-Day-Slider

- [ ] **Ruckeln beim horizontalen Ziehen beheben.** Nutzerbeobachtung: Das Verschieben zwischen Tagen nach links und rechts wirkt leicht fehlerhaft und ruckelig. Langsames Ziehen, schnelles Wischen und Richtungswechsel getrennt prüfen.
- [ ] **Sichtbare Animation bei Tag-Tap ergänzen.** Ein Tipp auf einen anderen Tag soll die Aktivierung nachvollziehbar animieren, statt direkt zur neuen Auswahl zu springen. Slider, aktive Markierung und zugehöriger Tagesinhalt sollen eine zusammenhängende Rückmeldung geben; schnelle aufeinanderfolgende Tipps berücksichtigen. „Bewegung reduzieren“ respektieren.
- [ ] **Mehr Tage trotz seitlichem Fade sichtbar machen.** Den vorhandenen Fade links und rechts beibehalten, den Verlauf aber so weiter zu den Seiten ausstrecken bzw. abstimmen, dass mehr benachbarte Tage deutlich lesbar bleiben. Der weiche Ausblendeffekt soll erhalten bleiben. Die Alphamaske und `edgeFadeLocations` in `app/(tabs)/home/index.tsx` auf schmalen und breiten Ansichten visuell abstimmen.
- [ ] Scroll-, Auswahl- und Synchronisationspfade in `app/(tabs)/home/index.tsx` zusammen prüfen: `handleSelectDate`, `selectDateWithTransition`, `handleDateRailScroll`, Momentum-/Drag-Ende und `syncDateRailToSelectedDate`. Letzterer setzt Offset und Animated.Value unmittelbar und verwendet `animated: false`; prüfen, ob dieser Synchronisationspfad eine gewünschte Tap-Animation überschreibt oder beim Ziehen eingreift. Ursache noch nicht bestätigt.
- [ ] Abnahme auf dem Gerät: beide Richtungen flüssig, keine nachträglichen Sprünge, Tippen mit verständlicher Aktivierungsanimation und anschließend genau der gewählte Tag aktiv. Auch im schmalen Fenster und nach Größenwechsel prüfen.

## Release-Priorität: Listenregressionen gegenüber master

**Nutzerbeobachtungen, noch keine neue Messung:** Swipe-Actions in beide Richtungen haben keinen sichtbaren Farbhintergrund mehr, die Icons wirken falsch dargestellt, und das frühere weiche Ein-/Ausblenden der Hintergrundfarbe fehlt. Der bisherige Fix sollte das Flackern nach dem Loslassen beim Drag & Drop beseitigen; es tritt weiterhin ungefähr bei **3 von 10 Vorgängen** auf. Zusätzlich springt die ganze Liste beim Aktivieren eines Drags häufig zusammen mit der Header-Bar nach oben.

- [ ] **Swipe-Darstellung wiederherstellen:** links und rechts korrekte Icons, sichtbare Aktionsfarben und weiches Ein-/Ausblenden bei Öffnen, Abbrechen und Schließen. Gegen `master` vergleichen, nicht nur einen neu gestalteten Ersatz visuell abnehmen.
- [ ] **Drop-Flackern beheben:** Originalproblem isoliert reproduzieren und den bisherigen Fix überprüfen. Die Behebung darf Swipe-Hintergründe, Icons oder Listengeometrie nicht beeinträchtigen.
- [ ] **Sprung bei Drag-Beginn beheben:** Scrollposition, Zeilenpositionen und Header-Zustand beim Übergang zum aktiven Drag stabil halten. Mit ausgeklapptem und eingeklapptem großen Titel sowie bereits gescrollter Liste prüfen. Eine beabsichtigte Änderung der Drag-Vorschau darf nicht die gesamte Liste verschieben.
- [ ] Änderungen gegenüber `master` gezielt in `components/tasks/swipe-task-row.tsx`, `components/tasks/task-swipe-draggable-list.tsx` und beiden zugehörigen `patch-package`-Patches nachvollziehen. Keine pauschale Übernahme alter Dateien: SDK-58-Kompatibilität und unabhängige Funktionen erhalten.
- [ ] Prüfansätze aus dem Codevergleich: `SwipeActionUnderlay` wechselte von `interpolateColor` zu einem soliden Hintergrund mit animierter Opacity; iOS verwendet nun `SymbolView` statt MaterialIcons. Der Swipe-Patch ergänzt `underlayHeight` und natives `zIndex`. Höhe, Clipping, Ebenenreihenfolge und Icon-Tint gemeinsam prüfen. Dies sind Änderungen, keine nachgewiesene Fehlerursache.
- [ ] Drop-Prüfansätze: `pendingDropData` verschiebt den Reorder in einen Effect; der Draggable-FlatList-Patch setzt den gehaltenen Zell-Offset im Layout-Effect zurück. Timing zwischen Bibliothekszustand, Daten-Reorder, Layout-/Landing-Animationen und Drag-State prüfen. Für den Header-Sprung zusätzlich `handleDragStateChange`, Scroll-Offsets und die native `setContentScrollView`-Anbindung untersuchen.
- [ ] Abnahme mit mindestens 30 wiederholten Drops je relevantem Listenaufbau dokumentieren; Flackern und Sprünge zählen, einschließlich unveränderter Ablageposition, geänderter Reihenfolge und externer Drop-Ziele. Heute, Inbox und Projektlisten sowie Swipe links/rechts gegenprüfen. Einen erfolgreichen Einzelversuch nicht als Behebung werten.

**Vergleichsstand vom 16. Oktober:** lokaler `master` = `6199d56`, geprüfter SDK-58-Stand = `befbf59`. Die drei betroffenen App-Dateien unterscheiden sich zusammen um 836 Einfügungen und 319 Löschungen; zusätzlich unterscheiden sich die Bibliothekspatches. Der Vergleich wurde lokal durchgeführt. Die gemeldeten Symptome wurden dabei nicht erneut im Simulator gemessen.

## Aufgabenerstellung: Overlay und Tastatur gemeinsam animieren

**Nutzerbeobachtung:** Nach „Aufgabe hinzufügen“ erscheint zuerst die Tastatur; das neue Aufgaben-Textfeld mit den übrigen Bedienelementen klappt erst anschließend dahinter auf. Die zwei versetzten Bewegungen wirken wie getrennte Animationen.

- [ ] Overlay und Tastatur beim Öffnen synchron bewegen, sodass die gesamte Eingabefläche unmittelbar mitkommt und an der Tastaturkante bleibt.
- [ ] Prüfen, ob sich Position und Fortschritt des Overlays direkt an die tatsächliche Tastaturposition bzw. deren Animationsverlauf koppeln lassen. Timing, Easing und Layout-Anpassung in `app/task/create-modal.tsx` gemeinsam betrachten; keine bloß geschätzte Verzögerung als Synchronisation verwenden.
- [ ] Den kompletten Ablauf prüfen: erster und erneuter Aufruf, Schließen, interaktives Tastatur-Ausblenden, Hardwaretastatur sowie iPhone, Duo und iPad. Kein zweites nachlaufendes Aufklappen und kein zusätzlicher Positionssprung durch konkurrierende Layout-Animationen.

## Streak Celebration: flachere Flamme und natürlichere Bewegung

- [ ] Die bestehende animierte Flamme beibehalten, ihre Darstellung aber deutlich flacher gestalten. Schatten und räumliche Schattierung drastisch reduzieren; die zwei Flächen dürfen weiterhin Orange und Gelb verwenden.
- [ ] Den **Light Sweep entfernen**.
- [ ] Oberhalb der Flamme einen horizontal zentrierten, mittig ausgerichteten Motivationstext vorsehen. Mit unterschiedlichen Textlängen und Übersetzungen prüfen.
- [ ] Die Anfangsanimation natürlicher gestalten: Die Flamme soll sich organisch wie eine Flamme aufbauen bzw. bewegen. Das aktuelle nacheinander erfolgende Größerwerden der beiden Flächen ersetzen.
- [ ] `components/streak-celebration/streak-flame.tsx`, `streak-celebration-overlay.tsx` und die verwendeten Flammen-Assets gemeinsam prüfen. Abnahme: klare flache Orange-/Gelb-Flächen, deutlich weniger Schatten, kein Light Sweep, lesbarer mittiger Text und ein zusammenhängender natürlicher Auftakt. „Bewegung reduzieren“ berücksichtigen.

## Status ohne Aufgaben: Textbreite und Umbruch begrenzen

- [ ] Die lange Leerzustandsmeldung bei fehlendem Status bzw. fehlenden Aufgaben in der Breite begrenzen und rechtzeitig umbrechen lassen.
- [ ] Verhindern, dass der Text die Prozentanzeige nach links verdrängt. Sowohl **0 % als auch 100 %** müssen stabil positioniert und vollständig sichtbar bleiben.
- [ ] Die betroffene Statusanzeige/-kachel in `app/status.tsx` und auf der Heute-Seite prüfen; lange Übersetzungen, schmale Fenster und große Schrift einbeziehen. Umbruch und Prozentwert dürfen sich nicht überlagern.

## Entschieden: Duo-/iPad-Split-Details für diesen Release zurückgestellt

Stand 16. Oktober 2026. Der Split-Stand liegt auf dem Branch `park/task-split-view` (`c26efd4`). Aufgaben öffnen auf Duo und iPad wieder als normale Vollbild-Seite über `/task/[id]`, wie auf dem iPhone. Begründung und Plan für einen späteren Neuaufbau auf `ArrangementView` (iOS 27.1): siehe [task-split-view-entscheidung.md](task-split-view-entscheidung.md).

- [x] Split-Stand auf Sicherungsbranch gesichert.
- [x] `TaskWorkspace` auf iOS auf die Filter-/Profil-Items in der Duo-Leiste reduziert; eingebettetes Detail, `TaskWorkspaceContext`-Auswahl und Auswahlrahmen in der Liste entfernt.
- [x] Regular-width-Redirect in `/task/[id]` entfernt.
- [ ] Normale Navigation und Zurück-Pfade aus Heute, Inbox, Projekten, Suche, Routinen, Assist und Widgets auf Duo (außen, innen hoch/quer, angewinkelt) und iPad prüfen. Position des Hinzufügen-Buttons und Tastaturverhalten in der Vollbild-Detailseite abnehmen.

Damit entfallen für diesen Release: Hinzufügen-Button in der linken Spalte zentrieren, Tastatur im eingebetteten Detail, 680-pt-Grenze, Arbeitskontext-Redirect. Sie bleiben für den geparkten Split-Stand relevant.

## SDK 58: abschließende native Prüfung

Die finalen Paketversionen sind im Checkout gespeichert. Die vorherige Simulatorprüfung verwendete noch den RC-Paketstand; die finale Kombination bestand separat TypeScript, Paketprüfung, Peer-Auflösung und iOS-JavaScript-Export. Das ersetzt keinen nativen Test der aktualisierten Pods.

- [ ] App **und Widget-Erweiterung** nach dem finalen Paket-/Pod-Update neu bauen. Vorhandene Development Builds mit React Native RC ersetzen.
- [ ] iPhone Duo: außen, innen hoch/quer, Falten/Entfalten und angewinkelte Pose; Safe Areas, native Filter-/Profilmenüs, Day-Slider und Hinzufügen prüfen.
- [ ] iPad: Hoch-/Querformat und schmale Fenster; Vollbild-Detail, Titelabstände und nativen Zurück-Button prüfen.
- [ ] Normales iPhone: kompakte Aufgabenroute, Suche, Erstellungsdialoge und Bildschirmtastatur prüfen.
- [ ] Datum-/Projekt-/Emoji-/Routinen-Sheets: native Close-/Done-Aktionen antippen; Eingaben über Posewechsel erhalten.
- [ ] Swipe/Drag und Widget-Abhaken nach dem Update prüfen. Der Widget-Speicherpatch bleibt erforderlich.

Device Hub lieferte bei der Prüfung zeitweise `noWindowsAvailable` bzw. Timeouts. Screenshots belegen erfolgreiche Hauptansichten aller drei Geräteklassen und ein geöffnetes iPad-Spaltendetail. Daraus folgt keine vollständige Freigabe aller Interaktionen. Hardwaretastatur-Modus und Bildschirmtastatur bei der Wiederholung ausdrücklich unterscheiden.

## Im Code gefundene Risiken bearbeiten

- [x] ~~**Tastatur im eingebetteten Detail:** Keyboard-Ausgleich ergänzen oder automatisch angepasste Keyboard-Insets aktivieren. Der Spacer entfällt derzeit bei `embedded`; das Notizfeld unten kann verdeckt werden. Mit eingeblendeter Bildschirmtastatur verifizieren.~~ Entfällt mit dem zurückgestellten Split.
- [ ] **Erster Duo-Leistenwechsel:** Den Safe-Area-Wrapper von Anfang an strukturell stabil halten. Der erste Wechsel von „noch nie Leiste“ zu „Leiste vorhanden“ ersetzt aktuell den Kinderbaum; ungespeicherter lokaler Formularzustand kann verloren gehen.
- [x] ~~**Aufgabenroute / Arbeitskontext:** Den pauschalen Redirect von `/task/[id]` nach `/inbox` auf regular-breiten Geräten prüfen. Suche, Routine, Assist und Widget-Links sollen ihren sinnvollen Kontext und Zurück-Pfad behalten.~~ Entfällt mit dem zurückgestellten Split.
- [ ] **Projekt-Modals:** Hintergrund bei „Projekt bearbeiten“ und Projektlimit wie beim Anlegen hinter die Duo-Leiste ausdehnen. Interaktive Inhalte weiter innerhalb der Safe Area halten.
- [x] ~~**Duo-Split bei 669 pt:** Die aktuelle 680-pt-Grenze zeigt innen hochkant nur eine Spalte. Gewünschtes Verhalten festlegen und bei einer Anpassung die Mindestbreiten beider Spalten beachten. Querformat nicht allein aus den Portrait-Einträgen in Info.plist ableiten: Im Simulator lief das resizable Duo-Innendisplay auch quer.~~ Entfällt mit dem zurückgestellten Split.

## Technische Altlasten

- [ ] React-Native-Strict-TypeScript migrieren und erst danach `react-native-legacy-deep-imports` entfernen. Mit finalen Paketen bestehen ohne die Ausnahme noch 69 Typfehler.
- [ ] Bekannte Lint-Befunde bearbeiten: `npm run lint` meldete vor dem finalen Update 107 Fehler / 65 Warnungen; vor allem Hook-/Ref-Regeln. Ein vollständiger `eslint .`-Lauf umfasst mehr Dateien und hatte 119 Fehler / 68 Warnungen.
- [ ] Historische Gerätedokumentation aktualisieren: Swipe-/Drag-Komponenten verwenden bereits `usePageDimensions`; entsprechende ältere offene Punkte sind überholt.
- [ ] Bei nativen Änderungen `app.json`, gepflegtes iOS-Projekt und Config-Plugins abgleichen. **Kein Clean-Prebuild:** Eigener AppDelegate, SceneDelegate und native Bridges sind nicht vollständig aus Plugins reproduzierbar. Der bekannte Expo-Doctor-Hinweis bleibt deshalb bestehen.
