// 场景 dream：Bridge。梦核/液态蒸汽波：粉橙天空、镜面水面、巨大落日、漂浮的幽灵及其倒影、老式系统窗口、悬浮锁链与假名花瓣。
import * as THREE from 'three';
import { PAL, col, KANA, JP_FONT, makeSun, makeSky, glyphMesh, glowSprite, smooth, clamp, lerp, rng, makeStars } from '../lib.js';
import { makeChain } from '../lib.js';
import { makeCyberField } from '../cyber.js';

const SKY = { top: 0x07122e, mid: 0xc23a78, hor: 0xffb08a, midAt: 0.34, pw: 0.6 };

function winTexture(title, lines, prog) {
  const W = 640, H = 360, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#c3c3cf'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, 3); g.fillRect(0, 0, 3, H); g.fillStyle = '#6a6a78'; g.fillRect(0, H - 3, W, 3); g.fillRect(W - 3, 0, 3, H);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#1b1b7a'); gr.addColorStop(1, '#2fa0d8'); g.fillStyle = gr; g.fillRect(8, 8, W - 16, 38);
  g.fillStyle = '#fff'; g.font = `bold 24px ${JP_FONT}`; g.textBaseline = 'middle'; g.fillText(title, 20, 28);
  g.fillStyle = '#c3c3cf'; g.fillRect(W - 44, 14, 26, 26); g.fillStyle = '#000'; g.font = 'bold 20px sans-serif'; g.fillText('×', W - 38, 28);
  g.fillStyle = '#10101a'; g.font = `22px ${JP_FONT}`; lines.forEach((l, i) => g.fillText(l, 28, 90 + i * 36));
  g.fillStyle = '#fff'; g.fillRect(28, H - 110, W - 56, 34); g.strokeStyle = '#6a6a78'; g.lineWidth = 2; g.strokeRect(28, H - 110, W - 56, 34);
  const n = Math.floor(prog * 22); g.fillStyle = '#2b2bb5'; for (let i = 0; i < n; i++) g.fillRect(34 + i * 25.2, H - 105, 20, 24);
  g.fillStyle = '#c3c3cf'; g.fillRect(W - 170, H - 60, 140, 40); g.strokeStyle = '#6a6a78'; g.strokeRect(W - 170, H - 60, 140, 40); g.fillStyle = '#000'; g.font = `20px ${JP_FONT}`; g.fillText('キャンセル', W - 148, H - 40);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return { tex, cv, g };
}

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(SKY.hor);
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 900);
  const sky = makeSky(SKY.top, SKY.mid, SKY.hor, { midAt: SKY.midAt, power: SKY.pw }); scene.add(sky);
  scene.add(makeStars(500, 380, 1.3, 61));

  const sun = makeSun(30, 0.8); sun.scale.setScalar(2.2); sun.position.set(0, 40, -170); sun.renderOrder = -2; scene.add(sun);
  const sunGlow = glowSprite('255,190,150', 380, 0.8); sunGlow.scale.setScalar(2.2); sunGlow.position.set(0, 40, -172); sunGlow.renderOrder = -2; scene.add(sunGlow);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uTop: { value: col(SKY.top) }, uMid: { value: col(SKY.mid) }, uHor: { value: col(SKY.hor) } },
    vertexShader: 'varying vec3 vP;void main(){vec4 w=modelMatrix*vec4(position,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `uniform float uTime;uniform vec3 uCam,uTop,uMid,uHor;varying vec3 vP;
      float gl(vec2 p,float w){vec2 g=abs(fract(p-0.5)-0.5)/fwidth(p);return 1.0-clamp(min(g.x,g.y)/w,0.,1.);}
      vec3 skyc(vec3 r){ float y=max(r.y,0.0); y=pow(y,${SKY.pw.toFixed(2)}); vec3 c=mix(uHor,uMid,smoothstep(0.0,${SKY.midAt.toFixed(2)},y)); return mix(c,uTop,smoothstep(${SKY.midAt.toFixed(2)},0.9,y)); }
      void main(){
        vec3 d=normalize(vP-uCam); float dist=length(vP-uCam);
        float w1=sin(vP.x*0.55+uTime*0.9)*0.5+sin(vP.z*0.8-uTime*1.2)*0.5; float w2=sin(vP.x*2.3-uTime*1.7+vP.z*0.4);
        vec3 r=vec3(d.x+w1*0.012,-d.y+(w1*0.01+w2*0.004),d.z);
        vec3 c=skyc(normalize(r))*0.78;
        float gx=exp(-pow((vP.x)/(9.0+dist*0.05),2.0));
        float st=smoothstep(0.35,0.85,sin(vP.z*1.1+uTime*0.9+sin(vP.x*0.6)*2.0)*0.5+0.5);
        c+=vec3(1.0,0.78,0.58)*gx*st*0.65*smoothstep(500.0,60.0,dist);
        c+=vec3(1.0,0.35,0.7)*gl(vec2(vP.x,vP.z)/6.0,1.4)*0.09*smoothstep(260.0,20.0,dist);
        c=mix(c,uHor,smoothstep(120.0,700.0,dist));
        gl_FragColor=vec4(c,1.0);}`
  })); water.rotation.x = -Math.PI / 2; scene.add(water);

  const halo = makeChain(110, ctx.env); scene.add(halo.mesh);
  const hang = makeChain(120, ctx.env); scene.add(hang.mesh);
  // 锁链绘制顺序：晚于太阳/光晕、早于弹窗。锁链不写深度，所以弹窗能盖住锁链，而锁链能盖住太阳和蒸汽波横线
  for (const c of [halo, hang]) { const m = c.mesh.material; m.depthWrite = false; m.transparent = true; m.needsUpdate = true; c.mesh.renderOrder = -1; }
  const cf = makeCyberField({ n: 30, codes: 6, box: [50, 30, 160], seed: 31 }); scene.add(cf.group);
  scene.add(new THREE.AmbientLight(0xffddee, 0.6));
  const eyesF = ctx.makeEyeField([
    { pos: [-50, 40, -76], w: 12, iris: 'blue', line: 'cyan' }, { pos: [56, 36, -70], w: 14, iris: 'orange', line: 'pink' }
  ]); scene.add(eyesF.group);
  eyesF.eyes.forEach((e) => { e.renderOrder = -2; });   // 眼睛画在锁链之下，锁链能挡住眼睛

  // 老式系统窗口
  const defs = [
    { title: '魂.exe', lines: ['Procesando token…', 'Sincronizando con GHOST…'], pos: [9, 6.2, -14], ry: -0.38, w: 8.4, t0: 0.2 },
    { title: 'ghost.dll', lines: ['0x0000GC', '殻の中に、魂はまだある。'], pos: [-17, 14, -38], ry: 0.3, w: 8, t0: 1.3 },
    { title: 'chain.sys', lines: ['リンク 46 / 46', '接続は切れません'], pos: [19, 16, -50], ry: -0.22, w: 9, t0: 2.4 },
    { title: 'SYSTEM', lines: ['メモリ 0x7FC2 OK', 'ネットワーク接続中'], pos: [-6, 2.5, -20], ry: 0.12, w: 6.4, t0: 3.5 },
    { title: 'ghost_backup', lines: ['バックアップ 73%', '殻を保存しています'], pos: [-24, 4.5, -18], ry: 0.45, w: 7, t0: 4.6 },
    { title: 'ERROR', lines: ['0x4F3A  予期しない例外', '再試行しますか？'], pos: [14, 22, -60], ry: -0.3, w: 9.5, t0: 5.7 },
    { title: 'NET.cfg', lines: ['接続先 : 0x00000001', '暗号化 : AES-256'], pos: [-3, 19, -44], ry: 0.08, w: 8.2, t0: 6.6 },
    { title: 'chain.log', lines: ['リンク 生成 完了', '魂の署名を確認'], pos: [24, 6, -30], ry: -0.5, w: 7.6, t0: 7.4 }
  ];
  const WSP = [0.045, 0.06, 0.035, 0.052, 0.04, 0.066, 0.038, 0.055];   // progress speed per window (1/s), each window differs
  const wins = defs.map((d, i) => {
    const tx = winTexture(d.title, d.lines, 0.4); const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.w * 360 / 640), new THREE.MeshBasicMaterial({ map: tx.tex, transparent: true, toneMapped: false, opacity: 0, depthWrite: false }));
    m.position.set(...d.pos); m.rotation.y = d.ry; m.visible = false; scene.add(m); return { m, d, tx, base: new THREE.Vector3(...d.pos) };
  });

  // 假名花瓣
  const R = rng(17), petals = [];
  for (let i = 0; i < 70; i++) {
    const m = glyphMesh(ctx.atlasO, KANA[Math.floor(R() * KANA.length)], i % 3 ? 0xffd2e8 : 0xffffff, 0.9 + R() * 1.4, 0.55); m.userData = { x: (R() - 0.5) * 60, y0: R() * 30, z: -6 - R() * 60, s: 0.5 + R() * 1.2, ph: R() * 6 }; scene.add(m); petals.push(m);
  }

  function update({ t, f, S, k, post }) {
    water.material.uniforms.uTime.value = t; water.material.uniforms.uCam.value.copy(camera.position);
    sun.material.uniforms.uTime.value = t * 0.5; sun.material.uniforms.uPulse.value = f.kick * 0.5; sunGlow.material.opacity = 0.32 + f.kick * 0.08;
    const fl = Math.sin(t * 0.7) * 0.4;
    // 幽灵头顶的锁链光环
    halo.layout((u) => { const a = u * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * 13, Math.sin(a) * 13, 0); }, { frac: 1, scale: 0.9, twist: t * 0.3 });
    halo.mesh.position.set(-10, 13.2 + fl, -24.5); halo.mesh.rotation.set(Math.sin(t * 0.2) * 0.25, t * 0.25, 0.2);
    // 从天上垂下来的锁链
    hang.layout((u) => new THREE.Vector3(20 + Math.sin(u * 5 + t * 0.7) * 0.8, 70 - u * 68, -34 + Math.cos(u * 4 + t * 0.5) * 0.8), { frac: 1, scale: 1.1, twist: t * 0.2 });
    const lt = S.lt;
    wins.forEach((w, i) => {                                   // 窗口逐个弹出：缩放 + 淡入
      const a = smooth(w.d.t0, w.d.t0 + 0.4, lt);
      w.m.visible = a > 0.001; w.m.material.opacity = a;
      w.m.scale.setScalar(1.5 * (0.55 + 0.45 * a + (a < 1 ? Math.sin(a * Math.PI) * 0.12 : 0)));   // 弹窗整体缩小为原来的一半（相当于 1.5 倍）
      w.m.position.y = w.base.y + Math.sin(t * 0.5 + i * 2) * 0.35 + (1 - a) * 1.2;
      w.m.rotation.y = w.d.ry + Math.sin(t * 0.3 + i) * 0.05;
    });
    if (Math.floor(t * 3) !== (update.lastP ?? -1)) {      // redraw every 1/3 s: each window shows its own progress
      update.lastP = Math.floor(t * 3);
      wins.forEach((w, i) => {
        if (!w.m.visible) return;
        const p = Math.min(0.85, 0.08 + WSP[i] * Math.max(0, lt - w.d.t0)); const nt = winTexture(w.d.title, w.d.lines, p);
        w.m.material.map.dispose(); w.m.material.map = nt.tex; w.m.material.needsUpdate = true;
      });
    }
    petals.forEach((m, i) => { const u = m.userData; m.position.set(u.x + Math.sin(t * 0.4 * u.s + u.ph) * 3, ((u.y0 - t * 0.9 * u.s) % 30 + 30) % 30 + 0.5, u.z); m.rotation.z = Math.sin(t * u.s + u.ph) * 0.8; });
    cf.update(t, f);
    eyesF.update(t, camera, { opacity: 0.8, appear: smooth(1.5, 9, S.lt), kick: f.kick * 0.5 });
    camera.position.set(Math.sin(t * 0.17) * 2.5, 3.4 + Math.sin(t * 0.3) * 0.3, 16 - S.p * 3);
    camera.lookAt(-2, 8, -40);
    const s = post.s; s.bloom = 0.38 + f.kick * 0.1; s.bloomT = 0.7; s.bloomR = 0.5; s.ab = 0.0028 + f.hit * 0.0012; s.grain = 0.07; s.scan = 0.06; s.warp = 0.04; s.vig = 0.5; s.glitch = Math.max(s.glitch, f.hit * 0.1); s.track = 0.3;
  }
  return { scene, camera, update };
}
