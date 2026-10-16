# Barrierefreiheit auf iOS: Research und Umsetzungsplan

Stand: 16. Oktober 2026. Grundlage: Expo SDK 58, React Native 0.88, Reanimated 4.7, iOS 27. Ausgangslage im Code ist der `master`-Stand nach PR #12. Die konkreten Aufgaben stehen in [offene-aufgaben.md](offene-aufgaben.md#barrierefreiheit-a11y).

## Ziel

Die App soll im App Store die Accessibility-Labels (Accessibility Nutrition Labels) **VoiceOver**, **Voice Control**, **Larger Text**, **Sufficient Contrast**, **Dark Interface**, **Differentiate Without Color Alone** und **Reduced Motion** ehrlich angeben können. Apple beschreibt die Kriterien so:

| Label | Was die App leisten muss |
| --- | --- |
| VoiceOver | Alle Funktionen sind mit Gesten, Braille und Sprachausgabe bedienbar. |
| Voice Control | Alle Bedienelemente sind per Sprache antippbar, wischbar und beschreibbar. Dafür brauchen sie sichtbare bzw. sprechbare Namen. |
| Larger Text | Text lässt sich auf mindestens 200 % vergrößern, ohne dass Inhalte abgeschnitten werden. |
| Sufficient Contrast | Kontrast zwischen Text/Icons und Hintergrund ist ausreichend oder vom Nutzer erhöhbar. |
| Dark Interface | Dunkles Erscheinungsbild auf allen Screens, Menüs und Steuerelementen. |
| Differentiate Without Color Alone | Wichtige Information hängt nicht allein an der Farbe. |
| Reduced Motion | Animationen, die Unwohlsein auslösen können, werden reduziert oder ersetzt. |

Captions und Audio Descriptions betreffen die App nicht (keine Video-/Audioinhalte).

## Ausgangslage im Code (gemessen auf `master`)

- 54 `accessibilityLabel` in 22 Dateien, 63 `accessibilityRole` in 27 Dateien, nur 8 `accessibilityState` und 1 `accessibilityActions`. Die meisten Pressables in Listen, Slider und Sheets sind für VoiceOver unbeschriftet.
- Kontrast: kein Code reagiert auf „Kontrast erhöhen“. Kein `isDarkerSystemColorsEnabled`, kein `PlatformColor`, `DynamicColorIOS` nur an zwei Stellen und dort ohne `highContrast*`-Varianten. 422 hart codierte Hex-Farben.
- Transparenz: kein `isReduceTransparencyEnabled`. 35 Dateien nutzen Glass/Blur-Flächen.
- Dynamic Type: 228 feste `fontSize`-Werte. Nur der FAB reagiert auf `fontScale`, nur die Streak-Überlagerung begrenzt mit `maxFontSizeMultiplier`.
- Bewegung: `settings-store.tsx` kombiniert System-„Bewegung reduzieren“ und die App-Einstellung zu `reduceMotionEnabled`. Ausgewertet wird das nur in vier Dateien. Acht Dateien animieren mit der RN-`Animated`-API, die die Systemeinstellung **nicht** von selbst beachtet.

## Empfohlene Technik je Einstellung

### Kontrast erhöhen (Increase Contrast)

iOS meldet die Einstellung als `UIAccessibility.isDarkerSystemColorsEnabled`. Es gibt zwei Wege, und die App braucht beide:

1. **Farben, die direkt in einen nativen Style gehen** (Text-, Hintergrund-, Rahmen-, Icon-Farbe ohne JS-Rechnung): `DynamicColorIOS({ light, dark, highContrastLight, highContrastDark })` bzw. `PlatformColor('label' | 'secondaryLabel' | 'systemBlue' …)`. UIKit löst diese Farben selbst auf und wechselt sie sofort, wenn Nutzer Dark Mode oder Kontrast ändern. Kein Re-Render nötig.
2. **Farben, mit denen JS rechnet** (`withAlpha`, Reanimated-`interpolateColor`, SVG-Füllungen, Widget-Daten): Diese brauchen Hex-Werte. `withAlpha` gibt bei `PlatformColor`-Objekten die Farbe unverändert zurück, die Transparenz ginge also still verloren. Hier einen Hook `useHighContrast()` einführen: `AccessibilityInfo.isDarkerSystemColorsEnabled()` beim Start und bei jedem `AppState`-Wechsel auf `active` abfragen (React Native liefert für diese Einstellung **kein** Change-Event). Daraus eine Palette mit Hochkontrast-Varianten wählen.

Zentral wird das über eine semantische Farbpalette gelöst, statt in jedem Screen einzeln: `constants/theme.ts` bekommt Rollen wie `label`, `secondaryLabel`, `tertiaryLabel`, `separator`, `fill`, `groupedBackground`, `accent` je mit `light`, `dark`, `highContrastLight`, `highContrastDark`. Ein Hook `useThemeColors()` liefert Hex-Werte für JS und `DynamicColorIOS`-Werte für native Styles.

Die Akzentfarben sind die iOS-Systemfarben, aber in Hell und Dunkel mit demselben Wert. Kontrast gegen Weiß (WCAG, Ziel 4,5:1 für Text, 3:1 für Icons und große Schrift):

| Akzent | auf Weiß | auf `#E5E5EA` | auf `#1C1C1E` | Hochkontrast hell / dunkel (Apple) |
| --- | --- | --- | --- | --- |
| Blau `#007AFF` | 4,0 | 3,2 | 4,2 | `#0040DD` / `#409CFF` |
| Rot `#F4512C` | 3,5 | 2,8 | 4,9 | `#D70015` / `#FF6961` |
| Grün `#34C759` | **2,2** | **1,8** | 7,7 | `#248A3D` / `#30DB5B` |
| Orange `#FF9500` | **2,2** | **1,8** | 7,7 | `#C93400` / `#FFB340` |
| Pink `#FF2D55` | 3,7 | 2,9 | 4,7 | `#D30F45` / `#FF6482` |
| Indigo `#5856D6` | 5,7 | 4,5 | 3,0 | `#3634A3` / `#7D7AFF` |

Folgen: Grün und Orange taugen im hellen Modus nicht für Text oder dünne Icons, auch ohne Kontrasteinstellung. Akzent-Text auf dem hellen Akzent-Hintergrund `#E5E5EA` liegt bei allen Farben außer Indigo unter 4,5:1. Indigo ist im Dunkelmodus zu dunkel (Apple nutzt dort `#5E5CE6`). Weißer Text auf Akzentfläche (Buttons, Badges) erreicht nur bei Blau und Indigo annähernd 4,5:1. Mit „Kontrast erhöhen“ sollten die Hochkontrastwerte aus der Tabelle greifen. Ohne die Einstellung sollten Akzente für Text mindestens die dunklere Systemvariante bekommen oder nur für Flächen und große Elemente eingesetzt werden.

Weitere Regeln bei erhöhtem Kontrast: Sekundärtexte mit Deckkraft unter 0,6 anheben (viele Stellen nutzen `withAlpha(text, 0.4–0.6)`). Haarlinien und Rahmen sichtbar machen (z. B. 1 pt statt Hairline, `separator` auf `opaqueSeparator`). Abdunklungen hinter Modals kräftiger.

### Transparenz reduzieren (Reduce Transparency)

`AccessibilityInfo.isReduceTransparencyEnabled()` mit Event `reduceTransparencyChanged`. Das native Liquid Glass von iOS 26/27 (`UIGlassEffect`, das hinter `expo-glass-effect` und den nativen Tab-/Toolbar-Elementen liegt) passt sich als Systemmaterial selbst an und wird bei „Transparenz reduzieren“ deckender; ebenso `UIVisualEffectView`-Blur. Das ist auf dem Gerät zu bestätigen. Eigene halbtransparente Flächen (`rgba`, `withAlpha`, Verläufe, Edge-Fades, Fallback-Hintergründe) tun das nicht. Diese Stellen bekommen über einen Hook `useReduceTransparency()` eine deckende Variante. `GlassSurface` ist der zentrale Hebel: Bei gesetzter Einstellung `fallbackBackgroundColor` deckend rendern und `tintColor` ohne Alpha.

### Bewegung reduzieren (Reduce Motion)

- **Reanimated 4** respektiert die Systemeinstellung bereits standardmäßig (`ReduceMotion.System`): `withTiming`/`withSpring` springen zum Ziel, Layout-Animationen auf den Endzustand. Die **App-eigene** Einstellung „Bewegung reduzieren“ greift dort aber nicht. Lösung: an der Wurzel `<ReducedMotionConfig mode={reduceMotionEnabled ? ReduceMotion.Always : ReduceMotion.System} />` setzen. Bewusst nötige Bewegungen (z. B. Drag-Verfolgung des Fingers, Tastaturkopplung) explizit mit `ReduceMotion.Never` markieren, damit sie nicht einfrieren.
- **RN-`Animated`** (8 Dateien) ignoriert die Einstellung. Dort `reduceMotionEnabled` aus `useAppSettings()` auswerten: Dauer 0 oder Überblendung statt Bewegung, Endlos-`loop`s stoppen.
- Nicht alles abschalten: Apple empfiehlt, Bewegung durch Überblendung zu ersetzen, wo sie Orientierung gibt (z. B. Tageswechsel im Slider). `AccessibilityInfo.prefersCrossFadeTransitions()` meldet zusätzlich den Wunsch nach Überblendungen.
- Haptik bleibt unabhängig davon erlaubt.

### Dynamic Type / Larger Text

React Native skaliert `Text` standardmäßig mit der Systemgröße (`allowFontScaling` ist `true`). Das Problem sind die Layouts: feste Höhen, `numberOfLines={1}`, feste Breiten und Zeilen, die nebeneinander nicht mehr passen. Vorgehen:

- Pro Screen bei der größten Accessibility-Größe (AX5, ca. 310 %) prüfen. Ziel ist 200 % ohne abgeschnittene Inhalte.
- Feste `height` durch `minHeight` ersetzen, horizontale Zeilen ab `fontScale >= 1.5` (über `useWindowDimensions().fontScale`) vertikal stapeln, wie es der FAB schon tut.
- `maxFontSizeMultiplier` nur dort setzen, wo Text sonst die Bedienung zerstört (Tab-Leiste, Day-Slider, Zahlen in engen Kacheln). iOS bietet für so etwas den Large Content Viewer; ein Ersatz für React Native fehlt, daher sparsam begrenzen.
- „Fettere Schrift“ (`isBoldTextEnabled`, Event `boldTextChanged`) auf dem Gerät prüfen: Wo Gewichte fest gesetzt sind, bleibt der Text sonst unverändert.

### VoiceOver und Voice Control

- Jedes bedienbare Element: `accessibilityRole`, ein lokalisierter `accessibilityLabel` (über i18n, nicht hart codiert), bei Zuständen `accessibilityState` (`checked`, `selected`, `disabled`, `expanded`).
- **Aufgabenzeile:** als ein Element zusammenfassen (`accessible`), Label aus Titel, Fälligkeit, Projekt und Priorität, `accessibilityRole="checkbox"` bzw. `button` mit `accessibilityState.checked`. Swipe-Aktionen und Drag-Sortierung brauchen **Custom Actions** (`accessibilityActions` + `onAccessibilityAction`): „Erledigt“, „Löschen“, „Verschieben“, „Nach oben“/„Nach unten“. Ohne diese sind Swipe und Drag für VoiceOver-Nutzer nicht erreichbar.
- **Day-Slider:** `accessibilityRole="adjustable"` mit `increment`/`decrement` (nächster/vorheriger Tag) und `accessibilityValue` mit dem ausgeschriebenen Datum.
- Dekorative Elemente (Flamme, Verläufe, Emoji-Deko) mit `accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"` ausblenden.
- Zustandsänderungen ansagen: Aufgabe erledigt/wiederhergestellt, gelöscht, Streak erreicht. `AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true })`.
- Modals/Sheets: `accessibilityViewIsModal` auf dem Container, damit VoiceOver nicht in den Hintergrund springt. Nach dem Öffnen Fokus auf Titel oder erstes Feld (`sendAccessibilityEvent(ref, 'focus')`), `onAccessibilityEscape` für die Zwei-Finger-Z-Geste zum Schließen.
- Voice Control nutzt dieselben Labels. Sichtbarer Text und Label sollten übereinstimmen, damit „Tippe auf Hinzufügen“ funktioniert.

### Bedienflächen

Mindestens 44 × 44 pt. Kleine Icon-Buttons über `hitSlop` vergrößern, wie es an 28 Stellen schon passiert. Abstand zwischen benachbarten Zielen beachten.

### Nicht nur Farbe

Priorität, Projektzugehörigkeit, Überfälligkeit und Streak-Status zusätzlich über Symbol, Text oder Form kennzeichnen, nicht nur über Farbe.

### Widgets

WidgetKit-Views (`widgets/`) übernehmen Dynamic Type, Kontrast und VoiceOver nur, wenn sie semantische Farben und Textstile verwenden. Labels für Abhak-Buttons (App Intents) setzen.

## Test und Absicherung

- **Accessibility Inspector** (Xcode) im Simulator: Audit pro Screen, Kontrast, Labels, Trefferflächen. Einstellungen live umschalten (Kontrast erhöhen, Transparenz reduzieren, Bewegung reduzieren, Textgröße).
- Auf dem Gerät: Bedienungshilfen-Kurzbefehl mit VoiceOver, Kontrast erhöhen und Intelligent invertieren belegen, um schnell umzuschalten. Jeden Hauptablauf einmal komplett mit VoiceOver und einmal mit Voice Control durchspielen.
- Lint: `eslint-plugin-react-native-a11y` prüft fehlende Labels und Rollen bei Pressables statisch.
- Unit-Tests: `@testing-library/react-native` mit `getByRole`/`getByLabelText` erzwingt Rollen und Labels.

## Quellen

- [React Native: AccessibilityInfo](https://reactnative.dev/docs/next/accessibilityinfo)
- [Reanimated: Accessibility / Reduced Motion](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility)
- [Reanimated: ReducedMotionConfig](https://docs.swmansion.com/react-native-reanimated/docs/device/ReducedMotionConfig)
- [Apple: Accessibility Labels](https://www.apple.com/accessibility/labels/)
- Apple Human Interface Guidelines: Accessibility, Color (Systemfarben mit Hochkontrastvarianten)
