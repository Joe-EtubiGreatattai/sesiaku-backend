import { GoogleGenerativeAI, GenerationConfig, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
  openingPanels?: ContextPanel[];  // first panels of chapter — establishes tone
  recentPanels?: ContextPanel[];   // last panels — immediate prior context
  knownCharacters?: string[];      // all characters seen in this chapter so far
}

export interface GeneratedPanel {
  type: 'dialog' | 'narration';
  text: string;
  character?: string;
}

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// Genre-specific craft instructions — each genre has a different rhythm and emotional logic
function getGenreInstructions(genres: string[]): string {
  const g = genres.map(x => x.toLowerCase());

  const instructions: string[] = [];

  if (g.some(x => ['action', 'shonen', 'fighting', 'battle'].includes(x))) {
    instructions.push(
      'ACTION/SHONEN CRAFT: Cut fast — short panels, kinetic energy. Every line of dialog mid-fight should feel like a punch. ' +
      'Narration in action scenes should be percussive, staccato. Power and cost must be felt simultaneously — no win without sacrifice. ' +
      'Use silence before the decisive blow, not after.'
    );
  }
  if (g.some(x => ['horror', 'psychological', 'thriller', 'suspense'].includes(x))) {
    instructions.push(
      'HORROR/THRILLER CRAFT: Build dread through wrongness in ordinary things. The temperature, a sound that stops, something missing that should be there. ' +
      'Never name the fear — describe what the character notices with their body. Slower pacing amplifies terror. ' +
      'The most disturbing moment should be quiet, not loud. Avoid jump-scare structure — sustained unease is far more effective.'
    );
  }
  if (g.some(x => ['romance', 'shoujo', 'love', 'drama'].includes(x))) {
    instructions.push(
      'ROMANCE/DRAMA CRAFT: Physical proximity is emotional tension made visible. A hand almost touching means more than a declaration. ' +
      'Characters in love do not speak directly — they orbit. What goes unsaid is the whole story. ' +
      'Internal conflict should live in the narration, not as exposition. A small detail — the way someone laughs, a habit — can carry more weight than a confession.'
    );
  }
  if (g.some(x => ['fantasy', 'isekai', 'adventure', 'magic'].includes(x))) {
    instructions.push(
      'FANTASY/ADVENTURE CRAFT: Ground the extraordinary in physical sensation — the weight of a weapon, the smell of a spell, the cold of a portal. ' +
      'Wonder and danger must coexist. World-building belongs in action, not exposition. ' +
      'The stakes should feel personal, not just world-scale. What does the character stand to lose that matters to them specifically?'
    );
  }
  if (g.some(x => ['sci-fi', 'science fiction', 'mecha', 'cyberpunk'].includes(x))) {
    instructions.push(
      'SCI-FI CRAFT: Technology should feel like it has weight, cost, and failure modes. The cold precision of systems contrasted against raw human emotion. ' +
      'Jargon earns trust only when it reveals character — a pilot naming their mech\'s systems like a friend, a hacker\'s fear of being traced. ' +
      'The most powerful sci-fi moments are when the human breaks through the machine context.'
    );
  }
  if (g.some(x => ['slice of life', 'slice-of-life', 'comedy', 'everyday', 'school'].includes(x))) {
    instructions.push(
      'SLICE-OF-LIFE/COMEDY CRAFT: Small moments carry enormous weight. A cup of tea going cold. The wrong bus taken on purpose. ' +
      'Comedy lives in timing and specificity — the exact wrong thing said at the exact wrong moment. ' +
      'Mundane details are metaphors. Let characters be weird and specific, not types. The funniest lines are often the most sincere.'
    );
  }
  if (g.some(x => ['mystery', 'detective', 'crime'].includes(x))) {
    instructions.push(
      'MYSTERY CRAFT: Information is a weapon — reveal it strategically, never all at once. ' +
      'The detective\'s observations should feel like puzzle pieces the reader can almost solve. ' +
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
      return 'This is a teen-rated series. Intense themes and conflict are fine — just keep explicit graphic content restrained. Emotional depth and complexity are fully appropriate.';
    default:
      return 'This is an all-ages series. Keep content appropriate for general audiences while still being emotionally resonant and dramatically compelling.';
  }
}

function formatPanels(panels: ContextPanel[]): string {
  return panels
    .map(p => p.type === 'dialog' ? `${p.character}: "${p.text}"` : `[${p.text}]`)
    .join('\n');
}

function buildPrompt(direction: string, context: CopilotContext, recentContext: string): string {
  const genreInstructions = getGenreInstructions(context.genre);
  const ageGuidance = getAgeRatingGuidance(context.ageRating);

  const seriesDescriptionSection = context.seriesDescription
    ? `Series premise: ${context.seriesDescription}`
    : '';

  const tagsSection = context.tags?.length
    ? `Themes & tags: ${context.tags.join(', ')}`
    : '';

  const chapterPosition = context.chapterNumber
    ? `Chapter ${context.chapterNumber}: "${context.chapterTitle}"`
    : `Chapter: "${context.chapterTitle}"`;

  const chapterNotesSection = context.chapterNotes
    ? `Author's notes for this chapter: ${context.chapterNotes}`
    : '';

  const openingSection = context.openingPanels?.length
    ? `How this chapter opened:\n${formatPanels(context.openingPanels)}`
    : '';

  const charactersSection = context.knownCharacters?.length
    ? `Characters established in this chapter: ${context.knownCharacters.join(', ')}\nOnly use these names — do not introduce new named characters unless the direction explicitly calls for it.`
    : '';

  const storyContextBlock = [
    `Series: "${context.seriesTitle}"`,
    seriesDescriptionSection,
    tagsSection,
    `Genre: ${context.genre.join(', ')}`,
    ageGuidance,
    chapterPosition,
    chapterNotesSection,
    openingSection,
    charactersSection,
    `What just happened:\n${recentContext}`,
  ].filter(Boolean).join('\n');

  return `You are a master manga script writer — your work is visceral, surprising, and emotionally unforgettable. You are writing an original story for the Seisaku platform. All characters and events are wholly fictional.

Your output must feel like it was written by a seasoned author, not a template engine. Every panel must earn its place.

---
UNIVERSAL WRITING PRINCIPLES:

DIALOG:
- Characters never say exactly what they feel — they deflect, lie, go quiet, or attack sideways. Subtext is everything.
- Each character has a distinct voice — shaped by their history, their pain, their wants.
- The most powerful lines are short and leave something unsaid. "You knew." hits harder than "I can't believe you knew this whole time."
- Banned phrases (these are filler — replace with something specific to THIS character): "I can't believe you!", "You monster!", "This isn't over!", "Why are you doing this?", "How could you?", "I won't forgive you."

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

${genreInstructions}

---
OUTPUT FORMAT:
Return ONLY a valid JSON object with a "panels" array. No explanation, no markdown, no wrapper.
Each panel:
- "type": "dialog" or "narration"
- "text": max 120 characters — tight, precise, every word deliberate
- "character": speaker's name (only when type is "dialog")

Max 15 panels. Quality over quantity — 8 panels that land beats 15 that don't.

---
STORY CONTEXT:
${storyContextBlock}

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
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 1.2,
    } as GenerationConfig,
    safetySettings: SAFETY_SETTINGS,
  }, { apiVersion: 'v1beta' });

  const recentContext = context.recentPanels?.length
    ? formatPanels(context.recentPanels)
    : 'Start of chapter';

  const prompt = buildPrompt(direction, context, recentContext);

  let result = await model.generateContent(prompt);
  let response = result.response;

  // Retry with reframed direction if safety-blocked
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === 'SAFETY' || !response.candidates?.[0]?.content) {
    console.warn('Gemini safety block — retrying with reframed prompt');
    const reframedDirection = `Write a dramatic manga scene capturing the emotional and narrative weight of: ${direction}. Use literary craft and subtext.`;
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
