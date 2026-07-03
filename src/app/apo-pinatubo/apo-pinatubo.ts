import {
  Component, OnInit, AfterViewChecked,
  ViewChild, ElementRef, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { buildAnswer, getAutocompleteMatches } from './pinatubo-engine';

interface ChatMessage {
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
  messages: ChatMessage[] = [];
  thinking = false;
  acItems: string[] = [];
  acIdx = -1;
  private shouldScroll = false;

  starters = [
    'When did Mt. Pinatubo erupt?',
    'How many people died?',
    'What is lahar?',
    'Who are the Aeta?',
    'What happened to Clark Air Base?',
    'Who is Apu Namalyari?',
  ];

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.addBotMessage(
      'Malaus ka! Welcome to the Apo Pinatubo Archive Guide.\n\n' +
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
    this.messages.push({
      role: 'apo',
      paragraphs: this.textToParagraphs(text),
      pages,
      followups,
    });
    this.shouldScroll = true;
  }

  private addUserMessage(text: string): void {
    this.messages.push({ role: 'user', paragraphs: [text] });
    this.shouldScroll = true;
  }

  handleAsk(): void {
    const q = this.query.trim();
    if (!q || this.thinking) return;
    this.addUserMessage(q);
    this.query = '';
    this.acItems = [];
    this.acIdx = -1;
    this.shouldScroll = true;

    // Only show the "thinking" seismograph if the lookup is actually slow
    // (most answers resolve in under a millisecond).
    const THINKING_INDICATOR_DELAY = 120;
    const showThinkingTimer = setTimeout(() => {
      this.thinking = true;
      // This app runs zoneless Angular (no zone.js) — a plain setTimeout
      // callback does not trigger a re-render on its own, so we have to
      // ask Angular to update the view explicitly.
      this.cdr.detectChanges();
    }, THINKING_INDICATOR_DELAY);

    setTimeout(() => {
      const ans = buildAnswer(q);
      clearTimeout(showThinkingTimer);
      this.thinking = false;
      this.addBotMessage(ans.text, ans.pages, ans.followups);
      // Same reason as above: without this, the computed answer sits in
      // memory but never appears on screen until some unrelated click
      // happens to trigger Angular's next change-detection pass.
      this.cdr.detectChanges();
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
    this.router.navigate(['/menu']);
  }
}
