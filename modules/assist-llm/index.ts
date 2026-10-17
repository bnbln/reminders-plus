import { Platform } from "react-native";
import {
  type EventSubscription,
  NativeModule,
  requireOptionalNativeModule,
} from "expo-modules-core";

/**
 * Assist's bridge to Apple Foundation Models (iOS 26+), backed by the
 * `AssistLLM` Swift module. One `AssistSession` is one chat: the native session
 * keeps the conversation, tools run here in JS, and answers can be constrained
 * to a schema (guided generation), so they always parse.
 */

export type AssistSchemaNode =
  | AssistObjectSchema
  | { type: "string"; enum?: readonly string[] }
  | { type: "integer"; minimum?: number; maximum?: number }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "array"; items: AssistSchemaNode; maxItems?: number };

/**
 * Properties are an ordered list: the model fills them in this order, so put
 * what later fields depend on (e.g. `intent`) first.
 */
export type AssistObjectSchema = {
  type: "object";
  description?: string;
  properties: AssistSchemaProperty[];
};

export type AssistSchemaProperty = {
  name: string;
  description?: string;
  optional?: boolean;
  schema: AssistSchemaNode;
};

export type AssistToolDefinition<Input = any, Output = any> = {
  name: string;
  description: string;
  parameters: AssistObjectSchema;
  execute: (input: Input) => Promise<Output> | Output;
  /**
   * What the model reads back. Defaults to the JSON of `execute`'s result;
   * keep it small, every token counts against the context window.
   */
  toModelOutput?: (output: Output) => unknown;
};

export type AssistHistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

export type AssistUnavailableReason =
  | "deviceNotEligible"
  | "appleIntelligenceNotEnabled"
  | "modelNotReady"
  | "unsupportedOS"
  | "unknown";

export type AssistAvailability =
  | { available: true }
  | { available: false; reason: AssistUnavailableReason };

export type AssistErrorCode =
  | "CANCELLED"
  | "CONTEXT_WINDOW"
  | "GUARDRAIL"
  | "UNSUPPORTED_LANGUAGE"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "TOOL"
  | "GENERATION"
  | "UNSUPPORTED_OS";

export class AssistLLMError extends Error {
  readonly code: AssistErrorCode;

  constructor(code: AssistErrorCode, message: string) {
    super(message);
    this.name = "AssistLLMError";
    this.code = code;
  }
}

type ToolCallEvent = {
  sessionId: string;
  callId: string;
  name: string;
  arguments: string;
};

declare class AssistLLMNativeModule extends NativeModule<{
  onToolCall: (event: ToolCallEvent) => void;
}> {
  getAvailability(): { available: boolean; reason?: AssistUnavailableReason };
  supportsLocale(identifier: string): boolean;
  createSession(sessionId: string, configJson: string): void;
  prewarm(sessionId: string): void;
  respond(
    sessionId: string,
    requestId: string,
    prompt: string,
    optionsJson: string,
  ): Promise<string>;
  cancel(requestId: string): void;
  resolveToolCall(callId: string, output: string): void;
  rejectToolCall(callId: string, message: string): void;
  disposeSession(sessionId: string): void;
}

// Optional so Android and builds without the native module keep working.
const AssistLLMNative =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<AssistLLMNativeModule>("AssistLLM")
    : null;

export function getAssistAvailability(): AssistAvailability {
  if (!AssistLLMNative) return { available: false, reason: "unsupportedOS" };
  try {
    const result = AssistLLMNative.getAvailability();
    return result.available
      ? { available: true }
      : { available: false, reason: result.reason ?? "unknown" };
  } catch {
    return { available: false, reason: "unknown" };
  }
}

/** Whether the model answers in this BCP 47 locale, e.g. `de-DE`. */
export function assistSupportsLocale(identifier: string): boolean {
  if (!AssistLLMNative) return false;
  try {
    return AssistLLMNative.supportsLocale(identifier);
  } catch {
    return false;
  }
}

type ToolCallHandler = (event: ToolCallEvent) => void;

const toolCallHandlers = new Map<string, ToolCallHandler>();
let toolCallSubscription: EventSubscription | null = null;

function ensureToolCallSubscription(native: AssistLLMNativeModule) {
  if (toolCallSubscription) return;
  toolCallSubscription = native.addListener("onToolCall", (event) => {
    const handler = toolCallHandlers.get(event.sessionId);
    if (handler) {
      handler(event);
    } else {
      native.rejectToolCall(event.callId, "Assist session is gone.");
    }
  });
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function toAssistLLMError(error: unknown): AssistLLMError {
  if (error instanceof AssistLLMError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "GENERATION";
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return new AssistLLMError(code as AssistErrorCode, message);
}

export type AssistToolResult = {
  toolName: string;
  input: unknown;
  output: unknown;
};

export type AssistSessionOptions = {
  instructions: string;
  tools: AssistToolDefinition[];
  /** Earlier messages to restore, oldest first. */
  history?: AssistHistoryEntry[];
};

export type AssistRespondOptions = {
  schema?: AssistObjectSchema;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Called with the full result of every tool call made for this request. */
  onToolResult?: (result: AssistToolResult) => void;
};

export class AssistSession {
  private readonly id = nextId("assist-session");
  private readonly native: AssistLLMNativeModule;
  private readonly tools: Map<string, AssistToolDefinition>;
  private onToolResult: AssistRespondOptions["onToolResult"];
  private disposed = false;

  constructor(options: AssistSessionOptions) {
    if (!AssistLLMNative) {
      throw new AssistLLMError(
        "UNSUPPORTED_OS",
        "Foundation Models are not available in this build.",
      );
    }
    this.native = AssistLLMNative;
    this.tools = new Map(options.tools.map((tool) => [tool.name, tool]));
    ensureToolCallSubscription(this.native);
    toolCallHandlers.set(this.id, (event) => {
      void this.handleToolCall(event);
    });
    this.native.createSession(
      this.id,
      JSON.stringify({
        instructions: options.instructions,
        tools: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
        history: options.history ?? [],
      }),
    );
  }

  prewarm() {
    if (this.disposed) return;
    try {
      this.native.prewarm(this.id);
    } catch {
      // Prewarming is only an optimization.
    }
  }

  async respond(prompt: string, options: AssistRespondOptions = {}) {
    if (this.disposed) {
      throw new AssistLLMError("CANCELLED", "Assist session was disposed.");
    }
    if (options.signal?.aborted) {
      throw new AssistLLMError("CANCELLED", "The request was cancelled.");
    }
    const requestId = nextId("assist-request");
    const cancel = () => this.native.cancel(requestId);
    options.signal?.addEventListener("abort", cancel);
    this.onToolResult = options.onToolResult;
    try {
      return await this.native.respond(
        this.id,
        requestId,
        prompt,
        JSON.stringify({
          schema: options.schema,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
        }),
      );
    } catch (error) {
      throw toAssistLLMError(error);
    } finally {
      options.signal?.removeEventListener("abort", cancel);
      this.onToolResult = undefined;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    toolCallHandlers.delete(this.id);
    this.native.disposeSession(this.id);
  }

  private async handleToolCall(event: ToolCallEvent) {
    const tool = this.tools.get(event.name);
    if (!tool) {
      this.native.rejectToolCall(event.callId, `Unknown tool ${event.name}.`);
      return;
    }
    try {
      const input = event.arguments ? JSON.parse(event.arguments) : {};
      const output = await tool.execute(input);
      this.onToolResult?.({ toolName: tool.name, input, output });
      const forModel = tool.toModelOutput ? tool.toModelOutput(output) : output;
      this.native.resolveToolCall(
        event.callId,
        typeof forModel === "string" ? forModel : JSON.stringify(forModel),
      );
    } catch (error) {
      this.native.rejectToolCall(
        event.callId,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
