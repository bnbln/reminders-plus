# Drag & Drop: Untersuchung vom 16. Oktober 2026

Ausgangsstand: `43bc8c3`, Branch `claude/project-thread-4wfewz`. Schwerpunkt ist das gelegentliche Flackern beim Loslassen und nach vielen aufeinanderfolgenden Umsortierungen. Die früheren Swipe-, Header- und Split-Änderungen bleiben erhalten.

## Befund aus dem Duo-Simulator

Auf dem geöffneten iPhone Duo mit iOS 27.1 wurde für **dieselbe Drag-Generation 1 zweimal ein Drop gemeldet**:

| Ereignis | Zeit (Unix-ms) | Von → nach |
| --- | --- | --- |
| Beginn | 1792180961025 | 3 |
| erster Abschluss | 1792180973274 | 3 → 1 |
| Daten übernommen | 1792180973674 | |
| zweiter Abschluss | 1792180973817 | 3 → 2 |
| Daten erneut übernommen | 1792180974157 | |
| Drag beendet | 1792180974302 | |

Der zweite Abschluss verwendete alte Ausgangsindizes, obwohl die erste Reihenfolge bereits übernommen war. Damit kann eine einzige Geste zwei unterschiedliche Listenstände rendern und speichern. Das ist ein nachgewiesener fehlerhafter Ablauf, aber noch kein Beweis, dass er jedes vom Nutzer beobachtete Flackern erklärt.

**Testgrenze:** Diese Sequenz entstand mit vorübergehend sofortiger Aktivierung, weil die Fernsteuerung langes Halten und anschließendes Ziehen nicht als zusammenhängende Geste ausführen konnte. Die Abkürzung wurde vollständig entfernt. Der finale Code verwendet wieder 260 ms. Mit normaler Aktivierung wurden Anheben und Ablegen ohne Positionswechsel protokolliert. Anschließend führte Bene normale Gesten aus: Eine erste Serie enthält zehn abgeschlossene Sitzungen und einen abgefangenen doppelten Abschluss. Bene bestätigte den weicheren Schatten, meldete aber weiterhin Flackern. Eine zweite Serie mit „jetzt“-Markierung wurde auf dem sichtbaren Display aufgenommen. Eine belastbare Freigabe mit 30 fehlerfreien Drops liegt nicht vor. Die Aufzeichnung enthält auch Scrollversuche und App-Neustarts; diese zählen nicht als erfolgreiche Drops.

Lokale, nicht versionierte Belege liegen in `.expo/qa/drag-drop-2026-10-16/`: `trace-test-activation.json`, `trace-normal-activation.json` sowie `trace-user-normal.json`, `trace-user-marked.json`, `duo-normal-final.mov` und `duo-normal-followup.mov`. Die erste Aufnahme `duo-candidate.mov` traf das inaktive Innendisplay und ist als visueller Beleg unbrauchbar. Die Protokolle enthalten Zeit, Listeninstanz, Generation, Anzahl und Indizes, keine Aufgabentexte oder IDs. Nach der Klarstellung des Nutzers wurde ausschließlich der Duo-Simulator verwendet.

## Sichtbares verbleibendes Flackern eingegrenzt

Die Bildfolge um Videozeit **82,533 s → 82,558 s** in `duo-normal-final.mov` zeigt einen kurzen falschen Zwischenzustand: Die nach oben verschobene Zeile ragt in den Kalender; die andere versetzte Zeile überlagert ihren Nachbarn. Im nächsten Frame stimmt das Layout. Kopfzeile und untere Zeilen bleiben an ihrer Position. Das ist in dieser Bildfolge kein Verschwinden oder Remounten der ganzen Liste, sondern eine falsch kombinierte Zellposition und Drag-Translation.

Beleg: `.expo/qa/drag-drop-2026-10-16/frames/flash-82.jpg`. Die genaue Zuordnung der Videozeit zu Unix-ms ist wegen der auf Sekunden gerundeten Aufnahme-Metadaten näherungsweise. Der visuelle Zwischenzustand selbst ist direkt belegt.

Der bisherige Layout-Effect auf JS konnte die Shared-Value-Translation erst zurücksetzen, nachdem Fabric bereits die neue Zellposition übernommen hatte. Ein Versuch, den nativen `onLayout`-Event direkt als Reanimated-Worklet zu behandeln, verhinderte im Simulator die Drag-Aktivierung. Bene meldete dies; der Versuch wurde vollständig zurückgenommen. Der normale `onLayout`-Handler bleibt erhalten.

**Aktueller weiterer Fix zur Validierung:** Bei einem Indexwechsel führt der bestehende Layout-Effect das Zurücksetzen synchron im UI-Runtime aus (`runOnUISync`) und setzt gleichzeitig den tatsächlichen nativen Transform mit `setNativeProps` auf null. So wartet die Rückgabe des Effects nicht lediglich auf einen späteren Shared-Value-Schreibzugriff. Unveränderte Indizes werden nicht angefasst. Die endgültige Wirkung muss erneut mit normalen Gesten und Video geprüft werden.

**Nachtrag (Auswertung der Folgeaufnahme):** `duo-normal-followup.mov` wurde nachträglich sauber beendet (22:11:32–22:34, ca. 23 min). Nach dem Neustart mit dem `runOnUISync`-Stand um 22:20:49 enthält weder der Trace noch das Video einen Drag. Die Liste steht um 22:21 und 22:34 in identischer Reihenfolge. Der `runOnUISync`-Stand ist damit **nie getestet** worden.

**Warum er vermutlich nicht genügt:** In Reanimated 4.7.1 ist `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` aus. `setNativeProps` ruft nur `global._updateProps` auf und legt das Update in denselben Batch, den `ReanimatedModuleProxy::performOperations` erst im nächsten Display-Link-Frame als eigenen ShadowTree-Commit schreibt. Während eines React-Commits pausiert Reanimated diese Commits sogar, und der `ReanimatedCommitHook` übernimmt die zu diesem Zeitpunkt registrierten Werte in den React-Baum. Der React-Mount (neues Layout, alter Versatz) und der Reset landen so in zwei verschiedenen Frames. `runOnUISync` verkürzt nur den Abstand. Atomar wird es erst, wenn Position und Versatz im selben `performOperations` geschrieben werden, also über eine Reanimated-Layout-Transition (`flushLayoutAnimationOperations` und Props-Flush laufen dort im selben Durchgang).

**Achtung beim Layout-Transition-Weg:** Der Pfad `enableLayoutAnimationExperimental` der Bibliothek greift auf `global.LayoutAnimationRepository` zu. Das gibt es in Reanimated 4 nicht mehr. Der Patch muss den `layout`-Prop direkt setzen und den Stash-Code entfernen.

## Umgesetzte Absicherungen

- **Ein Abschluss pro Drag, auch innerhalb der Bibliothek:** Die Bibliothek versieht Abschlüsse mit ihrer Drag-Epoche und ignoriert alte bzw. doppelte Epochen vor jeder internen Zustandsänderung.
- **Ein Abschluss pro Drag im App-Baustein:** Der gemeinsame Listenbaustein übernimmt eine Generation nur einmal. Weitere Abschlussmeldungen werden als `duplicate-end-ignored` protokolliert.
- **Abgebrochene Feder ist kein erfolgreicher Drop:** Der Bibliothekspatch prüft `finished`. Abgebrochene Reanimated-Springs rufen ihren Completion-Callback ebenfalls auf. Dieser darf keine weitere Umsortierung auslösen. Die Indizes werden vor dem Federlauf festgehalten.
- **Kein später Idle-Reset:** Neue Daten setzen den Bibliothekszustand im Layout-Commit zurück. Der vorherige ungesicherte `requestIdleCallback(reset)` konnte bis nach dem Beginn einer weiteren Geste liegen bleiben. JSON-Key-Vergleich vermeidet außerdem Kollisionen der bisherigen verketteten Schlüssel.
- **Kein wiederhergestellter alter Zell-Versatz:** Die Zelle speichert ihren Versatz nur bei aktivem Drag, einschließlich des Werts null beim Zurückziehen in die Ausgangsposition. Ein verspäteter Mapper nach dem Drop kann einen bereits gelöschten alten Versatz nicht erneut speichern.
- **Verzögertes Drag-Ende abgesichert:** RAF-Abschlüsse prüfen ihre Generation; beim Unmount werden sie abgebrochen.
- **Unveränderte Reihenfolge:** Für einen normalen Drop an derselben Position entfallen unnötiger Daten-Commit und Reorder-Aufrufe. Externe Drop-Handler werden weiterhin zuerst berücksichtigt.
- **Ungenutzter Debug-State entfernt:** Die Heute-Seite speicherte Diagnosegründe in React-State, ohne sie anzuzeigen. Die Schreibzugriffe sind entfernt. Die übrigen Hover-Zustände bleiben erhalten; nicht jeder dieser Schreibzugriffe hätte zwangsläufig einen Render ausgelöst.
- **Schatten:** UI-Thread-Animation über `boxShadow`, 180 ms ein / 220 ms aus. Die Clip-Fläche bleibt bis zum Ausblenden offen. Ein neuer Drag bricht den alten Clip-Timer ab. Reduzierte Bewegung wird berücksichtigt; Zeilenhöhe und Swipe-Untergründe bleiben strukturell erhalten.

## Bekannte externe Fehler

[Draggable FlatList #602](https://github.com/computerjazz/react-native-draggable-flatlist/issues/602) beschreibt Flackern mit 4.0.3 unter der New Architecture, insbesondere beim Datenwechsel in `onDragEnd`. Der dort vorgeschlagene Index im Key würde Zellen beim Umsortieren neu mounten; wir übernehmen ihn nicht. Die Kommentare bestätigen zudem, dass er das Problem nicht allgemein löst.

[Reanimated #10471](https://github.com/software-mansion/react-native-reanimated/issues/10471) dokumentiert verschwindende Zellen nach wiederholtem Umsortieren mit Layout-Animationen auf einem damaligen Main-Build. Das Issue ist geschlossen. Es belegt weder denselben Fehler in unserer installierten 4.7.1 noch eine erforderliche Paketänderung. Die normale Drag-Liste aktiviert keine experimentellen Reanimated-Layout-Animationen.

## Validierung und verbleibende Abnahme

`node scripts/check-drag-drop-races.cjs` prüft tatsächliche Callback-Ausschnitte aus der installierten, gepatchten Bibliothek und dem Listenbaustein: 1.000 wechselnde Reorder-Commits, kollidierende Key-Verkettungen, verspätete Mapper, Rückkehr auf Versatz null, doppelte Abschlussmeldungen und abgebrochene Springs. Der frühere Zell-Mapper scheitert am gezielten Regressionstest. Das sind gezielte JavaScript-Tests, keine simulierten 1.000 Fingergesten.

TypeScript besteht. Der Patch lässt sich auf das unveränderte npm-Paket 4.0.3 anwenden. Der gezielte Lint-Vergleich zeigt keine neuen Befunde; die vorhandenen Hook-/Ref-Befunde in Heute und SwipeTaskRow bleiben bestehen. `git diff --check` meldet im Patch ausschließlich neu hinzugekommene leere Unified-Diff-Kontextzeilen mit deren vorgeschriebenem Leerzeichen.

- [ ] Mindestens 30 normale Drops auf Heute, danach Inbox und Projektlisten, mit Richtungswechseln und zügiger Folge.
- [ ] Sichtbares Flackern frameweise mit den Drop-Zeitpunkten korrelieren; ein später Screenshot kann ein einzelnes fehlerhaftes Frame nicht ausschließen.
- [ ] Gesten ohne Bewegung, Ausgangsposition, wechselnde Zeilenhöhen, Autoscroll und externe Ziele getrennt prüfen.
- [ ] Schatten beim schnellen erneuten Anheben, Swipe nach dem Drop, Light/Dark und reduzierte Bewegung prüfen.
- [ ] Duo innen/außen und Querformat, anschließend iPad und normales iPhone im Simulator gegenprüfen.

Die Release-Abnahme für das Listen-Flackern bleibt bis zu diesen Prüfungen offen. Der Nutzer hat das Rest-Flackern ausdrücklich bestätigt; die bisherigen Absicherungen allein haben es nicht vollständig behoben.
