/**
 * 流式语音解析器
 * 实时解析 AI 生成的发言段落，支持增量输出
 */

import { LLMJSONParser } from "ai-json-fixer";

const parser = new LLMJSONParser();

export interface StreamingSpeechParserOptions {
  onSegmentReceived?: (segment: string, index: number) => void;
  onProgress?: (current: number) => void;
  onError?: (error: string) => void;
}

/**
 * 流式语音解析器
 * 从流式 AI 响应中实时提取发言段落
 */
export class StreamingSpeechParser {
  private accumulatedContent = "";
  private processedSegments: Set<string> = new Set();
  private emittedSegmentsList: string[] = []; // 按顺序记录已发送的段落
  private readonly onSegmentReceived?: (segment: string, index: number) => void;
  private readonly onProgress?: (current: number) => void;
  private readonly onError?: (error: string) => void;
  private pendingEmit = false;
  private emitTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: StreamingSpeechParserOptions = {}) {
    this.onSegmentReceived = options.onSegmentReceived;
    this.onProgress = options.onProgress;
    this.onError = options.onError;
  }

  /**
   * 处理流式内容
   * 只在检测到完整段落结束时触发解析（降低频率）
   */
  public processChunk(chunk: string): void {
    if (!chunk) return;

    this.accumulatedContent += chunk;

    // 流式响应里，分隔符（比如 "] 或 ",）可能会被拆分到不同 chunk。
    // 为了保证增量输出，只要 chunk 看起来包含了新字符串内容，就触发一次防抖解析。
    const hasArrayStart = this.accumulatedContent.includes("[");
    const likelyHasNewStringContent = chunk.includes('"') || chunk.includes("\n");

    if (hasArrayStart && likelyHasNewStringContent) {
      if (!this.pendingEmit) {
        this.pendingEmit = true;
        this.emitTimeout = setTimeout(() => {
          this.pendingEmit = false;
          this.tryExtractSegments();
        }, 50);
      }
    }
  }

  /**
   * 结束解析，尝试提取剩余内容
   */
  public end(): string[] {
    this.tryExtractSegments(true);
    return this.getAllSegments();
  }

  /**
   * 获取所有已解析的段落
   */
  public getAllSegments(): string[] {
    return Array.from(this.processedSegments);
  }

  /**
   * 获取已解析的段落数量
   */
  public getSegmentCount(): number {
    return this.processedSegments.size;
  }

  /**
   * 重置解析器状态
   */
  public reset(): void {
    this.accumulatedContent = "";
    this.processedSegments.clear();
    this.emittedSegmentsList = [];
    if (this.emitTimeout) {
      clearTimeout(this.emitTimeout);
      this.emitTimeout = null;
    }
    this.pendingEmit = false;
  }

  /**
   * 尝试从累积内容中提取段落
   */
  private tryExtractSegments(isFinal = false): void {
    if (!this.accumulatedContent.trim()) return;

    try {
      // 方法1: 尝试从流式内容中提取完整的字符串（使用正则匹配引号内的内容）
      const extractedFromStream = this.extractSegmentsFromStream();
      if (extractedFromStream > 0) {
        return;
      }

      // 方法2: 尝试使用 ai-json-fixer 修复并解析完整数组
      const segments = this.tryParseWithFixer(isFinal);
      if (segments && segments.length > this.emittedSegmentsList.length) {
        for (const segment of segments) {
          if (segment && !this.processedSegments.has(segment)) {
            this.processedSegments.add(segment);
            this.emittedSegmentsList.push(segment);
            if (this.onSegmentReceived) {
              this.onSegmentReceived(segment, this.emittedSegmentsList.length - 1);
            }
          }
        }

        if (this.onProgress) {
          this.onProgress(this.processedSegments.size);
        }
      }
    } catch (error) {
      // 在流式处理中，解析错误是正常的
      if (isFinal && this.processedSegments.size === 0) {
        console.warn("Failed to parse speech segments:", error);
        if (this.onError) {
          this.onError("Failed to parse speech segments");
        }
      }
    }
  }

  /**
   * 从流式内容中提取完整的字符串段落
   * 支持多个 JSON 数组（每行一个数组）和单个数组中的多个元素
   */
  private extractSegmentsFromStream(): number {
    let extractedCount = 0;

    try {
      const validSegments: string[] = [];
      let arrayDepth = 0;
      let inString = false;
      let escapeNext = false;
      let currentString = "";

      for (let i = 0; i < this.accumulatedContent.length; i++) {
        const ch = this.accumulatedContent[i];

        if (inString) {
          if (escapeNext) {
            escapeNext = false;
            currentString += ch;
            continue;
          }
          if (ch === "\\") {
            escapeNext = true;
            currentString += ch;
            continue;
          }
          if (ch === '"') {
            inString = false;
            try {
              const parsed = JSON.parse('"' + currentString + '"');
              if (typeof parsed === "string") {
                const cleaned = parsed.trim();
                if (arrayDepth > 0 && cleaned && cleaned.length > 5) {
                  validSegments.push(cleaned);
                }
              }
            } catch {
              // ignore
            }
            currentString = "";
            continue;
          }

          currentString += ch;
          continue;
        }

        if (ch === '"') {
          inString = true;
          escapeNext = false;
          currentString = "";
          continue;
        }

        if (ch === "[") {
          arrayDepth++;
          continue;
        }
        if (ch === "]" && arrayDepth > 0) {
          arrayDepth--;
          continue;
        }
      }

      // 发送新的段落（只发送尚未处理的）
      for (const segment of validSegments) {
        if (!this.processedSegments.has(segment)) {
          this.processedSegments.add(segment);
          this.emittedSegmentsList.push(segment);
          if (this.onSegmentReceived) {
            this.onSegmentReceived(segment, this.emittedSegmentsList.length - 1);
          }
          extractedCount++;
        }
      }

      if (extractedCount > 0 && this.onProgress) {
        this.onProgress(this.processedSegments.size);
      }
    } catch (error) {
      console.warn("Stream extraction error:", error);
    }

    return extractedCount;
  }

  /**
   * 使用 ai-json-fixer 尝试修复并解析 JSON
   */
  private tryParseWithFixer(isFinal: boolean): string[] | null {
    try {
      const content = this.accumulatedContent.trim();

      // 清理 markdown 代码块
      const cleaned = content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      // 尝试使用 ai-json-fixer 解析
      const parsed = parser.parse(cleaned);

      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }

      // 如果是对象，尝试提取值
      if (parsed && typeof parsed === "object") {
        const segments: string[] = [];
        for (const value of Object.values(parsed)) {
          if (typeof value === "string") {
            const cleaned = value.trim();
            if (cleaned) segments.push(cleaned);
          } else if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === "string") {
                const cleaned = item.trim();
                if (cleaned) segments.push(cleaned);
              }
            }
          }
        }
        if (segments.length > 0) return segments;
      }

      return null;
    } catch {
      // 尝试手动修复不完整的 JSON 数组
      if (!isFinal) {
        return this.tryRepairPartialArray();
      }
      return null;
    }
  }

  /**
   * 尝试修复不完整的 JSON 数组
   */
  private tryRepairPartialArray(): string[] | null {
    try {
      const content = this.accumulatedContent.trim();

      // 如果以 [ 开始，尝试提取完整的字符串
      if (content.startsWith("[")) {
        const segments: string[] = [];
        let inString = false;
        let escapeNext = false;
        let currentString = "";
        let stringStart = -1;

        for (let i = 0; i < content.length; i++) {
          const char = content[i];

          if (escapeNext) {
            escapeNext = false;
            if (inString) currentString += char;
            continue;
          }

          if (char === "\\") {
            escapeNext = true;
            if (inString) currentString += char;
            continue;
          }

          if (char === '"' && !escapeNext) {
            if (!inString) {
              inString = true;
              stringStart = i;
              currentString = "";
            } else {
              inString = false;
              // 完成一个字符串
              const cleaned = currentString.trim();
              if (cleaned && cleaned.length > 1) {
                segments.push(cleaned);
              }
              currentString = "";
            }
            continue;
          }

          if (inString) {
            currentString += char;
          }
        }

        return segments.length > 0 ? segments : null;
      }

      return null;
    } catch {
      return null;
    }
  }
}

/**
 * 创建流式语音解析器的便捷函数
 */
export function createStreamingSpeechParser(
  options: StreamingSpeechParserOptions = {}
): StreamingSpeechParser {
  return new StreamingSpeechParser(options);
}
