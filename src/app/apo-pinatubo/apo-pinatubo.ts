import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  buildAnswer,
  getAutocompleteMatches,
  initBM25
} from './pinatubo-engine';
import { Router } from "@angular/router";


export interface ChatMessage {
  role: 'apo' | 'user';
  paragraphs: string[];
  citations?: string[];
  followups?: string[];
}

const TYPING_BUBBLE_DURATION = 1200;

@Component({
  selector: 'app-apo-pinatubo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './apo-pinatubo.html',
  styleUrls: ['./apo-pinatubo.css']
})
export class ApoPinatubo implements OnInit {
  @ViewChild('chatEl') private chatEl?: ElementRef<HTMLDivElement>;
  @ViewChild('queryInput') private queryInputEl?: ElementRef<HTMLInputElement>;

  // Signal state management
  messages = signal<ChatMessage[]>([]);
  thinking = signal<boolean>(false);
  acItems = signal<string[]>([]);
  acIdx = signal<number>(-1);

  query = '';

  constructor(private router: Router) {}

  goBack(): void {
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/apo-pinatubo') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }

  starters: string[] = [
    "When did Mt. Pinatubo erupt?",
    "How many people died in the eruption?",
    "What is lahar?",
    "Who are the Aeta people?",
    "What happened to Clark Air Base?",
    "Who is Apu Namalyari?"
  ];

  ngOnInit(): void {
    // Warm up the BM25 index on init
    initBM25();

    this.addBotMessage(
      'Malaus ka! Welcome to the Apung Namalyari Field Guide.\n\n' +
      'Ask me anything about the 1991 eruption, lahars, or the Aeta people.'
    );
  }

  private scrollToBottom(): void {
    // requestAnimationFrame waits for the browser to finish laying out
    // the newly-added message before we read scrollHeight, so the
    // scroll always lands on the true bottom instead of one message behind.
    requestAnimationFrame(() => {
      if (this.chatEl) {
        const el = this.chatEl.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  private addBotMessage(text: string, citations?: string[], followups?: string[]): void {
    const paragraphs = text
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    this.messages.update(msgs => [
      ...msgs,
      { role: 'apo', paragraphs, citations, followups }
    ]);
    this.scrollToBottom();
  }

  private addUserMessage(text: string): void {
    this.messages.update(msgs => [
      ...msgs,
      { role: 'user', paragraphs: [text] }
    ]);
    this.scrollToBottom();
  }

  onInput(): void {
    const matches = getAutocompleteMatches(this.query);
    this.acItems.set(matches);
    this.acIdx.set(-1);
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.acItems();
    if (items.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.acIdx.update(i => (i < items.length - 1 ? i + 1 : 0));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.acIdx.update(i => (i > 0 ? i - 1 : items.length - 1));
        return;
      }
      if (event.key === 'Enter' && this.acIdx() >= 0) {
        event.preventDefault();
        this.selectAC(items[this.acIdx()]);
        return;
      }
      if (event.key === 'Escape') {
        this.clearAC();
        return;
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.handleAsk();
    }
  }

  selectAC(item: string): void {
    this.query = item;
    this.clearAC();
    this.handleAsk();
  }

  clearAC(): void {
    this.acItems.set([]);
    this.acIdx.set(-1);
  }

  highlightAC(item: string): string {
    if (!this.query.trim()) return item;
    const q = this.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${q})`, 'gi');
    return item.replace(regex, '<mark>$1</mark>');
  }

  askStarter(q: string): void {
    this.starters = this.starters.filter(s => s !== q);
    this.query = q;
    this.handleAsk();
  }

  askFollowup(f: string): void {
    this.query = f;
    this.handleAsk();
  }

  handleAsk(): void {
    const q = this.query.trim();
    if (!q || this.thinking()) return;

    this.addUserMessage(q);
    this.query = '';
    this.clearAC();
    this.thinking.set(true);
    this.scrollToBottom();

    setTimeout(() => {
      const ans = buildAnswer(q);
      this.thinking.set(false);
      this.addBotMessage(ans.text, ans.citations, ans.followups);
      setTimeout(() => this.queryInputEl?.nativeElement.focus(), 50);
    }, TYPING_BUBBLE_DURATION);
  }
}