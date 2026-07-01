import { type Point } from './DataManager';

export async function detectWallsFromImage(
  imageUrl: string,
  gridSize = 16,
  threshold = 60
): Promise<[Point, Point][]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Force canvas to match SVG coordinate system 1600x4550 to avoid scaling mismatch!
        canvas.width = 1600;
        canvas.height = 4550;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve([]);
          return;
        }
        ctx.drawImage(img, 0, 0, 1600, 4550);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        const cols = Math.ceil(canvas.width / gridSize);
        const rows = Math.ceil(canvas.height / gridSize);

        // 1. Determine if each cell contains wall pixels (dark gray / black)
        const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            // Check central pixel of the cell
            const px = Math.min(canvas.width - 1, Math.floor((c + 0.5) * gridSize));
            const py = Math.min(canvas.height - 1, Math.floor((r + 0.5) * gridSize));
            const idx = (py * canvas.width + px) * 4;
            const red = data[idx];
            const green = data[idx + 1];
            const blue = data[idx + 2];
            const alpha = data[idx + 3];

            // If opaque and dark
            if (alpha > 50 && red < threshold && green < threshold && blue < threshold) {
              grid[r][c] = true;
            }
          }
        }

        const walls: [Point, Point][] = [];
        const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

        // 2. Scan and merge horizontally
        for (let r = 0; r < rows; r++) {
          let startC = -1;
          for (let c = 0; c < cols; c++) {
            if (grid[r][c] && !visited[r][c]) {
              if (startC === -1) {
                startC = c;
              }
            } else {
              if (startC !== -1) {
                const endC = c - 1;
                const length = endC - startC + 1;
                if (length >= 2) {
                  for (let i = startC; i <= endC; i++) visited[r][i] = true;
                  walls.push([
                    { x: startC * gridSize, y: r * gridSize + gridSize / 2 },
                    { x: (endC + 1) * gridSize, y: r * gridSize + gridSize / 2 }
                  ]);
                }
                startC = -1;
              }
            }
          }
          if (startC !== -1) {
            const endC = cols - 1;
            const length = endC - startC + 1;
            if (length >= 2) {
              for (let i = startC; i <= endC; i++) visited[r][i] = true;
              walls.push([
                { x: startC * gridSize, y: r * gridSize + gridSize / 2 },
                { x: (endC + 1) * gridSize, y: r * gridSize + gridSize / 2 }
              ]);
            }
          }
        }

        // 3. Scan and merge vertically
        for (let c = 0; c < cols; c++) {
          let startR = -1;
          for (let r = 0; r < rows; r++) {
            if (grid[r][c] && !visited[r][c]) {
              if (startR === -1) {
                startR = r;
              }
            } else {
              if (startR !== -1) {
                const endR = r - 1;
                for (let i = startR; i <= endR; i++) visited[i][c] = true;
                walls.push([
                  { x: c * gridSize + gridSize / 2, y: startR * gridSize },
                  { x: c * gridSize + gridSize / 2, y: (endR + 1) * gridSize }
                ]);
                startR = -1;
              }
            }
          }
          if (startR !== -1) {
            const endR = rows - 1;
            for (let i = startR; i <= endR; i++) visited[i][c] = true;
            walls.push([
              { x: c * gridSize + gridSize / 2, y: startR * gridSize },
              { x: c * gridSize + gridSize / 2, y: (endR + 1) * gridSize }
            ]);
          }
        }

        resolve(walls);
      } catch (err) {
        console.error("Wall detection error:", err);
        resolve([]);
      }
    };
    img.onerror = (e) => {
      console.error("Failed to load map image for wall detection", e);
      resolve([]);
    };
    img.src = imageUrl;
  });
}
