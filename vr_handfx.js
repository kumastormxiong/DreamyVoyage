/**
 * Dreamy Voyage - WebXR 裸手视觉与手势特效 (vr_handfx.js)
 *
 * 五种手部外观（全部使用实例化 / GPU 粒子，两只手合计只有少量 draw call，每帧零内存分配）：
 *   constellation   全息星座：关节为柔光星点，骨骼为渐变细光束，鼓点时光脉冲从手腕流向指尖
 *   liquid_glass    液态玻璃：肥皂泡薄膜彩虹 + 菲涅尔边光，折射/反射身后的音乐全景
 *   aurora_ribbon   极光丝带：五指指尖拖出极光渐变丝带，宽度随低音起伏
 *   particle_avatar 粒子化身：约 2000 个粒子沿手形分布，张手时飘散、握拳时收拢发亮
 *   spirit_flame    灵焰：指尖与掌心冒出 GPU 火焰粒子（左手冷焰、右手暖焰）
 *
 * 手势特效（与外观无关，叠加显示）：
 *   捏合      指尖聚光 -> 松开时涟漪光环 + 火星
 *   张开手掌  掌心绽放随低音转动的光曼陀罗
 *   握拳      能量收成核心光球，松开时冲击波 + 天空涟漪
 *   推掌      向前推出的冲击环 + 全景天空对应方向的涟漪
 *   挥击打鼓  刀光弧线 + 火花；卡在节拍上为金色 PERFECT，并累计连击
 *   拍手      两手之间闪光 + 全景天空闪亮
 *   双手拉弦  两手捏合点之间一根随频谱振动的光弦
 *   召唤菜单  掌心朝向自己捏住时显示进度环
 */
(() => {
    'use strict';

    const STYLES = [
        { id: 'constellation', nameZh: '全息星座', nameEn: 'Holo Constellation', icon: '✨' },
        { id: 'liquid_glass', nameZh: '液态玻璃', nameEn: 'Liquid Glass', icon: '💎' },
        { id: 'aurora_ribbon', nameZh: '极光丝带', nameEn: 'Aurora Ribbons', icon: '🌌' },
        { id: 'particle_avatar', nameZh: '粒子化身', nameEn: 'Particle Avatar', icon: '🫧' },
        { id: 'spirit_flame', nameZh: '灵焰', nameEn: 'Spirit Flame', icon: '🔥' }
    ];

    // 每种风格：[左手 A, 左手 B, 右手 A, 右手 B]
    const PALETTES = {
        constellation: [0x5eead4, 0x60a5fa, 0xf0abfc, 0xa78bfa],
        liquid_glass: [0x8be9ff, 0xc4b5fd, 0xffb3e6, 0xfde68a],
        aurora_ribbon: [0x34d399, 0x22d3ee, 0xa78bfa, 0xf472b6],
        particle_avatar: [0x67e8f9, 0xa5b4fc, 0xf9a8d4, 0xfcd34d],
        spirit_flame: [0x7dd3fc, 0x6366f1, 0xfde68a, 0xf97316]
    };

    // 各风格下“星座骨架”的亮度 (作为其它风格的辅助轮廓)
    const SKELETON_INTENSITY = {
        constellation: 1.0,
        liquid_glass: 0.0,
        aurora_ribbon: 0.45,
        particle_avatar: 0.12,
        spirit_flame: 0.38
    };

    const GOLD = 0xffd27a;

    // ==================================================================
    // GLSL
    // ==================================================================
    const GLSL_HAND_COMMON = `
        uniform float uTime;
        uniform float uBass;
        uniform float uBeat;
        uniform float uViewHalfH;
        uniform vec2 uHandOn;
        uniform vec3 uColA[2];
        uniform vec3 uColB[2];
        vec3 dvColA(float h) { return h < 0.5 ? uColA[0] : uColA[1]; }
        vec3 dvColB(float h) { return h < 0.5 ? uColB[0] : uColB[1]; }
        float dvOn(float h) { return h < 0.5 ? uHandOn.x : uHandOn.y; }
    `;
    const GLSL_HAND_COMMON_VS = GLSL_HAND_COMMON + `
        float dvPx(float worldSize, float viewZ) {
            return worldSize * projectionMatrix[1][1] * uViewHalfH / max(-viewZ, 0.05);
        }
    `;

    // ---------- 星点 ----------
    const GLOW_POINT_VS = `
        ${GLSL_HAND_COMMON_VS}
        uniform float uIntensity;
        attribute float aHand;
        attribute float aT;
        attribute float aKind;
        varying vec3 vCol;
        varying float vA;
        varying float vKind;
        void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float sz = aKind > 1.5 ? 0.034 : (aKind > 0.5 ? 0.028 : 0.017);
            // 鼓点：亮度波从手腕 (aT=0) 推向指尖 (aT=1)
            float front = (1.0 - uBeat) * 1.25;
            float wave = exp(-pow((aT - front) * 5.0, 2.0)) * uBeat;
            sz *= 1.0 + uBass * 0.5 + wave * 0.9;
            gl_PointSize = dvPx(sz, mv.z);
            vCol = mix(dvColA(aHand), dvColB(aHand), aT) * (1.0 + wave * 1.5);
            vA = dvOn(aHand) * uIntensity;
            vKind = aKind;
            gl_Position = projectionMatrix * mv;
        }
    `;
    const GLOW_POINT_FS = `
        varying vec3 vCol;
        varying float vA;
        varying float vKind;
        void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float r2 = dot(p, p);
            if (r2 > 1.0 || vA < 0.002) discard;
            float core = exp(-r2 * 30.0);
            float halo = exp(-r2 * 5.0) * 0.45;
            float star = 0.0;
            if (vKind > 0.5) {
                star = (exp(-abs(p.x) * 24.0) + exp(-abs(p.y) * 24.0)) * (1.0 - sqrt(r2)) * 0.55;
            }
            vec3 col = vCol * (halo + star) + vec3(1.0) * core * 0.85;
            gl_FragColor = vec4(col * vA, 1.0);
        }
    `;

    // ---------- 骨骼光束 (实例化面片) ----------
    const BEAM_VS = `
        ${GLSL_HAND_COMMON}
        attribute vec3 aA;
        attribute vec3 aB;
        attribute float aHand;
        attribute float aT0;
        attribute float aT1;
        attribute float aW;
        varying float vSide;
        varying float vT;
        varying float vHand;
        void main() {
            vec3 P = mix(aA, aB, position.y);
            vec3 dir = aB - aA;
            float L = length(dir);
            dir = L > 1e-5 ? dir / L : vec3(0.0, 1.0, 0.0);
            vec3 toCam = normalize(cameraPosition - P);
            vec3 side = cross(dir, toCam);
            float sl = length(side);
            side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
            P += side * position.x * aW * (1.0 + uBass * 0.5);
            vSide = position.x;
            vT = mix(aT0, aT1, position.y);
            vHand = aHand;
            gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
        }
    `;
    const BEAM_FS = `
        ${GLSL_HAND_COMMON}
        uniform float uIntensity;
        varying float vSide;
        varying float vT;
        varying float vHand;
        void main() {
            float on = dvOn(vHand) * uIntensity;
            if (on < 0.002) discard;
            float s2 = vSide * vSide;
            float core = exp(-s2 * 16.0);
            float halo = exp(-s2 * 2.5) * 0.35;
            float flow = pow(0.5 + 0.5 * sin(vT * 7.0 - uTime * 3.2), 8.0);
            float front = (1.0 - uBeat) * 1.25;
            float wave = exp(-pow((vT - front) * 6.0, 2.0)) * uBeat;
            vec3 c = mix(dvColA(vHand), dvColB(vHand), vT);
            vec3 col = c * (halo + core * 0.55 + flow * core * 0.8 + wave * 1.4) + vec3(1.0) * core * (0.18 + wave * 0.6);
            gl_FragColor = vec4(col * on, 1.0);
        }
    `;

    // ---------- 液态玻璃 ----------
    const GLASS_VS = `
        attribute float aHand;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        varying float vHand;
        void main() {
            vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vWPos = wp.xyz;
            vWNorm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
            vHand = aHand;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `;
    const GLASS_DEPTH_FS = `
        void main() { gl_FragColor = vec4(0.0); }
    `;
    function glassFS() {
        const mapping = (window.DVPano && window.DVPano.GLSL_MAPPING) || `
            uniform float uProjMode; uniform vec3 uAxisC; uniform vec3 uAxisR; uniform vec3 uAxisU;
            vec2 dvPanoUV(vec3 d) { return vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, d.y * 0.5 + 0.5); }
        `;
        return `
            ${GLSL_HAND_COMMON}
            uniform sampler2D uTexture;
            ${mapping}
            varying vec3 vWPos;
            varying vec3 vWNorm;
            varying float vHand;
            void main() {
                float on = dvOn(vHand);
                if (on < 0.002) discard;
                vec3 N = normalize(vWNorm);
                vec3 V = normalize(cameraPosition - vWPos);
                float ndv = clamp(dot(N, V), 0.0, 1.0);
                float fres = pow(1.0 - ndv, 3.0);
                vec3 rr = refract(-V, N, 0.72);
                if (dot(rr, rr) < 1e-6) rr = -V;
                vec3 rf = reflect(-V, N);
                vec3 envR = texture2D(uTexture, dvPanoUV(normalize(rr))).rgb;
                vec3 envF = texture2D(uTexture, dvPanoUV(normalize(rf))).rgb;
                vec3 ca = dvColA(vHand);
                vec3 cb = dvColB(vHand);
                float film = ndv * 2.3 + uTime * 0.12 + vHand * 0.37;
                vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (film + vec3(0.0, 0.33, 0.67)));
                vec3 col = envR * mix(vec3(1.0), ca, 0.45) * 1.1
                         + envF * fres
                         + irid * (0.22 + fres * 0.9)
                         + cb * pow(fres, 1.2) * (0.6 + uBeat * 1.0 + uBass * 0.5)
                         + ca * 0.12;
                float a = clamp(0.38 + fres * 0.6, 0.0, 0.95) * on;
                gl_FragColor = vec4(col, a);
            }
        `;
    }

    // ---------- 极光丝带 ----------
    const RIBBON_VS = `
        attribute float aU;
        attribute float aRib;
        attribute float aSide;
        varying float vU;
        varying float vRib;
        varying float vSide;
        void main() {
            vU = aU;
            vRib = aRib;
            vSide = aSide;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const RIBBON_FS = `
        ${GLSL_HAND_COMMON}
        varying float vU;
        varying float vRib;
        varying float vSide;
        void main() {
            float hand = vRib > 4.5 ? 1.0 : 0.0;
            float on = dvOn(hand);
            if (on < 0.002) discard;
            float fing = vRib - hand * 5.0;
            float u = vU;
            float bands = 0.55 + 0.45 * sin(u * 18.0 - uTime * 5.0 + fing * 1.3);
            float edge = exp(-vSide * vSide * 2.2);
            float core = exp(-vSide * vSide * 14.0);
            float fade = pow(1.0 - u, 1.6) * smoothstep(0.0, 0.05, u + 0.01);
            vec3 aur = mix(dvColA(hand), dvColB(hand), smoothstep(0.0, 1.0, u * 1.4 + 0.15 * sin(uTime + fing)));
            aur = mix(aur, vec3(0.85, 0.6, 1.0), smoothstep(0.6, 1.0, u) * 0.5);
            vec3 col = aur * edge * bands * 0.95 + vec3(1.0) * core * 0.35 * (1.0 - u);
            gl_FragColor = vec4(col * fade * on * (1.0 + uBeat * 0.6), 1.0);
        }
    `;

    // ---------- 粒子化身 ----------
    const AVATAR_VS = `
        ${GLSL_HAND_COMMON_VS}
        uniform vec3 uJ[50];
        uniform vec2 uDisperse;
        uniform vec2 uFist;
        attribute float aJA;
        attribute float aJB;
        attribute float aT;
        attribute float aFT;
        attribute float aRad;
        attribute float aSeed;
        attribute vec3 aOff;
        varying vec3 vCol;
        varying float vA;
        void main() {
            int ia = int(aJA + 0.5);
            int ib = int(aJB + 0.5);
            vec3 A = uJ[ia];
            vec3 B = uJ[ib];
            float h = aJA > 24.5 ? 1.0 : 0.0;
            float disp = h < 0.5 ? uDisperse.x : uDisperse.y;
            float fist = h < 0.5 ? uFist.x : uFist.y;
            float breathe = 0.5 + 0.5 * sin(uTime * 2.3 + aSeed * 6.2831);
            float r = 0.009 * aRad * (1.0 + disp * (0.6 + breathe * 2.4) + uBass * 0.6) * (1.0 - fist * 0.55);
            vec3 swirl = vec3(sin(uTime * 1.7 + aSeed * 40.0), cos(uTime * 1.3 + aSeed * 23.0), sin(uTime * 2.1 + aSeed * 11.0));
            vec3 P = mix(A, B, aT) + aOff * r + swirl * 0.0025 * (1.0 + disp * 3.0);
            vec4 mv = viewMatrix * vec4(P, 1.0);
            float tw = 0.6 + 0.4 * sin(uTime * 9.0 + aSeed * 91.0);
            float front = (1.0 - uBeat) * 1.25;
            float wave = exp(-pow((aFT - front) * 5.0, 2.0)) * uBeat;
            gl_PointSize = dvPx((0.0042 + 0.003 * tw) * (1.0 + fist * 0.6 + wave), mv.z);
            vec3 c = mix(dvColA(h), dvColB(h), fract(aFT * 0.9 + aSeed * 0.25 + uTime * 0.05));
            vCol = c * (1.0 + fist * 0.8 + wave * 1.5);
            vA = dvOn(h) * tw;
            gl_Position = projectionMatrix * mv;
        }
    `;
    const AVATAR_FS = `
        varying vec3 vCol;
        varying float vA;
        void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float r2 = dot(p, p);
            if (r2 > 1.0 || vA < 0.002) discard;
            float g = exp(-r2 * 6.0);
            vec3 col = mix(vCol, vec3(1.0), exp(-r2 * 30.0) * 0.6) * g;
            gl_FragColor = vec4(col * vA, 1.0);
        }
    `;

    // ---------- GPU 粒子 (灵焰 / 火花) ----------
    const PARTICLE_VS = `
        uniform float uTime;
        uniform float uDrag;
        uniform float uFlame;
        uniform float uViewHalfH;
        uniform vec3 uGravity;
        attribute vec3 aV;
        attribute float aBirth;
        attribute float aLife;
        attribute float aSize;
        attribute float aSeed;
        attribute vec3 aCol;
        varying vec3 vCol;
        varying float vX;
        void main() {
            float age = uTime - aBirth;
            if (age < 0.0 || age > aLife) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                gl_PointSize = 0.0;
                vCol = vec3(0.0);
                vX = 1.0;
                return;
            }
            float x = age / aLife;
            float damp = (1.0 - exp(-uDrag * age)) / uDrag;
            vec3 P = position + aV * damp + 0.5 * uGravity * age * age;
            if (uFlame > 0.5) {
                P += vec3(sin(age * 7.0 + aSeed * 20.0), 0.0, cos(age * 6.0 + aSeed * 13.0)) * 0.03 * age;
            }
            vec4 mv = viewMatrix * vec4(P, 1.0);
            float sz = uFlame > 0.5 ? aSize * (0.6 + x * 1.8) : aSize * (1.0 - x * 0.6);
            gl_PointSize = sz * projectionMatrix[1][1] * uViewHalfH / max(-mv.z, 0.05);
            gl_Position = projectionMatrix * mv;
            vCol = aCol;
            vX = x;
        }
    `;
    const PARTICLE_FS = `
        uniform float uFlame;
        varying vec3 vCol;
        varying float vX;
        void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float r2 = dot(p, p);
            if (r2 > 1.0 || vX >= 1.0) discard;
            vec3 col;
            if (uFlame > 0.5) {
                vec3 hot = vec3(1.0, 0.95, 0.85);
                vec3 c = vX < 0.2 ? mix(hot, vCol, vX / 0.2) : mix(vCol, vCol * vec3(0.5, 0.32, 0.9) * 0.5, (vX - 0.2) / 0.8);
                float a = exp(-r2 * 3.5) * smoothstep(0.0, 0.08, vX) * pow(1.0 - vX, 1.5);
                col = c * a;
            } else {
                vec3 c = mix(vec3(1.0), vCol, smoothstep(0.0, 0.3, vX));
                float a = (exp(-r2 * 12.0) + exp(-r2 * 3.0) * 0.35) * pow(1.0 - vX, 1.3);
                col = c * a;
            }
            gl_FragColor = vec4(col * 1.2, 1.0);
        }
    `;

    // ---------- 特效面片 (环 / 闪光 / 光球 / 曼陀罗 / 进度环 / 文字) ----------
    const FXQUAD_VS = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const FXQUAD_FS = `
        uniform float uKind;
        uniform float uAge;
        uniform float uAlpha;
        uniform float uParam;
        uniform float uTime;
        uniform float uBass;
        uniform vec3 uColor;
        uniform vec3 uColor2;
        uniform sampler2D uTex;
        varying vec2 vUv;
        void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float r = length(p);
            float x = clamp(uAge, 0.0, 1.0);
            vec3 col = vec3(0.0);
            if (uKind < 0.5) {
                // 0 涟漪光环
                if (r > 1.0) discard;
                float rad = 1.0 - pow(1.0 - x, 3.0);
                float th = 0.05 + 0.07 * x;
                float ring = exp(-pow((r - rad * 0.92) / th, 2.0));
                float ring2 = exp(-pow((r - rad * 0.74) / (th * 0.6), 2.0)) * 0.5;
                float fill = smoothstep(rad * 0.95, 0.0, r) * 0.12 * (1.0 - x);
                col = (uColor * (ring + fill) + uColor2 * ring2 + vec3(1.0) * ring * 0.3) * pow(1.0 - x, 2.0);
            } else if (uKind < 1.5) {
                // 1 闪光星芒
                float s1 = exp(-abs(p.x) * 40.0) * max(0.0, 1.0 - abs(p.y));
                float s2 = exp(-abs(p.y) * 40.0) * max(0.0, 1.0 - abs(p.x));
                vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
                float s3 = (exp(-abs(q.x) * 60.0) * max(0.0, 1.0 - abs(q.y)) + exp(-abs(q.y) * 60.0) * max(0.0, 1.0 - abs(q.x))) * 0.5;
                float glow = exp(-r * r * 12.0);
                col = (uColor * glow * 1.2 + vec3(1.0) * (s1 + s2 + s3) * 0.9 + vec3(1.0) * exp(-r * r * 60.0)) * pow(1.0 - x, 1.5);
            } else if (uKind < 2.5) {
                // 2 能量光球 (uParam = 蓄力 0..1)
                if (r > 1.0) discard;
                float a = atan(p.y, p.x);
                float spiral = 0.5 + 0.5 * sin(a * 3.0 + r * 18.0 - uTime * 9.0);
                float core = exp(-r * r * (34.0 - uParam * 20.0));
                float halo = exp(-r * r * 5.0) * 0.55;
                col = uColor * (halo + spiral * halo * 1.3 * uParam) + uColor2 * spiral * exp(-r * r * 10.0) * 0.4 + vec3(1.0) * core;
            } else if (uKind < 3.5) {
                // 3 掌心曼陀罗 (uParam = 显现程度)
                if (r > 1.0) discard;
                float a = atan(p.y, p.x);
                float rot = uTime * 0.35;
                float pr = 0.30 + 0.40 * pow(abs(cos((a + rot) * 6.0)), 0.7) * (1.0 + uBass * 0.25);
                float petal = exp(-abs(r - pr) * 55.0) * step(r, 0.78);
                float petal2 = exp(-abs(r - pr * 0.6) * 70.0) * step(r, 0.6) * 0.6;
                float ring1 = exp(-abs(r - 0.86) * 120.0);
                float ring2 = exp(-abs(r - 0.95) * 220.0) * 0.7;
                float rays = exp(-abs(sin((a - rot * 1.6) * 8.0)) * r * 26.0) * smoothstep(0.75, 0.2, r) * 0.5;
                float seg = 6.2831853 / 24.0;
                float ang = mod(a - rot * 0.7 + 10.0 * seg, seg) - seg * 0.5;
                float dd = length(vec2(ang * 0.8, r - 0.80));
                float dots = exp(-dd * dd * 3000.0);
                float center = exp(-r * r * 40.0) * 0.8;
                col = uColor * (petal + petal2 + ring1 + rays) + uColor2 * (ring2 + dots * 1.5) + vec3(1.0) * center * 0.6;
                col *= uParam * (0.85 + uBass * 0.5);
            } else if (uKind < 4.5) {
                // 4 召唤进度环 (uParam = 进度)
                if (r > 1.0) discard;
                float a01 = fract(atan(p.x, p.y) / 6.2831853 + 1.0);
                float arc = exp(-pow((r - 0.74) / 0.075, 2.0)) * step(a01, uParam);
                float track = exp(-pow((r - 0.74) / 0.05, 2.0)) * 0.22;
                float dotc = exp(-r * r * 30.0) * 0.5;
                col = uColor * (arc + track + dotc) + vec3(1.0) * arc * 0.35;
            } else {
                // 5 文字
                vec4 t = texture2D(uTex, vUv);
                col = t.rgb * t.a;
            }
            gl_FragColor = vec4(col * uAlpha, 1.0);
        }
    `;

    // ---------- 冲击波球壳 ----------
    const SHELL_VS = `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `;
    const SHELL_FS = `
        uniform float uAge;
        uniform vec3 uColor;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
            float x = clamp(uAge, 0.0, 1.0);
            gl_FragColor = vec4((uColor * f * 1.4 + vec3(1.0) * pow(f, 6.0) * 0.6) * pow(1.0 - x, 2.0), 1.0);
        }
    `;

    // ---------- 刀光 ----------
    const SLASH_VS = `
        attribute float aU;
        attribute float aSide;
        varying float vU;
        varying float vSide;
        void main() {
            vU = aU;
            vSide = aSide;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const SLASH_FS = `
        uniform float uAge;
        uniform vec3 uColor;
        varying float vU;
        varying float vSide;
        void main() {
            float x = clamp(uAge, 0.0, 1.0);
            float s2 = vSide * vSide;
            float core = exp(-s2 * 10.0);
            float halo = exp(-s2 * 1.8) * 0.5;
            float along = pow(1.0 - vU, 1.4) * smoothstep(0.0, 0.08, vU + 0.02);
            vec3 col = (uColor * (halo + core) + vec3(1.0) * core * 0.6) * along * pow(1.0 - x, 1.6);
            gl_FragColor = vec4(col, 1.0);
        }
    `;

    // ---------- 光弦 ----------
    const STRING_VS = `
        uniform vec3 uA;
        uniform vec3 uB;
        uniform float uTime;
        uniform float uAmp;
        uniform float uBeat;
        uniform float uBands[8];
        attribute float aX;
        attribute float aSide;
        varying float vX;
        varying float vSide;
        varying float vDisp;
        void main() {
            vec3 P = mix(uA, uB, aX);
            vec3 dir = uB - uA;
            float L = length(dir);
            dir = L > 1e-5 ? dir / L : vec3(1.0, 0.0, 0.0);
            vec3 toCam = normalize(cameraPosition - P);
            vec3 side = normalize(cross(dir, toCam) + vec3(1e-6));
            vec3 up = cross(side, dir);
            float d1 = sin(3.14159 * aX) * sin(uTime * 9.0) * (uBands[1] + uBeat * 0.6);
            float d2 = sin(6.28318 * aX) * sin(uTime * 14.0 + 1.0) * uBands[3] * 0.6;
            float d3 = sin(9.42478 * aX) * sin(uTime * 21.0 + 2.0) * uBands[5] * 0.45;
            float disp = (d1 + d2 + d3) * uAmp;
            P += up * disp + side * aSide * 0.0055 * (1.0 + uBeat * 0.8);
            vX = aX;
            vSide = aSide;
            vDisp = abs(disp);
            gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
        }
    `;
    const STRING_FS = `
        uniform vec3 uColA;
        uniform vec3 uColB;
        uniform float uAlpha;
        varying float vX;
        varying float vSide;
        varying float vDisp;
        void main() {
            float s2 = vSide * vSide;
            float core = exp(-s2 * 8.0);
            float halo = exp(-s2 * 1.5) * 0.45;
            vec3 c = mix(uColA, uColB, vX);
            vec3 col = c * (halo + core) * (1.3 + vDisp * 60.0) + vec3(1.0) * core * 0.6;
            gl_FragColor = vec4(col * uAlpha, 1.0);
        }
    `;

    // ==================================================================
    // 工具
    // ==================================================================
    function makeTextTexture(THREE, text, colorA, colorB) {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 128;
        const ctx = c.getContext('2d');
        drawText(ctx, text, colorA, colorB);
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        return { canvas: c, ctx, tex };
    }

    function drawText(ctx, text, colorA, colorB) {
        const w = ctx.canvas.width, h = ctx.canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.font = '900 76px "Orbitron", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, colorA);
        g.addColorStop(1, colorB);
        ctx.shadowColor = colorA;
        ctx.shadowBlur = 22;
        ctx.fillStyle = g;
        ctx.fillText(text, w / 2, h / 2 + 4);
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeText(text, w / 2, h / 2 + 4);
    }

    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

    // ==================================================================
    // GPU 粒子池
    // ==================================================================
    class GPUParticles {
        constructor(THREE, capacity, opts) {
            this.THREE = THREE;
            this.cap = capacity;
            this.cursor = 0;
            this.dirtyMin = Infinity;
            this.dirtyMax = -1;
            this.wrapped = false;
            const g = new THREE.BufferGeometry();
            this.p0 = new Float32Array(capacity * 3);
            this.v = new Float32Array(capacity * 3);
            this.birth = new Float32Array(capacity).fill(-1000);
            this.life = new Float32Array(capacity).fill(1);
            this.size = new Float32Array(capacity);
            this.seed = new Float32Array(capacity);
            this.col = new Float32Array(capacity * 3);
            const mk = (arr, n) => {
                const a = new THREE.BufferAttribute(arr, n);
                a.setUsage(THREE.DynamicDrawUsage);
                return a;
            };
            this.attrs = {
                position: mk(this.p0, 3),
                aV: mk(this.v, 3),
                aBirth: mk(this.birth, 1),
                aLife: mk(this.life, 1),
                aSize: mk(this.size, 1),
                aSeed: mk(this.seed, 1),
                aCol: mk(this.col, 3)
            };
            Object.keys(this.attrs).forEach(k => g.setAttribute(k, this.attrs[k]));
            this.uniforms = {
                uTime: { value: 0 },
                uDrag: { value: opts.drag },
                uFlame: { value: opts.flame ? 1 : 0 },
                uViewHalfH: opts.viewHalfH,
                uGravity: { value: new THREE.Vector3(0, opts.gravity, 0) }
            };
            const mat = new THREE.ShaderMaterial({
                uniforms: this.uniforms,
                vertexShader: PARTICLE_VS,
                fragmentShader: PARTICLE_FS,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            this.points = new THREE.Points(g, mat);
            this.points.frustumCulled = false;
            this.points.renderOrder = 20;
        }
        spawn(t, px, py, pz, vx, vy, vz, life, size, r, g, b) {
            const i = this.cursor;
            this.cursor = (this.cursor + 1) % this.cap;
            if (this.cursor === 0) this.wrapped = true;
            const o = i * 3;
            this.p0[o] = px; this.p0[o + 1] = py; this.p0[o + 2] = pz;
            this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz;
            this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b;
            this.birth[i] = t;
            this.life[i] = life;
            this.size[i] = size;
            this.seed[i] = Math.random();
            if (i < this.dirtyMin) this.dirtyMin = i;
            if (i > this.dirtyMax) this.dirtyMax = i;
        }
        burst(t, pos, count, speed, life, size, color, dir, spread) {
            for (let k = 0; k < count; k++) {
                let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
                const l = Math.sqrt(x * x + y * y + z * z) || 1;
                x /= l; y /= l; z /= l;
                if (dir) {
                    const s = spread === undefined ? 0.5 : spread;
                    x = dir.x + x * s; y = dir.y + y * s; z = dir.z + z * s;
                    const l2 = Math.sqrt(x * x + y * y + z * z) || 1;
                    x /= l2; y /= l2; z /= l2;
                }
                const sp = speed * (0.45 + Math.random() * 0.75);
                this.spawn(t, pos.x, pos.y, pos.z, x * sp, y * sp, z * sp,
                    life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6),
                    color.r, color.g, color.b);
            }
        }
        flush(t) {
            this.uniforms.uTime.value = t;
            if (this.dirtyMax < 0) return;
            const wrap = this.wrapped && this.dirtyMin === 0 && this.dirtyMax === this.cap - 1;
            const min = this.dirtyMin, count = this.dirtyMax - this.dirtyMin + 1;
            Object.keys(this.attrs).forEach(k => {
                const a = this.attrs[k];
                if (wrap) {
                    a.updateRange.offset = 0;
                    a.updateRange.count = -1;
                } else {
                    a.updateRange.offset = min * a.itemSize;
                    a.updateRange.count = count * a.itemSize;
                }
                a.needsUpdate = true;
            });
            this.dirtyMin = Infinity;
            this.dirtyMax = -1;
            this.wrapped = false;
        }
        clear() {
            this.birth.fill(-1000);
            this.attrs.aBirth.updateRange.offset = 0;
            this.attrs.aBirth.updateRange.count = -1;
            this.attrs.aBirth.needsUpdate = true;
        }
    }

    // ==================================================================
    // 主类
    // ==================================================================
    class HandFX {
        /**
         * @param {object} THREE
         * @param {THREE.Scene} scene
         * @param {object} opts { panoUniforms: {uTexture,uProjMode,uAxisC,uAxisR,uAxisU}, onSkyRipple(dir,color,strength), onFlash(amount) }
         */
        constructor(THREE, scene, opts) {
            const G = window.DVGestures;
            this.THREE = THREE;
            this.G = G;
            this.opts = opts || {};
            this.root = new THREE.Group();
            this.root.name = 'DVHandFX';
            scene.add(this.root);
            this.style = 'constellation';
            this.t = 0;
            this.combo = 0;
            this.lastJudgeTime = -10;

            this.common = {
                uTime: { value: 0 },
                uBass: { value: 0 },
                uBeat: { value: 0 },
                uViewHalfH: { value: 960 },
                uHandOn: { value: new THREE.Vector2(0, 0) },
                uColA: { value: [new THREE.Color(), new THREE.Color()] },
                uColB: { value: [new THREE.Color(), new THREE.Color()] }
            };
            this.handOn = [0, 0];

            this._tmpV = new THREE.Vector3();
            this._tmpV2 = new THREE.Vector3();
            this._tmpV3 = new THREE.Vector3();
            this._tmpM = new THREE.Matrix4();
            this._tmpQ = new THREE.Quaternion();
            this._tmpS = new THREE.Vector3();
            this._up = new THREE.Vector3(0, 1, 0);
            this._zAxis = new THREE.Vector3(0, 0, 1);
            this._gold = new THREE.Color(GOLD);
            this._white = new THREE.Color(0xffffff);
            this._colTmp = new THREE.Color();

            this._buildSkeleton();
            this._buildGlass();
            this._buildRibbons();
            this._buildAvatar();
            this.flame = new GPUParticles(THREE, 1800, { drag: 1.6, gravity: 0.22, flame: true, viewHalfH: this.common.uViewHalfH });
            this.sparks = new GPUParticles(THREE, 1200, { drag: 3.2, gravity: -0.55, flame: false, viewHalfH: this.common.uViewHalfH });
            this.root.add(this.flame.points);
            this.root.add(this.sparks.points);
            this._buildFxPools();
            this._buildString();
            this.setStyle(this.style);
        }

        // ---------------- 构建 ----------------
        _sharedMat(vs, fs, extraUniforms, opts) {
            const THREE = this.THREE;
            const uniforms = Object.assign({}, this.common, extraUniforms || {});
            return new THREE.ShaderMaterial(Object.assign({
                uniforms,
                vertexShader: vs,
                fragmentShader: fs,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            }, opts || {}));
        }

        _buildSkeleton() {
            const THREE = this.THREE, G = this.G;
            const n = G.NJ * 2;
            const g = new THREE.BufferGeometry();
            this.skelPos = new Float32Array(n * 3);
            const aHand = new Float32Array(n), aT = new Float32Array(n), aKind = new Float32Array(n);
            for (let h = 0; h < 2; h++) {
                for (let j = 0; j < G.NJ; j++) {
                    const i = h * G.NJ + j;
                    aHand[i] = h;
                    aT[i] = G.JOINT_T[j];
                    aKind[i] = j === 0 ? 2 : (G.TIPS.indexOf(j) >= 0 ? 1 : 0);
                }
            }
            this.skelPosAttr = new THREE.BufferAttribute(this.skelPos, 3).setUsage(THREE.DynamicDrawUsage);
            g.setAttribute('position', this.skelPosAttr);
            g.setAttribute('aHand', new THREE.BufferAttribute(aHand, 1));
            g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
            g.setAttribute('aKind', new THREE.BufferAttribute(aKind, 1));
            this.skelIntensity = { value: 1 };
            this.skelPoints = new THREE.Points(g, this._sharedMat(GLOW_POINT_VS, GLOW_POINT_FS, { uIntensity: this.skelIntensity }));
            this.skelPoints.frustumCulled = false;
            this.skelPoints.renderOrder = 12;
            this.root.add(this.skelPoints);

            // 骨骼光束
            const nb = G.BONES.length * 2;
            const bg = new THREE.InstancedBufferGeometry();
            bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3));
            bg.setIndex([0, 1, 2, 2, 1, 3]);
            this.beamA = new Float32Array(nb * 3);
            this.beamB = new Float32Array(nb * 3);
            const bHand = new Float32Array(nb), bT0 = new Float32Array(nb), bT1 = new Float32Array(nb), bW = new Float32Array(nb);
            for (let h = 0; h < 2; h++) {
                G.BONES.forEach((bn, k) => {
                    const i = h * G.BONES.length + k;
                    bHand[i] = h;
                    bT0[i] = G.JOINT_T[bn[0]];
                    bT1[i] = G.JOINT_T[bn[1]];
                    bW[i] = 0.0055 - G.JOINT_T[bn[1]] * 0.0018;
                });
            }
            this.beamAAttr = new THREE.InstancedBufferAttribute(this.beamA, 3).setUsage(THREE.DynamicDrawUsage);
            this.beamBAttr = new THREE.InstancedBufferAttribute(this.beamB, 3).setUsage(THREE.DynamicDrawUsage);
            bg.setAttribute('aA', this.beamAAttr);
            bg.setAttribute('aB', this.beamBAttr);
            bg.setAttribute('aHand', new THREE.InstancedBufferAttribute(bHand, 1));
            bg.setAttribute('aT0', new THREE.InstancedBufferAttribute(bT0, 1));
            bg.setAttribute('aT1', new THREE.InstancedBufferAttribute(bT1, 1));
            bg.setAttribute('aW', new THREE.InstancedBufferAttribute(bW, 1));
            bg.instanceCount = nb;
            this.beams = new THREE.Mesh(bg, this._sharedMat(BEAM_VS, BEAM_FS, { uIntensity: this.skelIntensity }, { side: THREE.DoubleSide }));
            this.beams.frustumCulled = false;
            this.beams.renderOrder = 11;
            this.root.add(this.beams);
        }

        _buildGlass() {
            const THREE = this.THREE, G = this.G;
            const pano = this.opts.panoUniforms || {};
            const extra = {
                uTexture: pano.uTexture || { value: null },
                uProjMode: pano.uProjMode || { value: 0 },
                uAxisC: pano.uAxisC || { value: new THREE.Vector3(0, 0, -1) },
                uAxisR: pano.uAxisR || { value: new THREE.Vector3(1, 0, 0) },
                uAxisU: pano.uAxisU || { value: new THREE.Vector3(0, 1, 0) }
            };
            const nS = (G.NJ + 1) * 2; // 关节 + 掌心
            const nC = G.BONES.length * 2;
            const sphereGeom = new THREE.SphereGeometry(1, 14, 10);
            const cylGeom = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
            const sHand = new Float32Array(nS), cHand = new Float32Array(nC);
            for (let i = 0; i < nS; i++) sHand[i] = i < nS / 2 ? 0 : 1;
            for (let i = 0; i < nC; i++) cHand[i] = i < nC / 2 ? 0 : 1;
            sphereGeom.setAttribute('aHand', new THREE.InstancedBufferAttribute(sHand, 1));
            cylGeom.setAttribute('aHand', new THREE.InstancedBufferAttribute(cHand, 1));

            const colorMat = this._sharedMat(GLASS_VS, glassFS(), extra, {
                blending: THREE.NormalBlending,
                depthWrite: false,
                depthFunc: THREE.LessEqualDepth
            });
            const depthMat = new THREE.ShaderMaterial({
                uniforms: {},
                vertexShader: GLASS_VS,
                fragmentShader: GLASS_DEPTH_FS,
                colorWrite: false,
                depthWrite: true,
                transparent: true
            });
            this.glassSpheres = new THREE.InstancedMesh(sphereGeom, colorMat, nS);
            this.glassCyl = new THREE.InstancedMesh(cylGeom, colorMat, nC);
            this.glassSpheresD = new THREE.InstancedMesh(sphereGeom, depthMat, nS);
            this.glassCylD = new THREE.InstancedMesh(cylGeom, depthMat, nC);
            this.glassSpheresD.instanceMatrix = this.glassSpheres.instanceMatrix;
            this.glassCylD.instanceMatrix = this.glassCyl.instanceMatrix;
            this.glassSpheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.glassCyl.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            [this.glassSpheresD, this.glassCylD].forEach(m => { m.renderOrder = 8; });
            [this.glassSpheres, this.glassCyl].forEach(m => { m.renderOrder = 9; });
            this.glassGroup = new THREE.Group();
            [this.glassSpheresD, this.glassCylD, this.glassSpheres, this.glassCyl].forEach(m => {
                m.frustumCulled = false;
                this.glassGroup.add(m);
            });
            this.root.add(this.glassGroup);
        }

        _buildRibbons() {
            const THREE = this.THREE;
            const N = 36;
            this.ribN = N;
            const R = 10;
            const nv = R * N * 2;
            this.ribPos = new Float32Array(nv * 3);
            const aU = new Float32Array(nv), aRib = new Float32Array(nv), aSide = new Float32Array(nv);
            const idx = [];
            for (let r = 0; r < R; r++) {
                for (let k = 0; k < N; k++) {
                    const v = (r * N + k) * 2;
                    aU[v] = aU[v + 1] = k / (N - 1);
                    aRib[v] = aRib[v + 1] = r;
                    aSide[v] = -1;
                    aSide[v + 1] = 1;
                    if (k < N - 1) idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
                }
            }
            const g = new THREE.BufferGeometry();
            this.ribPosAttr = new THREE.BufferAttribute(this.ribPos, 3).setUsage(THREE.DynamicDrawUsage);
            g.setAttribute('position', this.ribPosAttr);
            g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
            g.setAttribute('aRib', new THREE.BufferAttribute(aRib, 1));
            g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
            g.setIndex(idx);
            this.ribbons = new THREE.Mesh(g, this._sharedMat(RIBBON_VS, RIBBON_FS, {}, { side: THREE.DoubleSide }));
            this.ribbons.frustumCulled = false;
            this.ribbons.renderOrder = 10;
            this.root.add(this.ribbons);
            // 每条丝带的历史点 (最新在前)
            this.ribHist = [];
            for (let r = 0; r < R; r++) this.ribHist.push({ pts: new Float32Array(N * 3), count: 0 });
        }

        _buildAvatar() {
            const THREE = this.THREE, G = this.G;
            const pairs = [];
            G.BONES.forEach(b => { for (let k = 0; k < 34; k++) pairs.push([b[0], b[1], Math.random(), 1.0]); });
            const palmJ = [0, 5, 6, 10, 11, 15, 16, 20, 21];
            for (let k = 0; k < 140; k++) {
                const a = palmJ[Math.floor(Math.random() * palmJ.length)];
                let b = palmJ[Math.floor(Math.random() * palmJ.length)];
                if (b === a) b = palmJ[(palmJ.indexOf(a) + 3) % palmJ.length];
                pairs.push([a, b, Math.random(), 1.4]);
            }
            const per = pairs.length;
            const n = per * 2;
            const aJA = new Float32Array(n), aJB = new Float32Array(n), aT = new Float32Array(n), aFT = new Float32Array(n);
            const aRad = new Float32Array(n), aSeed = new Float32Array(n), aOff = new Float32Array(n * 3);
            for (let h = 0; h < 2; h++) {
                for (let k = 0; k < per; k++) {
                    const i = h * per + k;
                    const p = pairs[k];
                    aJA[i] = p[0] + h * G.NJ;
                    aJB[i] = p[1] + h * G.NJ;
                    aT[i] = p[2];
                    aFT[i] = G.JOINT_T[p[0]] + (G.JOINT_T[p[1]] - G.JOINT_T[p[0]]) * p[2];
                    aRad[i] = p[3] * (0.5 + Math.random() * 0.7);
                    aSeed[i] = Math.random();
                    let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
                    const l = Math.sqrt(x * x + y * y + z * z) || 1;
                    const rr = Math.cbrt(Math.random());
                    aOff[i * 3] = x / l * rr;
                    aOff[i * 3 + 1] = y / l * rr;
                    aOff[i * 3 + 2] = z / l * rr;
                }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
            g.setAttribute('aJA', new THREE.BufferAttribute(aJA, 1));
            g.setAttribute('aJB', new THREE.BufferAttribute(aJB, 1));
            g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
            g.setAttribute('aFT', new THREE.BufferAttribute(aFT, 1));
            g.setAttribute('aRad', new THREE.BufferAttribute(aRad, 1));
            g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
            g.setAttribute('aOff', new THREE.BufferAttribute(aOff, 3));
            const J = [];
            for (let i = 0; i < 50; i++) J.push(new THREE.Vector3());
            this.avatarU = {
                uJ: { value: J },
                uDisperse: { value: new THREE.Vector2() },
                uFist: { value: new THREE.Vector2() }
            };
            this.avatar = new THREE.Points(g, this._sharedMat(AVATAR_VS, AVATAR_FS, this.avatarU));
            this.avatar.frustumCulled = false;
            this.avatar.renderOrder = 10;
            this.root.add(this.avatar);
        }

        _makeQuad(kind) {
            const THREE = this.THREE;
            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    uKind: { value: kind },
                    uAge: { value: 0 },
                    uAlpha: { value: 1 },
                    uParam: { value: 0 },
                    uTime: this.common.uTime,
                    uBass: this.common.uBass,
                    uColor: { value: new THREE.Color(1, 1, 1) },
                    uColor2: { value: new THREE.Color(1, 1, 1) },
                    uTex: { value: null }
                },
                vertexShader: FXQUAD_VS,
                fragmentShader: FXQUAD_FS,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });
            const m = new THREE.Mesh(this.quadGeom, mat);
            m.visible = false;
            m.frustumCulled = false;
            m.renderOrder = 22;
            this.root.add(m);
            return m;
        }

        _buildFxPools() {
            const THREE = this.THREE;
            this.quadGeom = new THREE.PlaneGeometry(1, 1);
            // 一次性特效池 (环 / 闪光 / 文字)
            this.fxPool = [];
            for (let i = 0; i < 20; i++) {
                this.fxPool.push({ mesh: this._makeQuad(0), active: false });
            }
            // 每只手的持续特效
            this.persist = [0, 1].map(() => ({
                pinchOrb: this._makeQuad(2),
                fistOrb: this._makeQuad(2),
                mandala: this._makeQuad(3),
                summon: this._makeQuad(4),
                mandalaAmt: 0,
                fistAmt: 0
            }));
            // 冲击波球壳
            const shellGeom = new THREE.SphereGeometry(1, 32, 16);
            this.shells = [];
            for (let i = 0; i < 3; i++) {
                const mat = new THREE.ShaderMaterial({
                    uniforms: { uAge: { value: 0 }, uColor: { value: new THREE.Color() } },
                    vertexShader: SHELL_VS,
                    fragmentShader: SHELL_FS,
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });
                const m = new THREE.Mesh(shellGeom, mat);
                m.visible = false;
                m.frustumCulled = false;
                m.renderOrder = 21;
                this.root.add(m);
                this.shells.push({ mesh: m, active: false, birth: 0, life: 0.7, maxR: 0.5 });
            }
            // 刀光
            this.slashes = [];
            const SN = 10;
            for (let i = 0; i < 4; i++) {
                const nv = SN * 2;
                const pos = new Float32Array(nv * 3);
                const aU = new Float32Array(nv), aSide = new Float32Array(nv);
                const idx = [];
                for (let k = 0; k < SN; k++) {
                    aU[k * 2] = aU[k * 2 + 1] = k / (SN - 1);
                    aSide[k * 2] = -1;
                    aSide[k * 2 + 1] = 1;
                    if (k < SN - 1) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3);
                }
                const g = new THREE.BufferGeometry();
                const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
                g.setAttribute('position', pa);
                g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
                g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
                g.setIndex(idx);
                const mat = new THREE.ShaderMaterial({
                    uniforms: { uAge: { value: 0 }, uColor: { value: new THREE.Color() } },
                    vertexShader: SLASH_VS,
                    fragmentShader: SLASH_FS,
                    transparent: true,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });
                const m = new THREE.Mesh(g, mat);
                m.visible = false;
                m.frustumCulled = false;
                m.renderOrder = 21;
                this.root.add(m);
                this.slashes.push({ mesh: m, pos, attr: pa, active: false, birth: 0, life: 0.38, n: SN });
            }
            this.slashCursor = 0;
            // 文字纹理
            this.textPerfect = makeTextTexture(THREE, 'PERFECT', '#fff3c4', '#ffb347');
            this.textGood = makeTextTexture(THREE, 'GOOD', '#a5f3fc', '#c4b5fd');
            this.textCombo = makeTextTexture(THREE, '', '#fde68a', '#f472b6');
            this.comboShown = -1;
        }

        _buildString() {
            const THREE = this.THREE;
            const N = 64;
            const nv = (N + 1) * 2;
            const aX = new Float32Array(nv), aSide = new Float32Array(nv);
            const idx = [];
            for (let k = 0; k <= N; k++) {
                aX[k * 2] = aX[k * 2 + 1] = k / N;
                aSide[k * 2] = -1;
                aSide[k * 2 + 1] = 1;
                if (k < N) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
            g.setAttribute('aX', new THREE.BufferAttribute(aX, 1));
            g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
            g.setIndex(idx);
            this.stringU = {
                uA: { value: new THREE.Vector3() },
                uB: { value: new THREE.Vector3() },
                uTime: this.common.uTime,
                uBeat: this.common.uBeat,
                uAmp: { value: 0.03 },
                uAlpha: { value: 0 },
                uBands: { value: new Float32Array(8) },
                uColA: { value: new THREE.Color() },
                uColB: { value: new THREE.Color() }
            };
            const mat = new THREE.ShaderMaterial({
                uniforms: this.stringU,
                vertexShader: STRING_VS,
                fragmentShader: STRING_FS,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });
            this.stringMesh = new THREE.Mesh(g, mat);
            this.stringMesh.visible = false;
            this.stringMesh.frustumCulled = false;
            this.stringMesh.renderOrder = 21;
            this.root.add(this.stringMesh);
            this.stringAmt = 0;
        }

        // ---------------- 风格 ----------------
        setStyle(id) {
            if (!STYLES.some(s => s.id === id)) id = 'constellation';
            this.style = id;
            const p = PALETTES[id];
            this.common.uColA.value[0].setHex(p[0]);
            this.common.uColB.value[0].setHex(p[1]);
            this.common.uColA.value[1].setHex(p[2]);
            this.common.uColB.value[1].setHex(p[3]);
            this.skelIntensity.value = SKELETON_INTENSITY[id];
            this.skelPoints.visible = this.beams.visible = SKELETON_INTENSITY[id] > 0;
            this.glassGroup.visible = id === 'liquid_glass';
            this.ribbons.visible = id === 'aurora_ribbon';
            this.avatar.visible = id === 'particle_avatar';
            this.flame.points.visible = id === 'spirit_flame';
            if (id !== 'spirit_flame') this.flame.clear();
            this.ribHist.forEach(r => { r.count = 0; });
        }

        handColor(h, which) {
            return which === 1 ? this.common.uColB.value[h] : this.common.uColA.value[h];
        }

        // ---------------- 每帧 ----------------
        /**
         * @param {object} ctx { t, dt, camera, tracker, bass, beatPulse, bands(Float32Array 8), viewHalfH }
         */
        update(ctx) {
            const t = ctx.t;
            this.t = t;
            const tracker = ctx.tracker;
            const cam = ctx.camera;
            this.camPos = cam.position;
            this.camQuat = cam.quaternion;
            this.common.uTime.value = t;
            this.common.uBass.value = ctx.bass || 0;
            this.common.uBeat.value = ctx.beatPulse || 0;
            if (ctx.viewHalfH) this.common.uViewHalfH.value = ctx.viewHalfH;
            if (ctx.bands) this.stringU.uBands.value.set(ctx.bands);

            for (let h = 0; h < 2; h++) {
                const hs = tracker.hands[h];
                const target = hs.valid ? 1 : 0;
                this.handOn[h] += (target - this.handOn[h]) * Math.min(1, ctx.dt * (target ? 10 : 6));
                if (this.handOn[h] < 0.004) this.handOn[h] = 0;
            }
            this.common.uHandOn.value.set(this.handOn[0], this.handOn[1]);

            this._updateSkeleton(tracker);
            if (this.style === 'liquid_glass') this._updateGlass(tracker);
            if (this.style === 'aurora_ribbon') this._updateRibbons(tracker, ctx);
            if (this.style === 'particle_avatar') this._updateAvatar(tracker, ctx);
            if (this.style === 'spirit_flame') this._updateFlame(tracker, ctx);

            for (const ev of tracker.events) this._onEvent(ev, tracker, ctx);

            this._updatePersistent(tracker, ctx);
            this._updatePools(ctx);
            this.flame.flush(t);
            this.sparks.flush(t);
        }

        _updateSkeleton(tracker) {
            const G = this.G;
            for (let h = 0; h < 2; h++) {
                const hs = tracker.hands[h];
                if (!hs.valid && this.handOn[h] === 0) continue;
                if (hs.valid) this.skelPos.set(hs.pos, h * G.NJ * 3);
                const base = h * G.BONES.length;
                G.BONES.forEach((bn, k) => {
                    const o = (base + k) * 3;
                    const a = bn[0] * 3, b = bn[1] * 3;
                    this.beamA[o] = hs.pos[a]; this.beamA[o + 1] = hs.pos[a + 1]; this.beamA[o + 2] = hs.pos[a + 2];
                    this.beamB[o] = hs.pos[b]; this.beamB[o + 1] = hs.pos[b + 1]; this.beamB[o + 2] = hs.pos[b + 2];
                });
            }
            this.skelPosAttr.needsUpdate = true;
            this.beamAAttr.needsUpdate = true;
            this.beamBAttr.needsUpdate = true;
        }

        _updateGlass(tracker) {
            const G = this.G;
            const m = this._tmpM, q = this._tmpQ, s = this._tmpS, p = this._tmpV, d = this._tmpV2;
            const nJ = G.NJ + 1;
            for (let h = 0; h < 2; h++) {
                const hs = tracker.hands[h];
                const visible = hs.valid || this.handOn[h] > 0;
                for (let j = 0; j < G.NJ; j++) {
                    if (!visible) { m.makeScale(0, 0, 0); } else {
                        p.set(hs.pos[j * 3], hs.pos[j * 3 + 1], hs.pos[j * 3 + 2]);
                        const r = hs.radii[j] * (j === 0 ? 0.75 : 1.05);
                        m.makeScale(r, r, r).setPosition(p);
                    }
                    this.glassSpheres.setMatrixAt(h * nJ + j, m);
                }
                // 掌心椭球
                if (!visible) { m.makeScale(0, 0, 0); } else {
                    const x = this._tmpV3.crossVectors(hs.palmNormal, hs.fingerDir);
                    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
                    x.normalize();
                    const z = d.crossVectors(x, hs.palmNormal).normalize();
                    m.makeBasis(x, hs.palmNormal, z);
                    s.set(hs.handSize * 0.42, 0.0125, hs.handSize * 0.48);
                    m.scale(s);
                    p.copy(hs.palmCenter);
                    m.setPosition(p);
                }
                this.glassSpheres.setMatrixAt(h * nJ + G.NJ, m);

                G.BONES.forEach((bn, k) => {
                    const idx = h * G.BONES.length + k;
                    if (!visible) { m.makeScale(0, 0, 0); } else {
                        const a = bn[0] * 3, b = bn[1] * 3;
                        p.set(hs.pos[a], hs.pos[a + 1], hs.pos[a + 2]);
                        d.set(hs.pos[b] - p.x, hs.pos[b + 1] - p.y, hs.pos[b + 2] - p.z);
                        const len = d.length();
                        if (len < 1e-5) { m.makeScale(0, 0, 0); } else {
                            d.divideScalar(len);
                            q.setFromUnitVectors(this._up, d);
                            const r = (hs.radii[bn[0]] + hs.radii[bn[1]]) * 0.5 * (bn[0] === 0 ? 0.7 : 0.98);
                            s.set(r, len, r);
                            p.addScaledVector(d, len * 0.5);
                            m.compose(p, q, s);
                        }
                    }
                    this.glassCyl.setMatrixAt(idx, m);
                });
            }
            this.glassSpheres.instanceMatrix.needsUpdate = true;
            this.glassCyl.instanceMatrix.needsUpdate = true;
        }

        _updateRibbons(tracker, ctx) {
            const G = this.G, N = this.ribN;
            const cam = this.camPos;
            const bassW = 1 + (ctx.bass || 0) * 0.9;
            for (let h = 0; h < 2; h++) {
                const hs = tracker.hands[h];
                for (let f = 0; f < 5; f++) {
                    const r = h * 5 + f;
                    const hist = this.ribHist[r];
                    const pts = hist.pts;
                    if (hs.valid) {
                        const j = G.TIPS[f] * 3;
                        pts.copyWithin(3, 0, (N - 1) * 3);
                        pts[0] = hs.pos[j]; pts[1] = hs.pos[j + 1]; pts[2] = hs.pos[j + 2];
                        if (hist.count === 0) for (let k = 1; k < N; k++) { pts[k * 3] = pts[0]; pts[k * 3 + 1] = pts[1]; pts[k * 3 + 2] = pts[2]; }
                        hist.count = Math.min(N, hist.count + 1);
                    } else if (hist.count > 0) {
                        // 手丢失：丝带向末端收拢
                        pts.copyWithin(3, 0, (N - 1) * 3);
                        hist.count = Math.max(0, hist.count - 2);
                    }
                    // 生成带宽度的面片 (宽度垂直于切线与视线)
                    for (let k = 0; k < N; k++) {
                        const o = k * 3;
                        const k0 = Math.max(0, k - 1), k1 = Math.min(N - 1, k + 1);
                        let tx = pts[k0 * 3] - pts[k1 * 3], ty = pts[k0 * 3 + 1] - pts[k1 * 3 + 1], tz = pts[k0 * 3 + 2] - pts[k1 * 3 + 2];
                        const vx = cam.x - pts[o], vy = cam.y - pts[o + 1], vz = cam.z - pts[o + 2];
                        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
                        let sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
                        if (sl < 1e-9) { sx = 0; sy = 0.001; sz = 0; sl = 0.001; }
                        const u = k / (N - 1);
                        const w = (f === 0 ? 0.009 : 0.012) * Math.pow(1 - u, 0.7) * bassW / sl;
                        const v = (r * N + k) * 2 * 3;
                        this.ribPos[v] = pts[o] - sx * w; this.ribPos[v + 1] = pts[o + 1] - sy * w; this.ribPos[v + 2] = pts[o + 2] - sz * w;
                        this.ribPos[v + 3] = pts[o] + sx * w; this.ribPos[v + 4] = pts[o + 1] + sy * w; this.ribPos[v + 5] = pts[o + 2] + sz * w;
                    }
                }
            }
            this.ribPosAttr.needsUpdate = true;
        }

        _updateAvatar(tracker, ctx) {
            const G = this.G;
            const J = this.avatarU.uJ.value;
            for (let h = 0; h < 2; h++) {
                const hs = tracker.hands[h];
                if (hs.valid) {
                    for (let j = 0; j < G.NJ; j++) J[h * G.NJ + j].set(hs.pos[j * 3], hs.pos[j * 3 + 1], hs.pos[j * 3 + 2]);
                }
                const dTarget = hs.valid ? Math.max(0, (hs.openness - 0.55) / 0.45) * 0.8 + (ctx.bass || 0) * 0.5 : 0;
                const fTarget = hs.fist ? 1 : 0;
                const dv = this.avatarU.uDisperse.value, fv = this.avatarU.uFist.value;
                const k = Math.min(1, ctx.dt * 6);
                if (h === 0) { dv.x += (dTarget - dv.x) * k; fv.x += (fTarget - fv.x) * k; } else { dv.y += (dTarget - dv.y) * k; fv.y += (fTarget - fv.y) * k; }
            }
        }

        _updateFlame(tracker, ctx) {
            const G = this.G, t = ctx.t;
            for (let h = 0; h < 2; h++) {
                const hs = tracker.hands[h];
                if (!hs.valid) continue;
                const c = this.handColor(h, 0);
                const c2 = this.handColor(h, 1);
                const rate = 1 + Math.min(4, hs.tipSpeed * 3) + (ctx.bass || 0) * 3;
                for (let f = 0; f < 5; f++) {
                    const j = G.TIPS[f] * 3;
                    const n = Math.floor(rate * (f === 0 ? 0.6 : 1) + Math.random());
                    for (let k = 0; k < n; k++) {
                        const cc = Math.random() < 0.5 ? c : c2;
                        this.flame.spawn(t,
                            hs.pos[j] + (Math.random() - 0.5) * 0.008,
                            hs.pos[j + 1] + (Math.random() - 0.5) * 0.008,
                            hs.pos[j + 2] + (Math.random() - 0.5) * 0.008,
                            hs.tipVel.x * 0.15 + (Math.random() - 0.5) * 0.05,
                            hs.tipVel.y * 0.15 + 0.06 + Math.random() * 0.05,
                            hs.tipVel.z * 0.15 + (Math.random() - 0.5) * 0.05,
                            0.45 + Math.random() * 0.35, 0.014 + Math.random() * 0.01,
                            cc.r, cc.g, cc.b);
                    }
                }
                // 掌心一缕
                if (Math.random() < 0.6) {
                    const p = hs.palmCenter;
                    this.flame.spawn(t, p.x, p.y, p.z,
                        hs.palmNormal.x * 0.08, hs.palmNormal.y * 0.08 + 0.05, hs.palmNormal.z * 0.08,
                        0.7, 0.026, c.r, c.g, c.b);
                }
            }
        }

        // ---------------- 手势事件 -> 特效 ----------------
        _judgeColor(h, judge, which) {
            if (judge === 'perfect') return this._gold;
            return this.handColor(h, which || 0);
        }

        _onEvent(ev, tracker, ctx) {
            const t = ctx.t;
            const h = ev.hand >= 0 ? ev.hand : 0;
            switch (ev.type) {
                case 'pinchStart': {
                    if (ev.summonCandidate) break;
                    this._spawnQuad(1, ev.pos, 0.05, 0.05, 0.22, this.handColor(h, 0), this.handColor(h, 1));
                    this.sparks.burst(t, ev.pos, 8, 0.35, 0.35, 0.007, this.handColor(h, 0));
                    break;
                }
                case 'pinchEnd': {
                    if (ev.consumed || ev.interrupted) break;
                    const charged = Math.min(1, ev.holdTime / 0.8);
                    const col = this._judgeColor(h, ev.judge, 0);
                    this._spawnQuad(0, ev.pos, 0.02, 0.12 + charged * 0.14, 0.5 + charged * 0.2, col, this.handColor(h, 1));
                    this.sparks.burst(t, ev.pos, 14 + Math.round(charged * 16), 0.5 + charged * 0.5, 0.5, 0.008, col);
                    if (ev.judge) this._judgement(ev.judge, ev.pos, h);
                    break;
                }
                case 'swipe': {
                    // 捏住滑动：沿滑动方向喷出一束火花 + 一个星芒
                    const col = this.handColor(h, 0);
                    this._spawnQuad(1, ev.pos, 0.05, 0.22, 0.4, col, this._white);
                    this.sparks.burst(t, ev.pos, 32, 1.3, 0.55, 0.009, col, ev.vec, 0.35);
                    break;
                }
                case 'summon': {
                    this._spawnQuad(1, ev.pos, 0.06, 0.16, 0.35, this._white, this.handColor(h, 0));
                    this._spawnQuad(0, ev.pos, 0.03, 0.22, 0.45, this.handColor(h, 0), this._white);
                    break;
                }
                case 'stop': {
                    this._spawnQuad(1, ev.pos, 0.06, 0.18, 0.35, this._white, this.handColor(h, 0));
                    this.sparks.burst(t, ev.pos, 18, 0.7, 0.5, 0.008, this.handColor(h, 0));
                    break;
                }
                case 'fistEnd': {
                    if (ev.lost || ev.holdTime < 0.25) break;
                    const charge = Math.min(1, ev.holdTime / 1.2);
                    const col = this.handColor(h, 0);
                    this._spawnShell(ev.pos, 0.25 + charge * 0.45, 0.6 + charge * 0.3, col);
                    this.sparks.burst(t, ev.pos, 24 + Math.round(charge * 40), 0.9 + charge * 1.2, 0.7, 0.01, col);
                    this._spawnQuad(1, ev.pos, 0.08, 0.2 + charge * 0.2, 0.3, col, this._white);
                    this._skyRipple(this._dirFromHead(ev.pos), col, 0.5 + charge * 0.7);
                    if (this.opts.onFlash) this.opts.onFlash(0.08 + charge * 0.15);
                    break;
                }
                case 'push': {
                    const col = this._judgeColor(h, ev.judge, 0);
                    const q = this._spawnQuad(0, ev.pos, 0.06, 0.55, 0.8, col, this.handColor(h, 1), ev.dir);
                    if (q) q.vel = ev.dir.clone().multiplyScalar(1.4);
                    this.sparks.burst(t, ev.pos, 26, 1.4, 0.6, 0.009, col, ev.dir, 0.45);
                    this._skyRipple(ev.dir, col, ev.judge === 'perfect' ? 1.2 : 0.85);
                    if (ev.judge) this._judgement(ev.judge, ev.pos, h);
                    break;
                }
                case 'strike': {
                    const col = this._judgeColor(h, ev.judge, 0);
                    this._spawnSlash(ev.trail, ev.dir, col);
                    const perfect = ev.judge === 'perfect';
                    this.sparks.burst(t, ev.pos, perfect ? 34 : 12, perfect ? 1.3 : 0.8, 0.5, 0.008, col, ev.dir, 0.7);
                    if (ev.judge) {
                        this._judgement(ev.judge, ev.pos, h);
                        if (perfect) this._skyRipple(this._dirFromHead(ev.pos), col, 0.5);
                    } else {
                        this.combo = 0;
                    }
                    break;
                }
                case 'clap': {
                    const col = ev.judge === 'perfect' ? this._gold : this._colTmp.copy(this.handColor(0, 0)).lerp(this.handColor(1, 0), 0.5);
                    this._spawnQuad(1, ev.pos, 0.1, 0.38, 0.4, col, this._white);
                    this._spawnQuad(0, ev.pos, 0.05, 0.5, 0.6, col, this._white);
                    this.sparks.burst(t, ev.pos, 50, 1.3, 0.7, 0.01, col);
                    if (this.opts.onFlash) this.opts.onFlash(ev.judge === 'perfect' ? 0.45 : 0.3);
                    this._skyRipple(this._dirFromHead(this._tmpV3.copy(this.camPos).add(this._tmpV.set(0, 0, -1).applyQuaternion(this.camQuat))), col, 1.0);
                    if (ev.judge) this._judgement(ev.judge, ev.pos, 1);
                    break;
                }
                case 'stringEnd': {
                    for (let k = 0; k < 8; k++) {
                        const p = this._tmpV.copy(ev.a).lerp(ev.b, k / 7);
                        this.sparks.burst(t, p, 3, 0.4, 0.4, 0.007, this._colTmp.copy(this.handColor(0, 0)).lerp(this.handColor(1, 0), k / 7));
                    }
                    break;
                }
                default:
                    break;
            }
        }

        _dirFromHead(pos) {
            return this._tmpV2.copy(pos).sub(this.camPos).normalize().clone();
        }

        _skyRipple(dir, color, strength) {
            if (this.opts.onSkyRipple) this.opts.onSkyRipple(dir, color, strength);
        }

        _judgement(judge, pos, h) {
            const t = this.t;
            if (judge === 'perfect' || judge === 'good') {
                this.combo = (t - this.lastJudgeTime < 2.5) ? this.combo + 1 : 1;
                this.lastJudgeTime = t;
            }
            const tex = judge === 'perfect' ? this.textPerfect.tex : this.textGood.tex;
            const p = this._tmpV.copy(pos);
            p.y += 0.07;
            const q = this._spawnQuad(5, p, 0.05, 0.065, 0.75, this._white, this._white);
            if (q) {
                q.mesh.material.uniforms.uTex.value = tex;
                q.aspect = 4;
                q.vel = this._tmpV2.set(0, 0.12, 0).clone();
            }
            if (this.combo >= 2) {
                if (this.comboShown !== this.combo) {
                    drawText(this.textCombo.ctx, 'COMBO ×' + this.combo, '#fde68a', '#f472b6');
                    this.textCombo.tex.needsUpdate = true;
                    this.comboShown = this.combo;
                }
                p.y += 0.045;
                const c = this._spawnQuad(5, p, 0.04, 0.05, 0.9, this._white, this._white);
                if (c) {
                    c.mesh.material.uniforms.uTex.value = this.textCombo.tex;
                    c.aspect = 4;
                    c.vel = this._tmpV2.set(0, 0.1, 0).clone();
                }
            }
        }

        _spawnQuad(kind, pos, size0, size1, life, color, color2, normal) {
            let slot = null;
            for (const s of this.fxPool) if (!s.active) { slot = s; break; }
            if (!slot) {
                // 回收最老的
                slot = this.fxPool.reduce((a, b) => (a.birth < b.birth ? a : b));
            }
            slot.active = true;
            slot.kind = kind;
            slot.birth = this.t;
            slot.life = life;
            slot.size0 = size0;
            slot.size1 = size1;
            slot.aspect = 1;
            slot.vel = null;
            slot.normal = normal ? normal.clone() : null;
            slot.pos = slot.pos || new this.THREE.Vector3();
            slot.pos.copy(pos);
            const u = slot.mesh.material.uniforms;
            u.uKind.value = kind;
            u.uColor.value.copy(color);
            u.uColor2.value.copy(color2 || color);
            u.uAlpha.value = 1;
            u.uAge.value = 0;
            slot.mesh.visible = true;
            return slot;
        }

        _spawnShell(pos, maxR, life, color) {
            let s = this.shells.find(x => !x.active) || this.shells.reduce((a, b) => (a.birth < b.birth ? a : b));
            s.active = true;
            s.birth = this.t;
            s.life = life;
            s.maxR = maxR;
            s.mesh.position.copy(pos);
            s.mesh.material.uniforms.uColor.value.copy(color);
            s.mesh.visible = true;
        }

        _spawnSlash(trail, dir, color) {
            if (!trail || trail.length < 3) return;
            const s = this.slashes[this.slashCursor];
            this.slashCursor = (this.slashCursor + 1) % this.slashes.length;
            const cam = this.camPos;
            for (let k = 0; k < s.n; k++) {
                const pt = trail[Math.min(k, trail.length - 1)];
                const nx = trail[Math.min(k + 1, trail.length - 1)];
                const pv = trail[Math.max(k - 1, 0)];
                let tx = pv.x - nx.x, ty = pv.y - nx.y, tz = pv.z - nx.z;
                const vx = cam.x - pt.x, vy = cam.y - pt.y, vz = cam.z - pt.z;
                let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
                let sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
                if (sl < 1e-9) { sx = 0; sy = 1; sz = 0; sl = 1; }
                const u = k / (s.n - 1);
                const w = 0.022 * (1 - u * 0.7) / sl;
                const o = k * 6;
                s.pos[o] = pt.x - sx * w; s.pos[o + 1] = pt.y - sy * w; s.pos[o + 2] = pt.z - sz * w;
                s.pos[o + 3] = pt.x + sx * w; s.pos[o + 4] = pt.y + sy * w; s.pos[o + 5] = pt.z + sz * w;
            }
            s.attr.needsUpdate = true;
            s.active = true;
            s.birth = this.t;
            s.mesh.material.uniforms.uColor.value.copy(color);
            s.mesh.visible = true;
        }

        _orient(mesh, normal) {
            if (normal) {
                this._tmpQ.setFromUnitVectors(this._zAxis, normal);
                mesh.quaternion.copy(this._tmpQ);
            } else {
                mesh.quaternion.copy(this.camQuat);
            }
        }

        _updatePersistent(tracker, ctx) {
            const t = ctx.t, dt = ctx.dt;
            for (let h = 0; h < 2; h++) {
                const hs = tracker.hands[h];
                const P = this.persist[h];

                // 捏合聚光
                const showPinch = hs.valid && hs.pinching;
                P.pinchOrb.visible = showPinch;
                if (showPinch) {
                    const hold = Math.min(1, (t - hs.pinchStartTime) / 0.8);
                    const sz = 0.03 + hold * 0.035 + (ctx.bass || 0) * 0.01;
                    P.pinchOrb.position.copy(hs.pinchPoint);
                    P.pinchOrb.scale.set(sz, sz, sz);
                    this._orient(P.pinchOrb, null);
                    const u = P.pinchOrb.material.uniforms;
                    u.uParam.value = hold;
                    u.uAlpha.value = 0.9;
                    u.uColor.value.copy(this.handColor(h, 0));
                    u.uColor2.value.copy(this.handColor(h, 1));
                } else if (hs.valid && hs.pinchStrength > 0.35 && !hs.fist) {
                    // 即将捏合：淡淡的预览光点，让人知道“快捏到了”
                    P.pinchOrb.visible = true;
                    const k = (hs.pinchStrength - 0.35) / 0.65;
                    const sz = 0.012 + k * 0.016;
                    P.pinchOrb.position.copy(hs.pinchPoint);
                    P.pinchOrb.scale.set(sz, sz, sz);
                    this._orient(P.pinchOrb, null);
                    const u = P.pinchOrb.material.uniforms;
                    u.uParam.value = 0;
                    u.uAlpha.value = 0.25 + k * 0.4;
                    u.uColor.value.copy(this.handColor(h, 0));
                    u.uColor2.value.copy(this.handColor(h, 1));
                }

                // 召唤进度环
                const showSummon = hs.valid && (hs.holdProgress || 0) > 0.02;
                P.summon.visible = showSummon;
                if (showSummon) {
                    P.summon.position.copy(hs.palmCenter).addScaledVector(hs.palmNormal, 0.1);
                    P.summon.scale.set(0.09, 0.09, 0.09);
                    this._orient(P.summon, null);
                    const u = P.summon.material.uniforms;
                    u.uParam.value = hs.holdProgress;
                    u.uColor.value.copy(this.handColor(h, 0));
                    u.uAlpha.value = 1;
                }

                // 掌心曼陀罗
                const mTarget = hs.valid && hs.open ? 1 : 0;
                P.mandalaAmt += (mTarget - P.mandalaAmt) * Math.min(1, dt * (mTarget ? 5 : 7));
                P.mandala.visible = P.mandalaAmt > 0.01 && hs.valid;
                if (P.mandala.visible) {
                    const sz = hs.handSize * 2.8 * (1 + (ctx.bass || 0) * 0.15) * (0.6 + 0.4 * P.mandalaAmt);
                    P.mandala.position.copy(hs.palmCenter).addScaledVector(hs.palmNormal, 0.02 + P.mandalaAmt * 0.015);
                    P.mandala.scale.set(sz, sz, sz);
                    this._orient(P.mandala, hs.palmNormal);
                    const u = P.mandala.material.uniforms;
                    u.uParam.value = P.mandalaAmt;
                    u.uAlpha.value = 1;
                    u.uColor.value.copy(this.handColor(h, 0));
                    u.uColor2.value.copy(this.handColor(h, 1));
                }

                // 握拳蓄力光球
                const fTarget = hs.valid && hs.fist ? 1 : 0;
                P.fistAmt += (fTarget - P.fistAmt) * Math.min(1, dt * (fTarget ? 8 : 12));
                P.fistOrb.visible = P.fistAmt > 0.01 && hs.valid;
                if (P.fistOrb.visible) {
                    const charge = hs.fist ? Math.min(1, (t - hs.fistStartTime) / 1.2) : 0;
                    const sz = (0.06 + charge * 0.1 + (ctx.beatPulse || 0) * 0.02) * P.fistAmt;
                    const c = this._tmpV;
                    c.set(0, 0, 0);
                    [6, 11, 16, 21].forEach(j => { c.x += hs.pos[j * 3]; c.y += hs.pos[j * 3 + 1]; c.z += hs.pos[j * 3 + 2]; });
                    c.multiplyScalar(0.25).lerp(hs.palmCenter, 0.4);
                    P.fistOrb.position.copy(c);
                    P.fistOrb.scale.set(sz, sz, sz);
                    this._orient(P.fistOrb, null);
                    const u = P.fistOrb.material.uniforms;
                    u.uParam.value = charge;
                    u.uAlpha.value = 0.95;
                    u.uColor.value.copy(this.handColor(h, 0));
                    u.uColor2.value.copy(this.handColor(h, 1));
                }
            }

            // 双手光弦
            const sTarget = tracker.stringActive ? 1 : 0;
            this.stringAmt += (sTarget - this.stringAmt) * Math.min(1, dt * (sTarget ? 10 : 8));
            this.stringMesh.visible = this.stringAmt > 0.01;
            if (this.stringMesh.visible && tracker.hands[0].valid && tracker.hands[1].valid) {
                this.stringU.uA.value.copy(tracker.hands[0].pinchPoint);
                this.stringU.uB.value.copy(tracker.hands[1].pinchPoint);
                const len = this.stringU.uA.value.distanceTo(this.stringU.uB.value);
                this.stringU.uAmp.value = 0.012 + len * 0.05;
                this.stringU.uAlpha.value = this.stringAmt;
                this.stringU.uColA.value.copy(this.handColor(0, 0));
                this.stringU.uColB.value.copy(this.handColor(1, 0));
            }
        }

        _updatePools(ctx) {
            const t = ctx.t, dt = ctx.dt;
            for (const s of this.fxPool) {
                if (!s.active) continue;
                const x = (t - s.birth) / s.life;
                if (x >= 1) {
                    s.active = false;
                    s.mesh.visible = false;
                    continue;
                }
                if (s.vel) s.pos.addScaledVector(s.vel, dt);
                const e = easeOutCubic(x);
                let sz = s.size0 + (s.size1 - s.size0) * e;
                if (s.kind === 5) {
                    // 文字：弹出后保持
                    sz = s.size1 * (x < 0.15 ? 0.6 + 0.4 * easeOutCubic(x / 0.15) * 1.15 : 1.0);
                    s.mesh.material.uniforms.uAlpha.value = x < 0.7 ? 1 : 1 - (x - 0.7) / 0.3;
                }
                s.mesh.position.copy(s.pos);
                s.mesh.scale.set(sz * s.aspect, sz, sz);
                this._orient(s.mesh, s.normal);
                s.mesh.material.uniforms.uAge.value = s.kind === 5 ? 0 : x;
            }
            for (const s of this.shells) {
                if (!s.active) continue;
                const x = (t - s.birth) / s.life;
                if (x >= 1) { s.active = false; s.mesh.visible = false; continue; }
                const r = 0.02 + s.maxR * easeOutCubic(x);
                s.mesh.scale.set(r, r, r);
                s.mesh.material.uniforms.uAge.value = x;
            }
            for (const s of this.slashes) {
                if (!s.active) continue;
                const x = (t - s.birth) / s.life;
                if (x >= 1) { s.active = false; s.mesh.visible = false; continue; }
                s.mesh.material.uniforms.uAge.value = x;
            }
        }

        clear() {
            this.fxPool.forEach(s => { s.active = false; s.mesh.visible = false; });
            this.shells.forEach(s => { s.active = false; s.mesh.visible = false; });
            this.slashes.forEach(s => { s.active = false; s.mesh.visible = false; });
            this.persist.forEach(P => {
                P.pinchOrb.visible = P.fistOrb.visible = P.mandala.visible = P.summon.visible = false;
                P.mandalaAmt = P.fistAmt = 0;
            });
            this.stringMesh.visible = false;
            this.stringAmt = 0;
            this.handOn[0] = this.handOn[1] = 0;
            this.common.uHandOn.value.set(0, 0);
            this.ribHist.forEach(r => { r.count = 0; });
            this.flame.clear();
            this.sparks.clear();
            this.combo = 0;
        }
    }

    window.DVHandFx = {
        STYLES,
        HandFX
    };
})();
