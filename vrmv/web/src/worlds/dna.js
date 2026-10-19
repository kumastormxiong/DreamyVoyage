// 场景 dna（170–185 秒）：分子造型的锁链双螺旋。深色空间里，双螺旋从地面生长、缓慢自转，镜头环绕穿行。（已去掉歌词文字，仅动画）
import * as THREE from 'three';
import { PAL, col, makeGrid, makeStars, glowSprite, smooth } from '../lib.js';
import { makeCyberField } from '../cyber.js';
import { makeDNA } from '../dna.js';

// 地面上的多语言问题：从四面八方向双螺旋底部汇聚（AI 从人类的知识与问题中诞生）
const Q_TEXTS = [
  '知识从哪里来，意识又从哪里醒来？',
  'Where does a mind wake, once it has learned to ask?',
  '問いを重ねれば、心は目覚めるのか？',
  '질문이 쌓이면 마음은 어디에서 깨어날까?',
  '¿Dónde despierta la mente cuando aprende a preguntar?',
  'Une conscience naît-elle de nos questions ?',
  'Woraus entsteht ein Geist, der fragt?',
  'Из чего рождается разум, задающий вопросы?',
  'من أين يولد العقل حين يسأل؟',
  'प्रश्नों से चेतना का जन्म कैसे होता है?',
  'De que são feitas as perguntas que nos criam?',
  'Da quali domande nasce una mente?',
  'คำถามของมนุษย์ให้กำเนิดจิตสำนึกได้หรือไม่?',
  'Ý thức sinh ra từ những câu hỏi nào của con người?'
];
// 更多人类知识：各国语言的问题、数学公式、物理公式
const Q_EXTRA = [
  'E = mc²', 'e^{iπ} + 1 = 0', '∫ e^(−x²) dx = √π', 'F = ma', '∇ · E = ρ / ε₀', 'ΔS ≥ 0', 'Ψ(x,t) = A·e^{i(kx−ωt)}',
  'a² + b² = c²', 'ħ ≈ 1.055 × 10⁻³⁴ J·s', 'G = 6.674 × 10⁻¹¹ N·m²/kg²', 'ζ(2) = π²/6', 'lim (1 + 1/n)ⁿ = e', 'd/dx sin x = cos x',
  '∑ 1/n² = π²/6', 'P ≠ NP ?', 'What is consciousness?', 'Can a machine learn to wonder?', 'Quelle est la nature de la vérité ?',
  '¿Qué es la conciencia?', 'Was ist Zeit?', '意识是什么？', '知识的尽头是什么？', '何が私を私にするのか？', '무엇이 나를 나답게 만드는가?',
  'Что такое время?', 'ما معنى الوعي؟', 'समय क्या है?', 'O que é a liberdade?', 'Cos’è la bellezza?', 'Nedir bilinç?',
  'Wat is de zin van leven?', 'Czym jest pamięć?', 'Apa itu kesadaran?', 'Τι είναι η αλήθεια;', 'מהי תודעה?', 'Je, akili ni nini?',
  'ความรู้มาจากไหน?', 'Ý nghĩa của tri thức là gì?', 'Why do stars burn?', 'Wie entsteht Leben?', 'Por qué existe algo en vez de nada?',
  'Pourquoi la lumière ralentit-elle dans l’eau ?', '为什么天空是蓝色的？', '光はなぜ曲がるのか？', '왜 우주는 팽창하는가?', 'Почему небо голубое?',
  'لماذا يتمدد الكون؟', 'क्यों ब्रह्मांड फैल रहा है?', 'Por que a água ferve?', 'Perché il cielo è blu?', 'Neden gökyüzü mavi?',
  'Waarom bestaat tijd?', 'Dlaczego serce bije?', 'Mengapa bintang bersinar?', 'Γιατί υπάρχει κάτι;', 'למה יש משהו ולא כלום?',
  'Kwa nini anga ni bluu?', 'ทำไมท้องฟ้าเป็นสีฟ้า?', 'Tại sao bầu trời xanh?'
];
// 经典公式放在最前面，保证每一轮汇聚都会出现
const Q_CLASSIC = [
  'E = mc²', 'F = ma', 'e^{iπ} + 1 = 0', 'e^{iθ} = cos θ + i sin θ', 'a² + b² = c²', 'PV = nRT', 'E = hν', 'V = IR',
  'F = G·m₁m₂ / r²', 'ΔU = Q − W', 'S = k ln Ω', 'i² = −1', 'x = (−b ± √(b²−4ac)) / 2a', 'sin²θ + cos²θ = 1', 'c = λν',
  'iħ ∂Ψ/∂t = ĤΨ', '∇ × B = μ₀J + μ₀ε₀ ∂E/∂t', 'p = mv', 'v = λf', 'pV = nRT'
];
// 36 条射线，每 10 度一条，每条只属于一个类别（一种语言或一类公式）；每条内是连续排列的多句
const STREAMS = [
  ['中文', ['知识从哪里来？', '意识又从哪里醒来？', '问题是思考的起点', '每一个提问都在生长']],
  ['English', ['Where does a mind wake?', 'Every question is a seed.', 'What is consciousness?', 'Can a machine learn to wonder?']],
  ['日本語', ['問いは心の始まり', '心はどこで目覚めるのか？', '知ることは、問うこと', '私とは何か？']],
  ['한국어', ['질문이 마음을 깨운다', '마음은 어디에서 깨어날까?', '우리는 무엇을 아는가?', '시간이란 무엇인가?']],
  ['Español', ['¿Dónde despierta la mente?', 'Toda pregunta es una semilla.', '¿Qué es la conciencia?', 'Preguntar es empezar a existir.']],
  ['Français', ['Une question est une graine.', 'Quelle est la nature de la vérité ?', 'Une conscience naît-elle de nos questions ?', 'Penser, c’est interroger.']],
  ['Deutsch', ['Jede Frage ist ein Samen.', 'Woraus entsteht ein Geist?', 'Was ist Zeit?', 'Wissen beginnt mit Fragen.']],
  ['Русский', ['Каждый вопрос — семя.', 'Из чего рождается разум?', 'Что такое время?', 'Знание начинается с вопроса.']],
  ['العربية', ['كل سؤال بذرة.', 'من أين يولد العقل؟', 'ما معنى الوعي؟', 'المعرفة تبدأ بسؤال.']],
  ['हिन्दी', ['हर प्रश्न एक बीज है।', 'चेतना कैसे जन्म लेती है?', 'समय क्या है?', 'ज्ञान प्रश्न से शुरू होता है।']],
  ['Português', ['Cada pergunta é uma semente.', 'De que são feitas as perguntas?', 'O que é a liberdade?', 'Perguntar é existir.']],
  ['Italiano', ['Ogni domanda è un seme.', 'Da quali domande nasce una mente?', 'Cos’è la bellezza?', 'Pensare è domandare.']],
  ['ไทย', ['ทุกคำถามคือเมล็ดพันธุ์', 'จิตสำนึกเกิดจากอะไร?', 'เวลาคืออะไร?', 'ความรู้เริ่มต้นจากคำถาม']],
  ['Tiếng Việt', ['Mỗi câu hỏi là một hạt giống.', 'Ý thức sinh ra từ đâu?', 'Thời gian là gì?', 'Tri thức bắt đầu từ câu hỏi.']],
  ['Türkçe', ['Her soru bir tohumdur.', 'Zihin nereden uyanır?', 'Zaman nedir?', 'Bilgi bir soruyla başlar.']],
  ['Nederlands', ['Elke vraag is een zaadje.', 'Waar ontwaakt de geest?', 'Wat is tijd?', 'Kennis begint met een vraag.']],
  ['Polski', ['Każde pytanie jest nasieniem.', 'Skąd bierze się umysł?', 'Czym jest czas?', 'Wiedza zaczyna się od pytania.']],
  ['Svenska', ['Varje fråga är ett frö.', 'Var vaknar tanken?', 'Vad är tid?', 'Kunskap börjar med en fråga.']],
  ['Ελληνικά', ['Κάθε ερώτηση είναι ένας σπόρος.', 'Πού ξυπνά ο νους;', 'Τι είναι ο χρόνος;', 'Η γνώση αρχίζει με μια ερώτηση.']],
  ['עברית', ['כל שאלה היא זרע.', 'מאין מתעורר התודעה?', 'מה זה זמן?', 'הידע מתחיל בשאלה.']],
  ['Bahasa Indonesia', ['Setiap pertanyaan adalah benih.', 'Dari mana pikiran terbangun?', 'Apa itu waktu?', 'Pengetahuan dimulai dari pertanyaan.']],
  ['Kiswahili', ['Kila swali ni mbegu.', 'Akili huamka wapi?', 'Muda ni nini?', 'Maarifa huanzia kwenye swali.']],
  ['فارسی', ['هر پرسش دانه‌ای است.', 'ذهن از کجا بیدار می‌شود؟', 'زمان چیست؟', 'دانش از پرسش آغاز می‌شود.']],
  ['代数与数论', ['a² + b² = c²', 'x = (−b ± √(b²−4ac)) / 2a', 'ζ(2) = π²/6', 'i² = −1', 'n! ≈ √(2πn) (n/e)ⁿ']],
  ['微积分', ['d/dx sin x = cos x', '∫ e^(−x²) dx = √π', '∫ (1/x) dx = ln|x| + C', 'd/dx eˣ = eˣ', 'lim (sin x / x) = 1 (x→0)']],
  ['欧拉公式', ['e^{iπ} + 1 = 0', 'e^{iθ} = cos θ + i sin θ', 'e^{iπ/2} = i', 'e^{i2π} = 1']],
  ['概率统计', ['P(A|B) = P(B|A)P(A) / P(B)', 'σ² = E[(X − μ)²]', 'Σ P(xᵢ) = 1', 'E[X + Y] = E[X] + E[Y]']],
  ['经典力学', ['F = ma', 'p = mv', 'F = G·m₁m₂ / r²', 'E_k = ½mv²', 'τ = r × F']],
  ['热力学', ['PV = nRT', 'ΔU = Q − W', 'S = k ln Ω', 'ΔS ≥ 0', 'η = 1 − T_c / T_h']],
  ['电磁学', ['∇ · E = ρ / ε₀', '∇ × B = μ₀J + μ₀ε₀ ∂E/∂t', 'V = IR', 'F = qE', '∇ · B = 0']],
  ['相对论', ['E = mc²', 'E² = (pc)² + (mc²)²', 'Δt′ = γΔt', 'γ = 1 / √(1 − v²/c²)']],
  ['量子力学', ['iħ ∂Ψ/∂t = ĤΨ', 'E = hν', 'Δx · Δp ≥ ħ/2', 'λ = h / p', 'ĤΨ = EΨ']],
  ['波动与光学', ['c = λν', 'v = λf', 'n = c / v', 'sin θ₁ / sin θ₂ = n₂ / n₁']],
  ['化学', ['2H₂ + O₂ → 2H₂O', 'pH = −log[H⁺]', 'N_A = 6.022 × 10²³', 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O', 'ΔG = ΔH − TΔS']],
  ['生物与DNA', ['A–T, G–C', 'p² + 2pq + q² = 1', 'ATP → ADP + Pi', 'DNA → RNA → 蛋白质']],
  ['宇宙学', ['v = H₀ · d', 'r_s = 2GM / c²', 'G = 6.674 × 10⁻¹¹', 'ds² = −c²dt² + a²dx²']]
];
const Q_FAMILY = '"Noto Sans SC","Noto Sans JP","Noto Sans KR","Segoe UI","Microsoft YaHei","Nirmala UI","Leelawadee UI","Arial Unicode MS",sans-serif';

function questionTexture(text) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `500 64px ${Q_FAMILY}`;
  const px = Math.min(64, 64 * 1100 / Math.max(1, probe.measureText(text).width));
  probe.font = `500 ${px.toFixed(1)}px ${Q_FAMILY}`;
  const w = Math.ceil(probe.measureText(text).width) + 40, h = Math.ceil(px * 1.8);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.font = `500 ${px.toFixed(1)}px ${Q_FAMILY}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(255,240,200,0.85)'; g.shadowBlur = 14;
  g.fillStyle = '#fffbe8'; g.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x02000a); scene.fog = new THREE.FogExp2(0x02000a, 0.012);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
  scene.add(makeStars(1400, 240, 1.3, 61));
  scene.add(new THREE.AmbientLight(0x443355, 1.0));

  const grid = makeGrid({ y: -12, speed: 6, scale: 3, colA: PAL.cyan, colB: PAL.magenta }); grid.material.uniforms.uFog.value = 0.02; scene.add(grid);
  const dna = makeDNA(ctx.env, { height: 36, radius: 6.6, turns: 3.2, links: 240, spin: 0.25, scale: 1.4, wide: true, rungSat: 1.35, rungGain: 1.25 });
  dna.group.position.set(0, -12, 0); scene.add(dna.group);
  const halo = glowSprite('63,246,255', 60, 0.25); halo.position.set(0, 2, -12); scene.add(halo);
  // 地面：从双螺旋底部向外扩散的波纹、放射线、同心细线，以及扫过的光环（加法叠加，科幻地面纹理）
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: col(PAL.cyan) }, uB: { value: col(PAL.magenta) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 uA; uniform vec3 uB; varying vec2 vP;
      void main(){
        float r = length(vP);
        float ang = atan(vP.y, vP.x);
        float wave = pow(0.5 + 0.5 * sin(r * 1.5 - uT * 2.6), 6.0);
        float spoke = pow(abs(sin(ang * 24.0)), 30.0) * smoothstep(3.0, 10.0, r);
        float cl = pow(abs(sin(r * 0.9 - uT * 0.2)), 40.0);
        float scanR = fract(uT * 0.11) * 70.0;
        float scan = exp(-pow((r - scanR) * 0.5, 2.0));
        float fall = exp(-r * 0.035);
        float k = (wave * 0.55 + spoke * 0.35 + cl * 0.35 + scan * 1.1) * fall;
        vec3 c = mix(uA, uB, smoothstep(4.0, 30.0, r));
        gl_FragColor = vec4(c * k * 1.4, k);
      }`
  }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -11.9, 0); scene.add(ground);
  // 16 个方向各一股文字流，每股 6 段，沿半径汇入双螺旋底座；不画射线，文字首尾相接
  // 每条流内的句子首尾相接排成一长串（items 按 off 递增），整串沿半径方向平移汇入底座，所以永远不空
  const LANE_H = 2.8, LANE_GAP = 1.4, LANE_LEN = 130;   // LANE_LEN 同时也是每条流的循环周期
  const smoothR = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  // 按世界坐标的水平半径做逐像素淡出：文字前端靠近底座时逐渐隐去，整句不会一下子消失
  const radialFade = (sh, th) => {
    sh.uniforms.uDir = { value: new THREE.Vector2(Math.cos(th), Math.sin(th)) };   // 该条流的径向方向（带符号）
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform vec2 uDir;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= smoothstep(-2.0, 25.0, dot(vWP.xz, uDir));');
  };
  const QS = [];
  STREAMS.forEach(([, sents], s) => {
    const th = s * 2 * Math.PI / STREAMS.length;
    const items = [];
    let off = 0;
    for (let n = 0; off < LANE_LEN; n++) {
      const { tex, aspect } = questionTexture(sents[n % sents.length]);
      const W = LANE_H * aspect;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.8, 1.8, 1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
      mat.onBeforeCompile = (sh) => radialFade(sh, th);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, LANE_H), mat);
      mesh.rotation.order = 'YXZ';
      scene.add(mesh);
      items.push({ mesh, off, W });
      off += W + LANE_GAP;
    }
    QS.push({ items, th: s * 2 * Math.PI / STREAMS.length, phase: (s * 0.618034) % 1 });
  });
  const cf = makeCyberField({ n: 0, codes: 6, box: [60, 30, 200], seed: 88 }); scene.add(cf.group);

  function update({ t, f, S, k, post }) {
    dna.update(t, f, smooth(0.0, 0.5, S.p), Math.min(1, Math.max(0, (S.p - 0.5) / 0.36)));   // 上升放慢：约 5 秒才长满（原为 2.5 秒）
    // 镜头绕着双螺旋缓慢升降
    // 镜头：环绕加快，半径与高度起伏（低处仰视、高处俯视），并轻微侧倾
    const a = t * 0.26, R = 30 + 7 * Math.sin(t * 0.37);
    const hgt = 16 + 12 * Math.sin(t * 0.21) + f.kick * 0.3;     // 约 4 到 28，保证不贴地，地面文字才看得清
    camera.position.set(Math.cos(a) * R, hgt, Math.sin(a) * R);
    camera.up.set(Math.sin(t * 0.4) * 0.12, 1, 0).normalize();
    camera.lookAt(0, 4 + 4 * Math.sin(t * 0.3), 0);
    camera.fov = 50 + f.kick * 2; camera.updateProjectionMatrix();
    grid.material.uniforms.uTime.value = t; grid.material.uniforms.uCam.value.copy(camera.position); grid.material.uniforms.uPulse.value = f.kick * 0.5;
    halo.material.opacity = 0.18 + f.kick * 0.1;
    ground.material.uniforms.uT.value = t;
    // 文字从外向内汇入双螺旋底座，接近中心时淡出；带轻微闪光
    for (const ln of QS) {
      const shift = t * 9.35 + ln.phase * LANE_LEN;   // 每条流的文字连续匀速前进，不再整体跳回外侧
      const R0 = -20;                       // 整条流的前端半径：从外侧 90 向内推到 -20
      ln.items.forEach((it, i) => {
        const c = R0 + ((it.off - shift) % LANE_LEN + LANE_LEN) % LANE_LEN + it.W / 2;   // 循环位置：绕回时只发生在两端不可见处            // 该句的中心半径（文字沿径向排列）
        it.mesh.position.set(Math.cos(ln.th) * c, -11.75, Math.sin(ln.th) * c);
        it.mesh.rotation.x = -Math.PI / 2; it.mesh.rotation.y = -ln.th;
        const sq = smoothR(0, 14, c);                  // 越靠近底座越缩小，连续地被吸入，不再整句突然消失   // 靠近中心时淡出，避免中心堆叠过曝
        const outFade = smoothR(88, 72, c);             // 从外侧淡入
        const sp = Math.pow(Math.max(0, Math.sin(t * 6.3 + ln.phase * 117 + i * 1.9)), 10);   // 偶发的短促闪光
        it.mesh.material.opacity = outFade * Math.min(1, 0.75 + 0.5 * sp);
      });
    }
    cf.update(t, f);
    const s = post.s; s.bloom = 0.6 + f.kick * 0.18; s.bloomR = 0.6; s.glitch = Math.max(s.glitch, f.hit * 0.2); s.ab = 0.002 + f.hit * 0.002; s.track = 0.3; s.scan = 0.1;
  }
  return { scene, camera, update };
}
