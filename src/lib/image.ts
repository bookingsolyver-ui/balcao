/** Só no browser: reduz a foto (máx. 900 px, JPEG) antes de enviar. Poupa dados e armazenamento. */
export async function resizeToJpeg(file: File, max = 900, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  if (file.size > 8 * 1024 * 1024) throw new Error('too_big');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // fundo branco para PNG com transparência
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', quality));
}
