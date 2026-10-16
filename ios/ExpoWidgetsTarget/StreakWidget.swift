import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct StreakWidget: Widget {
  let name: String = "StreakWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Streak")
    .description("Your streak of completed days at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}