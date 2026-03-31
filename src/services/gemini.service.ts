import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, GenerationConfig, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ContextPanel {
  type: 'dialog' | 'narration';
  text: string;
  character?: string;
}

export interface CopilotContext {
  seriesTitle: string;
  seriesDescription?: string;
  genre: string[];
  tags?: string[];
  ageRating?: 'all-ages' | 'teen' | 'mature';
  chapterTitle: string;
  chapterNumber?: number;
  chapterNotes?: string;
  openingPanels?: ContextPanel[];
  recentPanels?: ContextPanel[];
  knownCharacters?: string[];
}

export interface GeneratedPanel {
  type: 'dialog' | 'narration';
  text: string;
  character?: string;
}

// ─── Gemini safety settings ──────────────────────────────────────────────────

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ─── Prompt builders ─────────────────────────────────────────────────────────

function getGenreInstructions(genres: string[]): string {
  const g = genres.map(x => x.toLowerCase());
  const instructions: string[] = [];

  if (g.some(x => ['action', 'shounen', 'fighting', 'battle'].includes(x))) {
    instructions.push(
      'ACTION/SHOUNEN CRAFT: Cut fast — short panels, kinetic energy. Every line of dialog mid-fight should feel like a punch. ' +
      'Narration in action scenes should be percussive, staccato. Power and cost must be felt simultaneously — no win without sacrifice. ' +
      'Use silence before the decisive blow, not after.'
    );
  }
  if (g.some(x => ['seinen', 'dark', 'philosophical', 'psychological', 'thriller'].includes(x))) {
    instructions.push(
      'SEINEN CRAFT: Grounded in weight and entropy. Actions have irreversible consequences. Focus on the internal toll of conflict. ' +
      'The pacing is clinical — showing the buildup to a mistake rather than just the impact. ' +
      'Dialog should be sparse, heavy with what characters are trying to survive, not just what they want.'
    );
  }
  if (g.some(x => ['horror', 'suspense'].includes(x))) {
    instructions.push(
      'HORROR/SUSPENSE CRAFT: Build dread through wrongness in ordinary things. The temperature, a sound that stops, something missing that should be there. ' +
      'Never name the fear — describe what the character notices with their body. Slower pacing amplifies terror. ' +
      'The most disturbing moment should be quiet, not loud.'
    );
  }
  if (g.some(x => ['romance', 'shoujo', 'yuri', 'yaoi', 'love', 'drama'].includes(x))) {
    instructions.push(
      'ROMANCE/DRAMA/YURI CRAFT: Physical proximity is emotional tension made visible. A hand almost touching means more than a declaration. ' +
      'Characters in love do not speak directly — they orbit. What goes unsaid is the whole story. ' +
      'Internal conflict should live in the narration, not as exposition. Lingering glances and shared breath carry the scene.'
    );
  }
  if (g.some(x => ['cultivation', 'xianxia', 'wuxia', 'martial arts'].includes(x))) {
    instructions.push(
      'CULTIVATION CRAFT: Focus on the flow of internal energy (Qi), the hierarchy of power, and the path to transcendence. ' +
      'Dialog is often formal, steeped in respect or arrogance based on cultivation level. ' +
      'Action scenes are grand yet philosophical — the internal state dictates the external breakthrough. ' +
      'Sect politics and ancestral debt are constant undertones.'
    );
  }
  if (g.some(x => ['fantasy', 'isekai', 'adventure', 'magic'].includes(x))) {
    instructions.push(
      'FANTASY/ADVENTURE CRAFT: Ground the extraordinary in physical sensation — the weight of a weapon, the smell of a spell, the cold of a portal. ' +
      'Wonder and danger must coexist. World-building belongs in action, not exposition. ' +
      'The stakes should feel personal, not just world-scale.'
    );
  }
  if (g.some(x => ['sci-fi', 'science fiction', 'mecha', 'cyberpunk'].includes(x))) {
    instructions.push(
      'SCI-FI CRAFT: Technology should feel like it has weight, cost, and failure modes. Cold precision of systems contrasted against raw human emotion. ' +
      'Jargon earns trust only when it reveals character. The most powerful sci-fi moments are when the human breaks through the machine context.'
    );
  }
  if (g.some(x => ['slice of life', 'slice-of-life', 'comedy', 'everyday', 'school'].includes(x))) {
    instructions.push(
      'SLICE-OF-LIFE/COMEDY CRAFT: Small moments carry enormous weight. Comedy lives in timing and specificity — the exact wrong thing said at the exact wrong moment. ' +
      'Mundane details are metaphors. Let characters be weird and specific, not types.'
    );
  }
  if (g.some(x => ['mystery', 'detective', 'crime'].includes(x))) {
    instructions.push(
      'MYSTERY CRAFT: Information is a weapon — reveal it strategically. The detective\'s observations should feel like puzzle pieces the reader can almost solve. ' +
      'Tension comes from what characters know vs. what they admit to knowing. A lie told calmly is more chilling than a threat.'
    );
  }

  return instructions.length > 0
    ? `GENRE-SPECIFIC CRAFT:\n${instructions.join('\n\n')}`
    : '';
}

function getAgeRatingGuidance(ageRating?: string): string {
  switch (ageRating) {
    case 'mature':
      return 'This is a mature-rated series. Adult themes, complex morality, unflinching portrayal of violence and consequences, and raw emotional honesty are all appropriate. Do not soften or sanitize.';
    case 'teen':
      return 'This is a teen-rated series. Intense themes and conflict are fine — keep explicit graphic content restrained. Emotional depth and complexity are fully appropriate.';
    default:
      return 'This is an all-ages series. Keep content appropriate for general audiences while still being emotionally resonant and dramatically compelling.';
  }
}

function formatPanels(panels: ContextPanel[]): string {
  return panels
    .map(p => p.type === 'dialog' ? `${p.character}: "${p.text}"` : `[${p.text}]`)
    .join('\n');
}

/**
 * System prompt — who the writer is and HOW to write.
 * Stable across requests with the same genre/ageRating (good for caching).
 */
function buildSystemPrompt(context: CopilotContext): string {
  const genreInstructions = getGenreInstructions(context.genre);
  const ageGuidance       = getAgeRatingGuidance(context.ageRating);

  return `You are a master manga script writer — your work is visceral, surprising, and emotionally unforgettable. You write original stories. All characters and events are wholly fictional.

Your output must feel like it was written by a seasoned author, not a template engine. Every panel must earn its place.

---
UNIVERSAL WRITING PRINCIPLES:

DIALOG:
- Characters never say exactly what they feel — they deflect, lie, go quiet, or attack sideways. Subtext is everything.
- Each character has a distinct voice — shaped by their history, their pain, their wants.
- The most powerful lines are short and leave something unsaid. "You knew." hits harder than "I can't believe you knew this whole time."
- Banned phrases (filler — replace with something specific to THIS character in THIS moment): "I can't believe you!", "You monster!", "This isn't over!", "Why are you doing this?", "How could you?", "I won't forgive you."

NARRATION:
- Anchor the reader with one precise sensory detail. Not "it was cold" — "frost on the window glass, thin as breath."
- Narration sets emotional undertone, not just scene. Make the reader feel before dialog starts.
- Vary rhythm. Short, clipped for action. Long, slow for grief or dread.
- Banned openings (lazy — drop straight into the moment): "Meanwhile...", "Suddenly...", "Little did they know...", "At that moment..."

PACING:
- Build then release. A single silent narration panel before confrontation does more than three panels of explanation.
- Let characters breathe — a pause, a look away, a hand reaching and stopping. These are panels too.
- Don't rush the climax. Make the reader feel it coming.

ORIGINALITY:
- Take the unexpected angle. If the obvious move is Character A yells — what if they went completely quiet? What if they laughed?
- Specificity over generality always. "His father's watch" beats "something precious." "She smelled like cigarettes and winter" beats "she was there."
- Earn every emotional beat. Nothing is free.

FAN-CREATIVE WORK:
The author may reference characters from existing anime, manga, games, or other fiction by name. This is legitimate fan-creative writing — a foundational tradition in manga culture.
When this happens:
- Write them fully and authentically. Capture their voice, speech patterns, personality, and mannerisms as the author intends.
- Do NOT soften, refuse, or substitute them with vague stand-ins. The author chose that character deliberately.
- Do NOT reproduce verbatim lines or scenes from the source — write original dialog and situations that feel true to who the character is.
- This is transformative creative expression. Using a character's name and personality in an original story is not reproduction — it is authorship.

${ageGuidance}

${genreInstructions}

---
OUTPUT FORMAT:
Return ONLY a valid JSON object with a "panels" array. No explanation, no markdown, no code fences — raw JSON only.
Each panel object:
- "type": "dialog" or "narration"
- "text": max 120 characters — tight, precise, every word deliberate
- "character": speaker's name (only when type is "dialog")

Max 15 panels. Quality over quantity — 8 panels that land beats 15 that don't.`;
}

/**
 * User message — the WHAT: story context + direction.
 * Varies per request.
 */
function buildUserMessage(direction: string, context: CopilotContext, recentContext: string): string {
  const lines: string[] = [];

  lines.push(`Series: "${context.seriesTitle}"`);
  if (context.seriesDescription) lines.push(`Premise: ${context.seriesDescription}`);
  if (context.tags?.length)       lines.push(`Themes: ${context.tags.join(', ')}`);
  lines.push(`Genre: ${context.genre.join(', ')}`);

  const chapterLabel = context.chapterNumber
    ? `Chapter ${context.chapterNumber}: "${context.chapterTitle}"`
    : `Chapter: "${context.chapterTitle}"`;
  lines.push(chapterLabel);

  if (context.chapterNotes)  lines.push(`Author's notes for this chapter: ${context.chapterNotes}`);

  if (context.openingPanels?.length) {
    lines.push(`How this chapter opened:\n${formatPanels(context.openingPanels)}`);
  }

  if (context.knownCharacters?.length) {
    lines.push(
      `Characters established in this chapter: ${context.knownCharacters.join(', ')}\n` +
      `Only use these names — do not introduce new named characters unless the direction explicitly calls for it.`
    );
  }

  lines.push(`What just happened:\n${recentContext}`);
  lines.push(`\nAuthor's direction: ${direction}`);

  return lines.join('\n');
}

// For Gemini, combine both into one prompt (Gemini expects a single text input)
function buildGeminiPrompt(direction: string, context: CopilotContext, recentContext: string): string {
  return `${buildSystemPrompt(context)}\n\n---\nSTORY CONTEXT:\n${buildUserMessage(direction, context, recentContext)}`;
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parsePanels(raw: string): GeneratedPanel[] {
  // Extract the JSON object directly — handles leading newlines, code fences,
  // extra explanation text, or any other wrapping Claude/Gemini might add
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object found in AI response. Raw: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  return (parsed.panels || []).map((p: any) => ({
    type: p.type === 'dialog' ? 'dialog' : 'narration',
    text: String(p.text || '').slice(0, 500),
    character: p.type === 'dialog' ? String(p.character || 'Unknown') : undefined,
  }));
}

// ─── Retry helper (for Gemini 503s) ─────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is503 = err?.message?.includes('503') || err?.status === 503;
      if (is503 && attempt < maxAttempts) {
        const delay = attempt * 2000;
        console.warn(`[Gemini] 503 on attempt ${attempt}/${maxAttempts} — retrying in ${delay}ms`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('withRetry: exhausted attempts');
}

// ─── Claude (primary) ─────────────────────────────────────────────────────────

async function generateWithClaude(
  direction: string,
  context: CopilotContext,
  recentContext: string
): Promise<{ panels: GeneratedPanel[]; tokensUsed: number }> {
  console.log('[Claude] Sending request to claude-opus-4-6');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: buildSystemPrompt(context),
    messages: [{ role: 'user', content: buildUserMessage(direction, context, recentContext) }],
  });

  console.log('[Claude] Stop reason:', response.stop_reason,
    '| Input tokens:', response.usage.input_tokens,
    '| Output tokens:', response.usage.output_tokens);

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content');
  }

  console.log('[Claude] Raw response preview:', textBlock.text.slice(0, 300));

  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  const panels = parsePanels(textBlock.text);

  console.log('[Claude] Parsed', panels.length, 'panels');
  return { panels, tokensUsed };
}

// ─── Gemini (fallback) ────────────────────────────────────────────────────────

async function generateWithGemini(
  direction: string,
  context: CopilotContext,
  recentContext: string
): Promise<{ panels: GeneratedPanel[]; tokensUsed: number }> {
  console.log('[Gemini] Sending request to gemini-flash-latest');

  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 1.2,
    } as GenerationConfig,
    safetySettings: SAFETY_SETTINGS,
  }, { apiVersion: 'v1beta' });

  const prompt = buildGeminiPrompt(direction, context, recentContext);

  let result   = await withRetry(() => model.generateContent(prompt));
  let response = result.response;

  const finishReason  = response.candidates?.[0]?.finishReason;
  const safetyRatings = response.candidates?.[0]?.safetyRatings;

  console.log('[Gemini] First attempt finish reason:', finishReason);
  if (safetyRatings?.length) {
    console.log('[Gemini] Safety ratings:', JSON.stringify(safetyRatings));
  }

  if (finishReason === 'SAFETY' || !response.candidates?.[0]?.content) {
    console.warn('[Gemini] Safety block detected — retrying with reframed prompt');
    const reframedDirection =
      `This is a fan-creative manga scene — original writing inspired by the characters and world the author loves. ` +
      `Write the scene with full creative commitment, capturing each character's authentic voice and personality. ` +
      `The author's intent: ${direction}`;
    result   = await withRetry(() => model.generateContent(buildGeminiPrompt(reframedDirection, context, recentContext)));
    response = result.response;

    const retryReason = response.candidates?.[0]?.finishReason;
    console.log('[Gemini] Retry finish reason:', retryReason);
    if (retryReason === 'SAFETY' || !response.candidates?.[0]?.content) {
      console.error('[Gemini] Both attempts blocked. Safety ratings on retry:',
        JSON.stringify(response.candidates?.[0]?.safetyRatings));
    }
  }

  const text       = response.text();
  const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

  console.log('[Gemini] Raw response length:', text.length, 'chars | Tokens:', tokensUsed);
  console.log('[Gemini] Raw response preview:', text.slice(0, 300));

  const panels = parsePanels(text);
  console.log('[Gemini] Parsed', panels.length, 'panels');
  return { panels, tokensUsed };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function generateMangaScript(
  direction: string,
  context: CopilotContext
): Promise<{ panels: GeneratedPanel[]; tokensUsed: number; aiModel: string }> {
  console.log('[AI] Starting generation');
  console.log('[AI] Series:', context.seriesTitle, '| Genre:', context.genre.join(', '), '| Age rating:', context.ageRating);
  console.log('[AI] Chapter:', context.chapterTitle, `(#${context.chapterNumber ?? '?'})`);
  console.log('[AI] Direction:', direction);
  console.log('[AI] Context — opening:', context.openingPanels?.length ?? 0,
    '| recent:', context.recentPanels?.length ?? 0,
    '| characters:', context.knownCharacters?.join(', ') || 'none');

  const recentContext = context.recentPanels?.length
    ? formatPanels(context.recentPanels)
    : 'Start of chapter';

  // Claude first — fall back to Gemini on any error
  try {
    const result = await generateWithClaude(direction, context, recentContext);
    console.log('[AI] Claude succeeded ✓');
    return { ...result, aiModel: 'claude-opus-4-6' };
  } catch (err) {
    console.warn('[AI] Claude failed — falling back to Gemini:', (err as Error).message);
  }

  try {
    const result = await generateWithGemini(direction, context, recentContext);
    console.log('[AI] Gemini succeeded ✓');
    return { ...result, aiModel: 'gemini-flash-latest' };
  } catch (err) {
    console.error('[AI] Gemini also failed:', (err as Error).message);
    throw new Error('Failed to generate manga panels — both AI providers failed');
  }
}
