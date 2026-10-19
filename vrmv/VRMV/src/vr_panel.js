// VR 里的提示面板：暂停、结束、帧率等。挂在当前场景的 hud 上（面前 2 米、略低于视线）。
import * as THREE from 'three';

export function createPanel() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 9999; mesh.position.set(0, -0.45, -2); mesh.visible = false;
  let last = '';
  function draw(lines) {
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(8,2,20,0.78)'; g.strokeStyle = '#3ff6ff'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(6, 6, 1012, 244, 28); g.fill(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = '700 64px "Exo2","Microsoft YaHei",sans-serif'; g.fillText(lines[0] || '', 512, lines[1] ? 92 : 128);
    if (lines[1]) { g.fillStyle = '#ff9ad8'; g.font = '500 40px "Microsoft YaHei",sans-serif'; g.fillText(lines[1], 512, 178); }
    tex.needsUpdate = true;
  }
  return {
    mesh,
    // text：null 隐藏；否则 [主行, 副行]
    set(text, hud) {
      if (hud && mesh.parent !== hud) hud.add(mesh);
      if (!text) { mesh.visible = false; return; }
      const key = text.join('|');
      if (key !== last) { draw(text); last = key; }
      mesh.visible = true;
    },
  };
}
