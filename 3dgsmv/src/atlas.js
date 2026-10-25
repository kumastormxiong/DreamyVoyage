// 假名图集：把歌词里出现过的单字画到一张贴图上（带光晕），歌词和假名雨共用。
import * as THREE from 'three';

export function collectChars(lyrics) {
  const set = new Set();
  for (const b of lyrics.blocks) for (const r of b.rows) for (const c of r) if (typeof c === 'string' && [...c].length === 1) set.add(c);
  return [...set];
}

export function buildAtlas(chars, family = 'NotoSansSC') {
  const cols = 8, rows = Math.ceil(chars.length / cols), cell = 96;
  const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rows * cell;
  const g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${Math.round(cell * 0.56)}px ${family}, "Yu Gothic", "Hiragino Sans", "Noto Sans CJK JP", sans-serif`;
  const index = new Map();
  chars.forEach((ch, i) => {
    index.set(ch, i);
    const x = (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * cell + cell / 2 + 2;
    // R 通道 = 清晰字形，G 通道 = 光晕（着色器里再合成）
    g.globalCompositeOperation = 'lighter';
    g.shadowColor = '#00ff00'; g.shadowBlur = 14; g.fillStyle = '#00ff00'; g.fillText(ch, x, y);
    g.shadowBlur = 0; g.fillStyle = '#ff0000'; g.fillText(ch, x, y);
    g.globalCompositeOperation = 'source-over';
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
  return { tex, cols, rows, index, count: chars.length, chars };
}
