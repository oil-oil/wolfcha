# Gemini STT (Speech-to-Text) Implementation Design

## 1. Overview
Implement speech-to-text functionality using OpenRouter's Gemini models (e.g., `google/gemini-2.0-flash-001` or `google/gemini-pro-1.5`). The implementation will utilize the existing OpenRouter infrastructure but extend it to support multimodal input (audio).

## 2. Architecture Changes

### 2.1 Type Definitions (`src/lib/openrouter.ts`)
The `OpenRouterMessage` interface currently supports only string content. It needs to be extended to support multimodal content parts, specifically for audio.

```typescript
export type ContentPart = 
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | { type: "input_audio"; input_audio: { data: string; format: "mp3" | "wav" } };

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  // Allow string (legacy/simple) or array of parts (multimodal)
  content: string | ContentPart[]; 
  reasoning_details?: unknown;
}
```

### 2.2 OpenRouter Client (`src/lib/openrouter.ts`)
No major logic changes are needed in `generateCompletion` if it simply serializes the payload. However, we should ensure strict typing for the new content structure.

### 2.3 New API Endpoint (`src/app/api/stt/route.ts`)
Instead of reusing `/api/chat`, we will create a dedicated STT endpoint to handle the specific logic of:
1. Receiving audio file/blob from client.
2. Converting to Base64.
3. Constructing the multimodal prompt for Gemini.
4. Parsing the response to extract *only* the transcription.

**Request:**
- `audio`: Base64 string of the audio data.
- `format`: "mp3" | "wav" (default "webm" -> needs conversion or checking support).
- `model`: Optional model override (default to a fast Gemini model).

**Response:**
- `text`: The transcribed text.

### 2.4 Prompt Engineering
To ensure Gemini acts as a strict transcriber and doesn't "reply" to the audio:

**System Prompt:**
> "You are a professional transcriber. Your task is to transcribe the user's audio input exactly as spoken, without adding any conversational fillers, interpretations, or responses. Output ONLY the transcription."

## 3. Implementation Details

### Step 1: Update `src/lib/openrouter.ts`
- Modify `OpenRouterMessage` to include `ContentPart`.
- Ensure `generateCompletion` passes the `content` field correctly (JSON serialization handles this naturally).

### Step 2: Implement `src/app/api/stt/route.ts`
```typescript
import { NextResponse } from "next/server";
import { generateCompletion } from "@/lib/openrouter";

export async function POST(req: Request) {
  // 1. Parse body (expecting base64 audio)
  const { audio, format = "mp3" } = await req.json();
  
  // 2. Call OpenRouter with Gemini
  const result = await generateCompletion({
    model: "google/gemini-2.0-flash-001", // Or equivalent high-speed model
    messages: [
      {
        role: "system",
        content: "You are a transcriber. Output ONLY the verbatim transcription of the audio. Do not reply to the content."
      },
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: audio, // Base64 without prefix
              format: format
            }
          }
        ]
      }
    ]
  });

  // 3. Return text
  return NextResponse.json({ text: result.content });
}
```

### Step 3: Frontend Integration (Future)
- Use `MediaRecorder` API to capture microphone input.
- Convert `Blob` to Base64.
- POST to `/api/stt`.

## 4. Considerations
- **Audio Format**: OpenRouter/Gemini typically supports `wav` and `mp3`. Browser `MediaRecorder` often produces `audio/webm`. We may need to:
  - Just send `webm` and see if Gemini supports it (often yes).
  - Or decode/re-encode on server (heavy).
  - Or use a library like `mp3-recorder` on frontend.
  - *Recommendation*: Try sending `audio/webm` first (as "mp3" or checking "webm" support), or standardizing on `wav` if possible.
- **Payload Size**: Base64 audio increases size by ~33%. Ensure Vercel/Next.js body size limits are not exceeded (default 4MB/1MB).
