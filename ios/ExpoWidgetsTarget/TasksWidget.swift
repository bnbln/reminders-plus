import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct TasksWidget: Widget {
  let name: String = "TasksWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Your open tasks for today, ready to check off.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}