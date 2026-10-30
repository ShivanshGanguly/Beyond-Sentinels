import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

// Route to process AI prompt and generate message suggestions
router.post('/api/generate-suggestion', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in .env file.' });
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are an AI assistant helping draft a WhatsApp message. Keep it natural, clear, and concise. Draft a message based on this context/prompt: ${prompt}`,
        });

        const generatedText = response.text;

        return res.json({ suggestion: generatedText });
    } catch (error) {
        console.error('AI Processing Error:', error.message);
        return res.status(500).json({ error: 'Failed to generate AI suggestion: ' + error.message });
    }
});

export default router;