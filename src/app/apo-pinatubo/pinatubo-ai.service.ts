import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { retrieveContext, ContextPassage } from './pinatubo-engine';

export interface AIAnswer {
  text: string;
  citations: string[];
  followups: string[];
}

interface AskResponse {
  answer: string;
  citations: string[];
  followups: string[];
}

// How many source passages to hand the model as grounding context.
const CONTEXT_TOP_K = 12;

// Keeps the seismo typing indicator on screen for a believable beat
// even when a response comes back very fast.
const MIN_THINK_MS = 550;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class PinatuboAiService {
  // Same-origin path — works behind the dev proxy (proxy.conf.json)
  // and behind a reverse proxy in production.
  private readonly endpoint = '/api/pinatubo/ask';

  constructor(private http: HttpClient) {}

  async ask(question: string): Promise<AIAnswer> {
    const started = Date.now();
    const result = await this.resolve(question);
    const elapsed = Date.now() - started;
    if (elapsed < MIN_THINK_MS) {
      await sleep(MIN_THINK_MS - elapsed);
    }
    return result;
  }

  private async resolve(question: string): Promise<AIAnswer> {
    const passages: ContextPassage[] = retrieveContext(question, CONTEXT_TOP_K);

    try {
      const res = await firstValueFrom(
        this.http.post<AskResponse>(this.endpoint, { question, passages })
      );
      return {
        text: res.answer,
        citations: res.citations ?? [],
        followups: res.followups ?? []
      };
    } catch (err) {
      console.error('[Apo Namalyari] request failed:', err);
      return {
        text: "I'm having trouble reaching my knowledge base right now — please check your connection and try again in a moment.",
        citations: [],
        followups: []
      };
    }
  }
}
