import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct TasksWidget: Widget {
  let name: String = "TasksWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Heute")
    .description("Deine offenen Aufgaben für heute – direkt abhakbar.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}