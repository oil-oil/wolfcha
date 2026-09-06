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
};
const PUBLIC_FIELDS = new Set(["speech", "content", "message", "text", "value", "segments", "speeches"]);

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

  constructor(private readonly options: StreamingSpeechParserOptions = {}) {}

  private isPublicValue(): boolean {
    const frame = this.frames.at(-1);
    return !frame || (frame.public && (frame.type === "array" || PUBLIC_FIELDS.has(frame.key ?? "")));
  }

  private finishValue(): void {
    const frame = this.frames.at(-1);
    if (frame) frame.stage = "comma";
  }

  public processChunk(chunk: string): void {
    if (this.ended || this.invalid) return;
    for (const ch of chunk) {
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
          frame.stage = "colon";
        } else {
          if (this.isPublicValue() && value.trim()) {
            const index = this.segments.length;
            this.segments.push(value.trim());
            this.options.onSegmentReceived?.(value.trim(), index);
            this.options.onProgress?.(this.segments.length);
          }
          this.finishValue();
        }
        continue;
      }
      if (this.primitive) {
        if (!/[\s,\]}]/.test(ch)) continue;
        this.primitive = false;
        this.finishValue();
      }
      if (/\s/.test(ch)) continue;
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
        this.prefix = "";
        this.frames.push({ type: ch === "[" ? "array" : "object", public: this.isPublicValue(), stage: ch === "[" ? "value" : "key" });
      } else if (ch === "]" || ch === "}") {
        if (!frame || (ch === "]") !== (frame.type === "array") || frame.stage === "colon") {
          this.invalid = true; return;
        }
        this.frames.pop();
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
    if (!this.ended && !this.segments.length && (this.started || this.invalid)) {
      this.options.onError?.("No complete public speech segment");
    }
    this.ended = true;
    return this.getAllSegments();
  }
  public getAllSegments(): string[] { return [...this.segments]; }
  public getSegmentCount(): number { return this.segments.length; }
  public reset(): void {
    this.frames = [];
    this.segments = [];
    this.string = null;
    this.escaped = this.primitive = this.ended = this.invalid = this.started = false;
    this.prefix = "";
  }
}

export function createStreamingSpeechParser(options: StreamingSpeechParserOptions = {}): StreamingSpeechParser {
  return new StreamingSpeechParser(options);
}
