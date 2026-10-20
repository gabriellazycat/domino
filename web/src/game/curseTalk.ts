import type { PieceId } from '../core/pieces';
import { t } from '../i18n';

// Falas das peças malditas (balãozinho raro na mesa e no Presente do Dono).
export const CURSE_LINES: Partial<Record<PieceId, { idle: string[]; placed: string[]; fall: string[] }>> = {
  metal: {
    idle: ['Não saio daqui.', 'Pode empurrar. Eu espero.', 'Sou de lata, não de papel.'],
    placed: ['Daqui ninguém me tira.', 'Hehe. Fincada.'],
    fall: ['Aiii, pesada não vale!', 'Tá bom, tá bom…'],
  },
  crooked: {
    idle: ['Ops, virei de novo?', 'Reto é tão sem graça.', 'Hihihi.'],
    placed: ['Vou pular para o lado!', 'Para lá é mais bonito!'],
    fall: ['Wheee!', 'Foi de propósito!'],
  },
  minion: {
    idle: ['Surpresa!', 'O chefe mandou lembranças.', 'Vem, vem…'],
    placed: ['Surpresa!', 'Agora sou eu o inimigo.'],
    fall: ['Volto na próxima!', 'Contem ao chefe…'],
  },
  wander: {
    idle: ['Só vou ali e já volto.', 'Lá-lá-lá…', 'Que vista bonita daqui!'],
    placed: ['Fico parada? Não prometo.', 'Vou dar uma voltinha.'],
    fall: ['Nem me despedi!', 'Ei, eu tava passeando!'],
  },
  jealous: {
    idle: ['Ninguém me nota…', 'Ela é especial e eu não…', 'Hmpf.'],
    placed: ['Se eu não brilho, ninguém brilha.', 'Por que elas e não eu?'],
    fall: ['Ao menos caí junto…', 'Finalmente me olharam.'],
  },
};

export function curseLine(type: PieceId, kind: 'idle' | 'placed' | 'fall'): string | null {
  const l = CURSE_LINES[type]?.[kind];
  return l && l.length ? t(l[Math.floor(Math.random() * l.length)]) : null;
}
