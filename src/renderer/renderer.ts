interface ClawdApi {
  onState(cb: (label: string) => void): void;
}
interface Window {
  clawd: ClawdApi;
}

const labelEl = document.getElementById('label') as HTMLDivElement;
window.clawd.onState((label) => {
  labelEl.textContent = label;
});
