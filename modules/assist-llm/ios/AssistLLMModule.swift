import ExpoModulesCore
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Bridges Apple's Foundation Models to Assist.
///
/// Unlike a stateless bridge, every chat keeps one `LanguageModelSession`, so the
/// model sees the conversation so far, can be prewarmed, and only has to be
/// rebuilt when its context window overflows. Tools are declared from JS and run
/// in JS: a tool call is sent as an `onToolCall` event and the session waits
/// until JS answers through `resolveToolCall` or `rejectToolCall`.
public class AssistLLMModule: Module {
  private let toolCalls = PendingToolCalls()
  private let lock = NSLock()
  private var sessions: [String: AnyObject] = [:]
  private var requests: [String: (sessionId: String, task: Task<Void, Never>)] = [:]

  public func definition() -> ModuleDefinition {
    Name("AssistLLM")

    Events("onToolCall")

    // `{ available, reason? }`. `reason` is one of deviceNotEligible,
    // appleIntelligenceNotEnabled, modelNotReady, unsupportedOS or unknown.
    Function("getAvailability") { () -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available:
          return ["available": true]
        case .unavailable(let reason):
          switch reason {
          case .deviceNotEligible:
            return ["available": false, "reason": "deviceNotEligible"]
          case .appleIntelligenceNotEnabled:
            return ["available": false, "reason": "appleIntelligenceNotEnabled"]
          case .modelNotReady:
            return ["available": false, "reason": "modelNotReady"]
          @unknown default:
            return ["available": false, "reason": "unknown"]
          }
        }
      }
      #endif
      return ["available": false, "reason": "unsupportedOS"]
    }

    // Whether the model can answer in the given BCP 47 locale (e.g. "de-DE").
    Function("supportsLocale") { (identifier: String) -> Bool in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return SystemLanguageModel.default.supportsLocale(Locale(identifier: identifier))
      }
      #endif
      return false
    }

    // `configJson`: { instructions, tools: [{ name, description, parameters }],
    // history: [{ role: "user" | "assistant", content }] }. Replaces an existing
    // session with the same id.
    Function("createSession") { (sessionId: String, configJson: String) throws in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let config = try AssistJSON.object(from: configJson)
        let instructions = config["instructions"] as? String ?? ""
        let toolSpecs = config["tools"] as? [[String: Any]] ?? []
        let history = AssistHistoryEntry.list(from: config["history"])
        let tools = try toolSpecs.map { spec -> BridgedTool in
          try self.makeTool(spec: spec, sessionId: sessionId)
        }
        let box = AssistSessionBox(instructions: instructions, tools: tools, history: history)
        self.withLock { self.sessions[sessionId] = box }
        return
      }
      #endif
      throw AssistLLMException(code: "UNSUPPORTED_OS", message: "Foundation Models need iOS 26 or newer.")
    }

    // Loads the model ahead of the first request.
    Function("prewarm") { (sessionId: String) in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        (self.withLock({ self.sessions[sessionId] }) as? AssistSessionBox)?.prewarm()
      }
      #endif
    }

    // `optionsJson`: { schema?, temperature?, maxTokens? }. Resolves with the
    // response text, or with the JSON of the generated object when a schema is
    // given.
    AsyncFunction("respond") {
      (sessionId: String, requestId: String, prompt: String, optionsJson: String, promise: Promise) in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        guard let box = self.withLock({ self.sessions[sessionId] }) as? AssistSessionBox else {
          promise.reject("NO_SESSION", "Assist session \(sessionId) does not exist.")
          return
        }
        let request: AssistRequest
        do {
          request = try AssistRequest(prompt: prompt, optionsJson: optionsJson)
        } catch {
          promise.reject("INVALID_REQUEST", error.localizedDescription)
          return
        }
        // Registered under the lock so the task cannot remove its entry
        // before it was added.
        self.lock.lock()
        let task = Task {
          do {
            let content = try await box.respond(request)
            promise.resolve(content)
          } catch {
            let (code, message) = AssistErrorMapper.map(error)
            if code == "CANCELLED" {
              box.markInterrupted()
            }
            promise.reject(code, message)
          }
          self.withLock { self.requests[requestId] = nil }
        }
        self.requests[requestId] = (sessionId, task)
        self.lock.unlock()
        return
      }
      #endif
      promise.reject("UNSUPPORTED_OS", "Foundation Models need iOS 26 or newer.")
    }

    Function("cancel") { (requestId: String) in
      guard let request = self.withLock({ self.requests.removeValue(forKey: requestId) }) else {
        return
      }
      request.task.cancel()
      self.toolCalls.cancelAll(sessionId: request.sessionId)
    }

    Function("resolveToolCall") { (callId: String, output: String) in
      self.toolCalls.finish(callId: callId, with: .success(output))
    }

    Function("rejectToolCall") { (callId: String, message: String) in
      self.toolCalls.finish(callId: callId, with: .failure(AssistToolError(message: message)))
    }

    Function("disposeSession") { (sessionId: String) in
      self.withLock { _ = self.sessions.removeValue(forKey: sessionId) }
      self.toolCalls.cancelAll(sessionId: sessionId)
    }
  }

  private func withLock<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, *)
  private func makeTool(spec: [String: Any], sessionId: String) throws -> BridgedTool {
    guard let name = spec["name"] as? String, !name.isEmpty else {
      throw AssistLLMException(code: "INVALID_TOOL", message: "Every tool needs a name.")
    }
    let parameters = try AssistSchema.generationSchema(
      from: spec["parameters"] as? [String: Any] ?? ["type": "object", "properties": []],
      name: name
    )
    let toolCalls = self.toolCalls
    return BridgedTool(
      name: name,
      description: spec["description"] as? String ?? "",
      parameters: parameters
    ) { [weak self] arguments in
      try await toolCalls.wait(sessionId: sessionId) { callId in
        self?.sendEvent("onToolCall", [
          "sessionId": sessionId,
          "callId": callId,
          "name": name,
          "arguments": arguments,
        ])
      }
    }
  }
  #endif
}

// MARK: - Session

#if canImport(FoundationModels)

struct AssistHistoryEntry {
  let isUser: Bool
  let content: String

  static func list(from raw: Any?) -> [AssistHistoryEntry] {
    guard let entries = raw as? [[String: Any]] else { return [] }
    return entries.compactMap { entry in
      guard let content = entry["content"] as? String, !content.isEmpty else { return nil }
      return AssistHistoryEntry(isUser: (entry["role"] as? String) != "assistant", content: content)
    }
  }
}

@available(iOS 26.0, *)
struct AssistRequest {
  let prompt: String
  let schema: GenerationSchema?
  let options: GenerationOptions

  init(prompt: String, optionsJson: String) throws {
    let raw = try AssistJSON.object(from: optionsJson)
    self.prompt = prompt
    if let schema = raw["schema"] as? [String: Any] {
      self.schema = try AssistSchema.generationSchema(from: schema, name: "AssistResponse")
    } else {
      self.schema = nil
    }
    self.options = GenerationOptions(
      temperature: raw["temperature"] as? Double,
      maximumResponseTokens: raw["maxTokens"] as? Int
    )
  }
}

/// One chat. Keeps its own copy of the prompt/answer pairs so the session can
/// be rebuilt with a shorter history when the context window overflows or a
/// request was cancelled halfway through.
@available(iOS 26.0, *)
final class AssistSessionBox {
  /// Pairs kept when the session is rebuilt; the on-device window is 4K
  /// tokens on iOS 26 (8K on newer devices with iOS 27).
  private static let maxHistoryEntries = 8

  private let instructions: String
  private let tools: [BridgedTool]
  private var history: [AssistHistoryEntry]
  private var session: LanguageModelSession
  private var needsRebuild = false
  private let lock = NSLock()

  init(instructions: String, tools: [BridgedTool], history: [AssistHistoryEntry]) {
    self.instructions = instructions
    self.tools = tools
    self.history = Array(history.suffix(Self.maxHistoryEntries))
    self.session = Self.makeSession(instructions: instructions, tools: tools, history: self.history)
  }

  func prewarm() {
    lock.lock()
    let session = self.session
    lock.unlock()
    session.prewarm()
  }

  func markInterrupted() {
    lock.lock()
    needsRebuild = true
    lock.unlock()
  }

  func respond(_ request: AssistRequest) async throws -> String {
    // First retry keeps the last exchange, the second starts from the
    // instructions alone.
    let historyLimits = [2, 0]
    var attempt = 0
    while true {
      let session = currentSession()
      do {
        let content = try await Self.run(request, on: session)
        lock.lock()
        history.append(AssistHistoryEntry(isUser: true, content: request.prompt))
        history.append(AssistHistoryEntry(isUser: false, content: content))
        history = Array(history.suffix(Self.maxHistoryEntries))
        lock.unlock()
        return content
      } catch LanguageModelSession.GenerationError.exceededContextWindowSize(let context) {
        guard attempt < historyLimits.count else {
          throw LanguageModelSession.GenerationError.exceededContextWindowSize(context)
        }
        rebuild(keepingLast: historyLimits[attempt])
        attempt += 1
      }
    }
  }

  private func currentSession() -> LanguageModelSession {
    lock.lock()
    defer { lock.unlock() }
    if needsRebuild {
      needsRebuild = false
      session = Self.makeSession(instructions: instructions, tools: tools, history: history)
    }
    return session
  }

  private func rebuild(keepingLast count: Int) {
    lock.lock()
    defer { lock.unlock() }
    history = count > 0 ? Array(history.suffix(count)) : []
    session = Self.makeSession(instructions: instructions, tools: tools, history: history)
  }

  private static func run(_ request: AssistRequest, on session: LanguageModelSession) async throws -> String {
    if let schema = request.schema {
      let response = try await session.respond(
        to: request.prompt,
        schema: schema,
        includeSchemaInPrompt: true,
        options: request.options
      )
      return response.content.jsonString
    }
    let response = try await session.respond(to: request.prompt, options: request.options)
    return response.content
  }

  private static func makeSession(
    instructions: String,
    tools: [BridgedTool],
    history: [AssistHistoryEntry]
  ) -> LanguageModelSession {
    var entries: [Transcript.Entry] = [
      .instructions(
        Transcript.Instructions(
          segments: [.text(.init(content: instructions))],
          toolDefinitions: tools.map {
            Transcript.ToolDefinition(name: $0.name, description: $0.description, parameters: $0.parameters)
          }
        )
      ),
    ]
    for entry in history {
      let segment = Transcript.Segment.text(.init(content: entry.content))
      if entry.isUser {
        entries.append(.prompt(Transcript.Prompt(segments: [segment])))
      } else {
        entries.append(.response(Transcript.Response(assetIDs: [], segments: [segment])))
      }
    }
    return LanguageModelSession(
      model: SystemLanguageModel.default,
      tools: tools,
      transcript: Transcript(entries: entries)
    )
  }
}

// MARK: - Tools

@available(iOS 26.0, *)
struct BridgedTool: Tool {
  let name: String
  let description: String
  let parameters: GenerationSchema
  let invoke: @Sendable (String) async throws -> String

  init(
    name: String,
    description: String,
    parameters: GenerationSchema,
    invoke: @escaping @Sendable (String) async throws -> String
  ) {
    self.name = name
    self.description = description
    self.parameters = parameters
    self.invoke = invoke
  }

  func call(arguments: GeneratedContent) async throws -> String {
    try await invoke(arguments.jsonString)
  }
}

// MARK: - Schema

/// Builds a `GenerationSchema` from Assist's schema format. Object properties
/// are an ordered array (`[{ name, description?, optional?, schema }]`) because
/// the model generates fields in declaration order and a JSON object would
/// lose it on the way through `JSONSerialization`.
@available(iOS 26.0, *)
enum AssistSchema {
  static func generationSchema(from node: [String: Any], name: String) throws -> GenerationSchema {
    try GenerationSchema(root: dynamicSchema(from: node, name: name), dependencies: [])
  }

  private static func dynamicSchema(from node: [String: Any], name: String) throws -> DynamicGenerationSchema {
    let type = node["type"] as? String ?? "object"
    switch type {
    case "object":
      let properties = try (node["properties"] as? [[String: Any]] ?? []).map { property in
        guard let propertyName = property["name"] as? String else {
          throw AssistLLMException(code: "INVALID_SCHEMA", message: "Property without name in \(name).")
        }
        return DynamicGenerationSchema.Property(
          name: propertyName,
          description: property["description"] as? String,
          schema: try dynamicSchema(
            from: property["schema"] as? [String: Any] ?? ["type": "string"],
            name: "\(name)_\(propertyName)"
          ),
          isOptional: property["optional"] as? Bool ?? false
        )
      }
      return DynamicGenerationSchema(
        name: name,
        description: node["description"] as? String,
        properties: properties
      )
    case "string":
      if let values = node["enum"] as? [String], !values.isEmpty {
        return DynamicGenerationSchema(type: String.self, guides: [GenerationGuide.anyOf(values)])
      }
      return DynamicGenerationSchema(type: String.self, guides: [])
    case "integer":
      var guides: [GenerationGuide<Int>] = []
      if let minimum = node["minimum"] as? Int { guides.append(GenerationGuide.minimum(minimum)) }
      if let maximum = node["maximum"] as? Int { guides.append(GenerationGuide.maximum(maximum)) }
      return DynamicGenerationSchema(type: Int.self, guides: guides)
    case "number":
      return DynamicGenerationSchema(type: Double.self, guides: [])
    case "boolean":
      return DynamicGenerationSchema(type: Bool.self, guides: [])
    case "array":
      guard let items = node["items"] as? [String: Any] else {
        throw AssistLLMException(code: "INVALID_SCHEMA", message: "Array \(name) needs items.")
      }
      return DynamicGenerationSchema(
        arrayOf: try dynamicSchema(from: items, name: "\(name)_item"),
        minimumElements: nil,
        maximumElements: node["maxItems"] as? Int
      )
    default:
      throw AssistLLMException(code: "INVALID_SCHEMA", message: "Unsupported type \(type) in \(name).")
    }
  }
}

// MARK: - Errors

@available(iOS 26.0, *)
enum AssistErrorMapper {
  static func map(_ error: Error) -> (String, String) {
    if error is CancellationError {
      return ("CANCELLED", "The request was cancelled.")
    }
    if let toolError = error as? LanguageModelSession.ToolCallError {
      if toolError.underlyingError is CancellationError {
        return ("CANCELLED", "The request was cancelled.")
      }
      return ("TOOL", toolError.underlyingError.localizedDescription)
    }
    if let generationError = error as? LanguageModelSession.GenerationError {
      switch generationError {
      case .exceededContextWindowSize:
        return ("CONTEXT_WINDOW", generationError.localizedDescription)
      case .guardrailViolation:
        return ("GUARDRAIL", generationError.localizedDescription)
      case .unsupportedLanguageOrLocale:
        return ("UNSUPPORTED_LANGUAGE", generationError.localizedDescription)
      case .assetsUnavailable:
        return ("MODEL_UNAVAILABLE", generationError.localizedDescription)
      case .rateLimited:
        return ("RATE_LIMITED", generationError.localizedDescription)
      default:
        return ("GENERATION", generationError.localizedDescription)
      }
    }
    if let exception = error as? AssistLLMException {
      return (exception.code, exception.message)
    }
    return ("GENERATION", error.localizedDescription)
  }
}

#endif

// MARK: - Shared helpers

enum AssistJSON {
  static func object(from json: String) throws -> [String: Any] {
    guard !json.isEmpty else { return [:] }
    guard
      let data = json.data(using: .utf8),
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw AssistLLMException(code: "INVALID_JSON", message: "Expected a JSON object.")
    }
    return object
  }
}

struct AssistLLMException: LocalizedError {
  let code: String
  let message: String
  var errorDescription: String? { message }
}

struct AssistToolError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

/// Tool calls waiting for JS. A call is finished exactly once: by JS, or by a
/// cancel of its request or session.
final class PendingToolCalls: @unchecked Sendable {
  private let lock = NSLock()
  private var pending: [String: (sessionId: String, continuation: CheckedContinuation<String, Error>)] = [:]

  func wait(sessionId: String, emit: @escaping (String) -> Void) async throws -> String {
    let callId = UUID().uuidString
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        lock.lock()
        pending[callId] = (sessionId, continuation)
        lock.unlock()
        emit(callId)
      }
    } onCancel: {
      self.finish(callId: callId, with: .failure(CancellationError()))
    }
  }

  func finish(callId: String, with result: Result<String, Error>) {
    lock.lock()
    let entry = pending.removeValue(forKey: callId)
    lock.unlock()
    entry?.continuation.resume(with: result)
  }

  func cancelAll(sessionId: String) {
    lock.lock()
    let ids = pending.filter { $0.value.sessionId == sessionId }.map(\.key)
    let entries = ids.compactMap { pending.removeValue(forKey: $0) }
    lock.unlock()
    for entry in entries {
      entry.continuation.resume(throwing: CancellationError())
    }
  }
}
