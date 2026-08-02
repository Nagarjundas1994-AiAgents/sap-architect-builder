/**
 * Vision provider adapters.
 *
 * Every provider is asked for the same thing — one JSON architecture model — so the
 * differences live here and nowhere else: endpoint shape, auth header, how an image
 * is attached, and where the text comes back.
 */

export type ProviderId = "mock" | "openai" | "deepseek" | "google";

export interface ProviderProfile {
  id: ProviderId;
  label: string;
  /** Shown in the studio so an architect knows what produced the model. */
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  /** Environment variable holding the key, by convention. */
  envKey: string;
  /** Whether the default model can read an uploaded image. */
  vision: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderProfile> = {
  mock: {
    id: "mock",
    label: "Built-in sample",
    description: "Deterministic offline extraction. No key, no network, no cost.",
    defaultBaseUrl: "",
    defaultModel: "sample",
    envKey: "",
    vision: false,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "GPT-4o class models. Reads uploaded sketches directly.",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    envKey: "OPENAI_API_KEY",
    vision: true,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    description: "OpenAI-compatible API. Strong on structured output from text and hints.",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v4-flash",
    envKey: "DEEPSEEK_API_KEY",
    // v4-flash is text-only — it rejects image_url parts outright, so an
    // uploaded sketch is described by the architect notes instead
    vision: false,
  },
  google: {
    id: "google",
    label: "Google Gemini",
    description: "Gemini 3.x Flash. Reads uploaded sketches directly.",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.6-flash",
    envKey: "GOOGLE_API_KEY",
    vision: true,
  },
};

export function resolveProvider(id?: string): ProviderProfile {
  const key = (id ?? "mock").toLowerCase();
  if (key === "gemini") return PROVIDERS.google;
  return PROVIDERS[key as ProviderId] ?? PROVIDERS.mock;
}

/** Read a provider's key from the environment when the caller did not pass one. */
export function keyFromEnv(profile: ProviderProfile, env: NodeJS.ProcessEnv = process.env) {
  return profile.envKey ? env[profile.envKey] : undefined;
}

export interface CompletionRequest {
  profile: ProviderProfile;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  system: string;
  user: string;
  /** Attached only when the provider's model can read images. */
  image?: { base64: string; mimeType: string };
}

/** Chat-completions shape, used by OpenAI and every API that mirrors it. */
async function openAiCompatible(req: CompletionRequest): Promise<string> {
  const baseUrl = (req.baseUrl ?? req.profile.defaultBaseUrl).replace(/\/$/, "");
  const model = req.model ?? req.profile.defaultModel;

  const content: unknown[] = [{ type: "text", text: req.user }];
  if (req.image && req.profile.vision) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` },
    });
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.profile.vision ? content : req.user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `${req.profile.label} request failed (${res.status}): ${(await res.text()).slice(0, 400)}`
    );
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${req.profile.label} returned no content`);
  return text;
}

/** Gemini uses generateContent with inline image parts and a key query parameter. */
async function googleGenerateContent(req: CompletionRequest): Promise<string> {
  const baseUrl = (req.baseUrl ?? req.profile.defaultBaseUrl).replace(/\/$/, "");
  const model = req.model ?? req.profile.defaultModel;

  const parts: unknown[] = [{ text: `${req.system}\n\n${req.user}` }];
  if (req.image) {
    parts.push({ inline_data: { mime_type: req.image.mimeType, data: req.image.base64 } });
  }

  const res = await fetch(
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(req.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `${req.profile.label} request failed (${res.status}): ${(await res.text()).slice(0, 400)}`
    );
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error(`${req.profile.label} returned no content`);
  return text;
}

export async function complete(req: CompletionRequest): Promise<string> {
  return req.profile.id === "google" ? googleGenerateContent(req) : openAiCompatible(req);
}

/**
 * Models are asked for JSON but sometimes wrap it in prose or a fenced block, so
 * pull out the first balanced object rather than trusting the whole response.
 */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  if (body.startsWith("{")) return body;
  const start = body.indexOf("{");
  if (start < 0) throw new Error("Model response contained no JSON object");
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}" && --depth === 0) return body.slice(start, i + 1);
  }
  throw new Error("Model response contained an unterminated JSON object");
}
