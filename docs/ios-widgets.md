# iOS Widgets (Streak + Heute)

Diese Doku beschreibt die beiden Home-/Lock-Screen-Widgets, wie sie gebaut sind und
wie du sie erweiterst. Grundlage ist das offizielle Expo-Paket
[`expo-widgets`](https://docs.expo.dev/versions/latest/sdk/widgets/) (SDK 58) sowie
Apples [Widget-HIG](https://developer.apple.com/design/human-interface-guidelines/widgets).

## 1) Überblick

| Widget | Name | Familien | Inhalt |
| --- | --- | --- | --- |
| Streak | `StreakWidget` | `systemSmall`, `systemMedium`, `accessoryCircular`, `accessoryRectangular`, `accessoryInline` | Aktuelle Serie, heute erledigte Aufgaben, 7-Tage-Aktivität, längste Serie |
| Heute | `TasksWidget` | `systemSmall`, `systemMedium`, `systemLarge`, `accessoryCircular`, `accessoryRectangular`, `accessoryInline` | Offene Aufgaben für heute inkl. überfällig, Fortschritt, abhakbare Zeilen |

Beide Widgets übernehmen die **Akzentfarbe aus den App-Einstellungen**, respektieren
Light/Dark, den getönten Home-Screen-Modus (`accented`) und den Lock Screen (`vibrant`).

## 2) Dateien

```
widgets/
  types.ts            # Prop-Verträge zwischen App und Widget (nur Typen)
  build-props.ts      # Baut die Props aus dem Task-Store (läuft in der App)
  streak-widget.tsx   # SwiftUI-Layout des Streak-Widgets
  tasks-widget.tsx    # SwiftUI-Layout der Aufgabenliste
  index.ts            # createWidget-Instanzen + syncWidgets()/readWidgetCompletions()
components/widgets/
  widget-sync.tsx     # React-Glue: pusht Timelines, übernimmt Widget-Taps
```

Registriert wird das Ganze in `app.json` (Plugin `expo-widgets`) und in
`app/_layout.tsx` über `<WidgetSync />` innerhalb von `TasksProvider`.

## 3) Wie die Daten ins Widget kommen

Widgets laufen in einer eigenen Extension und können kein JavaScript der App
ausführen. `expo-widgets` löst das so:

1. Die App baut reine JSON-Props (`widgets/build-props.ts`) und schickt sie als
   **Timeline** an WidgetKit (`syncWidgets()` in `widgets/index.ts`).
2. Die Timeline enthält mehrere Einträge mit Zeitstempel: *jetzt*, jeder
   Fälligkeitszeitpunkt des Tages (damit „überfällig“ automatisch kippt) und
   Mitternacht (Tageswechsel). Dadurch bleibt das Widget korrekt, **ohne** dass die
   App läuft.
3. Die Layout-Funktion wird beim Build als Quelltext serialisiert und in der
   Extension in einem eigenen JavaScriptCore-Kontext ausgewertet.

Deshalb gelten im Rumpf einer Widget-Komponente (alles nach `'widget';`) harte
Regeln:

- nur Komponenten/Modifier aus `@expo/ui/swift-ui`, kein React Native,
- keine Hooks, kein State, kein Kontext, kein `await`,
- **kein Zugriff auf irgendetwas außerhalb der Funktion** — auch nicht auf
  Konstanten aus derselben Datei. Helfer werden innerhalb der Funktion deklariert,
  alles andere kommt über `props` und `environment`.

Alle sichtbaren Texte werden deshalb in der App übersetzt (`i18n`) und als Props
übergeben, nicht im Widget zusammengebaut.

## 4) Abhaken direkt im Widget

Die Kreise in `TasksWidget` sind App-Intent-Buttons (iOS 17+). Ein Tap ruft den
`onPress`-Callback der Zeile in der Extension auf; der Rückgabewert wird in die
Props des Timeline-Eintrags gemergt — die Task-ID landet in `doneIds`.

Übernommen wird das in `components/widgets/widget-sync.tsx` auf zwei Wegen:

- **App läuft:** `addUserInteractionListener` liefert `source`/`target` sofort.
- **App läuft nicht:** beim nächsten Start bzw. Wechsel nach `active` liest
  `readWidgetCompletions()` die Timeline zurück und schließt alle gesammelten
  Tasks ab (inkl. Routinen-Logik über `createRoutineCompletionTransition`).

Danach wird immer eine frische Timeline gepusht, wodurch `doneIds` wieder leer ist.
Ein zweiter Tap auf dieselbe Zeile nimmt das Abhaken zurück, solange die App es
noch nicht übernommen hat.

## 5) Deep Links

| Ziel | URL |
| --- | --- |
| Streak-Screen | `reminds:///home/streaks` |
| Heute-Liste | `reminds:///home/today` |
| Einzelne Aufgabe | `reminds:///task/<id>` |

Im kleinen Widget ist laut Apple nur ein Tap-Ziel erlaubt (`widgetURL`), ab
`systemMedium` bekommt jede Zeile zusätzlich einen `Link` auf ihre Aufgabe.

## 6) Build

Die Widgets brauchen einen Dev-/Release-Build, in Expo Go funktionieren sie nicht.

```bash
npx expo prebuild -p ios --no-clean
```

> **Wichtig:** immer mit `--no-clean` prebuilden. `ios/` enthält handgepflegte
> Native-Dateien (`ios/reminds/RemindsVerticalBar.m`,
> `ios/reminds/TaskAccessoryContextBridge.m`), die ein Clean-Prebuild löscht.

Zwei Dinge sind nach jedem Prebuild zu prüfen (beides unabhängig von den Widgets,
aber es trifft dich bei jedem Lauf):

- `ios/reminds/SplashScreen.storyboard` wird von `expo-splash-screen` neu
  geschrieben. Das Ergebnis ist mit dem angepassten Splash dieses Repos nicht
  kompatibel (`CompileStoryboard` schlägt fehl) — danach
  `git checkout -- ios/reminds/SplashScreen.storyboard`.
- `CFBundleVersion` kommt aus `expo.ios.buildNumber` in `app.json` (aktuell `"2"`).
  Ohne diesen Eintrag setzt Prebuild die Build-Nummer auf `1` zurück.

Danach wie gewohnt `npm run ios`. Das Plugin erzeugt das Extension-Target unter
`ios/ExpoWidgetsTarget/` (generiert — nicht von Hand bearbeiten) und trägt die
App-Group `group.com.anonymous.reminds` in beide Entitlements ein. Für Geräte-
und Store-Builds muss diese App-Group im Apple-Developer-Account für
`com.anonymous.reminds` **und** `com.anonymous.reminds.widgets` aktiv sein; EAS
legt die Credentials für das Extension-Target automatisch an.

## 7) Neues Widget hinzufügen

1. Layout unter `widgets/<name>.tsx` anlegen, Funktion mit `'widget';` beginnen,
   am Ende `export default createWidget('<Name>', <Name>, initialProps)`.
2. In `app.json` unter `plugins > expo-widgets > widgets` eintragen (`name` muss
   exakt dem `createWidget`-Namen entsprechen, `initialLayout` zeigt auf die Datei,
   damit das Widget schon vor dem ersten App-Start in der Galerie erscheint).
3. Props in `widgets/build-props.ts` bauen und in `syncWidgets()` pushen.
4. `npx expo prebuild -p ios --no-clean` ausführen.
