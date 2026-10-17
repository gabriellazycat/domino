// Bênçãos do altar místico: permanentes, valem para a run inteira.
export type BuffId = 'bighand' | 'breath' | 'vigor' | 'greed' | 'seer' | 'recycle';

export interface BuffDef {
  id: BuffId;
  name: string;
  desc: string;
  price: number;
  /** quantas vezes dá para ter */
  max: number;
  /** cor do brilho no altar e do ícone */
  color: string;
}

export const BUFFS: Record<BuffId, BuffDef> = {
  bighand: { id: 'bighand', name: 'Mão Grande', desc: '+1 peça em cada mão.', price: 60, max: 2, color: '#e8dcc0' },
  breath: { id: 'breath', name: 'Fôlego', desc: '+1 tentativa em toda fase.', price: 48, max: 1, color: '#7fd0ff' },
  vigor: { id: 'vigor', name: 'Vigor', desc: '+3 de vida máxima (e cura 3).', price: 32, max: 3, color: '#ff5a5a' },
  greed: { id: 'greed', name: 'Avareza', desc: '+30% de ouro ao vencer uma fase.', price: 40, max: 1, color: '#f2c14e' },
  seer: { id: 'seer', name: 'Vidente', desc: 'A caixa mostra qual é a próxima peça.', price: 28, max: 1, color: '#b98cff' },
  recycle: { id: 'recycle', name: 'Reciclagem', desc: 'A primeira Nova mão de cada tentativa devolve as sobras para a caixa, em vez de descartar.', price: 36, max: 1, color: '#7ee0a0' },
};
export const BUFF_ORDER: BuffId[] = ['bighand', 'breath', 'vigor', 'greed', 'seer', 'recycle'];

export type Buffs = Partial<Record<BuffId, number>>;
export const buffLevel = (b: Buffs | undefined, id: BuffId): number => b?.[id] ?? 0;
export const buffMaxed = (b: Buffs | undefined, id: BuffId): boolean => buffLevel(b, id) >= BUFFS[id].max;
