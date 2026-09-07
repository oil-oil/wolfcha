/** 仅解析协议中的公开发言；分析字段及其整个子树永远不能进入字幕或 TTS。 */
export interface StreamingSpeechParserOptions {
  onSegmentReceived?: (segment: string, index: number) => void;
  onProgress?: (current: number) => void;
  onError?: (error: string) => void;
}

type Frame = {
  type: "array" | "object";
  public: boolean;
  stage: "key" | "colon" | "value" | "comma";
  key?: string;
  pending: string[];
  role?: "assistant" | "other";
};
const PUBLIC_FIELDS = new Set(["speech", "content", "message", "messages", "text", "value", "segments", "speeches"]);

export class StreamingSpeechParser {
  private frames: Frame[] = [];
  private segments: string[] = [];
  private string: string | null = null;
  private escaped = false;
  private primitive = false;
  private ended = false;
  private invalid = false;
  private prefix = "";
  private started = false;
  private rootSeparator = false;
  private decodingError: string | undefined;
  private pendingString: string | undefined;
  private completeDocument = false;

  constructor(private readonly options: StreamingSpeechParserOptions = {}) {}

  private isPublicValue(): boolean {
    const frame = this.frames.at(-1);
    return !frame || (frame.public && (frame.type === "array" || PUBLIC_FIELDS.has(frame.key ?? "")));
  }

  private finishValue(): void {
    const frame = this.frames.at(-1);
    if (frame) frame.stage = "comma";
  }

  private decodePublicValue(value: unknown, depth = 0): string[] {
    if (depth > 16) {
      this.decodingError = "公开发言嵌套过深";
      return [];
    }
    if (typeof value === "string") {
      const text = value.trim();
      const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      if (/^[\[{]/.test(json)) {
        try { return this.decodePublicValue(JSON.parse(json), depth + 1); }
        catch { this.decodingError = "公开字段中包含无法解析的 JSON"; return []; }
      }
      return text ? [text] : [];
    }
    if (Array.isArray(value)) return value.flatMap((item) => this.decodePublicValue(item, depth + 1));
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if ("role" in object && object.role !== "assistant") return [];
      return Object.entries(object).flatMap(([key, item]) =>
        PUBLIC_FIELDS.has(key) ? this.decodePublicValue(item, depth + 1) : []);
    }
    return [];
  }

  private receiveValue(value: string): void {
    // 对象必须等到闭合后再确认 role，避免 content 在 role:user 前面时泄露提示词。
    const object = this.frames.findLast((frame) => frame.type === "object");
    if (object) { object.pending.push(value); return; }
    for (const segment of this.decodePublicValue(value)) {
      const index = this.segments.length;
      this.segments.push(segment);
      this.options.onSegmentReceived?.(segment, index);
      this.options.onProgress?.(this.segments.length);
    }
  }

  public processChunk(chunk: string): void {
    if (this.ended || this.invalid) return;
    for (const ch of chunk) {
      // 引号后必须有合法分隔符，才确认这是一整段，避免未转义引号截出半句话。
      if (this.pendingString !== undefined) {
        if (/\s/.test(ch)) continue;
        const frame = this.frames.at(-1);
        if (ch !== "," && ch !== (frame?.type === "array" ? "]" : "}")) {
          this.invalid = true;
          return;
        }
        const value = this.pendingString;
        this.pendingString = undefined;
        if (frame?.type === "object" && frame.key === "role") {
          frame.role = value === "assistant" ? "assistant" : "other";
        }
        if (this.isPublicValue() && value.trim()) this.receiveValue(value);
        this.finishValue();
      }
      if (this.string !== null) {
        this.string += ch;
        if (this.escaped) { this.escaped = false; continue; }
        if (ch === "\\") { this.escaped = true; continue; }
        if (ch !== '"') continue;
        let value: string;
        try { value = JSON.parse(this.string); } catch { this.invalid = true; return; }
        this.string = null;
        const frame = this.frames.at(-1);
        if (frame?.stage === "key") {
          frame.key = value;
          if (value === "role") frame.role = "other";
          frame.stage = "colon";
        } else {
          this.pendingString = value;
        }
        continue;
      }
      if (this.primitive) {
        if (!/[\s,\]}]/.test(ch)) continue;
        this.primitive = false;
        this.finishValue();
      }
      if (/\s/.test(ch)) continue;
      // 兼容模型省略外层数组的对象序列，仅在完整 JSON 值之间接受逗号。
      if (!this.frames.length && ch === "," && this.started && !this.prefix && !this.rootSeparator) {
        this.rootSeparator = true;
        continue;
      }
      // 只接受 JSON 或 Markdown JSON 代码块开头，不从自由分析文本中猜测发言。
      if (!this.frames.length && ch !== "[" && ch !== "{") {
        this.prefix += ch;
        if (!"```json".startsWith(this.prefix) && !"```".startsWith(this.prefix)) {
          this.invalid = true;
          return;
        }
        continue;
      }
      const frame = this.frames.at(-1);
      if (ch === "[" || ch === "{") {
        if (frame && frame.stage !== "value") { this.invalid = true; return; }
        this.started = true;
        this.rootSeparator = false;
        this.prefix = "";
        this.frames.push({ type: ch === "[" ? "array" : "object", public: this.isPublicValue(), stage: ch === "[" ? "value" : "key", pending: [] });
      } else if (ch === "]" || ch === "}") {
        if (!frame || (ch === "]") !== (frame.type === "array") || frame.stage === "colon") {
          this.invalid = true; return;
        }
        this.frames.pop();
        if (!this.frames.length) this.completeDocument = true;
        if (frame.public && frame.role !== "other") {
          for (const value of frame.pending) this.receiveValue(value);
        }
        this.finishValue();
      } else if (ch === '"' && (frame?.stage === "key" || frame?.stage === "value")) {
        this.string = '"';
      } else if (ch === ":" && frame?.stage === "colon") {
        frame.stage = "value";
      } else if (ch === "," && frame?.stage === "comma") {
        frame.stage = frame.type === "array" ? "value" : "key";
        frame.key = undefined;
      } else if (frame?.stage === "value" && /[-\dntf]/.test(ch)) {
        this.primitive = true;
      } else {
        this.invalid = true;
        return;
      }
    }
  }

  public end(): string[] {
    if (!this.ended) {
      const error = this.decodingError || (this.invalid || this.frames.length || this.string !== null || this.rootSeparator
        ? "发言响应格式不完整或不合法，仅保留已确认的公开段落"
        : !this.segments.length ? "没有解析到完整的公开发言" : undefined);
      if (error) this.options.onError?.(error);
    }
    this.ended = true;
    return this.getAllSegments();
  }
  public getAllSegments(): string[] { return [...this.segments]; }
  public getSegmentCount(): number { return this.segments.length; }
  /** 完整公开文档之后的垃圾尾缀可以丢弃；文档本身中断则必须恢复。 */
  public hasCompleteDocument(): boolean { return this.completeDocument; }
  public reset(): void {
    this.frames = [];
    this.segments = [];
    this.string = null;
    this.escaped = this.primitive = this.ended = this.invalid = this.started = false;
    this.rootSeparator = false;
    this.decodingError = undefined;
    this.pendingString = undefined;
    this.completeDocument = false;
    this.prefix = "";
  }
}

export function createStreamingSpeechParser(options: StreamingSpeechParserOptions = {}): StreamingSpeechParser {
  return new StreamingSpeechParser(options);
}
