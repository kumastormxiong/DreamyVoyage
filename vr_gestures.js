/**
 * Dreamy Voyage - WebXR 裸手手势识别引擎 (vr_gestures.js)
 *
 * 设计要点（针对“菜单乱跑 / 太灵敏”问题）：
 *  1. One Euro 滤波：25 个关节逐帧自适应平滑 —— 静止时几乎不抖，快速挥手时延迟很小。
 *  2. 所有阈值按“手的尺寸”归一化（手腕 -> 中指根 的距离），并带迟滞 + 连续帧确认。
 *  3. 指向射线 = 估算肩部 -> 拇指/食指根部中点，再做滤波；捏合时手指在动，但指根几乎不动，
 *     所以射线不会在捏下去的瞬间甩开。另外保存 ~150ms 的射线历史，按下时取 90ms 前的方向。
 *  4. 输出离散手势事件：pinchStart/pinchEnd、fistStart/fistEnd、openStart/openEnd、
 *     push(推掌)、strike(快速挥击/打鼓)、clap(拍手)、stringStart/stringEnd(双手捏合拉弦)、
 *     summon(掌心朝向自己捏住 0.6 秒)。
 *  5. BeatDetector：从 Butterchurn 的音频电平 (bass / bass_att) 或分析器能量中检测鼓点，
 *     用于判定“卡拍”(Perfect / Good)。
 *
 * 本模块只依赖 THREE.Vector3 / Quaternion，可脱离 WebXR 用模拟数据测试。
 */
(() => {
    'use strict';

    const JOINT_NAMES = [
        'wrist',
        'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
        'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
        'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
        'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
        'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'
    ];
    const NJ = JOINT_NAMES.length; // 25
    const JI = {};
    JOINT_NAMES.forEach((n, i) => { JI[n] = i; });

    // 24 根骨骼 (关节索引对) + 每个关节在手指上的进度 (0 手腕 -> 1 指尖)
    const BONES = [];
    const JOINT_T = new Float32Array(NJ);
    (function buildBones() {
        const chains = [
            [0, 1, 2, 3, 4],
            [0, 5, 6, 7, 8, 9],
            [0, 10, 11, 12, 13, 14],
            [0, 15, 16, 17, 18, 19],
            [0, 20, 21, 22, 23, 24]
        ];
        chains.forEach(chain => {
            for (let k = 0; k < chain.length - 1; k++) BONES.push([chain[k], chain[k + 1]]);
            for (let k = 1; k < chain.length; k++) JOINT_T[chain[k]] = k / (chain.length - 1);
        });
        JOINT_T[0] = 0;
    })();
    const TIPS = [4, 9, 14, 19, 24];
    // 每根手指：[掌骨, 近节, 中节, 远节, 指尖]
    const FINGER_CHAINS = {
        index: [5, 6, 7, 8, 9],
        middle: [10, 11, 12, 13, 14],
        ring: [15, 16, 17, 18, 19],
        pinky: [20, 21, 22, 23, 24]
    };

    // 默认关节半径 (米)，当 XR 没给出 jointRadius 时使用
    const DEFAULT_RADII = new Float32Array(NJ);
    for (let i = 0; i < NJ; i++) {
        const t = JOINT_T[i];
        DEFAULT_RADII[i] = i === 0 ? 0.022 : (0.0115 - t * 0.0035);
    }

    // ------------------------------------------------------------------
    // One Euro Filter (向量版，用 3D 速度模长决定截止频率，各向同性)
    // ------------------------------------------------------------------
    function smoothingAlpha(cutoff, dt) {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    class VecOneEuro {
        constructor(count, minCutoff, beta, dCutoff) {
            this.n = count;
            this.minCutoff = minCutoff;
            this.beta = beta;
            this.dCutoff = dCutoff;
            this.x = new Float32Array(count * 3);
            this.dx = new Float32Array(count * 3);
            this.init = false;
        }
        reset() { this.init = false; }
        filter(raw, out, dt) {
            const n3 = this.n * 3;
            if (!this.init || dt <= 0) {
                for (let i = 0; i < n3; i++) { this.x[i] = raw[i]; this.dx[i] = 0; out[i] = raw[i]; }
                this.init = true;
                return;
            }
            const ad = smoothingAlpha(this.dCutoff, dt);
            for (let j = 0; j < this.n; j++) {
                const o = j * 3;
                let sp2 = 0;
                for (let k = 0; k < 3; k++) {
                    const d = (raw[o + k] - this.x[o + k]) / dt;
                    this.dx[o + k] += ad * (d - this.dx[o + k]);
                    sp2 += this.dx[o + k] * this.dx[o + k];
                }
                const cutoff = this.minCutoff + this.beta * Math.sqrt(sp2);
                const a = smoothingAlpha(cutoff, dt);
                for (let k = 0; k < 3; k++) {
                    this.x[o + k] += a * (raw[o + k] - this.x[o + k]);
                    out[o + k] = this.x[o + k];
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 鼓点检测
    // ------------------------------------------------------------------
    class BeatDetector {
        constructor() {
            this.lastBeat = -10;
            this.intervals = [];
            this.period = 0.5;
            this.avg = 0.2;
            this.beatThisFrame = false;
            this.pulse = 0; // 1 -> 0 衰减
        }
        update(t, dt, levels, bassEnergy) {
            this.beatThisFrame = false;
            let hit = false;
            if (levels && typeof levels.bass === 'number' && levels.bass > 0) {
                // Butterchurn: bass 为相对长期均值的瞬时比 (~1.0)，bass_att 为平滑值
                hit = levels.bass > 1.22 && levels.bass > (levels.bass_att || 1) * 1.12;
            } else {
                const e = bassEnergy || 0;
                this.avg += (e - this.avg) * Math.min(1, dt * 1.5);
                hit = e > 0.22 && e > this.avg * 1.3;
            }
            if (hit && t - this.lastBeat > 0.26) {
                const iv = t - this.lastBeat;
                if (iv > 0.28 && iv < 1.3) {
                    this.intervals.push(iv);
                    if (this.intervals.length > 8) this.intervals.shift();
                    const sorted = this.intervals.slice().sort((a, b) => a - b);
                    this.period = sorted[Math.floor(sorted.length / 2)];
                }
                this.lastBeat = t;
                this.beatThisFrame = true;
                this.pulse = 1;
            }
            this.pulse = Math.max(0, this.pulse - dt * 3.2);
        }
        // 距离最近鼓点(上一拍或预测下一拍)的时间差 (秒)
        offsetToBeat(t) {
            if (t - this.lastBeat > 2.5) return Infinity;
            const sinceLast = t - this.lastBeat;
            const toNext = this.lastBeat + this.period - t;
            return Math.min(Math.abs(sinceLast), Math.abs(toNext));
        }
        judge(t) {
            const off = this.offsetToBeat(t);
            if (off <= 0.09) return 'perfect';
            if (off <= 0.16) return 'good';
            return null;
        }
    }

    // ------------------------------------------------------------------
    // 单手状态
    // ------------------------------------------------------------------
    function makeHandState(THREE, index) {
        return {
            index,
            handedness: index === 0 ? 'left' : 'right',
            valid: false,
            validFrames: 0,
            raw: new Float32Array(NJ * 3),
            pos: new Float32Array(NJ * 3),
            radii: new Float32Array(DEFAULT_RADII),
            filter: new VecOneEuro(NJ, 2.0, 9.0, 1.0),
            aimFilter: new VecOneEuro(1, 1.1, 2.2, 1.0),
            aimRawBuf: new Float32Array(3),
            aimOutBuf: new Float32Array(3),

            handSize: 0.09,
            palmCenter: new THREE.Vector3(),
            palmNormal: new THREE.Vector3(0, -1, 0),
            fingerDir: new THREE.Vector3(0, 0, -1),
            curls: { index: 0, middle: 0, ring: 0, pinky: 0 },
            fistness: 0,
            openness: 0,
            palmFacing: 0,

            pinchDist: 1,
            pinchStrength: 0,
            pinching: false,
            pinchOnFrames: 0,
            pinchOffFrames: 0,
            pinchStartTime: 0,
            pinchPoint: new THREE.Vector3(),
            pinchSummon: false,
            summonProgress: 0,
            summonFired: false,

            fist: false,
            fistFrames: 0,
            fistStartTime: 0,
            open: false,
            openFrames: 0,

            velocity: new THREE.Vector3(),
            prevPalm: new THREE.Vector3(),
            tipPos: new THREE.Vector3(),
            prevTip: new THREE.Vector3(),
            tipVel: new THREE.Vector3(),
            tipSpeed: 0,
            tipHistory: [], // 最近 12 帧指尖位置 (用于挥击刀光)
            strikeArmed: false,
            strikePeak: 0,
            strikePeakDir: new THREE.Vector3(),
            lastStrike: -10,
            lastPush: -10,

            aimOrigin: new THREE.Vector3(),
            aimDir: new THREE.Vector3(0, 0, -1),
            aimValid: false,
            aimHistory: [] // {t, x, y, z}
        };
    }

    // ------------------------------------------------------------------
    // 追踪器
    // ------------------------------------------------------------------
    class HandTracker {
        constructor(THREE) {
            this.THREE = THREE;
            this.hands = [makeHandState(THREE, 0), makeHandState(THREE, 1)];
            this.events = [];
            this.beat = new BeatDetector();
            this.headPos = new THREE.Vector3(0, 1.6, 0);
            this.headQuat = new THREE.Quaternion();
            this.headRight = new THREE.Vector3(1, 0, 0);
            this.headFwd = new THREE.Vector3(0, 0, -1);
            this.stringActive = false;
            this.lastClap = -10;
            this.prevPalmDist = 1;
            this.palmDistHistory = [];
            this._v1 = new THREE.Vector3();
            this._v2 = new THREE.Vector3();
            this._v3 = new THREE.Vector3();
            this._v4 = new THREE.Vector3();
        }

        /**
         * @param {number} t 秒
         * @param {number} dt 秒
         * @param {Array} inputs [{ joints: {name: {position, visible, jointRadius}} | null }, ...] 下标 0=左手 1=右手
         * @param {THREE.Vector3} headPos
         * @param {THREE.Quaternion} headQuat
         */
        update(t, dt, inputs, headPos, headQuat) {
            this.events.length = 0;
            dt = Math.min(Math.max(dt, 1 / 240), 0.1);
            if (headPos) this.headPos.copy(headPos);
            if (headQuat) this.headQuat.copy(headQuat);
            this.headFwd.set(0, 0, -1).applyQuaternion(this.headQuat);
            this.headFwd.y = 0;
            if (this.headFwd.lengthSq() < 1e-4) this.headFwd.set(0, 0, -1);
            this.headFwd.normalize();
            this.headRight.set(-this.headFwd.z, 0, this.headFwd.x); // fwd x up

            for (let i = 0; i < 2; i++) {
                this._updateHand(this.hands[i], inputs[i], t, dt);
            }
            this._updateTwoHand(t, dt);
            return this.events;
        }

        _emit(type, hand, data) {
            const ev = data || {};
            ev.type = type;
            ev.hand = hand;
            this.events.push(ev);
        }

        _readJoints(h, input) {
            if (!input || !input.joints) return false;
            const joints = input.joints;
            const wrist = joints['wrist'];
            if (!wrist || !wrist.visible) return false;
            let visibleCount = 0;
            for (let j = 0; j < NJ; j++) {
                const jo = joints[JOINT_NAMES[j]];
                const o = j * 3;
                if (jo && jo.visible) {
                    h.raw[o] = jo.position.x;
                    h.raw[o + 1] = jo.position.y;
                    h.raw[o + 2] = jo.position.z;
                    if (typeof jo.jointRadius === 'number' && jo.jointRadius > 0) h.radii[j] = jo.jointRadius;
                    visibleCount++;
                } else if (h.validFrames > 0) {
                    // 缺失关节沿用上一帧，避免闪烁
                    h.raw[o] = h.pos[o];
                    h.raw[o + 1] = h.pos[o + 1];
                    h.raw[o + 2] = h.pos[o + 2];
                }
            }
            return visibleCount >= 20;
        }

        _j(h, idx, out) {
            const o = idx * 3;
            return out.set(h.pos[o], h.pos[o + 1], h.pos[o + 2]);
        }

        _dist(h, a, b) {
            const oa = a * 3, ob = b * 3;
            const dx = h.pos[oa] - h.pos[ob];
            const dy = h.pos[oa + 1] - h.pos[ob + 1];
            const dz = h.pos[oa + 2] - h.pos[ob + 2];
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        _curl(h, chain) {
            // 弯曲度 = 掌骨方向 (掌骨->近节) 与 末节方向 (远节->指尖) 的夹角 / 150°
            const p = h.pos;
            const a = chain[0] * 3, b = chain[1] * 3, c = chain[3] * 3, d = chain[4] * 3;
            const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2];
            const bx = p[d] - p[c], by = p[d + 1] - p[c + 1], bz = p[d + 2] - p[c + 2];
            const la = Math.sqrt(ax * ax + ay * ay + az * az);
            const lb = Math.sqrt(bx * bx + by * by + bz * bz);
            if (la < 1e-5 || lb < 1e-5) return 0;
            const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb)));
            return Math.min(1, Math.acos(cos) / 2.62);
        }

        _updateHand(h, input, t, dt) {
            const ok = this._readJoints(h, input);
            if (!ok) {
                if (h.valid) this._invalidate(h, t);
                return;
            }
            if (!h.valid) {
                h.filter.reset();
                h.aimFilter.reset();
                h.tipHistory.length = 0;
                h.aimHistory.length = 0;
            }
            h.valid = true;
            h.validFrames++;
            h.filter.filter(h.raw, h.pos, dt);

            const v1 = this._v1, v2 = this._v2, v3 = this._v3;

            // ---------- 手部几何 ----------
            const wrist = this._j(h, 0, v1);
            h.handSize = Math.max(0.06, Math.min(0.13, this._dist(h, 0, 11)));
            const idxProx = this._j(h, 6, v2);
            const pinkyProx = this._j(h, 21, v3);
            h.palmCenter.copy(wrist).add(idxProx).add(pinkyProx);
            h.palmCenter.add(this._j(h, 11, this._v4)).multiplyScalar(0.25);
            idxProx.sub(wrist);
            pinkyProx.sub(wrist);
            h.palmNormal.crossVectors(idxProx, pinkyProx);
            if (h.index === 0) h.palmNormal.negate();
            if (h.palmNormal.lengthSq() > 1e-10) h.palmNormal.normalize();
            this._j(h, 11, h.fingerDir).sub(this._j(h, 0, v1));
            if (h.fingerDir.lengthSq() > 1e-10) h.fingerDir.normalize();

            const toHead = v1.copy(this.headPos).sub(h.palmCenter);
            if (toHead.lengthSq() > 1e-8) toHead.normalize();
            h.palmFacing = h.palmNormal.dot(toHead);

            h.curls.index = this._curl(h, FINGER_CHAINS.index);
            h.curls.middle = this._curl(h, FINGER_CHAINS.middle);
            h.curls.ring = this._curl(h, FINGER_CHAINS.ring);
            h.curls.pinky = this._curl(h, FINGER_CHAINS.pinky);
            h.fistness = (h.curls.index + h.curls.middle + h.curls.ring + h.curls.pinky) * 0.25;
            const thumbOut = this._dist(h, 4, 6) / h.handSize;
            h.openness = (1 - h.fistness) * Math.min(1, thumbOut / 0.55);

            // ---------- 速度 ----------
            if (h.validFrames > 1) {
                v2.copy(h.palmCenter).sub(h.prevPalm).divideScalar(dt);
                h.velocity.lerp(v2, 0.5);
            } else {
                h.velocity.set(0, 0, 0);
            }
            h.prevPalm.copy(h.palmCenter);

            this._j(h, 9, h.tipPos).add(this._j(h, 14, v2)).multiplyScalar(0.5);
            if (h.validFrames > 1) {
                v2.copy(h.tipPos).sub(h.prevTip).divideScalar(dt);
                h.tipVel.lerp(v2, 0.6);
            } else {
                h.tipVel.set(0, 0, 0);
            }
            h.prevTip.copy(h.tipPos);
            h.tipSpeed = h.tipVel.length();
            h.tipHistory.unshift({ x: h.tipPos.x, y: h.tipPos.y, z: h.tipPos.z });
            if (h.tipHistory.length > 12) h.tipHistory.pop();

            // ---------- 指向射线 (肩部 -> 拇指/食指根部中点) ----------
            const side = h.index === 0 ? -0.16 : 0.16;
            h.aimOrigin.copy(this._j(h, 6, v2)).add(this._j(h, 2, v3)).multiplyScalar(0.5);
            const shoulder = v3.copy(this.headPos).addScaledVector(this.headRight, side);
            shoulder.y -= 0.22;
            v2.copy(h.aimOrigin).sub(shoulder);
            if (v2.lengthSq() > 1e-6) {
                v2.normalize();
                h.aimRawBuf[0] = v2.x; h.aimRawBuf[1] = v2.y; h.aimRawBuf[2] = v2.z;
                h.aimFilter.filter(h.aimRawBuf, h.aimOutBuf, dt);
                h.aimDir.set(h.aimOutBuf[0], h.aimOutBuf[1], h.aimOutBuf[2]).normalize();
                h.aimValid = true;
                h.aimHistory.push({ t, x: h.aimDir.x, y: h.aimDir.y, z: h.aimDir.z });
                while (h.aimHistory.length > 0 && t - h.aimHistory[0].t > 0.2) h.aimHistory.shift();
            }

            // ---------- 握拳 ----------
            const wasFist = h.fist;
            if (!h.fist) {
                h.fistFrames = (h.fistness > 0.78 && h.curls.index > 0.65) ? h.fistFrames + 1 : 0;
                if (h.fistFrames >= 3) {
                    h.fist = true;
                    h.fistStartTime = t;
                }
            } else if (h.fistness < 0.58) {
                h.fist = false;
                h.fistFrames = 0;
            }
            if (h.fist && !wasFist) {
                if (h.pinching) this._endPinch(h, t, true);
                this._emit('fistStart', h.index, { pos: h.palmCenter.clone() });
            } else if (!h.fist && wasFist) {
                this._emit('fistEnd', h.index, { pos: h.palmCenter.clone(), holdTime: t - h.fistStartTime });
            }

            // ---------- 捏合 (归一化 + 迟滞 + 连续帧) ----------
            h.pinchDist = this._dist(h, 4, 9) / h.handSize;
            h.pinchStrength = Math.min(1, Math.max(0, (0.62 - h.pinchDist) / (0.62 - 0.18)));
            h.pinchPoint.copy(this._j(h, 4, v2)).add(this._j(h, 9, v3)).multiplyScalar(0.5);
            if (!h.pinching) {
                h.pinchOnFrames = (h.pinchDist < 0.2 && !h.fist) ? h.pinchOnFrames + 1 : 0;
                if (h.pinchOnFrames >= 2) {
                    h.pinching = true;
                    h.pinchOffFrames = 0;
                    h.pinchStartTime = t;
                    h.pinchSummon = h.palmFacing > 0.45;
                    h.summonProgress = 0;
                    h.summonFired = false;
                    this._emit('pinchStart', h.index, {
                        pos: h.pinchPoint.clone(),
                        palmFacing: h.palmFacing,
                        summonCandidate: h.pinchSummon,
                        aimDir: this.getAimDirAt(h.index, t - 0.09)
                    });
                }
            } else {
                h.pinchOffFrames = (h.pinchDist > 0.36) ? h.pinchOffFrames + 1 : 0;
                if (h.pinchOffFrames >= 2) this._endPinch(h, t, false);
            }

            // ---------- 召唤菜单：掌心朝向自己 + 捏住 0.6 秒 ----------
            if (h.pinching && h.pinchSummon && !h.summonFired) {
                if (h.palmFacing < 0.2) {
                    h.pinchSummon = false;
                    h.summonProgress = 0;
                    this._emit('summonCancel', h.index, {});
                } else {
                    h.summonProgress = Math.min(1, (t - h.pinchStartTime) / 0.6);
                    if (h.summonProgress >= 1) {
                        h.summonFired = true;
                        this._emit('summon', h.index, { pos: h.pinchPoint.clone() });
                    }
                }
            }

            // ---------- 张开手掌 ----------
            const wasOpen = h.open;
            if (!h.open) {
                h.openFrames = (h.openness > 0.8 && !h.pinching) ? h.openFrames + 1 : 0;
                if (h.openFrames >= 4) h.open = true;
            } else if (h.openness < 0.62 || h.pinching) {
                h.open = false;
                h.openFrames = 0;
            }
            if (h.open && !wasOpen) this._emit('openStart', h.index, { pos: h.palmCenter.clone() });
            else if (!h.open && wasOpen) this._emit('openEnd', h.index, { pos: h.palmCenter.clone() });

            // ---------- 推掌：张开的手沿掌心方向快速推出 ----------
            const vAlong = h.velocity.dot(h.palmNormal);
            const vLen = h.velocity.length();
            if (h.openness > 0.6 && vAlong > 1.05 && vLen > 0 && vAlong / vLen > 0.72 && t - h.lastPush > 0.55) {
                h.lastPush = t;
                h.lastStrike = t; // 同一个动作不再算挥击
                h.strikeArmed = false;
                this._emit('push', h.index, {
                    pos: h.palmCenter.clone(),
                    dir: h.palmNormal.clone(),
                    speed: vAlong,
                    judge: this.beat.judge(t)
                });
            }

            // ---------- 挥击 / 打鼓：指尖速度峰值 ----------
            if (!h.strikeArmed) {
                // 指尖快 + 整只手也在快速移动 (排除单纯张合手指)
                if (h.tipSpeed > 1.7 && h.velocity.length() > 0.9 && t - h.lastStrike > 0.2) {
                    h.strikeArmed = true;
                    h.strikePeak = h.tipSpeed;
                    h.strikePeakDir.copy(h.tipVel).normalize();
                }
            } else {
                if (h.tipSpeed > h.strikePeak) {
                    h.strikePeak = h.tipSpeed;
                    h.strikePeakDir.copy(h.tipVel).normalize();
                }
                if (h.tipSpeed < h.strikePeak * 0.65) {
                    h.strikeArmed = false;
                    h.lastStrike = t;
                    this._emit('strike', h.index, {
                        pos: h.tipPos.clone(),
                        dir: h.strikePeakDir.clone(),
                        speed: h.strikePeak,
                        trail: h.tipHistory.slice(0, 10),
                        judge: this.beat.judge(t)
                    });
                }
            }
        }

        _endPinch(h, t, interrupted) {
            h.pinching = false;
            h.pinchOnFrames = 0;
            h.pinchOffFrames = 0;
            const wasSummon = h.pinchSummon;
            if (wasSummon && !h.summonFired) this._emit('summonCancel', h.index, {});
            this._emit('pinchEnd', h.index, {
                pos: h.pinchPoint.clone(),
                holdTime: t - h.pinchStartTime,
                consumed: wasSummon,
                interrupted: !!interrupted,
                judge: this.beat.judge(t)
            });
            h.pinchSummon = false;
            h.summonProgress = 0;
        }

        _invalidate(h, t) {
            if (h.pinching) this._endPinch(h, t, true);
            if (h.fist) this._emit('fistEnd', h.index, { pos: h.palmCenter.clone(), holdTime: 0, lost: true });
            if (h.open) this._emit('openEnd', h.index, { pos: h.palmCenter.clone() });
            h.valid = false;
            h.validFrames = 0;
            h.fist = false;
            h.open = false;
            h.fistFrames = 0;
            h.openFrames = 0;
            h.strikeArmed = false;
            h.aimValid = false;
            h.velocity.set(0, 0, 0);
            h.tipVel.set(0, 0, 0);
            h.tipSpeed = 0;
            h.tipHistory.length = 0;
            h.aimHistory.length = 0;
        }

        _updateTwoHand(t, dt) {
            const L = this.hands[0], R = this.hands[1];
            // 双手捏合拉弦
            const both = L.valid && R.valid && L.pinching && R.pinching && !L.pinchSummon && !R.pinchSummon;
            const sep = both ? L.pinchPoint.distanceTo(R.pinchPoint) : 0;
            if (!this.stringActive && both && sep > 0.12) {
                this.stringActive = true;
                this._emit('stringStart', -1, {});
            } else if (this.stringActive && (!both || sep < 0.06)) {
                this.stringActive = false;
                this._emit('stringEnd', -1, { a: L.pinchPoint.clone(), b: R.pinchPoint.clone() });
            }

            // 拍手：双掌快速靠近
            if (L.valid && R.valid) {
                const d = L.palmCenter.distanceTo(R.palmCenter);
                const closing = (this.prevPalmDist - d) / dt;
                this.palmDistHistory.push({ t, d });
                while (this.palmDistHistory.length && t - this.palmDistHistory[0].t > 0.35) this.palmDistHistory.shift();
                let wasFar = false;
                for (const s of this.palmDistHistory) if (s.d > 0.17) { wasFar = true; break; }
                if (d < 0.105 && wasFar && closing > 0.45 && t - this.lastClap > 0.4) {
                    this.lastClap = t;
                    const mid = L.palmCenter.clone().add(R.palmCenter).multiplyScalar(0.5);
                    this._emit('clap', -1, { pos: mid, judge: this.beat.judge(t) });
                }
                this.prevPalmDist = d;
            } else {
                this.prevPalmDist = 1;
                this.palmDistHistory.length = 0;
            }
        }

        // 取 time 时刻 (或之前最近) 的指向方向
        getAimDirAt(handIndex, time) {
            const h = this.hands[handIndex];
            const out = new this.THREE.Vector3().copy(h.aimDir);
            const hist = h.aimHistory;
            for (let i = hist.length - 1; i >= 0; i--) {
                if (hist[i].t <= time) {
                    out.set(hist[i].x, hist[i].y, hist[i].z);
                    break;
                }
                if (i === 0) out.set(hist[0].x, hist[0].y, hist[0].z);
            }
            return out;
        }

        reset() {
            for (const h of this.hands) this._invalidate(h, 0);
            this.events.length = 0;
            this.stringActive = false;
        }
    }

    window.DVGestures = {
        JOINT_NAMES,
        JI,
        BONES,
        JOINT_T,
        TIPS,
        NJ,
        DEFAULT_RADII,
        VecOneEuro,
        BeatDetector,
        HandTracker
    };
})();
