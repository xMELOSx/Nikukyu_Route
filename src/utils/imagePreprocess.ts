/**
 * Pre-process an image file for better Tesseract OCR accuracy.
 *
 * The full-game screenshot has lots of dark UI chrome and small text.
 * We:
 *   1. Scale up 2x with nearest-neighbour (preserves crisp edges)
 *   2. Convert to grayscale
 *   3. Binarize with a fixed threshold (the game text is bright on dark)
 */
export async function preprocessImageForOcr(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');

    // Nearest-neighbour scaling keeps text strokes sharp
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Convert to grayscale, then binarize. Game text is typically light-on-dark.
    // Use a higher threshold so the bright text becomes solid white on black.
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Invert + threshold: bright pixels become black text, dark background becomes white
      const bin = lum > 110 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = bin;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}
