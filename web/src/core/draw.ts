import { Rng } from './rng';
import { Deck, emptyDeck } from './pieces';
import { Card, cardsFromDeck } from './cards';

// A caixa de peças da fase (puro): mistura as peças da run, entrega mãos e guarda o descarte.
// Peça descartada só volta quando a fase recomeça. Selo "Primeira" sobe para o topo ao misturar.
export class DrawPile {
  constructor(public pile: Card[] = [], public discard: Card[] = [], private rng: Rng = new Rng(1)) {}

  static fromCards(cards: readonly Card[], rng: Rng): DrawPile {
    const p = new DrawPile(cards.slice(), [], rng);
    p.shuffle();
    return p;
  }

  /** Atalho (testes/ferramentas): peças sem selo a partir de uma contagem por tipo. */
  static fromDeck(deck: Deck, rng: Rng): DrawPile { return DrawPile.fromCards(cardsFromDeck(deck), rng); }

  get size(): number { return this.pile.length; }

  private shuffle() {
    const a = this.pile;
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    // "Primeira": vai para o topo (mantendo a ordem sorteada entre elas)
    const first = a.filter((c) => c.seals.includes('first'));
    if (first.length) this.pile = [...first, ...a.filter((c) => !c.seals.includes('first'))];
  }

  /** Tira até `n` peças do topo. */
  draw(n: number): Card[] { return this.pile.splice(0, Math.max(0, n)); }

  /** A próxima peça (bênção Vidente). */
  peek(): Card | null { return this.pile[0] ?? null; }

  discardAll(cards: Card[]) { this.discard.push(...cards); }

  /** Devolve peças para a caixa em posições sorteadas (bênção Reciclagem). */
  returnShuffled(cards: Card[]) {
    for (const c of cards) this.pile.splice(this.rng.int(0, this.pile.length), 0, c);
  }

  /** Junta o que sobrou na caixa com o descarte e mistura de novo. */
  reshuffleRemaining() {
    this.pile = this.pile.concat(this.discard);
    this.discard = [];
    this.shuffle();
  }

  /** Conteúdo (sem a ordem) do que ainda está na caixa, por tipo. */
  composition(): Deck {
    const d = emptyDeck();
    for (const c of this.pile) d[c.type]++;
    return d;
  }
}
