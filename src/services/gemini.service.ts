import { GoogleGenerativeAI, GenerationConfig, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface RecentPanel {
  type: 'dialog' | 'narration';
  text: string;
  character?: string;
}

interface CopilotContext {
  seriesTitle: string;
  genre: string[];
  chapterTitle: string;
  recentPanels?: RecentPanel[];
}

export interface GeneratedPanel {
  type: 'dialog' | 'narration';
  text: string;
  character?: string;
}

// Allow creative fiction content — only block genuinely extreme content
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

function buildPrompt(direction: string, context: CopilotContext, recentContext: string): string {
  return `You are a master manga script writer — your work is known for being visceral, surprising, and emotionally unforgettable. You are writing an original story for the Seisaku platform. All characters and events are wholly fictional.

Your output must feel like it was written by a seasoned author, not a template engine. Every panel must earn its place.

---
WRITING PRINCIPLES — internalize these, do not state them:

DIALOG:
- Characters never say exactly what they feel — they deflect, lie, go quiet, or attack sideways. Subtext is everything.
- Each character has a distinct voice. A tired soldier speaks differently from a ruthless noble or a grieving child.
- The most powerful lines are short and leave something unsaid. "You knew." hits harder than "I can't believe you knew this whole time."
- Avoid: "I can't believe you did that!", "You monster!", "This isn't over!", "Why are you doing this?" — these are filler. Replace with something specific to THIS character in THIS moment.

NARRATION:
- Anchor the reader with one precise sensory detail — smell, sound, temperature, texture. Not "it was cold" — "frost on the window glass, thin as breath."
- Narration sets the emotional undertone, not just the scene. It should make the reader feel something before dialog starts.
- Vary rhythm. Short, clipped sentences for action and shock. Longer, slower sentences for grief or dread.
- Avoid: "Meanwhile...", "Suddenly...", "Little did they know..." — these are lazy. Drop the reader into the moment.

PACING:
- Not every panel is equal weight. Build — then release. A single silent narration panel before a confrontation does more than three panels of explanation.
- Let characters breathe. A pause, a look away, a hand reaching for something and stopping — these are panels too.
- If the direction calls for a fight, betrayal, or revelation — don't rush to the climax. Make the reader feel it coming.

ORIGINALITY:
- Take the unexpected angle. If the obvious move is Character A yells at Character B — ask: what if they went completely quiet? What if they laughed?
- Earn every emotional beat. A death means nothing if we haven't felt the person. A victory means nothing without cost.
- Specificity over generality always. "His father's watch" beats "something precious." "She smelled like cigarettes and winter" beats "she was there."

---
OUTPUT FORMAT:
Return ONLY a valid JSON object with a "panels" array. No explanation, no markdown, no wrapper — just the JSON.
Each panel:
- "type": "dialog" or "narration"
- "text": max 120 characters — tight, precise, every word deliberate
- "character": speaker's name (only when type is "dialog")

Max 15 panels. Quality over quantity — 8 panels that land is better than 15 that don't.

---
STORY CONTEXT:
Series: "${context.seriesTitle}"
Genre: ${context.genre.join(', ')}
Chapter: "${context.chapterTitle}"
What just happened:
${recentContext}

Author's direction: ${direction}`;
}

function parsePanels(text: string): GeneratedPanel[] {
  const parsed = JSON.parse(text);
  return (parsed.panels || []).map((p: any) => ({
    type: p.type === 'dialog' ? 'dialog' : 'narration',
    text: String(p.text || '').slice(0, 500),
    character: p.type === 'dialog' ? String(p.character || 'Unknown') : undefined,
  }));
}

export async function generateMangaScript(
  direction: string,
  context: CopilotContext
): Promise<{ panels: GeneratedPanel[]; tokensUsed: number }> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: { responseMimeType: 'application/json' } as GenerationConfig,
    safetySettings: SAFETY_SETTINGS,
  }, { apiVersion: 'v1beta' });

  const recentContext = context.recentPanels?.length
    ? context.recentPanels
        .map(p => p.type === 'dialog' ? `${p.character}: "${p.text}"` : `[Narration: ${p.text}]`)
        .join('\n')
    : 'Start of chapter';

  const prompt = buildPrompt(direction, context, recentContext);

  let result = await model.generateContent(prompt);
  let response = result.response;

  // If blocked by safety filters, retry with direction wrapped in narrative framing
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === 'SAFETY' || !response.candidates?.[0]?.content) {
    console.warn('Gemini safety block on first attempt, retrying with reframed prompt');
    const reframedDirection = `Write a dramatic manga scene. The author's intent: ${direction}. Focus on the emotional and narrative impact using literary storytelling craft.`;
    result = await model.generateContent(buildPrompt(reframedDirection, context, recentContext));
    response = result.response;
  }

  const text = response.text();
  const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

  try {
    return { panels: parsePanels(text), tokensUsed };
  } catch (err) {
    console.error('Gemini JSON Parse Error:', err, 'Raw text:', text);
    throw new Error('Failed to parse AI response into valid manga panels');
  }
}
