// Web Fullscreen API toggle. Different from F11 / macOS native fullscreen,
// which keep the address bar reachable on hover-top — this drops all
// browser chrome on every platform.
export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
