import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';

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

export async function generateMangaScript(
  direction: string,
  context: CopilotContext
): Promise<{ panels: GeneratedPanel[]; tokensUsed: number }> {
  // Use Gemini 1.5 Flash for speed and cost-effectiveness
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-flash-latest',
    generationConfig: {
      responseMimeType: 'application/json',
    } as GenerationConfig,
  }, { apiVersion: 'v1beta' });

  const recentContext = context.recentPanels?.length
    ? context.recentPanels
        .map(p => p.type === 'dialog' ? `${p.character}: "${p.text}"` : `[Narration: ${p.text}]`)
        .join('\n')
    : 'Start of chapter';

  const prompt = `You are a professional manga script writer for the Seisaku platform.
Generate a manga script based on the following context and direction.

Return ONLY a JSON object with a "panels" array. 
Each panel object must contain:
- "type": either "dialog" or "narration"
- "text": the content (max 120 characters per panel, keep it punchy)
- "character": the character's name (required ONLY when type is "dialog")

Rules:
- Max 15 panels per response.
- Keep dialog sharp and character-driven.
- Narration should be vivid and setting the scene.
- Maintain consistency with the series genre and chapter title.

Series Title: ${context.seriesTitle}
Genre: ${context.genre.join(', ')}
Chapter: ${context.chapterTitle}
Recent Context:
${recentContext}

Direction from user: ${direction}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  try {
    const parsed = JSON.parse(text);
    const panels: GeneratedPanel[] = (parsed.panels || []).map((p: any) => ({
      type: p.type === 'dialog' ? 'dialog' : 'narration',
      text: String(p.text || '').slice(0, 500),
      character: p.type === 'dialog' ? String(p.character || 'Unknown') : undefined,
    }));

    // Gemini token usage is slightly different, we'll estimate or just return 0 for now as it's not strictly used for billing here yet
    const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

    return { panels, tokensUsed };
  } catch (err) {
    console.error('Gemini JSON Parse Error:', err, 'Raw text:', text);
    throw new Error('Failed to parse AI response into valid manga panels');
  }
}
