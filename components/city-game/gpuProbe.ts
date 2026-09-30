/**
 * Read the GPU's name before the game's canvas exists.
 *
 * The starting preset decides things that are fixed when the WebGL context
 * is created (whether the canvas is multisampled), so the GPU has to be known
 * first. A throwaway context answers that and is released straight away.
 */

let cached: string | null = null;

/** Unmasked renderer string, or '' when the browser hides it. */
export function probeGpu(): string {
  if (cached !== null) return cached;
  cached = '';
  if (typeof document === 'undefined') return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return cached;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) cached = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    // Browsers cap live contexts; give this one back now instead of at GC.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Blocked or fingerprint-protected: detectTier treats '' as medium.
  }
  return cached;
}
