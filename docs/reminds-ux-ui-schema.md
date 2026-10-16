# Reminds UX/UI Schema

Dieses UX/UI-Schema beschreibt die wichtigsten Screens, Einstiegspunkte und Kernfunktionen der Reminds App als Markdown-kompatibles Mermaid-Diagramm. Der Diagrammtyp ist eine kombinierte Informationsarchitektur mit Haupt-User-Flow: blaue Knoten sind Screens, violette Knoten sind Modals/Sheets, rote Knoten sind Gates oder Entscheidungen und graue Knoten sind System-/Datenfunktionen.

```mermaid
flowchart LR
    %% Reminds UX/UI Schema

    Start([App Start / Splash])
    Shell["App Shell<br/>Theme, Premium, Tasks, Filters,<br/>Task-Create-Kontext, Notifications"]
    Tabs["Bottom Navigation<br/>Heute · Inbox · Suche · Projekte"]

    Start --> Shell --> Tabs

    subgraph Primary["Primaere Navigationsbereiche"]
        Home["Heute Screen<br/>Datumsleiste, Tagesfortschritt,<br/>Heute / Ohne Datum / Abgeschlossen"]
        Inbox["Inbox Screen<br/>Ueberfaellig + Ohne Datum"]
        Search["Suche Screen<br/>Query, Trefferliste, Direktzugriff"]
        Projects["Projekte Screen<br/>Projektkacheln, Reihenfolge per Drag"]
    end

    Tabs --> Home
    Tabs --> Inbox
    Tabs --> Search
    Tabs --> Projects

    subgraph TaskWork["Aufgaben-Workflow"]
        RowAction{"Aufgabenzeile<br/>antippen, wischen,<br/>halten & ziehen"}
        CreateTask["Aufgabe erstellen<br/>kontextabhaengiges Modal"]
        TaskPickers["Picker / Sheets<br/>Faelligkeit, Styling,<br/>Standort, Routine, Projekt"]
        TaskDetail["Aufgabendetail<br/>Titel, Beschreibung, Datum,<br/>Routine, Ort, Projekt,<br/>Unteraufgaben, Notizen"]
        Complete{"Erledigen?"}
        RoutineNext["Routine-Fortschreibung<br/>Abschluss-Eintrag + naechste Faelligkeit"]
        Trash["Papierkorb / Archiv<br/>geloeschte und erledigte Aufgaben"]
    end

    Home --> RowAction
    Inbox --> RowAction
    Search --> RowAction
    RowAction -->|antippen| TaskDetail
    RowAction -->|rechts wischen| Complete
    RowAction -->|links wischen| Trash
    RowAction -->|Drag & Drop| Home
    RowAction -->|auf Datum ziehen| Home

    Home -->|Plus Button| CreateTask
    Inbox -->|Plus Button| CreateTask
    CreateTask --> TaskPickers
    TaskPickers --> CreateTask
    CreateTask -->|speichern| Home
    TaskDetail --> TaskPickers
    TaskDetail -->|loeschen| Trash
    TaskDetail -->|erledigen| Complete
    Complete -->|normale Aufgabe| Trash
    Complete -->|Routine| RoutineNext --> Home

    subgraph ProjectWork["Projekt-Workflow"]
        ProjectGate{"Projektlimit<br/>Free Plan > 4?"}
        CreateProject["Projekt erstellen<br/>Name, Beschreibung,<br/>Emoji/Icon, Farbe"]
        ProjectDetail["Projekt-Board<br/>Demnaechst · Heute · Abgeschlossen"]
        EditProject["Projekt bearbeiten<br/>Metadaten und Loeschen"]
        ProjectTask["Aufgabe im Projekt<br/>neue Aufgabe mit Projekt-Kontext"]
    end

    Projects -->|neues Projekt| ProjectGate
    ProjectGate -->|frei / Plus aktiv| CreateProject --> Projects
    ProjectGate -->|Limit erreicht| Plus
    Projects -->|Projekt oeffnen| ProjectDetail
    ProjectDetail --> RowAction
    ProjectDetail -->|Plus Button| ProjectTask --> CreateTask
    ProjectDetail -->|Bearbeiten| EditProject --> Projects

    subgraph Secondary["Sekundaere Bereiche ueber Profilmenue"]
        ProfileMenu["Profilmenue<br/>Status, Streaks, Routinen,<br/>Archiv, Assist, Cloud Sync, Einstellungen"]
        Status["Status Screen<br/>Erfuellungsquote, Heute,<br/>Woche, Best Day, Gesamt"]
        Streaks["Streaks Screen<br/>Streak, Aktivitaet,<br/>Zeitfilter"]
        Routines["Routinen Screen<br/>Faellig heute, Frequenzen,<br/>alle Routinen"]
        Settings["Einstellungen<br/>Darstellung, Badge,<br/>Mitteilungen, Haptik,<br/>Reduce Motion, Import"]
        AssistGate{"Assist<br/>Reminders+ aktiv?"}
        Assist["AI Assist<br/>Tasks/Projekte finden,<br/>erstellen, verschieben"]
        CloudGate{"Cloud Sync<br/>Reminders+ aktiv?"}
        CloudSync["Cloud Sync & Backup<br/>iCloud Sync, Export,<br/>Restore"]
        Plus["Reminders+ Paywall<br/>AI Assist, unbegrenzte Projekte,<br/>Cloud Sync"]
    end

    Home --> ProfileMenu
    Inbox --> ProfileMenu
    Search --> ProfileMenu
    Projects --> ProfileMenu
    ProfileMenu --> Status
    ProfileMenu --> Streaks
    ProfileMenu --> Routines
    ProfileMenu --> Trash
    ProfileMenu --> Settings
    ProfileMenu --> AssistGate
    ProfileMenu --> CloudGate
    AssistGate -->|ja| Assist
    AssistGate -->|nein| Plus
    CloudGate -->|ja| CloudSync
    CloudGate -->|nein| Plus
    Routines -->|Routine anlegen| CreateTask
    Routines -->|Routine oeffnen| TaskDetail
    Assist -->|erstellt / findet / verschiebt| TaskDetail
    Assist -->|Projektaktion| Projects

    subgraph System["System- und Datenebene"]
        Store[("Tasks Store<br/>Tasks, Projekte,<br/>Completion History")]
        Local[("Lokaler Snapshot<br/>Datei / localStorage")]
        Cloud[("iCloud Sync<br/>nur iOS + Reminders+")]
        Notify[("Notifications<br/>Faelligkeiten, Tageszusammenfassung,<br/>Streak Reminder, App Badge")]
        Seed["Onboarding Seed<br/>Beispielaufgaben + Projekte<br/>beim ersten Start"]
    end

    Shell --> Store
    Store <--> Local
    Store <--> Cloud
    Store --> Notify
    Seed --> Store
    Home --> Store
    Inbox --> Store
    Search --> Store
    Projects --> Store
    TaskDetail --> Store
    CreateTask --> Store
    CreateProject --> Store
    Assist --> Store
    Settings --> Notify
    CloudSync --> Cloud

    classDef screen fill:#EAF3FF,stroke:#2F80ED,stroke-width:1.5px,color:#0F172A;
    classDef modal fill:#F5EDFF,stroke:#8B5CF6,stroke-width:1.5px,color:#0F172A;
    classDef action fill:#FFF7E6,stroke:#F59E0B,stroke-width:1.5px,color:#0F172A;
    classDef gate fill:#FFECEC,stroke:#EF4444,stroke-width:1.5px,color:#0F172A;
    classDef data fill:#F1F5F9,stroke:#64748B,stroke-width:1.5px,color:#0F172A;
    classDef start fill:#ECFDF5,stroke:#10B981,stroke-width:1.5px,color:#0F172A;

    class Start start;
    class Shell,Tabs,Home,Inbox,Search,Projects,TaskDetail,ProjectDetail,Status,Streaks,Routines,Settings,Assist,CloudSync,Plus,ProfileMenu screen;
    class CreateTask,TaskPickers,CreateProject,EditProject,ProjectTask modal;
    class RowAction,Complete,RoutineNext,Trash,Seed action;
    class ProjectGate,AssistGate,CloudGate gate;
    class Store,Local,Cloud,Notify data;
```

## UX-Leselogik

- Der Hauptpfad startet in `Heute`: Nutzer planen Aufgaben ueber Datum, Listenabschnitte, Swipe-Gesten und Drag & Drop.
- `Aufgabe erstellen` ist kein eigener Tab, sondern ein kontextabhaengiges Modal. Der gleiche Flow wird aus Heute, Inbox, Projekt und Routinen genutzt.
- `Aufgabendetail` ist der zentrale Bearbeitungsort fuer Eigenschaften, Unteraufgaben, Notizen, Abschluss und Loeschen.
- `Projekte` erweitern die Aufgabenliste zu einem Kanban-Board mit den Spalten `Demnaechst`, `Heute` und `Abgeschlossen`.
- `Status`, `Streaks`, `Routinen`, `Archiv`, `Assist`, `Cloud Sync` und `Einstellungen` sind sekundäre Bereiche ueber das Profilmenue.
- Reminders+ wirkt als Premium-Gate fuer AI Assist, Cloud Sync und mehr als vier aktive Projekte.
