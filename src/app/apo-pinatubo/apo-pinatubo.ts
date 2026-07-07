import {
  Component, OnInit, AfterViewChecked,
  ViewChild, ElementRef, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { buildAnswer, getAutocompleteMatches } from './pinatubo-engine';

interface ChatMessage {
citations: any;
  role: 'apo' | 'user';
  paragraphs: string[];
  pages?: number[];
  followups?: string[];
}

@Component({
  selector: 'app-apo-pinatubo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './apo-pinatubo.html',
  styleUrl: './apo-pinatubo.css',
})
export class ApoPinatubo implements OnInit, AfterViewChecked {

  @ViewChild('chatEl') chatEl!: ElementRef<HTMLDivElement>;
  @ViewChild('queryInput') queryInputEl!: ElementRef<HTMLInputElement>;

  query = '';
  acItems: string[] = [];
  acIdx = -1;
  private shouldScroll = false;

  // These two are signals, not plain fields, because they're the only
  // state mutated from inside a setTimeout callback — code that runs
  // completely outside anything Angular is watching in this zoneless
  // (no zone.js) app. A plain field write there would sit in memory but
  // never get painted to the screen until some unrelated event (like a
  // click anywhere) happened to trigger Angular's next render pass. A
  // signal write, by contrast, is tracked by Angular's own reactivity
  // graph no matter where it happens, so the view updates immediately
  // and automatically — no manual "please refresh now" call needed.
  messages = signal<ChatMessage[]>([]);
  thinking = signal(false);

  starters = [
    'When did Mt. Pinatubo erupt?',
    'How many people died?',
    'What is lahar?',
    'Who are the Aeta?',
    'What happened to Clark Air Base?',
    'Who is Apu Namalyari?',
  ];

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.addBotMessage(
      'Malaus ka! Welcome to the Apung Malyari Archive Guide.\n\n' +
      'I am here to help you discover the story of Mt. Pinatubo — the eruption that changed Central Luzon forever, the people who survived it, and the mountain that still stands today.\n\n' +
      'Feel free to ask me anything. I am happy to help!',
      [], []
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.chatEl) {
      const el = this.chatEl.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScroll = false;
    }
  }

  private textToParagraphs(text: string): string[] {
    return text
      .split('\n\n')
      .map(p => p.replace(/\n/g, '<br>').trim())
      .filter(p => p.length > 0);
  }

  private addBotMessage(text: string, pages: number[], followups: string[]): void {
    this.messages.update(msgs => [...msgs, {
      role: 'apo',
      paragraphs: this.textToParagraphs(text),
      pages,
      followups,
      citations: undefined
    }]);
    this.shouldScroll = true;
  }

  private addUserMessage(text: string): void {
    this.messages.update(msgs => [...msgs, {
      role: 'user', paragraphs: [text],
      citations: undefined
    }]);
    this.shouldScroll = true;
  }

  handleAsk(): void {
    const q = this.query.trim();
    if (!q || this.thinking()) return;
    this.addUserMessage(q);
    this.query = '';
    this.acItems = [];
    this.acIdx = -1;
    this.shouldScroll = true;

    // Only show the "thinking" seismograph if the lookup is actually slow
    // (most answers resolve in under a millisecond).
    const THINKING_INDICATOR_DELAY = 120;
    const showThinkingTimer = setTimeout(() => {
      this.thinking.set(true);
    }, THINKING_INDICATOR_DELAY);

    setTimeout(() => {
      const ans = buildAnswer(q);
      clearTimeout(showThinkingTimer);
      this.thinking.set(false);
      this.addBotMessage(ans.text, ans.pages, ans.followups);
      setTimeout(() => this.queryInputEl?.nativeElement.focus(), 50);
    }, 0);
  }

  askStarter(q: string): void {
    this.query = q;
    this.handleAsk();
  }

  askFollowup(q: string): void {
    this.query = q;
    this.handleAsk();
  }

  onInput(): void {
    this.acItems = getAutocompleteMatches(this.query);
    this.acIdx = -1;
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.acItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.acIdx = Math.min(this.acIdx + 1, this.acItems.length - 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.acIdx = Math.max(this.acIdx - 1, -1);
        return;
      }
      if (event.key === 'Tab' && this.acIdx >= 0) {
        event.preventDefault();
        this.query = this.acItems[this.acIdx];
        this.acItems = [];
        return;
      }
      if (event.key === 'Escape') {
        this.acItems = [];
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.acItems = [];
      this.handleAsk();
    }
  }

  selectAC(item: string): void {
    this.query = item;
    this.acItems = [];
    this.acIdx = -1;
    this.handleAsk();
  }

  highlightAC(item: string): string {
    const q = this.query.toLowerCase();
    if (!q) return item;
    const idx = item.toLowerCase().indexOf(q);
    if (idx < 0) return item;
    return (
      item.slice(0, idx) +
      '<mark>' + item.slice(idx, idx + q.length) + '</mark>' +
      item.slice(idx + q.length)
    );
  }

  goBack(): void {
    // Uses the previous route tracked app-wide in sessionStorage (see
    // app.ts) instead of the browser's native history.back() — kiosk
    // browsers and embedded webviews don't always support that reliably.
    // Falls back to the menu if there's no tracked previous page (e.g.
    // this route was opened directly, with nothing recorded yet).
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/apo-pinatubo') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }
}
