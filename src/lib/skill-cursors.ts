function cursor(art: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${art}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
}

export const SKILL_TARGET_CURSORS = {
  seer: cursor('<path d="M3 16Q16 2 29 16Q16 30 3 16Z" fill="#eee1c3" stroke="#31261d" stroke-width="2"/><path d="M5 16Q16 5 27 16" fill="none" stroke="#b18d52" stroke-width="1"/><circle cx="16" cy="16" r="6" fill="#7a7153" stroke="#3b3021" stroke-width="1.2"/><circle cx="16" cy="16" r="2.8" fill="#241e1b"/><circle cx="14.5" cy="14" r="1.2" fill="#f8eed8"/>'),
  guard: cursor('<path d="M6 5Q16 1 26 5V16Q24 25 16 30Q8 25 6 16Z" fill="#927352" stroke="#27221b" stroke-width="2"/><path d="M8 7Q16 4 24 7V16Q22 23 16 27Q10 23 8 16Z" fill="#d3bd88" stroke="#f0dfb4" stroke-width="1"/><path d="M12 7V21M20 7V21" stroke="#8c7150" stroke-width="1"/><circle cx="16" cy="15" r="4" fill="#65705b" stroke="#342e24" stroke-width="1.2"/><path d="M14 13L18 17" stroke="#e3d5a9" stroke-width="1"/>'),
} as const;
