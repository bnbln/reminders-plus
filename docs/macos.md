# Reminders+ auf dem Mac

Stand 2026-10-19. Die Mac-Version ist die iPad-App als „Designed for iPad“ auf Apple-Silicon-Macs. Es gibt kein Mac-Catalyst-Target und keine eigene Mac-App.

## Entscheidungen (Bene, 2026-10-19)

- Weg: „Designed for iPad“. Catalyst kommt höchstens später nach einem Machbarkeitstest. Intel-Macs sind nicht wichtig.
- Seitenleiste statt Tab-Leiste nur auf dem Mac. Das iPad behält vorerst die Tab-Leiste.
- Projekte stehen direkt in der Seitenleiste. Projekte anlegen muss dort weiter gehen.
- Mitteilungen auf dem Mac: nur Erinnerungen für Aufgaben mit Uhrzeit. Tagesübersicht und Streak-Erinnerung bleiben auf dem iPhone.

## Umgesetzt (Stufe 1)

| Bereich | Wo | Verhalten |
| --- | --- | --- |
| Erkennung | `utils/mac.ts` (`IS_MAC`), `MacSupportBridge` in `ios/reminds/MacSupport.swift` | `ProcessInfo.isiOSAppOnMac`, als Konstante an JS. |
| Seitenleiste | `app/(tabs)/_layout.tsx` (`sidebarAdaptable` nur auf dem Mac), `MacSidebarController` | Tabs als native Seitenleiste. Darunter die Gruppe „Meine Projekte“ mit allen Projekten und „Neues Projekt“ als Sidebar-Aktionen. Unten in der Leiste das Profilmenü. Kein Minimieren beim Scrollen. |
| Profilmenü | `components/navigation/profile-menu.ts` | Eine Definition für Seitenkopf, Duo-Leiste und Mac-Seitenleiste. Auf dem Mac verschwindet der Profil-Button aus dem Seitenkopf. |
| Plus | `components/navigation/mac-add-button.tsx` | Statt des Tab-Accessorys ein Plus im Seitenkopf, gleicher Kontext wie das Accessory. |
| Menüleiste | `MacMenuBuilder` in `MacSupport.swift`, Texte und Befehle in `components/navigation/mac-integration.tsx` | Gilt auf dem Mac und in der iPad-Menüleiste (iPadOS 26) samt Tastaturkürzeln. |
| Fenster | `MacWindowConfigurator` | Mindestgröße 700 × 500 pt. |
| Aufgabenzeile | `components/tasks/swipe-task-row.tsx` | Hover-Hervorhebung, Rechtsklick-Menü (Öffnen, Erledigen, Löschen), Ziehen startet nach 150 statt 260 ms. |
| Einstellungen | `app/settings.tsx`, `modules/app-icon/index.ts` | Kein Haptik-Schalter, keine Tagesübersicht, Hinweis zu Mitteilungen, keine alternativen App-Icons. |
| Mitteilungen | `notifications/tasks-notifications.ts` | Nur Aufgaben mit Uhrzeit. Keine Tagesübersicht, keine Streak-Erinnerung. |

### Tastaturkürzel

| Menü | Eintrag | Kürzel |
| --- | --- | --- |
| Reminders+ | Einstellungen … | ⌘, |
| Ablage | Neue Aufgabe | ⌘N |
| | Neues Projekt | ⇧⌘N |
| | Backup exportieren … (öffnet die Einstellungen) | – |
| Bearbeiten | Suchen | ⌘F |
| | Aufgabe erledigen (offene Aufgabe) | ⌘↩ |
| | Aufgabe löschen (offene Aufgabe) | ⌘⌫ |
| | Overlay schließen (versteckt) | Esc |
| Darstellung | Heute, Eingang, Projekte, Routinen | ⌘1 bis ⌘4 |
| | Seitenleiste ein-/ausblenden (nur Mac) | ⌃⌘S |
| | Filter (Haken je Filter) | – |
| Gehe zu | Status, Streaks, Archiv, Assist, Cloud Sync | – |
| Hilfe | Rechtliches, Support kontaktieren | – |

## Bewusst offen

- Pfeiltasten, Leertaste und Return auf einer markierten Listenzeile: Die RN-Liste hat keinen Fokus. Kommt mit dem Split-View-Neubau auf `ArrangementView` (`docs/task-split-view-entscheidung.md`).
- Mehrere Fenster: Stores sind React-Kontext unter einer Wurzel. Frühestens mit Catalyst.
- Catalyst-Machbarkeitstest (Stufe 2) und ein Menüleisten-Extra.

## Auf dem Mac testen

Diese Punkte sind ohne echten Mac nicht prüfbar:

1. Build läuft durch (neue Datei `ios/reminds/MacSupport.swift`).
2. Seitenleiste erscheint, Projekte und „Neues Projekt“ stehen unter „Meine Projekte“. Ob UIKit eine Gruppe ohne Tabs mit nur Sidebar-Aktionen zeigt, ist der größte offene Punkt.
3. Profil unten in der Leiste öffnet das Menü, Assist und Cloud Sync führen ohne Plus zur Paywall.
4. Menüleiste: alle Einträge vorhanden, Kürzel funktionieren, ⌘F öffnet die Suche statt „Suchen“ im Textfeld.
5. Rechtsklick auf eine Aufgabe öffnet das Menü, Hover hebt die Zeile hervor, Ziehen fühlt sich mit der Maus richtig an.
6. Fenster lässt sich nicht kleiner als 700 × 500 pt ziehen.
7. Widgets der iPad-App, Kauf und Wiederherstellung, iCloud-Sync mit dem iPhone, Kalender-Import.
8. Auf dem iPad mit Tastatur: Menüleiste und Kürzel da, Tab-Leiste unverändert.
