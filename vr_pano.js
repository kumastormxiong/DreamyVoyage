/**
 * Dreamy Voyage - VR 全景投影模块 (vr_pano.js)
 *
 * 把 Butterchurn 的 2D 画面映射到 360° 球幕上。提供三种投影：
 *
 *   tunnel     隧道球（默认）：Lambert 方位等积投影。画面中心对准正前方略偏上，
 *              画面的“离中心距离”对应球面上“离中心方向的角度”。整个球面只有正后下方
 *              一个收拢点，且用渐隐雾化遮住 —— 不存在任何竖向接缝。
 *   dome_lake  穹顶镜湖：上半球为以头顶为中心的等积穹顶，下半球为带波纹的水面倒影
 *              （上下镜像，左右不镜像）。全球既无接缝也无收拢点。
 *   cylinder   改良柱面：旧版 2:1 柱面展开。背后接缝区做“两侧颜色对齐 + 噪声溶解”，
 *              头顶/脚底极点用雾化代替旧的平面贴片（消除仰角处的重影环）。
 *
 * 另外支持：
 *   - 手势触发的“天空涟漪”(最多 4 个同时存在)，以及拍手时的全局闪光
 *   - 时空回响层 (echo) 合并进同一个片元着色器，不再额外画一层全屏球
 *   - 导出 GLSL 映射函数 dvPanoUV()，供“液态玻璃”手部材质折射采样全景
 */
(() => {
    'use strict';

    // classic = 2026-10-10 版的原始柱面拉伸方案 (默认)：2:1 柱面 + 背后窄带交叉混合 + 头顶/脚底平面贴片
    const PROJECTIONS = [
        { id: 'classic', nameZh: '经典柱面', nameEn: 'Classic Cylinder', icon: '🎞️', aspect: 2, mode: 3 },
        { id: 'tunnel', nameZh: '隧道球', nameEn: 'Tunnel Sphere', icon: '🌀', aspect: 1, mode: 0 },
        { id: 'dome_lake', nameZh: '穹顶镜湖', nameEn: 'Dome + Lake', icon: '🌅', aspect: 1, mode: 1 }
    ];

    const TUNNEL_PITCH = 12 * Math.PI / 180; // 隧道中心向上抬 12°，主体图案略高于视平线

    // ------------------------------------------------------------------
    // GLSL：方向 -> 纹理坐标 (不含雾化/湖面/涟漪，供手部玻璃材质复用)
    // ------------------------------------------------------------------
    const GLSL_MAPPING = `
        uniform float uProjMode;
        uniform vec3 uAxisC;
        uniform vec3 uAxisR;
        uniform vec3 uAxisU;
        #ifndef DV_PI
        #define DV_PI 3.141592653589793
        #endif

        vec2 dvTunnelUV(vec3 d) {
            float c = clamp(dot(d, uAxisC), -1.0, 1.0);
            vec3 t = d - uAxisC * c;
            float tl = length(t);
            vec2 dir2 = vec2(dot(t, uAxisR), dot(t, uAxisU)) / max(tl, 1e-5);
            float r = 0.49 * sqrt(max(0.0, (1.0 - c) * 0.5));
            return 0.5 + dir2 * r;
        }

        vec2 dvDomeUV(vec3 d) {
            float cy = clamp(d.y, 0.0, 1.0);
            vec2 h = vec2(d.x, d.z);
            float hl = length(h);
            vec2 dir2 = h / max(hl, 1e-5);
            float r = 0.49 * sqrt(max(0.0, 1.0 - cy));
            return 0.5 + dir2 * r;
        }

        vec2 dvCylUV(vec3 d) {
            float theta = atan(d.x, -d.z);
            float v = 0.5 + asin(clamp(d.y, -1.0, 1.0)) / DV_PI;
            return vec2(clamp(theta / (2.0 * DV_PI) + 0.5, 0.001, 0.999), clamp(v, 0.002, 0.998));
        }

        vec2 dvPanoUV(vec3 d) {
            if (uProjMode > 2.5) {
                vec3 n = vec3(-d.x, d.y, d.z);
                return vec2(clamp(atan(n.x, -n.z) / (2.0 * DV_PI) + 0.5, 0.001, 0.999), clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
            }
            if (uProjMode < 0.5) return dvTunnelUV(d);
            if (uProjMode < 1.5) return dvDomeUV(vec3(d.x, abs(d.y), d.z));
            return dvCylUV(d);
        }
    `;

    const VERTEX_SHADER = `
        uniform float uAudioBass;
        uniform float uStereoOn;
        varying vec3 vDir;
        void main() {
            vDir = (modelMatrix * vec4(position, 0.0)).xyz;
            vec3 displaced = position + normal * (uAudioBass * 0.35 * uStereoOn);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
    `;

    const FRAGMENT_SHADER = `
        uniform sampler2D uTexture;
        uniform sampler2D uEcho;
        uniform float uEchoAmt;
        uniform float uOpacity;
        uniform float uAudioBass;
        uniform float uTime;
        uniform float uFlash;
        uniform vec4 uRipples[4];
        uniform vec4 uRippleCol[4];
        varying vec3 vDir;
        ${GLSL_MAPPING}

        vec3 dvFetch(vec2 uv) { return texture2D(uTexture, uv).rgb; }

        vec3 dvRingAvg(float r) {
            vec3 s = vec3(0.0);
            for (int k = 0; k < 8; k++) {
                float a = float(k) * 0.7853982 + 0.3926991;
                s += dvFetch(0.5 + vec2(cos(a), sin(a)) * r);
            }
            return s * 0.125;
        }

        vec3 dvRowAvg(float v) {
            vec3 s = vec3(0.0);
            for (int k = 0; k < 8; k++) {
                s += dvFetch(vec2((float(k) + 0.5) / 8.0, v));
            }
            return s * 0.125;
        }

        float dvHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float dvNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = dvHash(i);
            float b = dvHash(i + vec2(1.0, 0.0));
            float c = dvHash(i + vec2(0.0, 1.0));
            float d = dvHash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        // ---------- 经典柱面 (与 2026-10-10 版着色器逐行一致) ----------
        // 旧版球体做了 scale(-1,1,1) 并用物体空间坐标，所以这里先把世界方向的 x 取反
        vec3 dvClassic(sampler2D tex, vec3 dWorld) {
            vec3 n = vec3(-dWorld.x, dWorld.y, dWorld.z);
            float v = n.y * 0.5 + 0.5;
            vec3 colCyl;
            const float SEAM_BETA = 0.22;
            float phiBack = atan(n.x, n.z);
            if (n.z > 0.0 && abs(phiBack) < SEAM_BETA) {
                float t = smoothstep(-SEAM_BETA, SEAM_BETA, phiBack);
                float uL = abs(phiBack) / (2.0 * DV_PI);
                float uR = 1.0 - uL;
                vec3 colL = texture2D(tex, vec2(clamp(uL, 0.001, 0.999), v)).rgb;
                vec3 colR = texture2D(tex, vec2(clamp(uR, 0.001, 0.999), v)).rgb;
                colCyl = mix(colL, colR, t);
            } else {
                float theta = atan(n.x, -n.z);
                float u = theta / (2.0 * DV_PI) + 0.5;
                colCyl = texture2D(tex, vec2(clamp(u, 0.001, 0.999), v)).rgb;
            }
            vec3 colZenith = texture2D(tex, clamp(vec2(n.x, -n.z) * 0.45 + 0.5, 0.0, 1.0)).rgb;
            vec3 colNadir = texture2D(tex, clamp(vec2(n.x, n.z) * 0.45 + 0.5, 0.0, 1.0)).rgb;
            float wZenith = smoothstep(0.48, 0.78, n.y);
            float wNadir = smoothstep(0.48, 0.78, -n.y);
            return colCyl * (1.0 - wZenith - wNadir) + colZenith * wZenith + colNadir * wNadir;
        }

        void main() {
            vec3 d = normalize(vDir);

            // ---------- 手势天空涟漪：沿球面向外扩散的环形波，轻微扭曲采样方向并叠加色光 ----------
            vec3 rippleAdd = vec3(0.0);
            for (int i = 0; i < 4; i++) {
                vec4 rp = uRipples[i];
                float age = uTime - rp.w;
                if (rp.w >= 0.0 && age >= 0.0 && age < 2.6) {
                    float cang = clamp(dot(d, rp.xyz), -1.0, 1.0);
                    float ang = acos(cang);
                    float front = age * 1.35;
                    float x = (ang - front) / 0.13;
                    float fade = 1.0 - age / 2.6;
                    float ring = exp(-x * x) * fade * fade * uRippleCol[i].a;
                    vec3 tang = d - rp.xyz * cang;
                    float tl = length(tang);
                    if (tl > 1e-4) {
                        d = normalize(d + (tang / tl) * ring * 0.045);
                    }
                    rippleAdd += uRippleCol[i].rgb * ring * 0.55;
                }
            }

            vec3 col;
            vec2 uvE;
            float echoW = 1.0;

            if (uProjMode > 2.5) {
                // ================= 经典柱面 (默认) =================
                col = dvClassic(uTexture, d);
                if (uEchoAmt > 0.001) col += dvClassic(uEcho, d) * uEchoAmt;
                uvE = vec2(0.5);
                echoW = 0.0;
            } else if (uProjMode < 0.5) {
                // ================= 隧道球：Lambert 方位等积投影 =================
                float c = clamp(dot(d, uAxisC), -1.0, 1.0);
                vec2 uv = dvTunnelUV(d);
                col = dvFetch(uv);
                uvE = uv;
                // 正后下方唯一收拢点：做成一个发光的“消失点”。
                // 外圈先用同方位角的柔化采样 (色带向消失点汇聚)，越靠近中心越过渡到整圈平均色，
                // 在收拢点本身完全与方位无关 -> 天然无缝。
                float fogW = 1.0 - smoothstep(-0.995, -0.80, c);
                if (fogW > 0.001) {
                    vec3 t3 = d - uAxisC * c;
                    vec2 dir2 = vec2(dot(t3, uAxisR), dot(t3, uAxisU)) / max(length(t3), 1e-5);
                    vec2 perp = vec2(-dir2.y, dir2.x);
                    vec3 streak = (dvFetch(0.5 + dir2 * 0.44) * 2.0
                                 + dvFetch(0.5 + (dir2 + perp * 0.12) * 0.44)
                                 + dvFetch(0.5 + (dir2 - perp * 0.12) * 0.44)) * 0.25;
                    vec3 avgC = mix(dvRingAvg(0.46), dvRingAvg(0.40), 0.5);
                    float center = 1.0 - smoothstep(-1.0, -0.95, c);
                    vec3 fogC = mix(streak, avgC, center);
                    float glow = exp((c + 1.0) * -60.0);
                    fogC = fogC * (1.15 + uAudioBass * 0.6) + avgC * glow * (0.8 + uAudioBass);
                    col = mix(col, fogC, fogW);
                    echoW = 1.0 - fogW;
                }
            } else if (uProjMode < 1.5) {
                // ================= 穹顶 + 镜湖 =================
                vec3 q = d;
                float depth = max(-q.y, 0.0);
                bool below = q.y < 0.0;
                if (below) {
                    float k = smoothstep(0.04, 0.4, depth);
                    vec2 p = q.xz / max(depth, 0.18);
                    float w1 = sin(length(p) * 4.2 - uTime * 1.6);
                    float w2 = sin(p.x * 2.7 + p.y * 1.9 + uTime * 1.05);
                    q = normalize(vec3(q.x + (w1 * 0.014 + w2 * 0.009) * k, -q.y, q.z + (w2 * 0.013 - w1 * 0.007) * k));
                }
                vec2 uv = dvDomeUV(q);
                col = dvFetch(uv);
                uvE = uv;
                if (below) {
                    float fres = 0.1 + 0.9 * pow(1.0 - depth, 5.0);
                    vec3 deep = vec3(0.006, 0.012, 0.035);
                    float glint = pow(max(0.0, dvNoise(q.xz * 40.0 + uTime * 0.4) - 0.72) * 3.5, 3.0) * smoothstep(0.02, 0.3, depth);
                    col = mix(deep, col * vec3(0.78, 0.9, 1.08), fres) + vec3(0.6, 0.8, 1.0) * glint * (0.4 + uAudioBass);
                    echoW = fres;
                }
            } else {
                // ================= 改良柱面 =================
                float v = clamp(0.5 + asin(clamp(d.y, -1.0, 1.0)) / DV_PI, 0.002, 0.998);
                float phi = atan(d.x, d.z); // 0 = 正后方
                const float BETA = 0.38;
                if (abs(phi) < BETA) {
                    float s = phi / BETA;
                    float ext = abs(phi) / (2.0 * DV_PI);
                    vec3 cA = dvFetch(vec2(clamp(1.0 - ext, 0.001, 0.999), v));
                    vec3 cB = dvFetch(vec2(clamp(ext, 0.001, 0.999), v));
                    vec3 mA = vec3(0.0);
                    vec3 mB = vec3(0.0);
                    for (int k = -2; k <= 2; k++) {
                        float vv = clamp(v + float(k) * 0.025, 0.002, 0.998);
                        mA += dvFetch(vec2(0.996, vv));
                        mB += dvFetch(vec2(0.004, vv));
                    }
                    mA *= 0.2;
                    mB *= 0.2;
                    float nearSeam = 1.0 - smoothstep(0.0, 1.0, abs(s));
                    cA += (mB - mA) * 0.5 * nearSeam;
                    cB += (mA - mB) * 0.5 * nearSeam;
                    float w = smoothstep(-1.0, 1.0, s);
                    float nse = dvNoise(vec2(v * 16.0, uTime * 0.2 + phi * 5.0));
                    float wd = smoothstep(0.0, 1.0, clamp(w + (nse - 0.5) * 0.9 * nearSeam, 0.0, 1.0));
                    col = mix(cB, cA, wd);
                    uvE = vec2(mix(ext, 1.0 - ext, wd), v);
                } else {
                    uvE = dvCylUV(d);
                    col = dvFetch(uvE);
                }
                float ay = abs(d.y);
                float poleW = smoothstep(0.80, 0.975, ay);
                if (poleW > 0.001) {
                    vec3 poleC = d.y > 0.0 ? dvRowAvg(0.93) : dvRowAvg(0.07);
                    col = mix(col, poleC, poleW);
                    echoW = 1.0 - poleW;
                }
            }

            if (uEchoAmt > 0.001) {
                col += texture2D(uEcho, uvE).rgb * uEchoAmt * echoW;
            }
            col += rippleAdd;
            col *= (1.0 + uAudioBass * 0.12 + uFlash);
            gl_FragColor = vec4(col, uOpacity);
        }
    `;

    function getProjection(id) {
        return PROJECTIONS.find(p => p.id === id) || PROJECTIONS[0];
    }

    /**
     * 创建全景球材质
     * @param {object} THREE
     * @param {object} opts { texture, echoTexture }
     */
    function createMaterial(THREE, opts) {
        const ripples = [];
        const rippleCols = [];
        for (let i = 0; i < 4; i++) {
            ripples.push(new THREE.Vector4(0, 0, -1, -1));
            rippleCols.push(new THREE.Vector4(1, 1, 1, 0));
        }
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: opts.texture },
                uEcho: { value: opts.echoTexture || opts.texture },
                uEchoAmt: { value: 0.0 },
                uOpacity: { value: 1.0 },
                uAudioBass: { value: 0.0 },
                uStereoOn: { value: 1.0 },
                uTime: { value: 0.0 },
                uFlash: { value: 0.0 },
                uRipples: { value: ripples },
                uRippleCol: { value: rippleCols },
                uProjMode: { value: 0.0 },
                uAxisC: { value: new THREE.Vector3(0, 0, -1) },
                uAxisR: { value: new THREE.Vector3(1, 0, 0) },
                uAxisU: { value: new THREE.Vector3(0, 1, 0) }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            side: THREE.BackSide,
            depthWrite: false
        });
        mat.userData.rippleCursor = 0;
        setTunnelYaw(mat, 0);
        return mat;
    }

    function setProjection(mat, id) {
        mat.uniforms.uProjMode.value = getProjection(id).mode;
    }

    // 隧道中心朝向：yaw 为绕 Y 轴的水平角 (0 = -Z 正前方)
    function setTunnelYaw(mat, yaw) {
        const cp = Math.cos(TUNNEL_PITCH);
        const sp = Math.sin(TUNNEL_PITCH);
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const C = mat.uniforms.uAxisC.value.set(fx * cp, sp, fz * cp).normalize();
        // U = 世界上方向在垂直于 C 平面上的投影
        const U = mat.uniforms.uAxisU.value.set(-fx * sp, cp, -fz * sp).normalize();
        // R = C x U  (面向 -Z 时为 +X)
        mat.uniforms.uAxisR.value.crossVectors(C, U).normalize();
    }

    function addRipple(mat, dir, color, strength, time) {
        const idx = mat.userData.rippleCursor % 4;
        mat.userData.rippleCursor++;
        mat.uniforms.uRipples.value[idx].set(dir.x, dir.y, dir.z, time);
        mat.uniforms.uRippleCol.value[idx].set(color.r, color.g, color.b, strength);
    }

    window.DVPano = {
        PROJECTIONS,
        getProjection,
        createMaterial,
        setProjection,
        setTunnelYaw,
        addRipple,
        GLSL_MAPPING
    };
})();
