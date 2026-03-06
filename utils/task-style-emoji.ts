export type TaskStyleEmojiOption = {
  emoji: string;
  label: string;
  keywords: readonly string[];
};

export type TaskStyleEmojiMatch = {
  emoji: string;
  keyword: string;
  option: TaskStyleEmojiOption;
  score: number;
};

type EmojibaseCompactEntry = {
  group?: number;
  label: string;
  unicode: string;
  tags?: readonly string[];
  emoticon?: string | readonly string[];
};

const DE_EMOJIBASE_COMPACT = require('emojibase-data/de/compact.json') as readonly EmojibaseCompactEntry[];
const EN_EMOJIBASE_COMPACT = require('emojibase-data/en/compact.json') as readonly EmojibaseCompactEntry[];

export const TASK_STYLE_COLOR_SWATCHES = [
  '#34C759',
  '#0A84FF',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#5E5CE6',
  '#32D74B',
  '#FFD60A',
  '#64D2FF',
  '#FF2D55',
  '#8E8E93',
  '#1C1C1E',
] as const;

const option = (
  emoji: string,
  label: string,
  keywords: readonly string[],
): TaskStyleEmojiOption => ({
  emoji,
  label,
  keywords,
});

const TASK_STYLE_MATCH_EMOJI_OPTIONS: readonly TaskStyleEmojiOption[] = [
  option('✅', 'Erledigt', ['erledigt', 'done', 'check', 'haken', 'abhaken', 'abschliessen', 'abschließen', 'fertig', 'complete']),
  option('📋', 'Checklist', ['checklist', 'checkliste', 'todo', 'to-do', 'aufgabe', 'aufgaben', 'task', 'tasks', 'liste']),
  option('📝', 'Notiz', ['notiz', 'memo', 'entwurf', 'draft', 'schreiben', 'text', 'notieren', 'journal']),
  option('🗒️', 'Protokoll', ['protokoll', 'minutes', 'meetingnotes', 'mitschrift', 'zusammenfassung']),
  option('📌', 'Wichtig', ['wichtig', 'pin', 'merken', 'prioritaet', 'priorität', 'urgent', 'dringend']),
  option('⭐', 'Favorit', ['favorit', 'favorite', 'star', 'highlight', 'bestof']),
  option('🔥', 'Fokus', ['fokus', 'focus', 'deepwork', 'konzentrieren', 'priority']),
  option('✨', 'Feinschliff', ['feinschliff', 'polish', 'glanz', 'shine', 'aufräumen']),
  option('💡', 'Idee', ['idee', 'einfall', 'brainstorm', 'konzept', 'inspiration']),
  option('🎯', 'Ziel', ['ziel', 'goal', 'okr', 'meilenstein', 'target', 'milestone']),
  option('🧠', 'Denken', ['denken', 'review', 'reflektieren', 'analyse', 'konzept', 'nachdenken']),
  option('🧭', 'Planung', ['plan', 'planung', 'roadmap', 'strategie', 'agenda', 'vorbereiten']),
  option('📞', 'Anruf', ['anruf', 'anrufen', 'call', 'telefon', 'telefonat', 'telefonieren', 'rueckruf', 'rückruf', 'videocall', 'zoom']),
  option('💬', 'Chat', ['chat', 'slack', 'teams', 'whatsapp', 'sms', 'dm', 'message', 'nachrichten', 'chatten', 'kommunikation']),
  option('✉️', 'Mail', ['mail', 'email', 'e-mail', 'nachricht', 'antwort', 'reply', 'postfach', 'inbox', 'post', 'gmail', 'outlook', 'mailen', 'senden']),
  option('👥', 'Team', ['team', 'standup', 'retro', 'kollegen', 'kollegin', '1on1', '1:1', 'sync']),
  option('🤝', 'Kunde', ['kunde', 'customer', 'sales', 'vertrieb', 'crm', 'angebot', 'deal', 'lead']),
  option('💼', 'Arbeit', ['arbeit', 'work', 'office', 'job', 'business', 'firma', 'beruf']),
  option('🗓️', 'Termin', ['termin', 'appointment', 'kalender', 'event', 'meeting', 'besprechung', 'date', 'interview', 'sprechstunde']),
  option('⏰', 'Erinnerung', ['reminder', 'alarm', 'wecker', 'timer', 'remember']),
  option('📚', 'Lernen', ['lernen', 'study', 'kurs', 'pruefung', 'prüfung', 'lesen', 'buch', 'fortbildung']),
  option('📄', 'Dokument', ['dokument', 'doc', 'unterlage', 'pdf', 'brief', 'formular']),
  option('✏️', 'Schreiben', ['schreiben', 'texten', 'editieren', 'copy', 'formulieren', 'aufsatz']),
  option('📎', 'Anhang', ['anhang', 'attachment', 'dateianhang', 'beifuegen', 'beifügen']),
  option('📁', 'Dateien', ['datei', 'files', 'ordner', 'folder', 'ablage', 'dokumente']),
  option('🗂️', 'Organisation', ['organisieren', 'ordnung', 'ablage', 'sortieren', 'struktur', 'strukturieren']),
  option('📊', 'Report', ['report', 'bericht', 'analyse', 'zahlen', 'kpi', 'dashboard', 'auswertung']),
  option('📈', 'Wachstum', ['wachstum', 'growth', 'umsatz', 'funnel', 'performance', 'conversion']),
  option('📣', 'Marketing', ['marketing', 'kampagne', 'campaign', 'newsletter', 'social', 'launch']),
  option('🌐', 'Website', ['website', 'web', 'landingpage', 'domain', 'dns', 'seo', 'homepage']),
  option('💻', 'Code', ['code', 'coding', 'dev', 'entwicklung', 'programmieren', 'software', 'app', 'feature', 'developer', 'engineering', 'typescript', 'react', 'frontend', 'backend']),
  option('🧑‍💻', 'Computer', ['computer', 'laptop', 'desktop', 'terminal', 'macbook', 'pc']),
  option('🐞', 'Bug', ['bug', 'fehler', 'fix', 'issue', 'debug', 'bugfix', 'defekt', 'regression', 'incident', 'stoerung', 'störung']),
  option('🧪', 'Test', ['test', 'qa', 'experiment', 'versuch', 'hypothese', 'testen']),
  option('🔍', 'Recherche', ['recherche', 'suche', 'search', 'googeln', 'forschung', 'investigation']),
  option('🧩', 'Problem', ['problem', 'raetsel', 'rätsel', 'loesung', 'lösung', 'knackpunkt']),
  option('⚙️', 'Einstellungen', ['einstellung', 'settings', 'setup', 'config', 'konfiguration', 'konfigurieren']),
  option('🧰', 'Tools', ['tool', 'tools', 'werkzeug', 'tooling', 'dependency', 'dependencies']),
  option('🔨', 'Build', ['build', 'bauen', 'compile', 'kompilieren', 'pipeline']),
  option('🚀', 'Release', ['deploy', 'deployment', 'release', 'ship', 'launch', 'go-live']),
  option('💾', 'Backup', ['backup', 'sichern', 'export', 'save', 'snapshot']),
  option('🎨', 'Design', ['design', 'ui', 'ux', 'layout', 'branding', 'grafik', 'wireframe', 'figma', 'prototype', 'prototyp', 'gestalten', 'creative']),
  option('🖼️', 'Grafik', ['grafik', 'visual', 'mockup', 'illustration', 'asset']),
  option('📷', 'Foto', ['foto', 'camera', 'kamera', 'shoot', 'photography', 'bilder']),
  option('🎬', 'Video', ['video', 'film', 'clip', 'recording', 'aufnahme', 'schnitt']),
  option('🎧', 'Audio', ['audio', 'podcast', 'sound', 'hoeren', 'hören', 'aufnahme']),
  option('🎵', 'Musik', ['musik', 'song', 'playlist', 'track', 'album']),
  option('🎮', 'Gaming', ['gaming', 'game', 'spielen', 'konsole', 'steam']),
  option('🛒', 'Einkauf', ['einkauf', 'einkaufen', 'shopping', 'supermarkt', 'drogerie', 'kaufen', 'bestellen', 'einkaufsliste', 'groceries', 'lebensmittel', 'besorgen']),
  option('🛍️', 'Shop', ['shop', 'store', 'retail', 'boutique', 'laden']),
  option('📦', 'Paket', ['paket', 'lieferung', 'versand', 'sendung', 'shipment', 'order', 'retoure', 'ruecksenden', 'rücksenden']),
  option('🚚', 'Transport', ['transport', 'kurier', 'abholen', 'lieferdienst', 'zustellung']),
  option('🧾', 'Rechnung', ['rechnung', 'invoice', 'beleg', 'quittung', 'abrechnung', 'zahlung', 'spesenabrechnung']),
  option('💸', 'Ausgabe', ['ausgabe', 'kosten', 'expense', 'spesen', 'bezahlen']),
  option('💰', 'Finanzen', ['finanz', 'budget', 'geld', 'zahlung', 'ueberweisen', 'überweisen', 'cashflow']),
  option('💳', 'Karte', ['karte', 'card', 'kreditkarte', 'debitkarte', 'zahlungsmittel']),
  option('🏦', 'Bank', ['bank', 'konto', 'iban', 'abrechnung', 'ueberweisung', 'überweisung']),
  option('⚖️', 'Recht', ['vertrag', 'legal', 'anwalt', 'recht', 'compliance', 'datenschutz']),
  option('🏛️', 'Amt', ['amt', 'behoerde', 'behörde', 'buergeramt', 'bürgeramt', 'formular']),
  option('🪪', 'Ausweis', ['ausweis', 'passport', 'pass', 'fuehrerschein', 'führerschein', 'id']),
  option('🍽️', 'Essen', ['essen', 'mahlzeit', 'restaurant', 'dinner', 'lunch', 'fruehstueck', 'frühstück', 'mittagessen', 'abendessen']),
  option('🧑‍🍳', 'Kochen', ['kochen', 'cook', 'rezept', 'mealprep', 'kueche', 'küche', 'backen']),
  option('🥗', 'Ernaehrung', ['ernaehrung', 'ernährung', 'salat', 'nutrition', 'mealprep']),
  option('🍎', 'Gesund essen', ['obst', 'vitamine', 'gesund', 'fruit', 'apfel']),
  option('☕️', 'Kaffee', ['kaffee', 'coffee', 'espresso', 'cafe', 'café', 'latte']),
  option('🏃‍♂️', 'Sport', ['sport', 'training', 'lauf', 'joggen', 'fitness', 'workout', 'cardio', 'run', 'running', 'jog']),
  option('🏋️‍♂️', 'Gym', ['gym', 'krafttraining', 'weights', 'lifting', 'hantel']),
  option('🚴‍♂️', 'Radfahren', ['radfahren', 'cycling', 'bike', 'fahrradtraining', 'tour']),
  option('🏊‍♂️', 'Schwimmen', ['schwimmen', 'swim', 'pool', 'bahnen']),
  option('🚶‍♂️', 'Spazieren', ['spaziergang', 'walk', 'gehen', 'runde', 'laufen']),
  option('🧘‍♂️', 'Meditation', ['meditation', 'meditieren', 'yoga', 'entspannung', 'atmung', 'stretching', 'ruhe', 'mindfulness']),
  option('😴', 'Schlaf', ['schlaf', 'sleep', 'nap', 'ruhen', 'bett']),
  option('💊', 'Medikamente', ['medikament', 'tablette', 'medizin', 'pille', 'rezept']),
  option('🩺', 'Arzt', ['arzt', 'doctor', 'therapie', 'physio', 'gesundheit', 'klinik', 'praxis', 'arzttermin', 'checkup', 'untersuchung', 'diagnose']),
  option('🦷', 'Zahnarzt', ['zahnarzt', 'dental', 'zahn', 'prophylaxe']),
  option('👓', 'Optik', ['brille', 'optiker', 'linsen', 'sehstaerke', 'sehstärke']),
  option('💇‍♂️', 'Friseur', ['friseur', 'haircut', 'barber', 'haare', 'schnitt']),
  option('🏠', 'Zuhause', ['zuhause', 'home', 'haus', 'wohnung', 'privat', 'haushalt', 'miete']),
  option('🧹', 'Putzen', ['putzen', 'reinigen', 'clean', 'sauber', 'saugen', 'wischen', 'declutter', 'aufräumen']),
  option('🧼', 'Hygiene', ['hygiene', 'duschen', 'shower', 'bad', 'waschen']),
  option('🧺', 'Waesche', ['waesche', 'wäsche', 'waschen', 'trocknen', 'buegeln', 'bügeln']),
  option('🛠️', 'Reparatur', ['reparatur', 'repair', 'bauen', 'werkstatt', 'fixen']),
  option('🔧', 'Wartung', ['wartung', 'maintenance', 'service', 'einstellen', 'anpassen']),
  option('🔒', 'Sicherheit', ['sicherheit', 'secure', 'passwort', 'privacy', 'schutz']),
  option('🔑', 'Zugang', ['zugang', 'login', 'schluessel', 'schlüssel', 'key', 'account']),
  option('📱', 'Handy', ['handy', 'smartphone', 'iphone', 'android', 'mobil', 'phone']),
  option('🚗', 'Auto', ['auto', 'car', 'fahren', 'fahrzeug', 'werkstatt', 'fahrt', 'autofahrt']),
  option('⛽', 'Tanken', ['tanken', 'fuel', 'gas', 'tankstelle']),
  option('🅿️', 'Parken', ['parken', 'parking', 'parkticket']),
  option('🚌', 'Pendeln', ['pendeln', 'commute', 'bus', 'nahverkehr', 'oepnv', 'öpnv']),
  option('🚲', 'Fahrrad', ['fahrrad', 'bike', 'rad', 'cycling', 'velo']),
  option('🚆', 'Zug', ['zug', 'train', 'bahn', 'ice']),
  option('✈️', 'Reise', ['reise', 'travel', 'trip', 'flug', 'urlaub', 'hotel', 'reisen', 'buchen', 'booking', 'vacation', 'holiday']),
  option('🧳', 'Packen', ['packen', 'packing', 'koffer', 'luggage', 'suitcase']),
  option('🏨', 'Hotel', ['hotel', 'unterkunft', 'accommodation', 'checkin', 'checkout']),
  option('🎟️', 'Ticket', ['ticket', 'booking', 'buchung', 'reservation', 'reservierung']),
  option('📍', 'Ort', ['ort', 'location', 'adresse', 'weg', 'route', 'navi']),
  option('🎁', 'Geschenk', ['geschenk', 'gift', 'present', 'ueberraschung', 'überraschung']),
  option('🎉', 'Feier', ['party', 'feier', 'geburtstag', 'event', 'jubilaeum', 'jubiläum']),
  option('❤️', 'Beziehung', ['liebe', 'beziehung', 'partner', 'familie', 'heart', 'date']),
  option('👶', 'Kind', ['baby', 'kind', 'kita', 'daycare', 'eltern']),
  option('🎒', 'Schule', ['schule', 'hausaufgaben', 'homework', 'unterricht', 'schulranzen']),
  option('🌿', 'Pflanzen', ['pflanze', 'garten', 'blumen', 'garden', 'giesen', 'gießen', 'pflanzenpflege', 'umtopfen']),
  option('🌳', 'Natur', ['natur', 'park', 'wandern', 'hike', 'outdoor']),
  option('☀️', 'Wetter', ['wetter', 'weather', 'sonne', 'forecast', 'regen']),
  option('🐶', 'Haustier', ['hund', 'haustier', 'gassi', 'pet', 'tierarzt']),
  option('🐱', 'Katze', ['katze', 'cat', 'kater', 'katzenklo']),
  option('📥', 'Inbox', ['inbox', 'eingang', 'posteingang', 'eingangskorb', 'sichten', 'durchsehen']),
  option('📤', 'Versand', ['versand', 'absenden', 'abschicken', 'submit', 'einreichen', 'verschicken']),
  option('🔔', 'Benachrichtigung', ['benachrichtigung', 'notification', 'push', 'hinweis', 'alert', 'meldungen']),
  option('🗣️', 'Gespraech', ['gespraech', 'gespräch', 'reden', 'austausch', 'diskussion', 'talk']),
  option('🎤', 'Praesentation', ['praesentation', 'präsentation', 'vortrag', 'pitch', 'demo', 'referat', 'moderation']),
  option('📖', 'Lesen', ['lesen', 'read', 'readme', 'dokumentation', 'lektuere', 'lektüre', 'kapitel', 'manual']),
  option('📰', 'News', ['news', 'neuigkeiten', 'presse', 'headline', 'blogpost', 'artikel']),
  option('🤖', 'KI', ['ki', 'ai', 'bot', 'automation', 'automatisierung', 'llm', 'prompt', 'agent']),
  option('☁️', 'Cloud', ['cloud', 'hosting', 'infra', 'infrastruktur', 'serverless', 'aws', 'vercel', 'netlify']),
  option('🛜', 'WLAN', ['wlan', 'wifi', 'wi-fi', 'internet', 'router', 'online']),
  option('🖥️', 'Server', ['server', 'vm', 'uptime', 'host', 'remote', 'maschine']),
  option('🔋', 'Akku', ['akku', 'battery', 'ladenstand', 'strom', 'energie', 'akkustand']),
  option('🔌', 'Laden', ['aufladen', 'laden', 'charger', 'netzteil', 'stecker', 'anschliessen', 'anschließen']),
  option('📡', 'Netzwerk', ['netzwerk', 'lan', 'vpn', 'proxy', 'signal', 'verbindung', 'empfang']),
  option('💵', 'Gehalt', ['gehalt', 'salary', 'lohn', 'payroll', 'auszahlung', 'honorar']),
  option('🪙', 'Sparen', ['sparen', 'sparziel', 'ruecklage', 'rücklage', 'trinkgeld', 'wechselgeld']),
  option('📉', 'Verlust', ['verlust', 'minus', 'rueckgang', 'rückgang', 'decline', 'drop', 'abschwung']),
  option('🧮', 'Buchhaltung', ['buchhaltung', 'accounting', 'kalkulation', 'berechnung', 'steuer', 'abrechnen']),
  option('📅', 'Kalender', ['kalenderwoche', 'wochenplan', 'monatsplan', 'wochenuebersicht', 'wochenübersicht', 'calendar']),
  option('🧑‍🏫', 'Coaching', ['coaching', 'workshop', 'mentor', 'mentoring', 'schulung', 'unterrichten']),
  option('🎓', 'Studium', ['studium', 'uni', 'universitaet', 'universität', 'semester', 'abschluss', 'graduation']),
  option('🏆', 'Wettbewerb', ['wettbewerb', 'award', 'preis', 'ranking', 'meisterschaft', 'gewinnen']),
  option('💒', 'Hochzeit', ['hochzeit', 'wedding', 'trauung', 'ehe', 'standesamt']),
  option('🍼', 'Baby', ['babyflasche', 'füttern', 'fuettern', 'milch', 'babynahrung', 'stillen']),
  option('🍕', 'Pizza', ['pizza', 'pizzeria', 'lieferpizza']),
  option('🍣', 'Sushi', ['sushi', 'nigiri', 'maki']),
  option('🍞', 'Backen', ['backen', 'brot', 'baeckerei', 'bäckerei', 'gebaeck', 'gebäck']),
  option('🍻', 'Bar', ['bar', 'bier', 'happyhour', 'drink', 'drinks', 'kneipe']),
  option('🚿', 'Dusche', ['dusche', 'duschen', 'abduschen']),
  option('🪥', 'Zahnpflege', ['zaehneputzen', 'zähneputzen', 'zahnpflege', 'zahnbuerste', 'zahnbürste', 'toothbrush']),
  option('🧴', 'Pflege', ['pflege', 'skincare', 'hautpflege', 'eincremen', 'sonnencreme', 'kosmetik']),
  option('💉', 'Impfung', ['impfung', 'impfen', 'spritze', 'vaccine', 'injektion']),
  option('🩹', 'Erste Hilfe', ['pflaster', 'wunde', 'erste hilfe', 'first aid', 'verletzung', 'versorgung']),
  option('🚑', 'Notfall', ['notfall', 'emergency', 'akut', 'rettung', 'ambulanz']),
  option('🛏️', 'Erholung', ['erholung', 'rest', 'ausruhen', 'liegen', 'bett', 'ruhepause']),
  option('🛋️', 'Wohnen', ['wohnzimmer', 'innenraum', 'interior', 'sofa', 'einrichten', 'dekorieren']),
  option('🪑', 'Moebel', ['moebel', 'möbel', 'stuhl', 'tisch', 'montieren', 'aufbauen']),
  option('🪴', 'Pflanzenpflege', ['pflanzenpflege', 'umtopfen', 'duengen', 'düngen', 'zimmerpflanze', 'topfpflanze']),
  option('🚕', 'Taxi', ['taxi', 'uber', 'lyft', 'fahrt buchen']),
  option('🚇', 'U-Bahn', ['u-bahn', 'ubahn', 'metro', 'subway', 's-bahn']),
  option('🗺️', 'Route', ['route', 'karte', 'maps', 'wegbeschreibung', 'navigation', 'anreise']),
  option('🏕️', 'Camping', ['camping', 'zelt', 'campground', 'campsite']),
  option('🏖️', 'Strand', ['strand', 'beach', 'meer', 'sonnen', 'badeurlaub']),
  option('🏔️', 'Wandern', ['wandern', 'bergtour', 'hiking', 'trail', 'gipfel']),
  option('⚽', 'Fussball', ['fussball', 'fußball', 'soccer', 'football', 'spieltag']),
  option('🏀', 'Basketball', ['basketball', 'nba', 'korbball']),
  option('🎾', 'Tennis', ['tennis', 'racket', 'aufschlag']),
  option('🎭', 'Theater', ['theater', 'buehne', 'bühne', 'auffuehrung', 'aufführung', 'schauspiel']),
  option('🎫', 'Eintritt', ['eintritt', 'admission', 'pass', 'einlass']),
  option('🪩', 'Ausgehen', ['ausgehen', 'club', 'disco', 'nachtleben', 'tanzen']),
  option('📺', 'Fernsehen', ['fernsehen', 'tv', 'stream', 'serie', 'show', 'filmabend']),
  option('🧬', 'Forschung', ['forschung', 'wissenschaft', 'genetik', 'studie', 'science', 'research']),
  option('🔬', 'Labor', ['labor', 'mikroskop', 'probe', 'lab', 'auswertung']),
];

function asStringArray(value: string | readonly string[] | undefined): readonly string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

function shouldIncludeEmojibaseEntry(entry: EmojibaseCompactEntry) {
  if (entry.group === undefined || !entry.unicode || !entry.label) {
    return false;
  }

  const label = entry.label.toLowerCase();
  if (label.startsWith('regional indicator') || label.startsWith('regionaler indikator')) {
    return false;
  }
  if (label.includes('skin tone') || label.includes('hautfarbe')) {
    return false;
  }

  return true;
}

function buildTaskStyleSearchOnlyEmojiOptions(): readonly TaskStyleEmojiOption[] {
  const merged = new Map<string, { label: string; keywords: Set<string> }>();

  for (const localeEntries of [DE_EMOJIBASE_COMPACT, EN_EMOJIBASE_COMPACT]) {
    for (const entry of localeEntries) {
      if (!shouldIncludeEmojibaseEntry(entry)) continue;

      const existing = merged.get(entry.unicode) ?? {
        label: entry.label,
        keywords: new Set<string>(),
      };

      for (const keyword of [entry.label, ...(entry.tags ?? []), ...asStringArray(entry.emoticon)]) {
        const normalizedKeyword = keyword.trim();
        if (normalizedKeyword) {
          existing.keywords.add(normalizedKeyword);
        }
      }

      merged.set(entry.unicode, existing);
    }
  }

  return Array.from(merged.entries(), ([emoji, value]) =>
    option(emoji, value.label, Array.from(value.keywords))
  );
}

const TASK_STYLE_SEARCH_ONLY_EMOJI_OPTIONS: readonly TaskStyleEmojiOption[] =
  buildTaskStyleSearchOnlyEmojiOptions();

function mergeTaskStyleEmojiOptions(...groups: readonly (readonly TaskStyleEmojiOption[])[]) {
  const merged = new Map<string, TaskStyleEmojiOption>();

  for (const group of groups) {
    for (const candidate of group) {
      const existing = merged.get(candidate.emoji);
      if (!existing) {
        merged.set(candidate.emoji, candidate);
        continue;
      }

      const nextKeywords = Array.from(new Set([...existing.keywords, ...candidate.keywords]));
      merged.set(candidate.emoji, {
        emoji: candidate.emoji,
        label: existing.label,
        keywords: nextKeywords,
      });
    }
  }

  return Array.from(merged.values());
}

export const TASK_STYLE_EMOJI_OPTIONS = mergeTaskStyleEmojiOptions(
  TASK_STYLE_MATCH_EMOJI_OPTIONS,
  TASK_STYLE_SEARCH_ONLY_EMOJI_OPTIONS,
);

export function normalizeTaskStyleSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeTaskStyleSearch(value: string) {
  const normalized = normalizeTaskStyleSearch(value);
  return normalized.length > 0 ? normalized.split(' ') : [];
}

function hasExactPhrase(haystack: string, needle: string) {
  return ` ${haystack} `.includes(` ${needle} `);
}

function scoreKeywordAgainstText(keyword: string, normalizedText: string, textTokens: readonly string[]) {
  if (!keyword) return 0;

  if (hasExactPhrase(normalizedText, keyword)) {
    return 1000 + keyword.length;
  }

  const keywordTokens = keyword.split(' ');
  if (keywordTokens.length > 1) {
    for (let index = 0; index <= textTokens.length - keywordTokens.length; index += 1) {
      const didMatchPhrase = keywordTokens.every((token, tokenIndex) => {
        const textToken = textTokens[index + tokenIndex];
        return textToken === token || (token.length >= 4 && textToken?.startsWith(token));
      });
      if (didMatchPhrase) {
        return 850 + keyword.length;
      }
    }
  }

  if (keywordTokens.length === 1) {
    const [singleKeyword] = keywordTokens;
    if (!singleKeyword) return 0;

    for (const textToken of textTokens) {
      if (textToken === singleKeyword) return 900 + singleKeyword.length;
      if (singleKeyword.length >= 4 && textToken.startsWith(singleKeyword)) {
        return 720 + singleKeyword.length;
      }
      if (singleKeyword.length >= 4 && textToken.includes(singleKeyword)) {
        return 560 + singleKeyword.length;
      }
    }
  }

  return 0;
}

function scoreOptionForSearch(option: TaskStyleEmojiOption, query: string, queryTokens: readonly string[]) {
  if (!query) return 1;
  if (option.emoji === query) return 3000;

  const normalizedLabel = normalizeTaskStyleSearch(option.label);
  const normalizedKeywords = option.keywords.map((keyword) => normalizeTaskStyleSearch(keyword));
  const searchParts = [normalizedLabel, ...normalizedKeywords].filter(Boolean);

  let bestScore = 0;
  for (const part of searchParts) {
    if (part === query) {
      bestScore = Math.max(bestScore, 2200 + part.length);
      continue;
    }
    if (part.includes(query)) {
      bestScore = Math.max(bestScore, 1800 + query.length);
      continue;
    }

    const partTokens = part.split(' ');
    const queryMatches = queryTokens.every((queryToken) =>
      partTokens.some((partToken) =>
        partToken.startsWith(queryToken) || queryToken.startsWith(partToken)
      )
    );
    if (queryMatches) {
      bestScore = Math.max(bestScore, 1200 + query.length);
    }
  }

  return bestScore;
}

export function findTaskStyleEmojiMatch(value: string): TaskStyleEmojiMatch | null {
  const normalizedText = normalizeTaskStyleSearch(value);
  if (!normalizedText) return null;

  const textTokens = tokenizeTaskStyleSearch(normalizedText);
  let bestMatch: TaskStyleEmojiMatch | null = null;

  for (const option of TASK_STYLE_MATCH_EMOJI_OPTIONS) {
    for (const rawKeyword of [option.label, ...option.keywords]) {
      const normalizedKeyword = normalizeTaskStyleSearch(rawKeyword);
      const score = scoreKeywordAgainstText(normalizedKeyword, normalizedText, textTokens);
      if (score <= 0) continue;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          emoji: option.emoji,
          keyword: rawKeyword,
          option,
          score,
        };
      }
    }
  }

  return bestMatch;
}

export function filterTaskStyleEmojiOptions(query: string) {
  const normalizedQuery = normalizeTaskStyleSearch(query);
  const queryTokens = tokenizeTaskStyleSearch(normalizedQuery);

  return TASK_STYLE_EMOJI_OPTIONS
    .map((option, index) => ({
      option,
      index,
      score: scoreOptionForSearch(option, normalizedQuery, queryTokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map(({ option }) => option);
}
