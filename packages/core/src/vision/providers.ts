/**
 * Vision provider adapters.
 *
 * Every provider is asked for the same thing — one JSON architecture model — so the
 * differences live here and nowhere else: endpoint shape, auth header, how an image
 * is attached, and where the text comes back.
 */

export type ProviderId = "mock" | "aicore" | "openai" | "deepseek" | "google";

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
  /**
   * SAP Generative AI Hub, in SAP AI Core.
   *
   * The only provider a regulated SAP customer can actually approve: an architecture
   * sketch is landscape data — system names, trust boundaries, where the data sits —
   * and sending it to a public model endpoint is not covered by anyone's DPA.
   * Generative AI Hub proxies the same frontier models under SAP's contract, in the
   * customer's own subaccount, so the prompt never leaves the agreement.
   *
   * Auth is OAuth client credentials against the bound service key, not a static key;
   * see `aiCoreToken`. Set AICORE_SERVICE_KEY to the JSON of the service binding and
   * AICORE_DEPLOYMENT_ID to the deployment serving your model.
   */
  aicore: {
    id: "aicore",
    label: "SAP Generative AI Hub",
    description:
      "Runs in your SAP AI Core subaccount — prompts stay inside SAP's contract. Reads sketches when the deployed model supports vision.",
    defaultBaseUrl: "",
    defaultModel: "gpt-4o",
    envKey: "AICORE_SERVICE_KEY",
    vision: true,
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

interface AiCoreKey {
  clientid: string;
  clientsecret: string;
  url: string;
  serviceurls?: { AI_API_URL?: string };
  /** Some bindings carry the API URL at the top level instead. */
  AI_API_URL?: string;
}

/** Cached bearer — AI Core tokens last ~12h and every run would otherwise re-auth. */
let aiCoreCache: { token: string; expires: number } | null = null;

function parseAiCoreKey(raw: string): AiCoreKey {
  try {
    return JSON.parse(raw) as AiCoreKey;
  } catch {
    throw new Error(
      "AICORE_SERVICE_KEY must be the JSON service key of the SAP AI Core binding"
    );
  }
}

async function aiCoreToken(key: AiCoreKey): Promise<string> {
  if (aiCoreCache && aiCoreCache.expires > Date.now() + 60_000) return aiCoreCache.token;
  const res = await fetch(`${key.url.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${key.clientid}:${key.clientsecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`SAP AI Core token request failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("SAP AI Core returned no access token");
  aiCoreCache = {
    token: json.access_token,
    expires: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

/**
 * Generative AI Hub inference.
 *
 * The wire format is OpenAI's, but the endpoint is per-deployment and the request
 * needs the resource group header, so it cannot reuse `openAiCompatible` directly.
 */
async function aiCoreCompletion(req: CompletionRequest): Promise<string> {
  const key = parseAiCoreKey(req.apiKey);
  const apiUrl = (
    req.baseUrl ||
    key.serviceurls?.AI_API_URL ||
    key.AI_API_URL ||
    ""
  ).replace(/\/$/, "");
  if (!apiUrl) {
    throw new Error("SAP AI Core service key carries no AI_API_URL");
  }
  const deployment = process.env.AICORE_DEPLOYMENT_ID;
  if (!deployment) {
    throw new Error("Set AICORE_DEPLOYMENT_ID to the Generative AI Hub deployment id");
  }
  const token = await aiCoreToken(key);

  const content: unknown[] = [{ type: "text", text: req.user }];
  if (req.image) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` },
    });
  }

  const res = await fetch(
    `${apiUrl}/v2/inference/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "AI-Resource-Group": process.env.AICORE_RESOURCE_GROUP || "default",
      },
      body: JSON.stringify({
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.image ? content : req.user },
        ],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `SAP Generative AI Hub request failed (${res.status}): ${(await res.text()).slice(0, 400)}`
    );
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("SAP Generative AI Hub returned no content");
  return text;
}

export async function complete(req: CompletionRequest): Promise<string> {
  if (req.profile.id === "aicore") return aiCoreCompletion(req);
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
