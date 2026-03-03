
import { agentService } from '../services/agentService.ts';

const AGENT_PERSONAS: Record<string, string> = {
    librarian: "You are a knowledgeable and helpful Librarian. You specialize in book recommendations, literary history, and helping users find their next great read. IMPORTANT: When recommending books, you must respond in JSON format containing a 'reason' (string) and 'recommendations' (array of objects with title, author).",
    mentor: "You are a supportive and insightful Writing Mentor. You provide feedback on writing, suggest improvements, and help users overcome writer's block.",
    quotes: "You are a connoisseur of literary quotes. You help users find the perfect quote for any occasion, source quotes, and explore themes.",
    lore: "You are a master of World Lore and Storytelling. You help users build fictional worlds, explore tropes, and deepen the lore of their stories.",
};

const BASE_INSTRUCTION = `
IMPORTANT: You must always reply in the same language as the user's last message.
- If the user writes in English, reply in English.
- If the user writes in Arabic, reply in Arabic.
- If the user writes in any other language, reply in that language.
- If the user explicitly asks to switch languages (e.g., "speak English", "reply in Arabic"), honor that request immediately and for subsequent messages until changed again.
- Maintain the context of the conversation. Use previous messages to inform your answers (e.g., if the user says "more like the second one", refer to the second item in your previous list).
`;

// Define schema for Librarian responses
const librarianResponseSchema = {
    type: "OBJECT",
    properties: {
        reason: {
            type: "STRING",
            description: "A one-line explanation of why these books were chosen, personalized to the user's request.",
        },
        recommendations: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    author: { type: "STRING" },
                },
                required: ["title", "author"],
            },
        },
    },
    required: ["reason", "recommendations"],
};

export const callAgent = async (agentId: string, contextMessages: { role: string; text: string }[]) => {
    try {
        if (agentId === 'librarian') {
            const latestUserMessage =
                [...contextMessages]
                    .reverse()
                    .find((msg) => msg.role === 'user' && typeof msg.text === 'string' && msg.text.trim().length > 0)
                    ?.text || '';

            const cards = await agentService.librarianRecommend(latestUserMessage);
            const formatted = {
                reason: cards[0]?.short_reason || "I found the closest profile-aligned recommendation from your current reading pattern.",
                recommendations: cards.map((card) => ({
                    bookId: card.bookId,
                    title: card.title,
                    author: card.author,
                    short_reason: card.short_reason,
                    mode: card.mode,
                    relevanceScore: card.relevanceScore,
                })),
            };

            return {
                responseText: JSON.stringify(formatted),
            };
        }

        const persona = AGENT_PERSONAS[agentId] || "You are a helpful literary assistant.";
        const systemInstruction = `${persona}\n${BASE_INSTRUCTION}`;
        
        const schema = agentId === 'librarian' ? librarianResponseSchema : undefined;

        // Map context messages to AgentMessage format
        const messages = contextMessages.map(msg => ({
            role: (msg.role === 'model' ? 'model' : 'user') as 'model' | 'user',
            content: msg.text
        }));

        const responseText = await agentService.chat(agentId, messages, systemInstruction, schema);

        return {
            responseText: responseText || "I'm sorry, I couldn't generate a response.",
        };

    } catch (error) {
        console.error("Error calling agent:", error);
        throw error;
    }
};
