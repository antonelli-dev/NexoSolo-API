/**
 * Provider-agnostic chat completion for OpenAI-compatible and Anthropic APIs.
 * Configure via AI_PROVIDER, AI_API_KEY, optional AI_BASE_URL, AI_MODEL.
 */

export type LlmProviderName = 'openai' | 'anthropic' | 'azure_openai';

export type CompleteChatParams = {
  provider: LlmProviderName;
  apiKey: string;
  /** Override API base, e.g. Azure resource or OpenAI-compatible proxy */
  baseUrl?: string;
  /** Model id; sensible defaults per provider */
  model?: string;
  system: string;
  user: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  maxTokens?: number;
};

function defaultModel(provider: LlmProviderName, explicit?: string): string {
  if (explicit?.length) return explicit;
  switch (provider) {
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'azure_openai':
    case 'openai':
    default:
      return 'gpt-4o-mini';
  }
}

async function completeOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
  maxTokens: number,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI-compatible error ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI-compatible: empty completion');
  return text;
}

async function completeAnthropic(
  apiKey: string,
  model: string,
  system: string,
  user: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
  maxTokens: number,
): Promise<string> {
  // Map OpenAI-style image_url to Anthropic's image source format if needed
  const anthropicUser = typeof user === 'string' ? user : user.map(u => {
    if (u.type === 'image_url' && u.image_url) {
      const match = u.image_url.url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (match) {
        return {
          type: 'image',
          source: { type: 'base64', media_type: match[1], data: match[2] }
        };
      }
    }
    return u;
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: anthropicUser }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = data.content?.find((b) => b.type === 'text');
  const text = block?.text;
  if (!text) throw new Error('Anthropic: empty completion');
  return text;
}

export async function completeChat(params: CompleteChatParams): Promise<string> {
  const maxTokens = params.maxTokens ?? 4096;
  const model = defaultModel(params.provider, params.model);

  if (params.provider === 'anthropic') {
    return completeAnthropic(
      params.apiKey,
      model,
      params.system,
      params.user,
      maxTokens,
    );
  }

  const base =
    params.baseUrl?.trim() ||
    (params.provider === 'azure_openai'
      ? process.env.AZURE_OPENAI_ENDPOINT
      : 'https://api.openai.com/v1') ||
    'https://api.openai.com/v1';

  if (!base.startsWith('http')) {
    throw new Error(
      'AI_BASE_URL or AZURE_OPENAI_ENDPOINT must be set for azure_openai',
    );
  }

  return completeOpenAiCompatible(
    base,
    params.apiKey,
    model,
    params.system,
    params.user,
    maxTokens,
  );
}
