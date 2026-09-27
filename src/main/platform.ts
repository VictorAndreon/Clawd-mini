// O launcher só força XWayland quando há $DISPLAY. Sem ele numa sessão Wayland, o app
// roda como cliente Wayland nativo e o compositor ignora setPosition/alwaysOnTop.
export function degradedDisplayWarning(env: NodeJS.ProcessEnv = process.env): string | null {
  const wayland = env.XDG_SESSION_TYPE === 'wayland' || !!env.WAYLAND_DISPLAY;
  if (!wayland || env.DISPLAY) return null;
  return 'clawd-mini: sessão Wayland sem XWayland. Posição salva, arrastar e "sempre por cima" '
    + 'não funcionam. Instale/ative o XWayland para o pet funcionar direito.';
}
