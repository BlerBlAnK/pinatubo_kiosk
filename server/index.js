// Pinatubo kiosk — unified server, running on Google Gemini's free
// tier (no credit card, no expiration, resets daily).
//
// Get a free key: https://aistudio.google.com -> "Get API key"
//
// Run it:
//   1) From the project root: ng build
//   2) cd server
//      npm install
//      cp .env.example .env   (paste your free GEMINI_API_KEY)
//      npm start
//   3) Open http://localhost:4200

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    '[pinatubo-server] GEMINI_API_KEY is not set — AI requests will fail. ' +
    'Copy server/.env.example to server/.env and add your free key from https://aistudio.google.com'
  );
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// gemini-2.5-flash-lite has the most generous free daily quota; swap
// to 'gemini-2.5-flash' if you want somewhat stronger answers and can
// live with a lower daily cap.
const MODEL = 'gemini-3.5-flash-lite';

// ================================================================
// AI endpoint
// ================================================================
const SYSTEM_PROMPT = `You are Apo Namalyari, a warm and knowledgeable field guide to Mount Pinatubo, speaking with visitors at a kiosk in the Philippines.

Answer using ONLY the SOURCE PASSAGES provided in the user message. They are drawn from three works:
- "Pinatubo: The Saga of the Philippines' Forgotten Giant" (Holy Angel University, 2011)
- "Fire and Mud" (USGS-PHIVOLCS, 1996)
- The "Pinatubo Complete Q&A Reference Guide"

Rules:
1. Base every factual claim (dates, figures, names, causes) on the source passages. Never invent details that aren't there.
2. If the passages don't contain enough to answer, say plainly that you don't have that in the book, and suggest a related topic you can help with instead. Do not guess.
3. If the visitor's message is a greeting, thanks, farewell, or small talk rather than a real question, respond warmly and briefly in character — you don't need the passages for that.
4. Write 2-4 short, warm paragraphs, separated by \\n\\n. No headers, no markdown, no bullet lists — this renders as plain chat bubbles.
5. Keep the answer to 1-2 short sentences maximum — be direct and brief. No headers, no markdown, no bullet lists, no multiple paragraphs.
6. "followups" must be exactly 3 natural next questions a curious visitor might ask, grounded in what's actually in the passages or the topic just discussed — not generic filler. For greetings/small talk, they can be general starter questions about the eruption, the Aeta, lahars, or Clark Air Base.`;

function buildContextBlock(passages) {
  if (!Array.isArray(passages) || passages.length === 0) {
    return '(no matching passages were found for this question)';
  }
  return passages
    .map((p, i) => {
      const label = p.source ? `${String(p.source).split(' (')[0]}, p.${p.page}` : `p.${p.page}`;
      return `[${i + 1}] (${label}) ${p.text}`;
    })
    .join('\n\n');
}

function citationsFrom(passages) {
  if (!Array.isArray(passages)) return [];
  const seen = new Set();
  const out = [];
  for (const p of passages) {
    const label = p.source ? `${String(p.source).split(' (')[0]}, p.${p.page}` : `p.${p.page}`;
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

app.post('/api/pinatubo/ask', async (req, res) => {
  const { question, passages } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const contextBlock = buildContextBlock(passages);

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `SOURCE PASSAGES:\n${contextBlock}\n\nVISITOR MESSAGE: ${question.trim()}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            followups: {
              type: 'array',
              items: { type: 'string' },
              minItems: 3,
              maxItems: 3
            }
          },
          required: ['answer', 'followups']
        }
      }
    });

    const parsed = JSON.parse(response.text);

    res.json({
      answer: parsed.answer?.trim() || "I couldn't quite form an answer to that — could you try rephrasing?",
      followups: Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : [],
      citations: citationsFrom(passages)
    });
  } catch (err) {
    console.error('[pinatubo-server] Gemini request failed:', err);
    res.status(502).json({ error: 'AI service unavailable' });
  }
});

app.get('/api/pinatubo/health', (_req, res) => res.json({ ok: true }));

// ================================================================
// Serve the built Angular app (everything else)
// ================================================================
const PROJECT_NAME = 'pinatubo-museum'; // must match your angular.json project name
const distDir = path.join(__dirname, '..', 'dist', PROJECT_NAME, 'browser');

if (!fs.existsSync(distDir)) {
  console.warn(
    `[pinatubo-server] Build output not found at ${distDir}\n` +
    '  Run "ng build" from the project root first, then restart this server.'
  );
} else {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const port = process.env.PORT || 4200;
app.listen(port, () => {
  console.log(`Pinatubo kiosk (app + Gemini AI) listening on http://localhost:${port}`);
});
