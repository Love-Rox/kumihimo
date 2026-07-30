/**
 * Getting a diagram out of the browser and onto disk.
 */

/**
 * Prompt the browser to save some content as a file.
 *
 * @param content - What to save.
 * @param filename - Suggested name.
 * @param type - MIME type.
 */
export function download(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking immediately would race the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save the diagram as SVG.
 *
 * @param svg - The rendered SVG document.
 * @param filename - Suggested name.
 */
export function downloadSvg(svg: string, filename = 'diagram.svg'): void {
  download(svg, filename, 'image/svg+xml;charset=utf-8');
}

/** Read the pixel dimensions declared on an SVG document. */
function dimensionsOf(svg: string): { width: number; height: number } {
  const width = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  const height = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  return { width: width || 800, height: height || 600 };
}

/**
 * Rasterise the diagram and save it as PNG.
 *
 * The SVG is drawn through an `Image`, which is the only way a browser will rasterise
 * markup. It is loaded from a data URL rather than a blob URL because a blob-sourced SVG
 * taints the canvas in some browsers, and a tainted canvas cannot be exported at all.
 *
 * @param svg - The rendered SVG document.
 * @param filename - Suggested name.
 * @param scale - Pixel ratio. Two gives a file that holds up when printed.
 * @returns Resolves once the file has been offered, rejects if the image cannot load.
 */
export async function downloadPng(svg: string, filename = 'diagram.png', scale = 2): Promise<void> {
  const { width, height } = dimensionsOf(svg);
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = new Image();
  image.width = width;
  image.height = height;

  await new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve());
    image.addEventListener('error', () =>
      reject(new Error('SVG を画像として読み込めませんでした')),
    );
    image.src = encoded;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas を初期化できませんでした');
  // The SVG has its own opaque background, but a transparent gap around the edges would
  // otherwise come out black in some viewers.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG を生成できませんでした');
  download(blob, filename, 'image/png');
}
