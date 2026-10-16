// Ícones da interface: traço de tinta (contorno arredondado, cor = currentColor), no lugar dos emojis,
// que mudam de desenho conforme o sistema operacional e fogem do estilo do jogo.
const SHAPES: Record<string, string> = {
  heart: '<path d="M12 20.2C8.4 17.6 4.2 14.5 4.2 9.9 4.2 7.2 6.2 5.3 8.6 5.3c1.5 0 2.7.8 3.4 2 .7-1.2 1.9-2 3.4-2 2.4 0 4.4 1.9 4.4 4.6 0 4.6-4.2 7.7-7.8 10.3z" fill="currentColor"/>',
  coin: '<circle cx="12" cy="12" r="8.6" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="12" r="8.6"/><path d="M14.6 9.2c-.5-.8-1.4-1.2-2.6-1.2-1.5 0-2.5.7-2.5 1.8 0 2.6 5.3 1.3 5.3 4 0 1.1-1.1 1.9-2.7 1.9-1.3 0-2.3-.5-2.8-1.4M12 6.4v1.4M12 16.2v1.4"/>',
  pause: '<rect x="6.5" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/><rect x="13.9" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/>',
  fast: '<path d="M4 6.2l7.4 5.8L4 17.8z" fill="currentColor"/><path d="M12.6 6.2l7.4 5.8-7.4 5.8z" fill="currentColor"/>',
  skip: '<path d="M4 6.2l8.2 5.8L4 17.8z" fill="currentColor"/><rect x="14.2" y="6" width="2.8" height="12" rx="1" fill="currentColor"/><path d="M19.6 6v12" />',
  undo: '<path d="M9.5 6.5L5 11l4.5 4.5"/><path d="M5.5 11H14a5 5 0 0 1 0 10h-3"/>',
  clear: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  deck: '<rect x="7.5" y="3.8" width="11" height="15.2" rx="1.8" transform="rotate(10 13 11.4)" fill="currentColor" fill-opacity=".15"/><rect x="5.2" y="5" width="11" height="15.2" rx="1.8" fill="currentColor" fill-opacity=".3"/><path d="M8 9.5h5.5M8 12.6h4"/>',
  play: '<path d="M7.5 5.2l11.2 6.8-11.2 6.8z" fill="currentColor"/>',
  star: '<path d="M12 3.6l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 17.2l-5.3 2.7 1.1-5.9-4.4-4.1 6-.8z" fill="currentColor"/>',
  sword: '<path d="M5 19.2l3.6-.9 9.6-9.6-2.7-2.7-9.6 9.6z" fill="currentColor" fill-opacity=".2"/><path d="M14.4 6.6l3-3 3 3-3 3M5 19.2l-1.5 1.5M9 15l-2 2"/>',
};

/** SVG inline de um ícone da interface (use dentro de innerHTML). */
export function icon(name: keyof typeof SHAPES, cls = ''): string {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SHAPES[name]}</svg>`;
}
