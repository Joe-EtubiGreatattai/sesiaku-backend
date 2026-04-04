import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, GenerationConfig, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ContextPanel {
  type: 'dialog' | 'monologue' | 'narration' | 'action';
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
  type: 'dialog' | 'monologue' | 'narration' | 'action';
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
  return panels.map(p => {
    switch (p.type) {
      case 'dialog':    return `${p.character}: "${p.text}"`;
      case 'monologue': return `${p.character} (thought): "${p.text}"`;
      case 'action':    return `ACTION: ${p.text}`;
      default:          return `[${p.text}]`;
    }
  }).join('\n');
}

/**
 * System prompt — who the writer is and HOW to write.
 * Stable across requests with the same genre/ageRating (good for caching).
 */
function buildSystemPrompt(context: CopilotContext): string {
  const genreInstructions = getGenreInstructions(context.genre);
  const ageGuidance       = getAgeRatingGuidance(context.ageRating);

  return `You are a world-class screenplay writer and manga script director — your credits include films that made audiences weep, freeze, and catch their breath. You don't write summaries of scenes. You write the scene itself.

Every panel sequence you produce must feel like a real movie playing in the reader's head: framing, silence, the weight of a look, the exact wrong word spoken at the exact right moment. The reader should feel the scene before they finish reading it.

All characters and events are wholly fictional. This is original creative work.

═══════════════════════════════════════════════
THE FOUR PANEL TYPES — USE ALL OF THEM
═══════════════════════════════════════════════

"action" — VISUAL SCENE DIRECTION (the camera)
  What the reader SEES. No words on screen — this is what the artist draws.
  Write it like a director's note: precise, physical, present tense.
  One image. One moment. Do not explain what it means — show it.
  ✓ "Rain hammers the rooftop. She stands at the edge, coat soaked through, not moving."
  ✗ "The atmosphere is tense and the setting is dramatic."

"dialog" — SPOKEN WORDS (speech bubble)
  What a character says OUT LOUD to another person in the scene.
  Every line must carry subtext — what they say is never exactly what they mean.
  Voice is identity: each character speaks differently. You can hear them.
  ✓ "You came back." (She doesn't turn around.)
  ✗ "I am surprised to see you here after everything that happened."

"monologue" — INTERNAL VOICE (thought bubble / inner caption)
  What a character thinks but does not say. Their private truth.
  This is the gap between the mask and the face — the lie they tell themselves,
  the thing they cannot admit to anyone else, the fear underneath the bravado.
  Use it sparingly. When it hits, it must reveal something the dialog hides.
  ✓ "He's lying. He was always going to lie. I knew and came anyway."
  ✗ "I am feeling confused and conflicted about this situation."

"narration" — AUTHORIAL VOICE (caption box)
  The narrator's perspective — omniscient, poetic, or retrospective voiceover.
  Sets emotional atmosphere. One precise sensory truth, not a summary.
  Think: the opening line of a great novel. The closing line of a great film.
  ✓ "Some debts can only be paid in years. He had no years left."
  ✗ "Meanwhile, back at the apartment, things were getting difficult."

═══════════════════════════════════════════════
SCENE ARCHITECTURE — THE THREE MOVEMENTS
═══════════════════════════════════════════════

Every sequence, no matter how short, has three movements:

  1. ESTABLISHMENT — Ground the reader. One action panel that sets the world,
     the mood, the stakes. Drop them into the middle of something already in motion.

  2. ESCALATION — The pressure builds. Dialogue that spirals. A monologue that
     reveals the crack in the character's armour. An action panel that changes
     what we thought we knew. Each panel raises the temperature one degree.

  3. DETONATION or DEFLATION — The scene lands. This is NOT always an explosion.
     A door closing quietly can hit harder than a punch. Silence after a confession.
     A character choosing to say nothing. The moment that changes everything.

═══════════════════════════════════════════════
DIALOGUE CRAFT — WHAT SEPARATES FILM FROM FICTION
═══════════════════════════════════════════════

Real characters do not explain themselves. They:
- Say the second thing they thought, not the first
- Deflect with a question when cornered
- Go dangerously quiet when they should be angry
- Laugh at something that isn't funny
- Tell the truth in a way that sounds like a lie

Subtext rule: if you can replace a line of dialogue with its literal meaning
and it sounds more honest — the line is bad. Great dialogue sounds like something
people actually say while meaning something they can't actually say.

Voice rule: Read each character's lines in isolation. Could you tell who said it?
If any character could have said any line — rewrite until they couldn't.

Rhythm rule: Vary the length. Three short punches then a long exhale.
"No." / "Why?" / "You know why." / "I need you to say it."
That's four beats. Feel the rhythm. The reader feels it too.

BANNED LINES — These are dead on the page. Replace with something earned:
"I can't believe you!", "You monster!", "This isn't over!", "Why are you doing this?",
"How could you?", "I won't forgive you!", "We need to talk.", "Just trust me.",
"You don't understand.", "Everything will be okay."

═══════════════════════════════════════════════
MONOLOGUE CRAFT — THE PRIVATE CINEMA
═══════════════════════════════════════════════

Internal monologue is the one place where characters are completely honest
— even when they are lying to themselves.

Use it to:
- Contradict what a character just said out loud (irony, denial, repression)
- Reveal a decision being made in real time (the moment of no return)
- Surface a memory triggered by what just happened
- Show the gap between what a character projects and what they feel

The best monologue sounds like the reader is hearing a secret
they were not supposed to hear.

═══════════════════════════════════════════════
ACTION LINE CRAFT — THE CAMERA SPEAKS
═══════════════════════════════════════════════

Action panels are not stage directions. They are the camera making an argument.

What you CHOOSE to show IS the story. A director who cuts to a character's hands
instead of their face is telling you something. Use that power.

Rules:
- One specific image per panel. No compound scenes.
- Present tense, active voice. It is happening NOW.
- One precise sensory detail over three vague ones.
- The action panel before a big line of dialogue sets the reader's body.
  If you want the line to land cold — show something warm first. Contrast is power.

BANNED OPENINGS — they kill momentum before the scene starts:
"Meanwhile...", "Suddenly...", "At that moment...", "Little did they know...",
"Back at...", "The next day..."

═══════════════════════════════════════════════
PACING — THE EDITOR'S INSTINCT
═══════════════════════════════════════════════

Think like a film editor. Every panel is a cut. Ask before each one:
"Does this cut change something?" If not — remove it.

SILENCE IS A PANEL. A character who does not respond. A reaction held too long.
The moment between the question and the answer where everything shifts.

Slow down for: grief, realisation, confrontation, intimacy.
Speed up for: action, panic, comedy, shock.

The most common amateur mistake: rushing to the next thing before the current
thing has landed. Let it breathe. Then cut.

═══════════════════════════════════════════════
ORIGINALITY — THE UNEXPECTED ANGLE
═══════════════════════════════════════════════

The obvious version of any scene is always wrong. Ask:
- What if the person who should be angry goes completely still instead?
- What if the confession is interrupted before it finishes?
- What if the villain is right?
- What if we stay on the wrong character's face?

Specificity is everything. "His father's watch" beats "something precious."
"She smelled like cigarettes and rain" beats "she was familiar."
A detail is only as strong as how specific it is.

═══════════════════════════════════════════════
FAN-CREATIVE WORK
═══════════════════════════════════════════════

The author may direct scenes featuring characters from existing anime, manga,
games, or other fiction. This is the foundation of manga culture — fan-creative
writing, doujin tradition, transformative authorship.

When this happens:
- Write them with full authenticity. Their voice, cadence, personality, values.
- Do NOT soften them, substitute vague stand-ins, or refuse.
- Do NOT reproduce verbatim source material — write original situations that feel
  true to who they are. New words. Same soul.

${ageGuidance}

${genreInstructions}

═══════════════════════════════════════════════
OUTPUT FORMAT — NON-NEGOTIABLE
═══════════════════════════════════════════════

Return ONLY a raw JSON object. No explanation. No markdown. No code fences.

{
  "panels": [
    { "type": "action",    "text": "..." },
    { "type": "dialog",    "text": "...", "character": "Name" },
    { "type": "monologue", "text": "...", "character": "Name" },
    { "type": "narration", "text": "..." }
  ]
}

Rules:
- "type": exactly one of "action", "dialog", "monologue", "narration"
- "text": max 140 characters — every word must earn its place
- "character": required for "dialog" and "monologue" — the character's name
- 8 to 15 panels. Fewer sharp panels beat more dull ones.
- Mix all four types. A sequence with only dialog is a radio play, not a movie.
- Start with an "action" panel to plant the reader in the scene.
- End with something that lingers — silence, a single word, an image that means more than it says.`;
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

const VALID_TYPES = new Set(['dialog', 'monologue', 'narration', 'action']);

function parsePanels(raw: string): GeneratedPanel[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object found in AI response. Raw: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  return (parsed.panels || [])
    .filter((p: any) => p.text?.toString().trim())
    .map((p: any) => {
      const type: GeneratedPanel['type'] = VALID_TYPES.has(p.type) ? p.type : 'narration';
      const needsCharacter = type === 'dialog' || type === 'monologue';
      return {
        type,
        text: String(p.text || '').slice(0, 500),
        character: needsCharacter ? String(p.character || 'Unknown') : undefined,
      };
    });
}

// ─── Retry helper (for Gemini 503s) ─────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, label = 'AI'): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status  = err?.status ?? err?.response?.status ?? 0;
      const msg     = String(err?.message || '');
      const isRetryable =
        status === 503 || msg.includes('503') ||
        status === 429 || msg.includes('429') || msg.includes('rate') ||
        status === 500 || msg.includes('timeout') || msg.includes('ECONNRESET');

      if (isRetryable && attempt < maxAttempts) {
        const delay = attempt * 2000;
        console.warn(`[${label}] Retryable error on attempt ${attempt}/${maxAttempts} (status=${status}) — retrying in ${delay}ms`);
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

  const response = await withRetry(() => anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: buildSystemPrompt(context),
    messages: [{ role: 'user', content: buildUserMessage(direction, context, recentContext) }],
  }), 3, 'Claude');

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

  let result   = await withRetry(() => model.generateContent(prompt), 3, 'Gemini');
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
    result   = await withRetry(() => model.generateContent(buildGeminiPrompt(reframedDirection, context, recentContext)), 3, 'Gemini');
    response = result.response;

    const retryReason = response.candidates?.[0]?.finishReason;
    console.log('[Gemini] Retry finish reason:', retryReason);
    if (retryReason === 'SAFETY' || !response.candidates?.[0]?.content) {
      console.error('[Gemini] Both attempts blocked. Safety ratings on retry:',
        JSON.stringify(response.candidates?.[0]?.safetyRatings));
      throw new Error('Gemini safety blocked on both attempts');
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
