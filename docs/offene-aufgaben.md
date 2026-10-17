# Offene Aufgaben

Stand: 16. Oktober 2026, abends (nach PR #12). Grundlage: [Expo-58-Release-Abgleich](expo58-release-audit-2026-10-16.md).

**Abgleich mit den gemergten Threads:** Alle Fixes aus den PRs #2 (Day-Slider), #3 (Split geparkt), #5 (Widget), #7 (Projekt-Modals), #8 (Tastatur/Duo-Wrapper), #9 (Streak/Status), #10/#11 (Swipe) und der Fix für den Sprung bei Drag-Beginn sind auf `master`. Bene hat am 16. Oktober gemeldet, dass die meisten davon auf `master` getestet sind und gut funktionieren. Die Umsetzungspunkte sind deshalb abgehakt. Offen bleiben nur ausdrückliche Wiederholungs- und Gerätematrix-Prüfungen sowie das Drop-Flackern, für das es noch keinen Fix gibt.

Gespeicherter Paketstand: Expo `58.0.13`, React Native `0.88.0`, Router `58.0.22`, Screens `4.30.0`, Safe Area Context `5.10.1`, UI/Widgets `58.0.20`. Saubere npm-Installation mit regulärer Peer-Auflösung, alle vier Patches, TypeScript und Expo-Paketabgleich sind erfolgreich. Pods und Podfile.lock sind synchronisiert. Expo Doctor meldet allein den bekannten Config-Sync-Hinweis.

## Release-Priorität: Heute-Day-Slider

- [x] **Ruckeln beim horizontalen Ziehen beheben.** Nutzerbeobachtung: Das Verschieben zwischen Tagen nach links und rechts wirkt leicht fehlerhaft und ruckelig. Langsames Ziehen, schnelles Wischen und Richtungswechsel getrennt prüfen.
- [x] **Sichtbare Animation bei Tag-Tap ergänzen.** Ein Tipp auf einen anderen Tag soll die Aktivierung nachvollziehbar animieren, statt direkt zur neuen Auswahl zu springen. Slider, aktive Markierung und zugehöriger Tagesinhalt sollen eine zusammenhängende Rückmeldung geben; schnelle aufeinanderfolgende Tipps berücksichtigen. „Bewegung reduzieren“ respektieren.
- [x] **Mehr Tage trotz seitlichem Fade sichtbar machen.** Den vorhandenen Fade links und rechts beibehalten, den Verlauf aber so weiter zu den Seiten ausstrecken bzw. abstimmen, dass mehr benachbarte Tage deutlich lesbar bleiben. Der weiche Ausblendeffekt soll erhalten bleiben. Die Alphamaske und `edgeFadeLocations` in `app/(tabs)/home/index.tsx` auf schmalen und breiten Ansichten visuell abstimmen.
- [x] Scroll-, Auswahl- und Synchronisationspfade in `app/(tabs)/home/index.tsx` zusammen prüfen: `handleSelectDate`, `selectDateWithTransition`, `handleDateRailScroll`, Momentum-/Drag-Ende und `syncDateRailToSelectedDate`. Letzterer setzt Offset und Animated.Value unmittelbar und verwendet `animated: false`; prüfen, ob dieser Synchronisationspfad eine gewünschte Tap-Animation überschreibt oder beim Ziehen eingreift. **Ursache im Code bestätigt:** `dateRailDays` hing über das ungenutzte Feld `isSelected` von der Auswahl ab. Jeder Tageswechsel erzeugte dadurch neue Callbacks, der Layout-Effekt lief erneut und `syncDateRailToSelectedDate` setzte den Offset während des Ziehens bzw. der Tap-Animation hart zurück. Behoben durch stabile `dateRailDays`, Sync-Sperre während Drag/Momentum, animierten Tap-Scroll (außer bei „Bewegung reduzieren“) und schmaleren, weicheren Fade (PR #2).
- [x] Abnahme auf dem Gerät: beide Richtungen flüssig, keine nachträglichen Sprünge, Tippen mit verständlicher Aktivierungsanimation und anschließend genau der gewählte Tag aktiv. Auch im schmalen Fenster und nach Größenwechsel prüfen. *Auf `master` getestet; schmales Fenster/Größenwechsel auf iPad noch einmal gezielt ansehen.*

## Release-Priorität: Listenregressionen gegenüber master

**Ursprüngliche Nutzerbeobachtungen (vor den Fixes #10/#11 und dem Drag-Start-Fix):** Swipe-Actions in beide Richtungen haben keinen sichtbaren Farbhintergrund mehr, die Icons wirken falsch dargestellt, und das frühere weiche Ein-/Ausblenden der Hintergrundfarbe fehlt. Der bisherige Fix sollte das Flackern nach dem Loslassen beim Drag & Drop beseitigen; es tritt weiterhin ungefähr bei **3 von 10 Vorgängen** auf. Zusätzlich springt die ganze Liste beim Aktivieren eines Drags häufig zusammen mit der Header-Bar nach oben.

- [x] **Swipe-Darstellung wiederherstellen:** links und rechts korrekte Icons, sichtbare Aktionsfarben und weiches Ein-/Ausblenden bei Öffnen, Abbrechen und Schließen. Gegen `master` vergleichen, nicht nur einen neu gestalteten Ersatz visuell abnehmen. **Gemergt (#10, #11):** Swipe-Unterlage, Farbverlauf und Icons wieder wie auf `master`; eigentliche Ursache war das in RN 0.88 entfernte `StyleSheet.absoluteFillObject` in `react-native-swipeable-item` (Patch auf `absoluteFill`).
- [ ] **Drop-Flackern beheben:** Originalproblem isoliert reproduzieren und den bisherigen Fix überprüfen. Die Behebung darf Swipe-Hintergründe, Icons oder Listengeometrie nicht beeinträchtigen.
- [x] **Sprung bei Drag-Beginn beheben:** Scrollposition, Zeilenpositionen und Header-Zustand beim Übergang zum aktiven Drag stabil halten. Mit ausgeklapptem und eingeklapptem großen Titel sowie bereits gescrollter Liste prüfen. Eine beabsichtigte Änderung der Drag-Vorschau darf nicht die gesamte Liste verschieben. **Gemergt:** Ursache war das native Re-Binding der Tab-/Nav-Scrollview, das Scrollviews mit `scrollEnabled=false` übersprang; die gebundene Scrollview bleibt jetzt während des Drags gebunden.
- [x] Änderungen gegenüber `master` gezielt in `components/tasks/swipe-task-row.tsx`, `components/tasks/task-swipe-draggable-list.tsx` und beiden zugehörigen `patch-package`-Patches nachvollziehen. Keine pauschale Übernahme alter Dateien: SDK-58-Kompatibilität und unabhängige Funktionen erhalten.
- [x] Prüfansätze aus dem Codevergleich: `SwipeActionUnderlay` wechselte von `interpolateColor` zu einem soliden Hintergrund mit animierter Opacity; iOS verwendet nun `SymbolView` statt MaterialIcons. Der Swipe-Patch ergänzt `underlayHeight` und natives `zIndex`. Höhe, Clipping, Ebenenreihenfolge und Icon-Tint gemeinsam prüfen. Dies sind Änderungen, keine nachgewiesene Fehlerursache. *Erledigt mit #10/#11: `underlayHeight` und natives `zIndex` sind wieder entfernt.*
- [ ] Drop-Prüfansätze: `pendingDropData` verschiebt den Reorder in einen Effect; der Draggable-FlatList-Patch setzt den gehaltenen Zell-Offset im Layout-Effect zurück. Timing zwischen Bibliothekszustand, Daten-Reorder, Layout-/Landing-Animationen und Drag-State prüfen. Der Header-Sprung ist behoben; für das Flackern weiter `handleDragStateChange`, Scroll-Offsets und die native `setContentScrollView`-Anbindung untersuchen.
- [ ] Abnahme mit mindestens 30 wiederholten Drops je relevantem Listenaufbau dokumentieren; Flackern und Sprünge zählen, einschließlich unveränderter Ablageposition, geänderter Reihenfolge und externer Drop-Ziele. Heute, Inbox und Projektlisten sowie Swipe links/rechts gegenprüfen. Einen erfolgreichen Einzelversuch nicht als Behebung werten.

**Vergleichsstand vom 16. Oktober:** lokaler `master` = `6199d56`, geprüfter SDK-58-Stand = `befbf59`. Die drei betroffenen App-Dateien unterscheiden sich zusammen um 836 Einfügungen und 319 Löschungen; zusätzlich unterscheiden sich die Bibliothekspatches. Der Vergleich wurde lokal durchgeführt. Die gemeldeten Symptome wurden dabei nicht erneut im Simulator gemessen.

## Aufgabenerstellung: Overlay und Tastatur gemeinsam animieren

**Nutzerbeobachtung:** Nach „Aufgabe hinzufügen“ erscheint zuerst die Tastatur; das neue Aufgaben-Textfeld mit den übrigen Bedienelementen klappt erst anschließend dahinter auf. Die zwei versetzten Bewegungen wirken wie getrennte Animationen.

- [x] Overlay und Tastatur beim Öffnen synchron bewegen, sodass die gesamte Eingabefläche unmittelbar mitkommt und an der Tastaturkante bleibt.
- [x] Prüfen, ob sich Position und Fortschritt des Overlays direkt an die tatsächliche Tastaturposition bzw. deren Animationsverlauf koppeln lassen. Timing, Easing und Layout-Anpassung in `app/task/create-modal.tsx` gemeinsam betrachten; keine bloß geschätzte Verzögerung als Synchronisation verwenden.
- [x] **Gemergt (#8):** `KeyboardAvoidingView` durch eine iOS-Ansicht ersetzt, die per `useAnimatedKeyboard` bildgenau mit der Tastaturhöhe verschoben wird (UI-Thread, kein nachträgliches Layout). Ursache: Der KAV berechnete die Höhe asynchron und erst nach `onLayout`; beim Fokus direkt nach dem Öffnen lief die Padding-Animation deshalb nachträglich. Android unverändert.
- [ ] Restprüfung: erster und erneuter Aufruf, Schließen, interaktives Tastatur-Ausblenden, Hardwaretastatur sowie iPhone, Duo und iPad. Kein zweites nachlaufendes Aufklappen und kein zusätzlicher Positionssprung durch konkurrierende Layout-Animationen.

## Streak Celebration: flachere Flamme und natürlichere Bewegung

- [x] Die bestehende animierte Flamme beibehalten, ihre Darstellung aber deutlich flacher gestalten. Schatten und räumliche Schattierung drastisch reduzieren; die zwei Flächen dürfen weiterhin Orange und Gelb verwenden.
- [x] Den **Light Sweep entfernen**.
- [x] Oberhalb der Flamme einen horizontal zentrierten, mittig ausgerichteten Motivationstext vorsehen. Mit unterschiedlichen Textlängen und Übersetzungen prüfen.
- [x] Die Anfangsanimation natürlicher gestalten: Die Flamme soll sich organisch wie eine Flamme aufbauen bzw. bewegen. Das aktuelle nacheinander erfolgende Größerwerden der beiden Flächen ersetzen.
- [x] `components/streak-celebration/streak-flame.tsx`, `streak-celebration-overlay.tsx` und die verwendeten Flammen-Assets gemeinsam prüfen. Abnahme: klare flache Orange-/Gelb-Flächen, deutlich weniger Schatten, kein Light Sweep, lesbarer mittiger Text und ein zusammenhängender natürlicher Auftakt. „Bewegung reduzieren“ berücksichtigen.
- **Gemergt (#9):** Flamme als flache Vektorflächen aus den bestehenden Konturen (`streak-flame-paths.ts`, erzeugt von `scripts/generate-streak-flame-paths.js`); vorgerenderte PNGs, Glanzlicht, 3D-Drehung und Schattierung entfernt, nur ein schwacher Bodenschatten bleibt. Auftakt: Flamme wächst von der Basis als schmale Zunge hoch, gelber Kern folgt, beide flackern gegeneinander und gehen in ruhiges Brennen über. Motivationstext (Start, Standard, Rekord, Meilenstein; de/en) zentriert über der Flamme. Danach: Weiter-Button mit Karten-Glas, maximal 480 pt breit, Systemschrift statt SF Rounded.

## Status ohne Aufgaben: Textbreite und Umbruch begrenzen

- [x] Die lange Leerzustandsmeldung bei fehlendem Status bzw. fehlenden Aufgaben in der Breite begrenzen und rechtzeitig umbrechen lassen.
- [x] Verhindern, dass der Text die Prozentanzeige nach links verdrängt. Sowohl **0 % als auch 100 %** müssen stabil positioniert und vollständig sichtbar bleiben.
- [x] Die betroffene Statusanzeige/-kachel in `app/status.tsx` und auf der Heute-Seite prüfen; lange Übersetzungen, schmale Fenster und große Schrift einbeziehen. Umbruch und Prozentwert dürfen sich nicht überlagern.
- **Gemergt (#9):** Ursache in `app/status.tsx`: Der zentrierte Hero-Block wurde so breit wie der Untertitel, dadurch rückte die Prozentzahl nach links, und 0 % und 100 % waren unterschiedlich breit. Die Textspalte hat jetzt eine feste Breite (unsichtbarer „100 %“-Platzhalter, mindestens 170/190 pt, höchstens die verfügbare Breite), der Untertitel bricht darin um. Die Kachel auf der Heute-Seite zeigt keinen Leertext und ist nicht betroffen. Große Schrift wird im Abschnitt Barrierefreiheit noch einmal geprüft.

## Entschieden: Duo-/iPad-Split-Details für diesen Release zurückgestellt

Stand 16. Oktober 2026. Der Split-Stand liegt auf dem Branch `park/task-split-view` (`c26efd4`). Aufgaben öffnen auf Duo und iPad wieder als normale Vollbild-Seite über `/task/[id]`, wie auf dem iPhone. Begründung und Plan für einen späteren Neuaufbau auf `ArrangementView` (iOS 27.1): siehe [task-split-view-entscheidung.md](task-split-view-entscheidung.md).

- [x] Split-Stand auf Sicherungsbranch gesichert.
- [x] `TaskWorkspace` auf iOS auf die Filter-/Profil-Items in der Duo-Leiste reduziert; eingebettetes Detail, `TaskWorkspaceContext`-Auswahl und Auswahlrahmen in der Liste entfernt.
- [x] Regular-width-Redirect in `/task/[id]` entfernt.
- [x] Normale Navigation und Zurück-Pfade aus Heute, Inbox, Projekten, Suche, Routinen, Assist und Widgets auf Duo (außen, innen hoch/quer, angewinkelt) und iPad prüfen. Position des Hinzufügen-Buttons und Tastaturverhalten in der Vollbild-Detailseite abnehmen. *Auf `master` getestet.*

Damit entfallen für diesen Release: Hinzufügen-Button in der linken Spalte zentrieren, Tastatur im eingebetteten Detail, 680-pt-Grenze, Arbeitskontext-Redirect. Sie bleiben für den geparkten Split-Stand relevant.

## SDK 58: abschließende native Prüfung

Die finalen Paketversionen sind im Checkout gespeichert. Die vorherige Simulatorprüfung verwendete noch den RC-Paketstand; die finale Kombination bestand separat TypeScript, Paketprüfung, Peer-Auflösung und iOS-JavaScript-Export. Das ersetzt keinen nativen Test der aktualisierten Pods.

- [ ] App **und Widget-Erweiterung** nach dem finalen Paket-/Pod-Update neu bauen. Vorhandene Development Builds mit React Native RC ersetzen.
- [ ] iPhone Duo: außen, innen hoch/quer, Falten/Entfalten und angewinkelte Pose; Safe Areas, native Filter-/Profilmenüs, Day-Slider und Hinzufügen prüfen.
- [ ] iPad: Hoch-/Querformat und schmale Fenster; Vollbild-Detail, Titelabstände und nativen Zurück-Button prüfen.
- [ ] Normales iPhone: kompakte Aufgabenroute, Suche, Erstellungsdialoge und Bildschirmtastatur prüfen.
- [ ] Datum-/Projekt-/Emoji-/Routinen-Sheets: native Close-/Done-Aktionen antippen; Eingaben über Posewechsel erhalten.
- [ ] Swipe/Drag und Widget-Abhaken nach dem Update prüfen. Der Widget-Speicherpatch bleibt erforderlich. **Gemergt (#5):** Widget-Sync wartet jetzt auf das Laden der Aufgaben, bevor Widget-Abhakungen übernommen werden.

Device Hub lieferte bei der Prüfung zeitweise `noWindowsAvailable` bzw. Timeouts. Screenshots belegen erfolgreiche Hauptansichten aller drei Geräteklassen und ein geöffnetes iPad-Spaltendetail. Daraus folgt keine vollständige Freigabe aller Interaktionen. Hardwaretastatur-Modus und Bildschirmtastatur bei der Wiederholung ausdrücklich unterscheiden.

## Im Code gefundene Risiken bearbeiten

- [x] ~~**Tastatur im eingebetteten Detail:** Keyboard-Ausgleich ergänzen oder automatisch angepasste Keyboard-Insets aktivieren. Der Spacer entfällt derzeit bei `embedded`; das Notizfeld unten kann verdeckt werden. Mit eingeblendeter Bildschirmtastatur verifizieren.~~ Entfällt mit dem zurückgestellten Split.
- [x] **Erster Duo-Leistenwechsel:** Den Safe-Area-Wrapper von Anfang an strukturell stabil halten. Der erste Wechsel von „noch nie Leiste“ zu „Leiste vorhanden“ ersetzt aktuell den Kinderbaum; ungespeicherter lokaler Formularzustand kann verloren gehen. **Gemergt (#8):** Ab iOS 27.1 (natives `supportsVerticalBar`) ist der Wrapper von Anfang an gemountet und bleibt neutral (keine Insets, Dekoration oder Seitenlayout), bis erstmals eine Leiste erscheint. Ältere iOS-Versionen und Android behalten die ursprüngliche Hierarchie. Native Neubau nötig; auf iPhone mit iOS 27.1 große Titel und Scroll-Kanten gegenprüfen.
- [x] ~~**Aufgabenroute / Arbeitskontext:** Den pauschalen Redirect von `/task/[id]` nach `/inbox` auf regular-breiten Geräten prüfen. Suche, Routine, Assist und Widget-Links sollen ihren sinnvollen Kontext und Zurück-Pfad behalten.~~ Entfällt mit dem zurückgestellten Split.
- [x] **Projekt-Modals:** Hintergrund bei „Projekt bearbeiten“ und Projektlimit wie beim Anlegen hinter die Duo-Leiste ausdehnen. Interaktive Inhalte weiter innerhalb der Safe Area halten. **Gemergt (#7):** Abdunklung in `edit-modal.tsx` und `limit-modal.tsx` nutzt jetzt wie `create-modal.tsx` `usePageInsets()` und reicht seitlich unter die Leiste.
- [x] ~~**Duo-Split bei 669 pt:** Die aktuelle 680-pt-Grenze zeigt innen hochkant nur eine Spalte. Gewünschtes Verhalten festlegen und bei einer Anpassung die Mindestbreiten beider Spalten beachten. Querformat nicht allein aus den Portrait-Einträgen in Info.plist ableiten: Im Simulator lief das resizable Duo-Innendisplay auch quer.~~ Entfällt mit dem zurückgestellten Split.

## Barrierefreiheit (a11y)

Neu aufgenommen am 16. Oktober 2026. Research, Technikentscheidungen und Kontrastwerte: [accessibility-ios.md](accessibility-ios.md). Ziel ist, im App Store die Accessibility-Labels VoiceOver, Voice Control, Larger Text, Sufficient Contrast, Dark Interface, Differentiate Without Color Alone und Reduced Motion angeben zu können. Code-Änderungen erst nach Freigabe durch Bene.

### Grundlagen (zentral, vor den Screens)

- [ ] **Kontrast erhöhen:** Semantische Farbpalette in `constants/theme.ts` (`label`, `secondaryLabel`, `separator`, `groupedBackground`, `accent`, `onAccent` …) mit `light`, `dark`, `highContrastLight`, `highContrastDark`. Hook `useHighContrast()` (`isDarkerSystemColorsEnabled`, bei `AppState` → `active` neu abfragen, weil RN kein Change-Event liefert) und `useThemeColors()`, der Hex für JS-Rechnungen und `DynamicColorIOS` für native Styles liefert. Danach die über 400 hart codierten Hex-Farben schrittweise auf Tokens umstellen. **Umgesetzt in PR #14** (Gerätetest offen): `context/high-contrast-store.ts` (Abfrage beim Start und bei Rückkehr in den Vordergrund), Hochkontrast-Palette hinter `Colors[theme]`, `useThemedStyles` für Style-Memos, Neuaufbau der Screens beim Umschalten. Offen bleiben die hart codierten Hex-Farben (`#8E8E93`, `#6B7280`, `#F2F2F7` …) und eigene Rollen wie `separator`/`groupedBackground`.
- [ ] **Akzentfarben:** Hochkontrastvarianten (Apple-Systemwerte, siehe Tabelle in accessibility-ios.md) und eigene Dunkelwerte ergänzen. Grün und Orange erreichen auf Weiß nur 2,2:1 und taugen hell nicht für Text oder dünne Icons. Weißer Text auf Akzent (FAB, Senden, Assist-Bubbles) reicht nur bei Indigo; Blau (4,0:1) nur für Icons und große Schrift, Swipe-Icons brauchen mindestens 3:1: Vordergrundfarbe per WCAG-Formel wählen (`getReadableTextColor` in `app/assist.tsx:1966` nutzt eine naive Luma-Schwelle und wählt für Grün Weiß). Hochkontrastvarianten aller sechs Akzente in `getAccentColorValue`: **Umgesetzt in PR #14** (Gerätetest offen). Grün und Orange im Normalmodus bewusst unverändert (Bene, 16.10.: Nutzer wählt sie aktiv).
- [ ] **Sekundärtexte:** Deckkraft-Abstufungen wie `ALPHA_3 = 0.48` (`home/index.tsx:478`), `rowSubtitle` 0,32 (Inbox, Suche), `rowMetaText` 0,34 (`home/today.tsx:252`), Placeholder 0,42, `#8E8E93`/`#6B7280`/`#5B6270` liegen unter 4,5:1. Auf Token `secondaryLabel` umstellen; bei erhöhtem Kontrast weiter anheben. Anheben bei erhöhtem Kontrast über `contrastAlpha()` an allen `withAlpha(text, …)`-Stellen und den `ALPHA_*`-Deckkräften: **Umgesetzt in PR #14** (Gerätetest offen); die Normalwerte sind unverändert.
- [ ] **Transparenz reduzieren:** `isReduceTransparencyEnabled` + `reduceTransparencyChanged` im Settings-Store abonnieren. `components/ui/glass-surface.tsx` rendert dann eine deckende `fallbackBackgroundColor` (Default ist derzeit `transparent`). `GlassView` direkt in `app/task/create-modal.tsx` ebenso. Natives Liquid Glass auf dem Gerät mit der Einstellung gegenprüfen.
- [x] **Bewegung reduzieren, nur Systemeinstellung (17. Oktober):** Der App-eigene Schalter „Bewegung reduzieren“ ist entfernt. Native Seitenübergänge, Sheets, Menüs und Tastatur folgen nur der iOS-Einstellung; ein App-Schalter hätte sie nie vollständig abdecken können (Bene, 17.10.). Die Einstellungen zeigen stattdessen einen Hinweis auf Bedienungshilfen (alle 25 Sprachen). Das gespeicherte Feld bleibt für Backups erhalten, wird aber ignoriert.
- [x] **Bewegung reduzieren, Reanimated:** An der Wurzel `<ReducedMotionConfig mode={reduceMotionEnabled ? ReduceMotion.Always : ReduceMotion.System} />`, damit auch der App-Schalter greift. Fingergeführte Bewegungen (Drag, Tastaturkopplung) explizit `ReduceMotion.Never`. **Umgesetzt in PR #14** (Gerätetest offen): `ReducedMotionConfig` in `app/_layout.tsx` setzt `Always`/`Never` aus dem kombinierten Wert, weil Reanimated die Systemeinstellung selbst nur beim Start liest. Rückschnappen nach Swipe/Drag springt bei reduzierter Bewegung direkt.
- [x] **Bewegung reduzieren, Startwert:** `context/settings-store.tsx:465` startet jede Hook-Instanz mit `systemReduceMotion = false` und fragt asynchron nach, dazu ein Listener pro Instanz. Mount-Animationen (AnimatedNumber, Home-Reveal, Celebration) laufen deshalb kurz trotzdem. Wert einmal auf Modulebene halten (`useSyncExternalStore`, vor dem ersten Render vorgeladen). **Umgesetzt in PR #14** (Gerätetest offen).
- [x] **Bewegung reduzieren, RN-`Animated` und `LayoutAnimation`:** ungegated in `swipe-task-row.tsx:840-870` (Swipe-Commit), `inbox/index.tsx:301,353` und `explore/index.tsx:510` (`LayoutAnimation`), `explore/index.tsx:422,553`, `app/task/create-modal.tsx:508`, `task-detail-content.tsx:153` (`withTiming`), `project/[id].tsx:371`, Assist-`TypingAnimation`. In `task-swipe-draggable-list.tsx:1337/1367` bedeutet `undefined` die Default-Spring der Library, nicht „aus“. **Umgesetzt in PR #14** (Gerätetest offen): `utils/motion.ts` (`motionTiming`, `motionSpring`, `configureLayoutAnimation`) in allen acht Dateien; Reanimated-Stellen laufen über den globalen Schalter. Die Draggable-List-Config und `TypingAnimation` in Assist sind noch eigens zu prüfen.
- [ ] **Ansagen:** Hilfsfunktion `announce()` über `announceForAccessibilityWithOptions(…, { queue: true })`. Einsetzen bei Erledigen/Wiederöffnen, Löschen, Wiederherstellen, Tageswechsel, Trefferzahl der Suche, neuer Assist-Antwort.
- [ ] **Modals und Sheets:** `accessibilityViewIsModal` auf allen `transparentModal`-Containern (Projekt-Modals, Kalender-Popover, Create-Modal, Streak-Overlay), Fokus beim Öffnen auf Titel bzw. erstes Feld, `onAccessibilityEscape` zum Schließen.
- [ ] **Bedienflächen 44 pt:** `HeaderIconButton` ist 32 pt und clippt mit `overflow: hidden`, sodass `hitSlop` auf iOS nicht greift (alle Sheet-Close/Done). Ebenso `ProfileHeaderMenuButton` (36 pt), Filter-Button (36 pt), „x“ auf Detail-Kacheln und Tag-Chips (ca. 32–34 pt), Assist-Clear (36 pt), Plus-Close (42 pt).
- [ ] **Übersetzungen:** In 23 Locales fehlen 38 Keys, darunter alle `a11y.*`, `legal.*`, `streakCelebration.*`. VoiceOver spricht dort Englisch. Akzentfarben-Namen sind deutsch hart codiert (`settings-store.tsx:17-22`) und werden als Label genutzt; Emoji-Labels kommen für alle Sprachen aus `DE_EMOJIBASE_COMPACT`.
- [ ] **Statische Prüfung:** `eslint-plugin-react-native-a11y` einführen; Pressables ohne Rolle/Label als Fehler melden.
- [ ] **Abnahme:** Accessibility Inspector Audit je Screen; Gerätedurchlauf mit VoiceOver, Voice Control, AX5-Schriftgröße, Kontrast erhöhen, Transparenz reduzieren, Bewegung reduzieren und Fettere Schrift. Hell und dunkel, iPhone, Duo, iPad.

### VoiceOver und Voice Control

- [ ] **Aufgabenzeile** (`swipe-task-row.tsx:1653`): Zeileninhalt ohne Teilaufgaben als ein Element mit Rolle, zusammengesetztem Label (Titel, Fälligkeit, Projekt, Priorität) und `accessibilityState.checked`. Vorhandene Aktionen `activate`/`complete`/`delete` um „Nach oben“, „Nach unten“, „Auf Tag verschieben“ ergänzen, damit Drag-Sortierung ohne Geste geht. Teilaufgaben-Häkchen (`:1412`) als `checkbox` mit State, und zwar als Geschwister außerhalb des `accessible`-Bereichs (ein `accessible`-Elternelement versteckt sie sonst) oder als Custom Actions der Zeile.
- [ ] **Day-Slider** (`home/index.tsx:4516-4541`): rund 485 einzelne Buttons ohne Monat, Jahr und ausgewählten Zustand. Als ein `adjustable`-Element mit `accessibilityValue` (volles Datum, Anzahl Aufgaben) und increment/decrement über `shiftSelectedDateBySwipe`. Das ist auch die Alternative zum Wischen auf der Liste.
- [ ] **Heute:** Collapsible-Sektionen mit `expanded`, übrige Sektionstitel mit `header`. Kalender-Popover: Backdrop-Label, Rollen für „Heute“/„Morgen“. Archiv-Pill: sichtbaren Text als Label übernehmen, „Archiv öffnen“ als Hint.
- [ ] **Projekte (Explore):** Kachel-Reihenfolge per `accessibilityActions` „nach links/rechts“ über `commitProjectOrder`.
- [ ] **Projekt-Detail (Kanban):** Spaltenwechsel ohne Drag („In Heute/Demnächst/Erledigt verschieben“). Spaltenköpfe als `header`, Zähler mit Label.
- [ ] **Task-Detail** (`task-detail-content.tsx`): Icon-Buttons ohne Label (Löschen 702, Datum/Routine/Ort/Projekt entfernen 507/537/567/617, Ort holen 572, Teilaufgabe löschen/hinzufügen 660/680). Erledigen-Button (714-746) rendert „Erledigen“ und „Wiederholen“ gleichzeitig, VoiceOver liest beide. Kacheln mit verschachtelten Pressables: innere Buttons sind für VoiceOver unerreichbar, als `accessibilityActions` der Kachel abbilden. Ort-Kachel (553) hat leeres `onPress`.
- [ ] **Create-Modal:** Entfernen-Buttons in Tag-Chips (1663/1712) unerreichbar; Menü-Toggle (1749) ohne `expanded`.
- [ ] **Picker:** Optionszeilen in Datum, Projekt, Routine, Ort ohne Rolle und `selected`. Date-Picker-Switch (175) ohne Label. Emoji-Picker-Farbswatches (118-127) ohne Label und Zustand.
- [ ] **Projekt-Modals:** TextInputs nur mit Placeholder; Icon-/Farb-Dropdowns ohne aktuellen Wert; Speichern-Button in `edit-modal.tsx:501` heißt „Projekt bearbeiten“.
- [ ] **Header und Filter:** `ProfileHeaderMenuButton` (231) und Filter-Anker (`filter-menu-button.tsx:428-444`) ohne Label.
- [ ] **Suche:** Trefferzahl ansagen, Leerzustands-Icon ausblenden. Inbox-Sektionskopf: Anzahl als „3 Aufgaben“, Chevron ausblenden.
- [ ] **Routinen:** Karten (`home/routines.tsx:509`) ohne Rolle und Label; Stat-Kacheln gruppieren.
- [ ] **Streaks und Status:** Balkendiagramme sind stumm; als ein Element mit Zusammenfassung oder Label je Balken. Stat-Kacheln und Hero gruppieren. `AnimatedNumber` liest jede Ziffer einzeln: Wrapper `accessible` mit formatiertem Label.
- [ ] **Streak-Celebration:** alte Zahl (Opacity 0) liegt im Accessibility-Baum; Wochenpunkte ohne Zustand, „3/7“ als „3 von 7 Tagen“. Ansage beim Mount mit `queue: true`.
- [ ] **Assist:** Senden (3032) ohne Label (liest „Pfeil nach oben“), Aktions-Buttons lesen „→“ mit, `TypingAnimation` ohne Label, neue Antworten nicht angesagt.
- [ ] **Plus und Sync:** `OfferCard` ohne `selected`, Spinner ohne Label, Legal-Toggle ohne `expanded`; CloudSync-Switch ohne Label, `DisabledWrap` ohne `disabled`-State.
- [ ] **Widgets:** Abhak-Symbol ohne Label (`tasks-widget.tsx:153-161`), Erledigt-Status nur über Durchstreichung, Wochenbalken ohne Textzusammenfassung.

### Larger Text (Dynamic Type)

- [ ] Day-Slider: `dateRailDay` feste Höhe 64 bei 10/20 pt (`home/index.tsx:838-906`). `maxFontSizeMultiplier` ca. 1,3 oder Höhe aus Font-Scale; Datumspicker als skalierbare Alternative.
- [ ] Aufgabentitel `numberOfLines={1}` (`swipe-task-row.tsx:1748`) und Titel im Heute-Header: ab großer Schrift umbrechen lassen.
- [ ] Projektkacheln: feste `PROJECT_TILE_HEIGHT` mit `overflow: hidden`, Titel 28 pt einzeilig (`explore/index.tsx:115-124, 241`).
- [ ] Metrik-Karten 40 pt zweispaltig (`home/index.tsx:576-583`), Streak-/Status-Diagramme (feste Höhe 120, Labels 26 pt breit), Streak-Zahlfenster 40 pt hoch (`streak-celebration-overlay.tsx:476-490`), `AnimatedNumber` mit Höhe `fontSize*1.2` und Clip: ab Font-Scale 1,5 stapeln bzw. Höhe skalieren.
- [ ] Projekt-Modals: feste Höhen 64/40/44 (`create-modal.tsx:529-577`).
- [ ] Routinen: `adjustsFontSizeToFit` mit `minimumFontScale 0.6` hebt die Vergrößerung wieder auf (`home/routines.tsx:330-333`).
- [ ] Widgets: `font({ size })` fest; auf Text-Styles umstellen.
- [ ] 10-pt-Texte (Row-Meta, Tag-Chips, Wochentage) prüfen; Mindestgröße 11 pt.

### Nicht nur Farbe

- [ ] Priorität, Überfälligkeit, Projekt und Streak-Status zusätzlich über Symbol oder Text kennzeichnen. Erledigt-Zustand nicht nur über Durchstreichung/Deckkraft.

## Technisches Review: Befunde je Screen

Stand 16. Oktober 2026, Code auf `master` (`84b1099`) gelesen, nicht auf dem Gerät gemessen. Die schweren Punkte stichprobenartig im Code nachgeprüft.

### Hoch (Bugs und Datenverlust)

- [ ] **Datum-Picker speichert „heute“ bei Aufgaben ohne Datum:** `isCleared` startet mit `false` (`app/task/date-picker.tsx:51`), „Fertig“ ohne Interaktion setzt die Fälligkeit auf heute. Fix: `useState(!task?.dueAt)`. **Fix in Draft-PR #15** (Gerätetest offen).
- [ ] **Profil-CTA unsichtbar im Dunkelmodus:** Hintergrund `Colors.dark.tint = #fff`, Text `#FFFFFF` (`app/profile.tsx:71-77`). Der Screen ist allerdings nicht erreichbar und zeigt Platzhalterdaten; eher entfernen (siehe Aufräumen).
- [ ] **Backup-Wiederherstellung ohne Rückfrage:** `onRestoreBackup` (`premium-sync-backup.tsx:645`) ersetzt alle Aufgaben und Projekte ohne Bestätigung und ohne Schemaprüfung. Außerdem wird `reduceMotionEnabled` inklusive Systemwert gesichert und als App-Präferenz eingefroren; stattdessen `reduceMotionPreference` sichern. Rückfrage vor dem Wiederherstellen: **Fix in Draft-PR #15** (Gerätetest offen); Schemaprüfung und Reduce-Motion-Sicherung prüfen, ob #15 sie abdeckt.
- [ ] **Löschen ohne Bestätigung oder Undo:** Projekt löschen samt Aufgaben (`edit-modal.tsx:217`), Swipe-/VoiceOver-Löschen in Listen, endgültiges Löschen im Archiv (`archive.tsx:166-171`). Task-Detail fragt dagegen nach. Projekt löschen und endgültiges Löschen im Archiv: **Fix in Draft-PR #15** (Gerätetest offen). Swipe-Löschen bleibt bewusst ohne Rückfrage, weil der Papierkorb wiederherstellbar ist.
- [ ] **Ortung wirft bei leerem Ergebnis:** `const [rev] = await reverseGeocodeAsync(…)` und danach `rev.name` (`location-picker.tsx:96-101`, `task-detail-content.tsx:216-221`). Zusätzlich: Button während `isLocating` nicht gesperrt; Schließen während der Ortung ruft danach `router.back()` und poppt den falschen Screen. Koordinaten-Fallback, Doppeltipp-Sperre und Entwicklertext: **Fix in Draft-PR #15** (Gerätetest offen).
- [ ] **Suche: „Wieder öffnen“ wirkt nicht:** `toggleComplete` (`search-results-screen.tsx:89-117`) setzt erledigte Aufgaben erneut auf `completed`. **Fix in Draft-PR #15** (Gerätetest offen).
- [ ] **Assist gesperrt zeigt Projektlimit-Text:** `t("projectLimit.body", { count: 4 })` (`app/assist.tsx:3140`); CTA Weiß auf `#FF8A00` (ca. 2,4:1), gleiches im Limit-Modal (`limit-modal.tsx:225-230`). Falscher Text: **Fix in Draft-PR #15** (Gerätetest offen); der Kontrast des CTA bleibt offen und gehört zu den Akzentfarben unter Barrierefreiheit.
- [ ] **Assist-Tab vor Premium-Prüfung offen:** `!isReady || hasPremiumAccess` (`(tabs)/assistant/index.tsx:18`) zeigt den Premium-Screen, solange der Status lädt.
- [ ] **Entwürfe als echte Aufgaben:** Create-Modal und Routine-Picker schreiben Entwürfe als soft-deleted Tasks in den Store (`create-modal.tsx:397-410`, `routine-picker.tsx:416-439`), Aufräumen hängt an Ref-Flags und einem 1200-ms-Timeout. Bei App-Abbruch bleiben Leichen, die in Sync und Backup landen können. Eigener Draft-Zustand, Einfügen erst bei „Erstellen“.
- [ ] **Projekt bearbeiten verliert Eingaben:** `useEffect([project])` (`edit-modal.tsx:167-174`) setzt alle Felder bei jeder neuen Projekt-Referenz (Sync, Store-Update) zurück. Nur bei Mount/ID-Wechsel initialisieren. Anlegen hat keinen Doppeltipp-Schutz (`create-modal.tsx:201`). Beides: **Fix in Draft-PR #15** (Gerätetest offen).

### Mittel

- [ ] **Mitternacht/Resume:** `todayStart` (`home/index.tsx:1639`), `selectedDateStart`, `listDateStart` und `completionPercentage` bleiben nach Mitternacht oder Resume am Folgetag auf „gestern“. Tageswechsel im AppState-Listener erkennen. Gleiches Muster: `nowMs = Date.now()` pro Render in der Inbox (`inbox/index.tsx:149`) macht alle Memos wirkungslos und aktualisiert „überfällig“ trotzdem nicht mit der Zeit.
- [ ] **Remount ganzer Listen:** `key={listRenderKey}` aus allen Task-Keys auf der ScrollView in Suche (`search-results-screen.tsx:167`) und Archiv (`archive.tsx:291`). Jede Änderung und jeder Tastendruck verliert Scrollposition und VoiceOver-Fokus.
- [ ] **Heute-Performance:** `setDragDropDebugReason` (`home/index.tsx:1656`, ca. 10 Aufrufe beim Drag) wird nie gelesen und rendert die ca. 3500 Zeilen große `HomeContent` bei jedem Drag-Move neu; ebenso `setActiveDragSurface`/`setIsDateListTransitioning` prüfen. Rail-Items rendern bei jedem Drag-Hover neu (Inline-`renderItem`, `:4499`). `handleToggleComplete` hängt an `tasks`.
- [ ] **Store-Schreiben pro Tastendruck:** Titel, Notizen, Ort im Detail und Titel im Create-Modal rufen bei jedem Zeichen `updateTask` (Persistenz, Widget-Sync, alle Listen). Lokaler Entwurf, Commit bei Blur oder mit Debounce. Suche ruft `router.setParams` pro Tastendruck (`search/_layout.tsx:61`, `app/_layout.tsx:271`).
- [ ] **Sprachwechsel greift nicht überall:** `SECTION_TITLES` (`project/[id].tsx:83-87`) und `FILTERS` (`home/filters.ts`) werden beim Modul-Import mit `t()` gebaut. Spaltentitel im Board: **Fix in Draft-PR #15** (Gerätetest offen); `FILTERS` bleibt offen.
- [ ] **Projekt-Detail ohne Projekt:** `return null` (`project/[id].tsx:1290`) bei gelöschter oder ungültiger ID, leerer Screen ohne Zurück (Geste aus). Not-found-Zustand. Routine-Picker `notFound` ohne Schließen-Button.
- [ ] **Projekt-Reihenfolge per Index:** `commitProjectOrder` (`explore/index.tsx:512-522`) ordnet über Indizes; kommt während des Drags ein Projekt per Sync hinzu, kann eines doppelt erscheinen oder fehlen.
- [ ] **Doppelte Logik:** `toggleComplete`/`deleteTask`/`toggleSubtask` als abweichende Kopien in Inbox, Suche und Projekt-Detail; Row-Styles in Inbox und Suche; `StatTile`/`ChartBar` in Streaks, Status, Routinen; Projekt-Create und -Edit. In Store-Hooks bzw. gemeinsame Komponenten ziehen. `routines.tsx` umgeht `useOpenTask`.
- [ ] **Status-Diagramm:** 0 % Erledigung zeigt durch `Math.max(8, 0)` einen 8-%-Balken (`status.tsx:209-211`). **Fix in Draft-PR #15** (Gerätetest offen). `createStyles()` wird pro Balken und Render aufgerufen (Status, Streaks).
- [ ] **Root-Layout:** `useSegments()` in `app/_layout.tsx:37-40` rendert bei jeder Navigation die ganze Provider-Hierarchie neu. Kein `ErrorBoundary`-Export. RTL-Umschaltung per `forceRTL` ohne Reload.
- [ ] **Accessory-Kontext:** `setContext("today", null, null)` in `(tabs)/_layout.tsx:167` läuft nach dem `useFocusEffect` von Heute und kann `selectedDateStart` überschreiben; in der nativen Bridge prüfen.
- [ ] **Assist:** `onSubmitEditing` bei `multiline` feuert auf iOS nicht; laufende Generierung wird beim Verlassen nicht abgebrochen.
- [ ] **Plus:** Abo-Hinweise sind standardmäßig eingeklappt; für die App-Review besser sichtbar.
- [ ] **Entwicklertext für Nutzer:** `taskDetail.alert.locationUnavailableBody` nennt `npx expo run:ios` (en:131, de:133). **Fix in Draft-PR #15** (Gerätetest offen).
- [ ] **Streak-Overlay:** `useFrameCallback` (`:229`) läuft auch bei reduzierter Bewegung; `runOnJS` durch `scheduleOnRN` ersetzen.

### Aufräumen (niedrig)

- [ ] Toter Transition-Code in `home/index.tsx`: `dateListTransitionState` wird nur auf `null` gesetzt, damit sind `dateListTransitionData`, die Layout-Handler `:2258-2333`, `runDateListTransition`, `upcomingSectionReveal*` und `monthPickerButtonLabel` wirkungslos. Onboarding-Hinweise (`:1370-1420`) werden nie gerendert, lesen aber AsyncStorage beim Mount. `HomeContent` aufteilen (DateRail, CalendarPopover, Metrics, Drag-Controller).
- [ ] Nicht erreichbare Routen und Dateien entfernen: `app/modal.tsx`, `app/profile.tsx`, vermutlich `app/(tabs)/home/today.tsx`, `app/(tabs)/home/filters.ts` (wird zur Route), `components/hello-wave.tsx`, `parallax-scroll-view.tsx`, `external-link.tsx`, `ui/collapsible.tsx`, `navigation/routines-header-button.tsx`, `navigation/task-create-bottom-accessory.tsx`, `native/month-year-wheel-picker.tsx`, `FloatingAddPillButton`, `components/tasks/task-swipe-draggable-list.tsx.bak`, `replace.js` und `update_script.js` im Repo-Root. Vor dem Löschen jeweils per Suche bestätigen.
- [ ] Toter Code in `task-detail-content.tsx` (`PROJECT_ICON_SWATCHES`, `COMPLETE_GREEN`, `normalizeDateWithTimeFlag`, `FormField` …) und Pickern; doppelte Long-Press-Erkennung und unbegrenzter `TASK_ROW_HEIGHT_CACHE` in `swipe-task-row.tsx`; Swipe-Commit-Guard über Ref statt State; Timer in `keepKeyboardOpen` beim Unmount aufräumen; `router.setParams` im State-Updater (`filter-menu-button.tsx:410-416`); `console.warn` im Render (`(tabs)/_layout.tsx:174-180`); Prozentwerte mit `Intl.NumberFormat`.

## Technische Altlasten

- [ ] React-Native-Strict-TypeScript migrieren und erst danach `react-native-legacy-deep-imports` entfernen. Mit finalen Paketen bestehen ohne die Ausnahme noch 69 Typfehler.
- [ ] Bekannte Lint-Befunde bearbeiten: `npm run lint` meldete vor dem finalen Update 107 Fehler / 65 Warnungen; vor allem Hook-/Ref-Regeln. Ein vollständiger `eslint .`-Lauf umfasst mehr Dateien und hatte 119 Fehler / 68 Warnungen.
- [ ] Historische Gerätedokumentation aktualisieren: Swipe-/Drag-Komponenten verwenden bereits `usePageDimensions`; entsprechende ältere offene Punkte sind überholt.
- [ ] Bei nativen Änderungen `app.json`, gepflegtes iOS-Projekt und Config-Plugins abgleichen. **Kein Clean-Prebuild:** Eigener AppDelegate, SceneDelegate und native Bridges sind nicht vollständig aus Plugins reproduzierbar. Der bekannte Expo-Doctor-Hinweis bleibt deshalb bestehen.
