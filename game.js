"use strict";

/* =====================================================================
   DUNGEON REBORN — 無限生存肉鴿
   單一檔案：資料表 / 音效 / 存檔 / 狀態 / 戰鬥 / 升級 / 繪製 / 介面
   所有局內狀態都集中在 G（createState），重新開始＝建立新的 G。
===================================================================== */

/* ============================== 常數 ============================== */
let VIEW_W = 1280;           // 邏輯畫面寬（手機會依螢幕比例調整）
let VIEW_H = 720;
const SAVE_KEY = "dungeonReborn.save.v2";
const WAVE_DURATION = 30;      // 每波秒數
const BOSS_EVERY = 5;          // 每幾波出現 Boss
const TILE = 64;
const SKILL_MAX = 5;           // 技能滿級
const MAX_SKILL_SLOTS = 4;     // 同時持有的技能欄位（終極技能也占一格）
const IS_TOUCH = !!(window.matchMedia && (window.matchMedia("(pointer: coarse)").matches ||
    (window.matchMedia("(hover: none)").matches && navigator.maxTouchPoints > 0)));
let zoom = 1;                  // 手機放大倍率
function mobileMode() { return IS_TOUCH || window.innerWidth < 820; }
function updateZoom() { zoom = mobileMode() ? Math.max(1, Math.min(1.4, VIEW_W / 640)) : 1; }
updateZoom();

const RARITIES = [
    { id: "common",    name: "普通", mult: 1,   color: "#c9c6d0" },
    { id: "rare",      name: "稀有", mult: 1.7, color: "#5fb4ff" },
    { id: "legendary", name: "傳說", mult: 2.6, color: "#ffb23e" }
];

/* ============================== 工具 ============================== */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pct = (v) => Math.round(v * 100) + "%";

function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function hash2(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

function loadImage(src) {
    const img = new Image();
    img.ready = false;
    img.onload = () => { img.ready = true; };
    img.onerror = () => { console.warn("圖片載入失敗：", src); };
    img.src = src;
    return img;
}

/* 著色快取（用於史萊姆變種與受擊閃白，不依賴 ctx.filter） */
const tintCache = new Map();
function getTinted(img, key, color, alpha) {
    if (!img || !img.ready) return null;
    let m = tintCache.get(img);
    if (!m) { m = new Map(); tintCache.set(img, m); }
    let c = m.get(key);
    if (!c) {
        c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = "source-atop";
        g.globalAlpha = alpha;
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        m.set(key, c);
    }
    return c;
}

/* ============================== 角色資料 ============================== */
const CHARACTERS = [
    {
        id: "warrior", name: "Warrior", title: "戰士",
        idle: "assets/characters/Warrior/Warrior_Idle.png",
        run: "assets/characters/Warrior/Warrior_Run.png",
        attack: "assets/characters/Warrior/Warrior_Attack1.png",
        frameW: 192, frameH: 192,
        idleFrames: 8, runFrames: 6, attackFrames: 4,
        idleFps: 10, runFps: 12, attackFps: 16,
        drawScale: 1,
        stats: { maxHp: 140, damage: 24, cooldown: 0.75, speed: 200 },
        weaponName: "戰士之刃", weaponUp: "揮砍範圍與傷害提升",
        evoName: "烈焰裂地斬", evoNeeds: "armor",
        evoText: "360° 旋風斬 + 二連擊 + 燃燒"
    },
    {
        id: "lancer", name: "Lancer", title: "槍兵",
        idle: "assets/characters/Lancer/Lancer_Idle.png",
        run: "assets/characters/Lancer/Lancer_Run.png",
        attackDirs: {
            right: "assets/characters/Lancer/Lancer_Right_Attack.png",
            down: "assets/characters/Lancer/Lancer_Down_Attack.png",
            downRight: "assets/characters/Lancer/Lancer_DownRight_Attack.png",
            up: "assets/characters/Lancer/Lancer_Up_Attack.png",
            upRight: "assets/characters/Lancer/Lancer_UpRight_Attack.png"
        },
        frameW: 320, frameH: 320,
        idleFrames: 12, runFrames: 6, attackFrames: 3,
        idleFps: 10, runFps: 12, attackFps: 12,
        drawScale: 1.75,
        stats: { maxHp: 110, damage: 20, cooldown: 0.6, speed: 210 },
        weaponName: "騎士長槍", weaponUp: "刺擊更長更寬，Lv.3 起二連刺",
        evoName: "雷霆貫穿", evoNeeds: "boots",
        evoText: "超長貫穿 + 連鎖閃電"
    },
    {
        id: "archer", name: "Archer", title: "弓箭手",
        idle: "assets/characters/Archer/Archer_Idle.png",
        run: "assets/characters/Archer/Archer_Run.png",
        attack: "assets/characters/Archer/Archer_Shoot.png",
        frameW: 192, frameH: 192,
        idleFrames: 6, runFrames: 4, attackFrames: 8,
        idleFps: 10, runFps: 12, attackFps: 12,
        drawScale: 1,
        stats: { maxHp: 85, damage: 15, cooldown: 0.5, speed: 225 },
        weaponName: "獵手長弓", weaponUp: "箭矢數量增加，Lv.3 起可穿透",
        evoName: "追魂箭雨", evoNeeds: "luck",
        evoText: "五連扇形追蹤箭 + 高穿透"
    }
];

const ITEM_NAMES = {
    armor: "鐵衛護甲", lifesteal: "吸血戒指", boots: "疾風長靴",
    luck: "幸運符", thorns: "荊棘之環", aura: "聖光符文"
};

/* 載入角色圖片 */
CHARACTERS.forEach((ch) => {
    ch.images = {
        idle: loadImage(ch.idle),
        run: loadImage(ch.run),
        attack: ch.attack ? loadImage(ch.attack) : null,
        attackDirs: null
    };
    if (ch.attackDirs) {
        ch.images.attackDirs = {};
        Object.keys(ch.attackDirs).forEach((k) => {
            ch.images.attackDirs[k] = loadImage(ch.attackDirs[k]);
        });
    }
});

/* ============================== 怪物資料 ============================== */
const SLIME_DIR = "assets/characters/Slime/";
const SLIME = {
    idle: loadImage(SLIME_DIR + "slime_green_idle.png"),
    move: {}, attack: {}
};
["down", "left", "right", "up"].forEach((d) => {
    SLIME.move[d] = loadImage(SLIME_DIR + "slime_green_move_" + d + ".png");
    SLIME.attack[d] = loadImage(SLIME_DIR + "slime_green_attack_" + d + ".png");
});

const ENEMY_TYPES = {
    slime: { name: "史萊姆",   hp: 30,  speed: 68,  dmg: 8,  r: 20, size: 60,  exp: 8,   tint: null },
    fast:  { name: "疾行史萊姆", hp: 16,  speed: 118, dmg: 6,  r: 15, size: 44,  exp: 7,   tint: ["#3aa0ff", 0.5] },
    tank:  { name: "重甲史萊姆", hp: 95,  speed: 46,  dmg: 14, r: 30, size: 92,  exp: 20,  tint: ["#ff4040", 0.45] },
    boss:  { name: "史萊姆王",   hp: 900, speed: 52,  dmg: 22, r: 78, size: 230, exp: 260, tint: ["#a050ff", 0.5] }
};

/* ============================== 升級資料 ============================== */
const ITEM_GAIN = [1, 1, 2]; // 依稀有度獲得的道具等級

const UPGRADES = [
    /* ---- 能力強化 ---- */
    { id: "attack", kind: "stat", name: "強力攻擊", icon: "⚔",
      text: (m) => `攻擊傷害 +${pct(0.10 * m)}`,
      apply: (p, m) => { p.dmgMult += 0.10 * m; } },
    { id: "attackSpeed", kind: "stat", name: "迅捷攻擊", icon: "✦",
      text: (m) => `攻擊冷卻 -${pct(0.08 * m)}`,
      apply: (p, m) => { p.cdMult = Math.max(0.3, p.cdMult * (1 - 0.08 * m)); } },
    { id: "moveSpeed", kind: "stat", name: "疾風步", icon: "➤",
      text: (m) => `移動速度 +${pct(0.07 * m)}`,
      apply: (p, m) => { p.speedBonus += 0.07 * m; } },
    { id: "health", kind: "stat", name: "生命強化", icon: "♥",
      text: (m) => `最大生命 +${Math.round(16 * m)}，同時恢復相同數值`,
      apply: (p, m) => { const v = Math.round(16 * m); p.maxHp += v; p.hp += v; } },
    { id: "critical", kind: "stat", name: "精準打擊", icon: "✧",
      text: (m) => `暴擊率 +${pct(0.04 * m)}，暴擊傷害 +${pct(0.05 * m)}`,
      apply: (p, m) => { p.crit = Math.min(0.9, p.crit + 0.04 * m); p.critMult += 0.05 * m; } },
    { id: "expRange", kind: "stat", name: "經驗磁吸", icon: "◎",
      text: (m) => `經驗球吸取範圍 +${pct(0.25 * m)}`,
      apply: (p, m) => { p.pickupMult += 0.25 * m; } },
    { id: "regen", kind: "stat", name: "再生", icon: "✚",
      text: (m) => `每秒恢復 ${(0.6 * m).toFixed(1)} 點生命`,
      apply: (p, m) => { p.regen += 0.6 * m; } },
    { id: "area", kind: "stat", name: "擴張", icon: "◉",
      text: (m) => `攻擊範圍 +${pct(0.07 * m)}`,
      apply: (p, m) => { p.areaMult += 0.07 * m; } },

    /* ---- 被動裝備 / 道具（可疊到 5 級）---- */
    { id: "armor", kind: "item", max: 5, name: "鐵衛護甲", icon: "◈",
      text: "受到傷害 -7% / 級" },
    { id: "lifesteal", kind: "item", max: 5, name: "吸血戒指", icon: "❦",
      text: "造成傷害的 3% 轉為生命 / 級" },
    { id: "boots", kind: "item", max: 5, name: "疾風長靴", icon: "➶",
      text: "移動速度 +6% / 級" },
    { id: "luck", kind: "item", max: 5, name: "幸運符", icon: "☘",
      text: "升級時更容易出現稀有、傳說" },
    { id: "thorns", kind: "item", max: 5, name: "荊棘之環", icon: "✺",
      text: "被碰撞時反彈傷害給敵人" },
    { id: "aura", kind: "item", max: 5, name: "聖光符文", icon: "☼",
      text: "周期性對周圍敵人造成光傷害" },

    /* ---- 武器 ---- */
    { id: "weapon", kind: "weapon", name: "武器精煉", icon: "⚒" },
    { id: "evolve", kind: "evolve", name: "武器進化", icon: "✹" },

    /* ---- 消耗品 ---- */
    { id: "heal", kind: "heal", name: "治療藥水", icon: "⚗" }
];

/* =====================================================================
   技能系統：8 種自動施放技能（最高 Lv.5）＋ 5 種融合終極技能
===================================================================== */
const SKILLS = {
    fireball: {
        name: "火球術", icon: "☄",
        cd: (lv) => 2.2 - 0.25 * (lv - 1),
        text: (lv) => `每 ${(2.2 - 0.25 * (lv - 1)).toFixed(1)} 秒射出 ${1 + Math.floor((lv - 1) / 2)} 顆追蹤火球，爆炸造成範圍傷害${lv >= 3 ? "並點燃敵人" : ""}`,
        cast(s, lv) {
            const p = G.player;
            const count = 1 + Math.floor((lv - 1) / 2);
            const targets = [];
            for (let i = 0; i < count; i++) {
                const t = nearestEnemy(p.x, p.y, 650, targets);
                if (!t) break;
                targets.push(t);
            }
            if (!targets.length) return false;
            targets.forEach((t) => {
                const a = Math.atan2(t.y - p.y, t.x - p.x) + rand(-0.15, 0.15);
                G.skillShots.push({
                    kind: "fire", x: p.x, y: p.y,
                    vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, speed: 420,
                    target: t, life: 2.5, radius: 70 + 8 * lv, mult: 1.5 + 0.3 * lv, burn: lv >= 3
                });
            });
            Sound.play("shoot");
            return true;
        }
    },
    frostnova: {
        name: "冰霜新星", icon: "❄",
        cd: (lv) => 5 - 0.5 * (lv - 1),
        text: (lv) => `每 ${(5 - 0.5 * (lv - 1)).toFixed(1)} 秒釋放冰環（範圍 ${120 + 20 * lv}），傷害並緩速敵人${lv >= 4 ? "，短暫凍結" : ""}`,
        cast(s, lv) {
            const p = G.player;
            const r = 120 + 20 * lv;
            if (!nearestEnemy(p.x, p.y, r)) return false;
            explode(p.x, p.y, r, 1 + 0.25 * lv, { color: "#8fd8ff", kb: 260, slow: 2.5, stun: lv >= 4 ? 0.5 : 0 });
            return true;
        }
    },
    lightning: {
        name: "落雷", icon: "⚡",
        cd: (lv) => 3 - 0.3 * (lv - 1),
        text: (lv) => `每 ${(3 - 0.3 * (lv - 1)).toFixed(1)} 秒降下 ${lv + 1} 道落雷，轟擊隨機敵人`,
        cast(s, lv) {
            const p = G.player;
            const list = G.enemies.filter((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 650);
            if (!list.length) return false;
            for (let i = 0; i < lv + 1; i++) {
                const e = list[Math.floor(Math.random() * list.length)];
                strike(e.x, e.y, 2 + 0.3 * lv, "#e6f4ff");
            }
            return true;
        }
    },
    orbit: {
        name: "守護飛刃", icon: "✥",
        text: (lv) => `${lv + 1} 把飛刃環繞身邊，持續切割靠近的敵人`,
        update(s, dt) {
            s.angle = (s.angle || 0) + dt * (3 + 0.3 * s.lv);
            s.count = s.lv + 1;
            s.radius = 85 + 6 * s.lv;
            s.bladeSize = 14;
            runBlades(s, 0.7 + 0.15 * s.lv, 0.45);
        }
    },
    poison: {
        name: "毒霧", icon: "☣",
        cd: (lv) => 4 - 0.4 * (lv - 1),
        text: (lv) => `每 ${(4 - 0.4 * (lv - 1)).toFixed(1)} 秒在敵人腳下生成毒霧（範圍 ${70 + 10 * lv}，持續 ${(4 + 0.5 * lv).toFixed(1)} 秒）`,
        cast(s, lv) {
            const p = G.player;
            const t = nearestEnemy(p.x, p.y, 600);
            if (!t) return false;
            if (G.zones.length < 14) {
                const dur = 4 + 0.5 * lv;
                G.zones.push({ kind: "poison", x: t.x, y: t.y, r: 70 + 10 * lv, t: dur, max: dur, tick: 0, mult: 0.35 + 0.08 * lv });
            }
            return true;
        }
    },
    boomerang: {
        name: "迴旋斧", icon: "↻",
        cd: (lv) => 2.6 - 0.25 * (lv - 1),
        text: (lv) => `每 ${(2.6 - 0.25 * (lv - 1)).toFixed(1)} 秒擲出 ${1 + Math.floor((lv - 1) / 2)} 把穿透迴旋斧，飛出後會折返`,
        cast(s, lv) {
            const p = G.player;
            const count = 1 + Math.floor((lv - 1) / 2);
            const targets = [];
            for (let i = 0; i < count; i++) {
                const t = nearestEnemy(p.x, p.y, 600, targets);
                if (!t) break;
                targets.push(t);
            }
            if (!targets.length) return false;
            targets.forEach((t) => spawnAxe(Math.atan2(t.y - p.y, t.x - p.x), 320 + 30 * lv, 1.3 + 0.25 * lv));
            Sound.play("shoot");
            return true;
        }
    },
    quake: {
        name: "地裂震擊", icon: "≋",
        cd: (lv) => 6 - 0.6 * (lv - 1),
        text: (lv) => `每 ${(6 - 0.6 * (lv - 1)).toFixed(1)} 秒震裂大地（範圍 ${130 + 18 * lv}），重擊、強力擊退並暈眩敵人`,
        cast(s, lv) {
            const p = G.player;
            const r = 130 + 18 * lv;
            if (!nearestEnemy(p.x, p.y, r)) return false;
            explode(p.x, p.y, r, 1.5 + 0.3 * lv, { color: "#c9a56a", kb: 520, stun: 0.6 + 0.1 * lv });
            G.shake = Math.max(G.shake, 8);
            return true;
        }
    },
    shield: {
        name: "魔力護盾", icon: "⬡",
        regenTime: (lv) => 10 - 1.2 * (lv - 1),
        text: (lv) => `抵擋接下來 ${1 + (lv >= 3 ? 1 : 0) + (lv >= 5 ? 1 : 0)} 次傷害，每 ${(10 - 1.2 * (lv - 1)).toFixed(1)} 秒回復一層`,
        update(s, dt) {
            const max = 1 + (s.lv >= 3 ? 1 : 0) + (s.lv >= 5 ? 1 : 0);
            s.max = max;
            if (s.charges > max) s.charges = max;
            if (s.charges < max) {
                s.regen -= dt;
                if (s.regen <= 0) { s.charges++; s.regen = this.regenTime(s.lv); }
            } else {
                s.regen = this.regenTime(s.lv);
            }
        }
    }
};

/* 兩個不同技能都升到滿級 → 可融合為終極技能（融合後兩個原技能消失） */
const FUSIONS = [
    { id: "meteor", name: "天火流星雨", icon: "✹", a: "fireball", b: "lightning",
      text: "每 3.5 秒降下十顆巨型隕石，範圍爆炸並點燃敵人" },
    { id: "absolute", name: "絕對零度", icon: "❅", a: "frostnova", b: "quake",
      text: "每 6 秒釋放大範圍冰霜衝擊，凍結、擊退並粉碎敵人" },
    { id: "bladestorm", name: "千刃風暴", icon: "✸", a: "orbit", b: "boomerang",
      text: "八把巨刃環繞並週期性擴張，同時向四面八方擲出迴旋斧" },
    { id: "plague", name: "瘟疫之王", icon: "☠", a: "poison", b: "fireball",
      text: "身周生成巨大毒焰領域，持續灼燒；領域內死亡的敵人會爆炸" },
    { id: "titan", name: "泰坦神盾", icon: "⛨", a: "shield", b: "quake",
      text: "三層神盾，每次格擋都會引爆震波擊退並暈眩周圍敵人，回復極快" }
];

const ULTS = {
    meteor: {
        update(u, dt) {
            u.cd -= dt;
            if (u.cd > 0) return;
            const p = G.player;
            const list = G.enemies.filter((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 700);
            if (!list.length) { u.cd = 0.5; return; }
            u.cd = 3.5;
            for (let i = 0; i < 10; i++) {
                const e = list[Math.floor(Math.random() * list.length)];
                const x = e.x + rand(-50, 50);
                const y = e.y + rand(-50, 50);
                const delay = 0.5 + i * 0.07;
                G.effects.push({ kind: "warn", x, y, r: 95, t: delay, max: delay });
                G.timers.push({ t: delay, fn: () => {
                    if (!G || G.dead) return;
                    G.effects.push({ kind: "strike", x, y, t: 0.3, max: 0.3, color: "#ffb070" });
                    explode(x, y, 95, 3.2, { burn: true, color: "#ff6a2a", kb: 260 });
                } });
            }
            G.shake = Math.max(G.shake, 6);
            Sound.play("bossAttack");
        }
    },
    absolute: {
        update(u, dt) {
            u.cd -= dt;
            if (u.cd > 0) return;
            const p = G.player;
            if (!nearestEnemy(p.x, p.y, 420)) { u.cd = 0.5; return; }
            u.cd = 6;
            explode(p.x, p.y, 420, 4, { color: "#aee6ff", kb: 600, slow: 3, stun: 1.2 });
            G.shake = Math.max(G.shake, 10);
            G.timers.push({ t: 0.5, fn: () => {
                if (!G || G.dead) return;
                G.effects.push({ kind: "ring", x: p.x, y: p.y, r0: 50, r1: 420, t: 0.4, max: 0.4, color: "#ffffff", width: 8, follow: true });
                G.enemies.forEach((e) => {
                    if (!e.dead && e.slow > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 420 + e.r) {
                        damageEnemy(e, rollSkill(2.5), { kb: 0 });
                    }
                });
            } });
        }
    },
    bladestorm: {
        update(u, dt) {
            u.angle = (u.angle || 0) + dt * 5;
            u.count = 8;
            u.bladeSize = 22;
            u.expand = Math.max(0, (u.expand || 0) - dt);
            u.radius = 130 + (u.expand > 0 ? 120 * Math.sin(Math.PI * (1 - u.expand)) : 0);
            runBlades(u, 1.6, 0.35);
            u.axeCd -= dt;
            if (u.axeCd <= 0) {
                u.axeCd = 3;
                u.expand = 1;
                for (let i = 0; i < 6; i++) spawnAxe(u.angle + (i * Math.PI) / 3, 380, 1.8);
            }
        }
    },
    plague: {
        update(u, dt) {
            const p = G.player;
            u.radius = 210;
            u.tick -= dt;
            if (u.tick > 0) return;
            u.tick = 0.4;
            G.enemies.forEach((e) => {
                if (e.dead) return;
                if (Math.hypot(e.x - p.x, e.y - p.y) <= u.radius + e.r) {
                    damageEnemy(e, rollSkill(0.9), { kb: 0, silent: true, type: "poison", burn: true });
                }
            });
        }
    },
    titan: {
        update(u, dt) {
            if (u.charges < 3) {
                u.regen -= dt;
                if (u.regen <= 0) { u.charges++; u.regen = 3.5; }
            } else {
                u.regen = 3.5;
            }
        }
    }
};

/* 技能 / 融合卡片併入升級池 */
Object.keys(SKILLS).forEach((id) => {
    UPGRADES.push({ id, kind: "skill", name: SKILLS[id].name, icon: SKILLS[id].icon });
});
FUSIONS.forEach((f) => {
    UPGRADES.push({ id: "fuse_" + f.id, kind: "fusion", fusion: f, name: f.name, icon: f.icon });
});

function skillLv(id) { return (G && G.skills[id] && G.skills[id].lv) || 0; }
function skillSlotsUsed() { return Object.keys(G.skills).length + Object.keys(G.ults).length; }
function fusionReady(f) {
    return !G.ults[f.id] && skillLv(f.a) >= SKILL_MAX && skillLv(f.b) >= SKILL_MAX;
}

function weightOf(d) {
    switch (d.kind) {
        case "skill": {
            if (skillLv(d.id) > 0) return 3;
            // 新技能若能與已持有技能湊成融合配方，出現機率提高
            const synergy = FUSIONS.some((f) => (f.a === d.id && skillLv(f.b) > 0) || (f.b === d.id && skillLv(f.a) > 0));
            return synergy ? 3 : 1.5;
        }
        case "weapon": return 1.5;
        case "heal":   return G.player.hp < G.player.maxHp * 0.6 ? 2 : 0.5;
        case "item":   return itemLv(d.id) > 0 ? 1.5 : 1;
        default:       return 1;
    }
}

function rollSkill(mult) {
    const p = G.player;
    let d = 18 * p.dmgMult * mult * rand(0.92, 1.08);
    const crit = Math.random() < p.crit;
    if (crit) d *= p.critMult;
    return { dmg: Math.max(1, Math.round(d)), crit };
}

function explode(x, y, radius, mult, opts) {
    opts = opts || {};
    const color = opts.color || "#ff9a3a";
    G.effects.push({ kind: "ring", x, y, r0: radius * 0.3, r1: radius, t: 0.35, max: 0.35, color, width: 6 });
    addParticles(x, y, 12, color, 260, 5);
    Sound.play("boom");
    G.enemies.forEach((e) => {
        if (e.dead) return;
        if (Math.hypot(e.x - x, e.y - y) > radius + e.r) return;
        damageEnemy(e, rollSkill(mult), {
            kb: opts.kb === undefined ? 200 : opts.kb, fromX: x, fromY: y, burn: opts.burn
        });
        if (e.dead) return;
        if (opts.slow) e.slow = Math.max(e.slow, opts.slow);
        if (opts.stun && !e.isBoss) e.stun = Math.max(e.stun, opts.stun);
    });
}

function strike(x, y, mult, color) {
    G.effects.push({ kind: "strike", x, y, t: 0.3, max: 0.3, color });
    explode(x, y, 55, mult, { color: "#bfe8ff", kb: 80 });
}

function runBlades(s, mult, hitCd) {
    const p = G.player;
    for (let i = 0; i < s.count; i++) {
        const a = s.angle + (i * Math.PI * 2) / s.count;
        const bx = p.x + Math.cos(a) * s.radius;
        const by = p.y + Math.sin(a) * s.radius;
        for (const e of G.enemies) {
            if (e.dead || e.orbitCd > 0) continue;
            if (Math.hypot(e.x - bx, e.y - by) < e.r + s.bladeSize + 2) {
                damageEnemy(e, rollSkill(mult), { kb: 120, fromX: p.x, fromY: p.y });
                e.orbitCd = hitCd;
            }
        }
    }
}

function spawnAxe(aim, range, mult) {
    const p = G.player;
    G.skillShots.push({
        kind: "axe", x: p.x, y: p.y, aim, range, mult,
        dist: 0, speed: 520, phase: "out", hits: [], spin: 0, life: 6
    });
}

function updateSkills(dt) {
    const scale = Math.max(0.4, G.player.cdMult);
    Object.keys(G.skills).forEach((id) => {
        const s = G.skills[id];
        const sk = SKILLS[id];
        if (sk.update) { sk.update(s, dt); return; }
        s.cd -= dt;
        if (s.cd <= 0) {
            if (sk.cast(s, s.lv)) s.cd = sk.cd(s.lv) * scale;
            else s.cd = 0.3;
        }
    });
    Object.keys(G.ults).forEach((id) => ULTS[id].update(G.ults[id], dt));
}

function updateSkillShots(dt) {
    const p = G.player;
    for (const s of G.skillShots) {
        s.life -= dt;
        if (s.kind === "fire") {
            if (!s.target || s.target.dead) s.target = nearestEnemy(s.x, s.y, 700);
            if (s.target) {
                const desired = Math.atan2(s.target.y - s.y, s.target.x - s.x);
                const cur = Math.atan2(s.vy, s.vx);
                const turn = clamp(normAngle(desired - cur), -4 * dt, 4 * dt);
                s.vx = Math.cos(cur + turn) * s.speed;
                s.vy = Math.sin(cur + turn) * s.speed;
            }
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            for (const e of G.enemies) {
                if (e.dead) continue;
                if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 12) {
                    explode(s.x, s.y, s.radius, s.mult, { burn: s.burn, color: "#ff9a3a", kb: 220 });
                    s.life = 0;
                    break;
                }
            }
        } else if (s.kind === "axe") {
            s.spin += dt * 14;
            if (s.phase === "out") {
                s.x += Math.cos(s.aim) * s.speed * dt;
                s.y += Math.sin(s.aim) * s.speed * dt;
                s.dist += s.speed * dt;
                if (s.dist >= s.range) { s.phase = "back"; s.hits = []; }
            } else {
                const dx = p.x - s.x;
                const dy = p.y - s.y;
                const d = Math.hypot(dx, dy) || 1;
                s.x += (dx / d) * 620 * dt;
                s.y += (dy / d) * 620 * dt;
                if (d < 32) s.life = 0;
            }
            for (const e of G.enemies) {
                if (e.dead || s.hits.indexOf(e) !== -1) continue;
                if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + 22) {
                    s.hits.push(e);
                    damageEnemy(e, rollSkill(s.mult), { kb: 150, fromX: s.x, fromY: s.y });
                }
            }
        }
    }
    G.skillShots = G.skillShots.filter((s) => s.life > 0);
}

function updateZones(dt) {
    for (const z of G.zones) {
        z.t -= dt;
        z.tick -= dt;
        if (z.tick <= 0) {
            z.tick = 0.5;
            G.enemies.forEach((e) => {
                if (e.dead) return;
                if (Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.r) {
                    damageEnemy(e, rollSkill(z.mult), { kb: 0, silent: true, type: "poison" });
                }
            });
        }
    }
    G.zones = G.zones.filter((z) => z.t > 0);
}

/* 護盾格擋（泰坦神盾優先） */
function tryBlock() {
    const sh = G.skills.shield;
    const ti = G.ults.titan;
    let src = null;
    if (ti && ti.charges > 0) src = ti;
    else if (sh && sh.charges > 0) src = sh;
    if (!src) return false;

    const p = G.player;
    src.charges--;
    p.invincible = 0.6;
    addNumber(p.x, p.y - 56, "BLOCK", "heal");
    G.effects.push({ kind: "ring", x: p.x, y: p.y, r0: 20, r1: 90, t: 0.35, max: 0.35, color: "#7ecbff", width: 5, follow: true });
    Sound.play("heal");
    if (src === ti) {
        explode(p.x, p.y, 230, 3, { color: "#9fd0ff", kb: 600, stun: 1 });
        G.shake = Math.max(G.shake, 8);
    }
    return true;
}

function fuse(f) {
    delete G.skills[f.a];
    delete G.skills[f.b];
    G.ults[f.id] = { cd: 1, angle: 0, charges: 3, regen: 3.5, tick: 0, expand: 0, axeCd: 2, radius: 210, count: 0, bladeSize: 22 };
    const p = G.player;
    setBanner("終極技能覺醒！", f.name, "#ffb23e");
    G.effects.push({ kind: "ring", x: p.x, y: p.y, r0: 20, r1: 360, t: 1, max: 1, color: "#ffb23e", width: 9 });
    G.shake = Math.max(G.shake, 12);
    Sound.play("evolve");
}

/* 技能繪製：地面層（毒霧 / 瘟疫領域） */
function drawSkillGround() {
    const p = G.player;
    G.zones.forEach((z) => {
        const a = clamp(z.t / z.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.35 * Math.min(1, a * 3);
        ctx.fillStyle = "#5fc04a";
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * (0.92 + 0.08 * Math.sin(G.anim * 4)), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.6 * Math.min(1, a * 3);
        ctx.strokeStyle = "#9cf07a";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    });
    const pl = G.ults.plague;
    if (pl) {
        ctx.save();
        ctx.globalAlpha = 0.14 + 0.04 * Math.sin(G.anim * 5);
        ctx.fillStyle = "#8be05a";
        ctx.beginPath();
        ctx.arc(p.x, p.y, pl.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "#c2ff7a";
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -G.anim * 30;
        ctx.stroke();
        ctx.restore();
    }
}

/* 技能繪製：空中層（投射物 / 飛刃 / 護盾） */
function drawSkillAir() {
    const p = G.player;

    G.skillShots.forEach((s) => {
        ctx.save();
        if (s.kind === "fire") {
            ctx.shadowColor = "#ff7a2a";
            ctx.shadowBlur = 18;
            ctx.fillStyle = "#ffb04a";
            ctx.beginPath();
            ctx.arc(s.x, s.y, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff2c0";
            ctx.beginPath();
            ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.translate(s.x, s.y);
            ctx.rotate(s.spin);
            ctx.shadowColor = "#cfe2ff";
            ctx.shadowBlur = 10;
            ctx.fillStyle = "#dfe9ff";
            ctx.strokeStyle = "#7e8bb0";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-20, -4); ctx.lineTo(0, -22); ctx.lineTo(20, -4);
            ctx.lineTo(4, 0); ctx.lineTo(20, 4); ctx.lineTo(0, 22);
            ctx.lineTo(-20, 4); ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    });

    [G.skills.orbit, G.ults.bladestorm].forEach((s) => {
        if (!s || !s.count) return;
        for (let i = 0; i < s.count; i++) {
            const a = s.angle + (i * Math.PI * 2) / s.count;
            const bx = p.x + Math.cos(a) * s.radius;
            const by = p.y + Math.sin(a) * s.radius;
            const size = s.bladeSize || 14;
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(a * 3);
            ctx.shadowColor = "#9fc4ff";
            ctx.shadowBlur = 12;
            ctx.fillStyle = "#e8f0ff";
            ctx.beginPath();
            ctx.moveTo(0, -size);
            ctx.lineTo(size * 0.55, 0);
            ctx.lineTo(0, size);
            ctx.lineTo(-size * 0.55, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    });

    [[G.skills.shield, "#7ecbff"], [G.ults.titan, "#ffd27a"]].forEach((pair) => {
        const s = pair[0];
        if (!s || s.charges <= 0) return;
        ctx.save();
        ctx.strokeStyle = pair[1];
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.55 + 0.2 * Math.sin(G.anim * 5);
        for (let i = 0; i < s.charges; i++) {
            ctx.beginPath();
            ctx.arc(p.x, p.y - 6, 44 + i * 7, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    });
}

/* ============================== 存檔 ============================== */
function defaultSave() {
    return { bestTime: 0, bestKills: 0, bestLevel: 1, bestWave: 1, bestBoss: 0, runs: 0, muted: false };
}
function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return defaultSave();
        return Object.assign(defaultSave(), JSON.parse(raw));
    } catch (e) {
        return defaultSave();
    }
}
function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 忽略 */ }
}
let save = loadSave();

/* ============================== 音效（WebAudio 合成） ============================== */
const Sound = {
    ctx: null, master: null, last: {},

    ensure() {
        try {
            if (this.ctx) {
                if (this.ctx.state === "suspended") this.ctx.resume();
                return;
            }
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.32;
            this.master.connect(this.ctx.destination);
        } catch (e) { this.ctx = null; }
    },

    tone(freq, dur, type, vol, slide, delay) {
        if (save.muted || !this.ctx) return;
        try {
            const t = this.ctx.currentTime + (delay || 0);
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = type || "square";
            o.frequency.setValueAtTime(freq, t);
            if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
            g.gain.setValueAtTime(vol || 0.15, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            o.connect(g); g.connect(this.master);
            o.start(t); o.stop(t + dur + 0.03);
        } catch (e) { /* 忽略 */ }
    },

    noise(dur, vol, delay) {
        if (save.muted || !this.ctx) return;
        try {
            const t = this.ctx.currentTime + (delay || 0);
            const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
            const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
            const src = this.ctx.createBufferSource();
            const g = this.ctx.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.12, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            src.connect(g); g.connect(this.master);
            src.start(t);
        } catch (e) { /* 忽略 */ }
    },

    play(name) {
        if (save.muted || !this.ctx) return;
        const now = performance.now();
        const gap = { hit: 45, crit: 45, orb: 40, kill: 50, swing: 60, shoot: 60, boom: 70 }[name] || 0;
        if (gap && this.last[name] && now - this.last[name] < gap) return;
        this.last[name] = now;

        switch (name) {
            case "swing":   this.noise(0.12, 0.10); this.tone(260, 0.1, "sawtooth", 0.05, -120); break;
            case "shoot":   this.tone(520, 0.12, "triangle", 0.10, -300); this.noise(0.05, 0.05); break;
            case "hit":     this.tone(190, 0.07, "square", 0.08, -80); break;
            case "crit":    this.tone(420, 0.1, "square", 0.10, 200); this.tone(210, 0.1, "square", 0.08, -90); break;
            case "kill":    this.tone(300, 0.14, "triangle", 0.09, -200); this.noise(0.08, 0.06); break;
            case "orb":     this.tone(880, 0.06, "sine", 0.06, 300); break;
            case "hurt":    this.tone(140, 0.2, "sawtooth", 0.14, -90); this.noise(0.1, 0.08); break;
            case "levelup": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.11, 0, i * 0.08)); break;
            case "select":  this.tone(660, 0.1, "square", 0.08, 220); break;
            case "click":   this.tone(480, 0.05, "square", 0.06); break;
            case "wave":    this.tone(220, 0.3, "sawtooth", 0.09, 120); break;
            case "boss":    [110, 98, 82].forEach((f, i) => this.tone(f, 0.45, "sawtooth", 0.16, -20, i * 0.28)); break;
            case "bossAttack": this.tone(90, 0.25, "sawtooth", 0.14, 260); break;
            case "boom":    this.noise(0.18, 0.1); this.tone(90, 0.18, "sawtooth", 0.09, -40); break;
            case "evolve":  [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.12, 0, i * 0.07)); break;
            case "heal":    this.tone(600, 0.12, "sine", 0.08, 400); this.tone(800, 0.14, "sine", 0.07, 400, 0.08); break;
            case "death":   [330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.4, "sawtooth", 0.14, -40, i * 0.22)); break;
            default: break;
        }
    }
};

/* ============================== DOM ============================== */
const dom = {
    home: $("homeScreen"),
    selection: $("selectionScreen"),
    dungeon: $("dungeonScreen"),
    canvas: $("game"),
    startBtn: $("startButton"),
    selStatus: $("selectionStatus"),
    homeRecords: $("homeRecords"),
    level: $("statusLevel"),
    hpText: $("statusHPText"),
    hpBar: $("statusHPBar"),
    expText: $("statusEXPText"),
    expBar: $("statusEXPBar"),
    hudTime: $("hudTime"),
    hudWave: $("hudWave"),
    hudKills: $("hudKills"),
    hudBest: $("hudBest"),
    passives: $("passiveList"),
    upgradeOverlay: $("upgradeOverlay"),
    upgradeTitle: $("upgradeTitle"),
    upgradeSubtitle: $("upgradeSubtitle"),
    upgradeCards: $("upgradeCards"),
    pauseOverlay: $("pauseOverlay"),
    deathOverlay: $("deathOverlay"),
    deathStats: $("deathStats"),
    soundBtn: $("soundButton"),
    pauseSoundBtn: $("pauseSoundButton"),
    joy: $("joystick"),
    joyKnob: $("joyKnob")
};
const ctx = dom.canvas.getContext("2d");

const selectionCanvases = {
    warrior: $("warriorCanvas"),
    lancer: $("lancerCanvas"),
    archer: $("archerCanvas")
};
const selectionSizes = { warrior: 150, lancer: 190, archer: 150 };

/* ============================== 全域狀態 ============================== */
let scene = "home";            // home | selection | playing
let selectedCharacter = null;
let G = null;                  // 局內狀態（重新開始時整個重建）
let animTime = 0;              // 主頁/選角用的動畫時間
let lastTs = 0;
const keys = {};
const hudCache = {};
let vignetteGrad = null;

/* 依裝置調整畫布：桌機固定 1280x720；手機依可用空間改變比例（直式/橫式都填滿） */
function fitCanvas() {
    const cv = dom.canvas;
    if (!mobileMode()) {
        VIEW_W = 1280;
        VIEW_H = 720;
        cv.style.width = "";
        cv.style.height = "";
        cv.style.maxWidth = "";
        cv.style.maxHeight = "";
    } else {
        const stage = cv.parentElement;
        const top = Math.max(0, stage.getBoundingClientRect().top);
        const availW = Math.max(240, Math.floor(Math.min(stage.clientWidth || window.innerWidth, window.innerWidth)));
        const availH = Math.max(160, Math.floor(window.innerHeight - top - 6));
        const aspect = clamp(availW / availH, 0.5, 2.1);
        VIEW_H = 720;
        VIEW_W = Math.round(VIEW_H * aspect);
        const cssW = Math.min(availW, availH * aspect);
        cv.style.maxWidth = "none";
        cv.style.maxHeight = "none";
        cv.style.width = Math.floor(cssW) + "px";
        cv.style.height = Math.floor(cssW / aspect) + "px";
    }
    if (cv.width !== VIEW_W) cv.width = VIEW_W;
    if (cv.height !== VIEW_H) cv.height = VIEW_H;
    vignetteGrad = null;
    updateZoom();
}

/* 虛擬搖桿（觸控） */
const JOY_R = 60;
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

function resetJoystick() {
    joy.active = false;
    joy.id = null;
    joy.x = 0;
    joy.y = 0;
    if (dom.joy) dom.joy.classList.add("hidden");
}

function clearKeys() {
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    resetJoystick();
}

/* ============================== 建立 / 重置局內狀態 ============================== */
function createState(ch) {
    const s = ch.stats;
    return {
        character: ch,
        time: 0,
        anim: 0,
        wave: 1,
        waveTimer: 0,
        kills: 0,
        bossKills: 0,
        damageDealt: 0,

        player: {
            x: 0, y: 0, r: 22,
            hp: s.maxHp, maxHp: s.maxHp,
            level: 1, exp: 0, maxExp: 30,
            dmgMult: 1, cdMult: 1, speedBonus: 0,
            crit: 0.05, critMult: 1.6,
            pickupMult: 1, regen: 0, areaMult: 1,
            invincible: 0, attackCd: 0,
            attacking: false, attackTime: 0, attackDur: 0.3, hitAt: 0.15, hitDone: true, attackAim: 0,
            facingX: 1, moving: false, auraTimer: 0
        },

        items: {},
        weaponLevel: 1,
        evolved: false,

        enemies: [],
        orbs: [],
        projectiles: [],
        effects: [],
        particles: [],
        numbers: [],
        timers: [],
        skillShots: [],
        zones: [],
        fusionNotified: {},
        skills: {},         // 主動技能：{ id: { lv, cd, ... } }
        ults: {},           // 融合終極技能
        chain: 0,

        spawnTimer: 1.2,
        boss: null,
        bossPending: 0,
        bossesSpawned: 0,

        queue: [],          // 待處理的升級（一般 / Boss 寶箱）
        choices: [],
        chestChoice: false,

        paused: false,
        choosing: false,
        dead: false,
        committed: false,
        newRecords: {},

        banner: null,
        shake: 0,
        cam: { x: -VIEW_W / 2, y: -VIEW_H / 2 }
    };
}

function startRun() {
    if (!selectedCharacter) return;
    G = createState(selectedCharacter);
    clearKeys();
    Object.keys(hudCache).forEach((k) => { delete hudCache[k]; });
    dom.upgradeOverlay.classList.add("hidden");
    dom.pauseOverlay.classList.add("hidden");
    dom.deathOverlay.classList.add("hidden");
    setScene("playing");
    window.scrollTo(0, 0);
    fitCanvas();                                   // 畫面顯示後才能量測可用空間
    G.cam.x = G.player.x - VIEW_W / zoom / 2;
    G.cam.y = G.player.y - VIEW_H / zoom / 2;
    setBanner("WAVE 1", "撐過一波又一波的史萊姆", "#f0d69a");
    lastTs = 0;
}

function restartRun() {
    if (!selectedCharacter) return;
    Sound.play("click");
    startRun();
}

function exitToHome() {
    if (G) commitRecords();
    G = null;
    clearKeys();
    dom.upgradeOverlay.classList.add("hidden");
    dom.pauseOverlay.classList.add("hidden");
    dom.deathOverlay.classList.add("hidden");
    setScene("home");
}

function setScene(name) {
    scene = name;
    document.body.classList.toggle("playing", name === "playing");
    dom.home.classList.toggle("hidden", name !== "home");
    dom.selection.classList.toggle("hidden", name !== "selection");
    dom.dungeon.classList.toggle("hidden", name !== "playing");
    clearKeys();
    if (name === "home") refreshRecords();
}

/* ============================== 存檔 / 紀錄 ============================== */
function commitRecords() {
    if (!G || G.committed) return;
    G.committed = true;
    const nr = {};
    if (G.time > save.bestTime) { save.bestTime = G.time; nr.time = true; }
    if (G.kills > save.bestKills) { save.bestKills = G.kills; nr.kills = true; }
    if (G.player.level > save.bestLevel) { save.bestLevel = G.player.level; nr.level = true; }
    if (G.wave > save.bestWave) { save.bestWave = G.wave; nr.wave = true; }
    if (G.bossKills > save.bestBoss) { save.bestBoss = G.bossKills; nr.boss = true; }
    save.runs++;
    G.newRecords = nr;
    writeSave();
}

function refreshRecords() {
    dom.homeRecords.innerHTML =
        `<span>最長存活 <b>${fmtTime(save.bestTime)}</b></span>` +
        `<span>最高等級 <b>${save.bestLevel}</b></span>` +
        `<span>最高波次 <b>${save.bestWave}</b></span>` +
        `<span>最多擊殺 <b>${save.bestKills}</b></span>` +
        `<span>擊敗 Boss <b>${save.bestBoss}</b></span>` +
        `<span>遊玩次數 <b>${save.runs}</b></span>`;
}

/* ============================== 玩家屬性輔助 ============================== */
function itemLv(id) { return (G && G.items[id]) || 0; }
function playerSpeed() { return G.character.stats.speed * (1 + G.player.speedBonus + itemLv("boots") * 0.06); }
function damageReduction() { return Math.min(0.6, itemLv("armor") * 0.07); }
function cooldownNow() { return Math.max(0.2, G.character.stats.cooldown * G.player.cdMult); }

function healPlayer(amount, show) {
    const p = G.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const real = p.hp - before;
    if (show && real >= 1) addNumber(p.x, p.y - 62, "+" + Math.round(real), "heal");
}

function weaponLabel() {
    const ch = G.character;
    return G.evolved ? ch.evoName : `${ch.weaponName} Lv.${G.weaponLevel}`;
}

/* ============================== 視覺資料：數字 / 粒子 / 橫幅 ============================== */
function addNumber(x, y, text, type) {
    G.numbers.push({ x: x + rand(-8, 8), y, text: String(text), type: type || "normal", t: 0.8, max: 0.8 });
    if (G.numbers.length > 90) G.numbers.shift();
}

function addParticles(x, y, n, color, speed, size) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rand(0.3, 1) * speed;
        G.particles.push({
            x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            t: rand(0.25, 0.5), max: 0.5, color, size: size || 4
        });
    }
    if (G.particles.length > 400) G.particles.splice(0, G.particles.length - 400);
}

function setBanner(text, sub, color) {
    G.banner = { text, sub: sub || "", color: color || "#f0d69a", t: 2.6, max: 2.6 };
}

/* ============================== 敵人 ============================== */
function waveHpMul() { const w = G.wave - 1; return 1 + 0.2 * w + 0.01 * w * w; }
function waveSpeedMul() { return Math.min(1.5, 1 + 0.025 * (G.wave - 1)); }

function makeEnemy(type, x, y) {
    const def = ENEMY_TYPES[type];
    const isBoss = type === "boss";
    let hp = def.hp * waveHpMul();
    let dmg = def.dmg + 0.5 * (G.wave - 1);
    if (isBoss) {
        const idx = G.bossesSpawned;
        hp = def.hp * (1 + 0.8 * idx) * (1 + 0.05 * (G.wave - 1));
        dmg = def.dmg + idx * 4;
    }
    return {
        type, isBoss, x, y,
        hp, maxHp: hp,
        speed: def.speed * (isBoss ? 1 : waveSpeedMul()),
        dmg, r: def.r, size: def.size, exp: def.exp,
        kx: 0, ky: 0, flash: 0, hitCd: 0, atkAnim: 0, animT: Math.random() * 3,
        dir: "down", moving: true, dead: false,
        burn: 0, burnTick: 0, burnDps: 0, slow: 0, stun: 0, orbitCd: 0,
        state: "chase", stateT: 0, dirX: 0, dirY: 1, skillCd: 4, summonCd: 6, vx: 0, vy: 0
    };
}

function ringPos(minD, maxD) {
    const a = Math.random() * Math.PI * 2;
    const d = rand(minD, maxD);
    return { x: G.player.x + Math.cos(a) * d, y: G.player.y + Math.sin(a) * d };
}

function pickEnemyType() {
    const w = G.wave;
    const list = [["slime", 100]];
    if (w >= 3) list.push(["fast", 20 + w * 3]);
    if (w >= 5) list.push(["tank", 10 + w * 2]);
    let total = 0;
    list.forEach((e) => { total += e[1]; });
    let r = Math.random() * total;
    for (const e of list) {
        r -= e[1];
        if (r <= 0) return e[0];
    }
    return "slime";
}

function updateSpawner(dt) {
    G.spawnTimer -= dt;
    if (G.spawnTimer > 0) return;
    const w = G.wave;
    G.spawnTimer = Math.max(0.22, 1.3 - w * 0.07);
    const batch = 1 + Math.floor(w / 3);
    const cap = Math.min(40 + w * 6, 140);
    for (let i = 0; i < batch; i++) {
        if (G.enemies.length >= cap) break;
        const pos = ringPos(760, 900);
        G.enemies.push(makeEnemy(pickEnemyType(), pos.x, pos.y));
    }
}

function spawnBoss() {
    const pos = ringPos(700, 760);
    const boss = makeEnemy("boss", pos.x, pos.y);
    G.bossesSpawned++;
    G.boss = boss;
    G.enemies.push(boss);
}

function updateWave(dt) {
    G.waveTimer += dt;
    if (G.waveTimer >= WAVE_DURATION) {
        G.waveTimer -= WAVE_DURATION;
        G.wave++;
        if (G.wave % BOSS_EVERY === 0) {
            G.bossPending++;
            setBanner("WAVE " + G.wave, "⚠ 史萊姆王來襲 ⚠", "#ff6b6b");
            Sound.play("boss");
        } else {
            setBanner("WAVE " + G.wave, "怪物變得更強了", "#f0d69a");
            Sound.play("wave");
        }
    }
    if (G.bossPending > 0 && !G.boss) {
        G.bossPending--;
        spawnBoss();
    }
}

function nearestEnemy(x, y, maxDist, exclude) {
    let best = null;
    let bestD = Infinity;
    for (const e of G.enemies) {
        if (e.dead) continue;
        if (exclude && exclude.indexOf(e) !== -1) continue;
        const d = Math.hypot(e.x - x, e.y - y) - e.r;
        if (d <= maxDist && d < bestD) { bestD = d; best = e; }
    }
    return best;
}

function summonMinions(boss) {
    const n = 4 + Math.min(4, G.bossesSpawned);
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const m = makeEnemy("slime", boss.x + Math.cos(a) * 130, boss.y + Math.sin(a) * 130);
        m.hp = m.maxHp = m.maxHp * 0.7;
        G.enemies.push(m);
    }
    G.effects.push({ kind: "ring", x: boss.x, y: boss.y, r0: 40, r1: 190, t: 0.6, max: 0.6, color: "#c58bff", width: 5 });
    Sound.play("bossAttack");
}

function updateBoss(e, dt, ux, uy) {
    const enraged = e.hp < e.maxHp * 0.5;
    const rage = enraged ? 1.25 : 1;
    e.stateT -= dt;
    e.vx = 0; e.vy = 0;

    if (e.state === "chase") {
        e.skillCd -= dt;
        e.summonCd -= dt;
        e.vx = ux * e.speed * rage;
        e.vy = uy * e.speed * rage;
        if (e.summonCd <= 0) {
            summonMinions(e);
            e.summonCd = enraged ? 8 : 11;
            e.state = "rest"; e.stateT = 0.8;
        } else if (e.skillCd <= 0) {
            e.state = "tele"; e.stateT = 0.9;
            e.dirX = ux; e.dirY = uy;
            Sound.play("bossAttack");
        }
    } else if (e.state === "tele") {
        if (e.stateT > 0.35) { e.dirX = ux; e.dirY = uy; }  // 前段持續瞄準
        if (e.stateT <= 0) { e.state = "dash"; e.stateT = 0.5; }
    } else if (e.state === "dash") {
        e.vx = e.dirX * 640;
        e.vy = e.dirY * 640;
        if (e.stateT <= 0) { e.state = "rest"; e.stateT = 0.9; }
    } else if (e.state === "rest") {
        if (e.stateT <= 0) { e.state = "chase"; e.skillCd = enraged ? 3 : 4.5; }
    }
}

function hurtPlayer(raw, fromX, fromY) {
    if (tryBlock()) return;
    const p = G.player;
    const dmg = Math.max(1, Math.round(raw * (1 - damageReduction())));
    p.hp -= dmg;
    p.invincible = 0.4;
    G.shake = Math.max(G.shake, 10);
    addNumber(p.x, p.y - 56, "-" + dmg, "hurt");
    addParticles(p.x, p.y, 8, "#ff5a5a", 160, 4);
    Sound.play("hurt");
}

function updateEnemies(dt) {
    const p = G.player;

    for (const e of G.enemies) {
        if (e.dead) continue;

        e.flash = Math.max(0, e.flash - dt);
        e.hitCd = Math.max(0, e.hitCd - dt);
        e.atkAnim = Math.max(0, e.atkAnim - dt);
        e.animT += dt;
        e.slow = Math.max(0, e.slow - dt);
        e.stun = Math.max(0, e.stun - dt);
        e.orbitCd = Math.max(0, e.orbitCd - dt);

        // 燃燒
        if (e.burn > 0) {
            e.burn -= dt;
            e.burnTick -= dt;
            if (e.burnTick <= 0) {
                e.burnTick = 0.5;
                damageEnemy(e, { dmg: e.burnDps, crit: false }, { kb: 0, type: "fire", silent: true });
                if (e.dead) continue;
            }
        }

        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        if (e.isBoss) {
            updateBoss(e, dt, ux, uy);
        } else {
            e.vx = ux * e.speed;
            e.vy = uy * e.speed;
        }

        if (e.stun > 0 && !e.isBoss) { e.vx = 0; e.vy = 0; }
        else if (e.slow > 0) { const sm = e.isBoss ? 0.75 : 0.5; e.vx *= sm; e.vy *= sm; }

        e.x += (e.vx + e.kx) * dt;
        e.y += (e.vy + e.ky) * dt;
        const decay = Math.exp(-9 * dt);
        e.kx *= decay;
        e.ky *= decay;

        e.moving = Math.abs(e.vx) + Math.abs(e.vy) > 5 || Math.abs(e.kx) + Math.abs(e.ky) > 20;
        if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? "left" : "right";
        else e.dir = dy < 0 ? "up" : "down";

        // 接觸傷害
        if (dist < e.r + p.r && e.hitCd <= 0 && p.invincible <= 0) {
            const dashBonus = e.isBoss && e.state === "dash" ? 1.5 : 1;
            hurtPlayer(e.dmg * dashBonus, e.x, e.y);
            e.hitCd = 0.9;
            e.atkAnim = 0.5;

            const th = itemLv("thorns");
            if (th > 0 && !e.dead) {
                damageEnemy(e, { dmg: Math.round((5 + G.wave) * th), crit: false }, { kb: 120, type: "fire", silent: true });
            }
        }
    }

    // 敵人彼此推擠
    const list = G.enemies;
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.dead) continue;
        for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            if (b.dead) continue;
            const min = (a.r + b.r) * 0.8;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const push = (min - d);
            const nx = dx / d;
            const ny = dy / d;
            if (a.isBoss) { b.x += nx * push; b.y += ny * push; }
            else if (b.isBoss) { a.x -= nx * push; a.y -= ny * push; }
            else {
                a.x -= nx * push * 0.5; a.y -= ny * push * 0.5;
                b.x += nx * push * 0.5; b.y += ny * push * 0.5;
            }
        }
    }

    // 怪物重生：離太遠的怪物重新出現在玩家附近
    for (const e of G.enemies) {
        if (e.dead || e.isBoss) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) > 1300) {
            const pos = ringPos(780, 880);
            e.x = pos.x; e.y = pos.y; e.kx = 0; e.ky = 0;
        }
    }
}

/* ============================== 傷害 / 死亡 ============================== */
function rollDamage(mult) {
    const p = G.player;
    let d = G.character.stats.damage * p.dmgMult * mult * rand(0.92, 1.08);
    const crit = Math.random() < p.crit;
    if (crit) d *= p.critMult;
    return { dmg: Math.max(1, Math.round(d)), crit };
}

function damageEnemy(e, hit, opts) {
    if (!e || e.dead) return;
    opts = opts || {};
    const p = G.player;

    e.hp -= hit.dmg;
    G.damageDealt += hit.dmg;
    e.flash = 0.1;

    addNumber(e.x, e.y - e.size * 0.4, hit.crit ? hit.dmg + "!" : hit.dmg, hit.crit ? "crit" : (opts.type || "normal"));

    const kbBase = opts.kb === undefined ? 180 : opts.kb;
    if (kbBase > 0) {
        const fx = opts.fromX === undefined ? p.x : opts.fromX;
        const fy = opts.fromY === undefined ? p.y : opts.fromY;
        const dx = e.x - fx;
        const dy = e.y - fy;
        const d = Math.hypot(dx, dy) || 1;
        const kb = kbBase * (e.isBoss ? 0.12 : 1);
        e.kx += (dx / d) * kb * 1.6;
        e.ky += (dy / d) * kb * 1.6;
    }

    if (opts.burn) {
        e.burn = 3;
        e.burnTick = 0.5;
        e.burnDps = Math.max(1, Math.round(hit.dmg * 0.25));
    }

    const ls = itemLv("lifesteal");
    if (ls > 0 && !opts.silent) healPlayer(hit.dmg * 0.03 * ls, false);

    if (!opts.silent) {
        Sound.play(hit.crit ? "crit" : "hit");
        addParticles(e.x, e.y, hit.crit ? 6 : 3, hit.crit ? "#ffe27a" : "#9ff08a", 120, 3);
        if (hit.crit) G.shake = Math.max(G.shake, 3);
    }

    if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    G.kills++;

    addParticles(e.x, e.y, e.isBoss ? 40 : 10, "#a7ff83", e.isBoss ? 380 : 200, e.isBoss ? 7 : 4);
    G.effects.push({ kind: "ring", x: e.x, y: e.y, r0: 10, r1: e.isBoss ? 220 : 50, t: 0.45, max: 0.45, color: "#c5ff9c", width: 3 });
    Sound.play("kill");

    const pl = G.ults.plague;
    if (pl && G.chain < 3 && Math.hypot(e.x - G.player.x, e.y - G.player.y) <= pl.radius + e.r) {
        G.chain++;
        explode(e.x, e.y, 90, 1.5, { color: "#7dff5a", kb: 100 });
        G.chain--;
    }

    const value = Math.round(e.exp * (1 + 0.06 * (G.wave - 1)));

    if (e.isBoss) {
        G.bossKills++;
        G.boss = null;
        G.shake = 18;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            dropOrb(e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, Math.round(value / 8));
        }
        healPlayer(G.player.maxHp * 0.3, true);
        G.queue.push({ chest: true });
        setBanner("BOSS 擊破！", "獲得稀有以上的寶藏強化", "#ffb23e");
        Sound.play("evolve");
    } else {
        dropOrb(e.x, e.y, value);
    }
}

function dropOrb(x, y, exp) {
    if (G.orbs.length > 250) { gainExp(exp); return; }
    G.orbs.push({ x, y, exp, phase: Math.random() * 6, attracted: false, speed: 0 });
}

/* ============================== 經驗與升級 ============================== */
function gainExp(amount) {
    const p = G.player;
    p.exp += amount;
    while (p.exp >= p.maxExp) {
        p.exp -= p.maxExp;
        p.level++;
        p.maxExp = Math.floor(p.maxExp * 1.18 + 12);
        healPlayer(p.maxHp * 0.1, false);
        G.queue.push({ chest: false });
        G.effects.push({ kind: "levelup", t: 1.3, max: 1.3 });
        Sound.play("levelup");
    }
}

function evolveReady() {
    const ch = G.character;
    return !G.evolved && G.weaponLevel >= 4 && itemLv(ch.evoNeeds) >= 1;
}

function isAvailable(def) {
    switch (def.kind) {
        case "item":   return itemLv(def.id) < def.max;
        case "weapon": return !G.evolved && G.weaponLevel < 4;
        case "evolve": return evolveReady();
        case "skill": {
            const lv = skillLv(def.id);
            if (lv > 0) return lv < SKILL_MAX;
            return skillSlotsUsed() < MAX_SKILL_SLOTS;
        }
        case "fusion": return fusionReady(def.fusion);
        default:       return true;
    }
}

function rollRarity(chest) {
    const luck = itemLv("luck");
    let w = [Math.max(25, 70 - luck * 4), 25 + luck * 2, 5 + luck * 1.5];
    if (chest) w = [0, 62 + luck, 38 + luck];
    const total = w[0] + w[1] + w[2];
    let r = Math.random() * total;
    for (let i = 0; i < 3; i++) {
        r -= w[i];
        if (r <= 0) return i;
    }
    return 0;
}

function buildChoices(chest) {
    const avail = UPGRADES.filter(isAvailable);

    // 武器進化、技能融合：條件達成時優先出現（傳說）
    const forced = avail.filter((u) => u.kind === "evolve" || u.kind === "fusion");
    const picks = forced.slice(0, 3).map((def) => ({ def, rarity: 2 }));

    const pool = avail.filter((u) => u.kind !== "evolve" && u.kind !== "fusion");
    while (picks.length < 3 && pool.length > 0) {
        const ws = pool.map(weightOf);
        let total = 0;
        ws.forEach((w) => { total += w; });
        let r = Math.random() * total;
        let idx = 0;
        for (; idx < pool.length; idx++) {
            r -= ws[idx];
            if (r <= 0) break;
        }
        idx = Math.min(idx, pool.length - 1);
        const def = pool.splice(idx, 1)[0];
        let rarity = rollRarity(chest);
        if (def.kind === "weapon") rarity = 1;
        picks.push({ def, rarity });
    }
    return picks;
}

function cardText(c) {
    const d = c.def;
    const m = RARITIES[c.rarity].mult;
    const ch = G.character;
    switch (d.kind) {
        case "stat": return d.text(m);
        case "item": {
            const cur = itemLv(d.id);
            const next = Math.min(d.max, cur + ITEM_GAIN[c.rarity]);
            return `${d.text}<br>Lv.${cur} → Lv.${next}` + (c.rarity === 1 ? "<br>額外恢復 15% 生命" : "");
        }
        case "weapon": return `${ch.weaponName} Lv.${G.weaponLevel} → Lv.${G.weaponLevel + 1}<br>${ch.weaponUp}`;
        case "evolve": return `${ch.evoName}<br>${ch.evoText}`;
        case "skill": {
            const sk = SKILLS[d.id];
            const cur = skillLv(d.id);
            const next = Math.min(SKILL_MAX, cur + ITEM_GAIN[c.rarity]);
            const partners = FUSIONS
                .filter((f) => f.a === d.id || f.b === d.id)
                .map((f) => `${SKILLS[f.a === d.id ? f.b : f.a].name} → ${f.name}`)
                .join("、");
            return sk.text(next) +
                (cur === 0 ? "<br>【習得新技能】" : `<br>Lv.${cur} → Lv.${next}${next >= SKILL_MAX ? "（滿級）" : ""}`) +
                `<br><small style="opacity:.7">融合：${partners}</small>`;
        }
        case "fusion": {
            const f = d.fusion;
            return `${SKILLS[f.a].name} + ${SKILLS[f.b].name}（皆滿級）<br>${f.text}`;
        }
        case "heal":   return `恢復 ${Math.round(35 * m)}% 最大生命`;
        default: return "";
    }
}

function cardName(c) {
    if (c.def.kind === "evolve") return "進化：" + G.character.evoName;
    if (c.def.kind === "fusion") return "融合：" + c.def.name;
    return c.def.name;
}

function openUpgrade() {
    if (!G || G.choosing || G.queue.length === 0) return;
    const entry = G.queue.shift();
    G.chestChoice = entry.chest;
    G.choices = buildChoices(entry.chest);
    G.choosing = true;
    clearKeys();

    dom.upgradeTitle.textContent = entry.fusion ? "FUSION" : (entry.chest ? "BOSS 寶藏" : "LEVEL UP");
    dom.upgradeSubtitle.textContent = entry.fusion
        ? "兩項技能已滿級 — 選擇融合卡即可獲得終極技能（選別張則稍後升級時再次出現）"
        : (entry.chest
            ? "擊敗 Boss 的獎勵 — 稀有度更高"
            : `等級 ${G.player.level} — 選擇一項能力，繼續你的冒險`);

    renderUpgradeCards();
    dom.upgradeOverlay.classList.remove("hidden");
}

function renderUpgradeCards() {
    dom.upgradeCards.replaceChildren();
    G.choices.forEach((c, index) => {
        const r = RARITIES[c.rarity];
        const card = document.createElement("button");
        card.type = "button";
        card.className = "upgrade-card r-" + r.id;
        card.style.setProperty("--card-index", index);
        card.innerHTML =
            `<span class="upgrade-number">0${index + 1}</span>` +
            `<span class="upgrade-rarity">${r.name}</span>` +
            `<span class="upgrade-icon"></span>` +
            `<span class="upgrade-card-title"></span>` +
            `<span class="upgrade-card-description"></span>` +
            `<span class="upgrade-card-action">選擇強化 ↗</span>`;
        card.querySelector(".upgrade-icon").textContent = c.def.icon;
        card.querySelector(".upgrade-card-title").textContent = cardName(c);
        card.querySelector(".upgrade-card-description").innerHTML = cardText(c);
        card.addEventListener("click", () => chooseUpgrade(index));
        dom.upgradeCards.appendChild(card);
    });
}

function chooseUpgrade(index) {
    if (!G || !G.choosing) return;
    const c = G.choices[index];
    if (!c) return;
    const p = G.player;
    const d = c.def;
    const m = RARITIES[c.rarity].mult;

    switch (d.kind) {
        case "stat":
            d.apply(p, m);
            break;
        case "item":
            G.items[d.id] = Math.min(d.max, itemLv(d.id) + ITEM_GAIN[c.rarity]);
            if (c.rarity === 1) healPlayer(p.maxHp * 0.15, true);
            break;
        case "weapon":
            G.weaponLevel = Math.min(4, G.weaponLevel + 1);
            break;
        case "evolve":
            G.evolved = true;
            setBanner("武器進化！", G.character.evoName, "#ffb23e");
            G.effects.push({ kind: "ring", x: p.x, y: p.y, r0: 20, r1: 320, t: 0.9, max: 0.9, color: "#ffb23e", width: 8 });
            Sound.play("evolve");
            break;
        case "skill": {
            const cur = skillLv(d.id);
            const nl = Math.min(SKILL_MAX, cur + ITEM_GAIN[c.rarity]);
            if (cur === 0) {
                G.skills[d.id] = { lv: nl, cd: 0.4, charges: 1, regen: 9, angle: 0, count: 0, radius: 0, bladeSize: 14 };
            } else {
                G.skills[d.id].lv = nl;
            }
            if (nl >= SKILL_MAX && cur < SKILL_MAX) {
                setBanner("技能滿級！", SKILLS[d.id].name + " MAX", "#ffb23e");
                // 與另一個滿級技能湊成配方 → 立刻跳出融合選擇
                FUSIONS.forEach((f) => {
                    if ((f.a === d.id || f.b === d.id) && fusionReady(f) && !G.fusionNotified[f.id]) {
                        G.fusionNotified[f.id] = true;
                        if (!G.queue.some((q) => q.fusion)) G.queue.push({ chest: false, fusion: true });
                        setBanner("可以融合了！", `${SKILLS[f.a].name} + ${SKILLS[f.b].name} → ${f.name}`, "#ffb23e");
                    }
                });
            }
            break;
        }
        case "fusion":
            fuse(d.fusion);
            break;
        case "heal":
            healPlayer(p.maxHp * 0.35 * m, true);
            Sound.play("heal");
            break;
        default:
            break;
    }

    if (d.kind !== "evolve" && d.kind !== "fusion") Sound.play("select");

    G.choosing = false;
    G.choices = [];
    dom.upgradeOverlay.classList.add("hidden");

    if (G.queue.length > 0) openUpgrade();
}

/* ============================== 戰鬥：自動鎖敵 / 攻擊 ============================== */
function triggerReach() {
    const id = G.character.id;
    const L = G.weaponLevel;
    const a = G.player.areaMult;
    if (id === "warrior") return (105 + (L - 1) * 10 + (G.evolved ? 35 : 0)) * a;
    if (id === "lancer")  return (175 + (L - 1) * 18 + (G.evolved ? 60 : 0)) * a * 0.92;
    return Math.min(430, Math.max(VIEW_W, VIEW_H) / zoom / 2 - 30);
}

function updateAutoAttack() {
    const p = G.player;
    if (p.attackCd > 0 || p.attacking) return;
    const target = nearestEnemy(p.x, p.y, triggerReach());
    if (!target) return;
    startAttack(target);
}

function startAttack(target) {
    const p = G.player;
    const ch = G.character;
    const aim = Math.atan2(target.y - p.y, target.x - p.x);
    const cd = cooldownNow();
    const natural = ch.attackFrames / ch.attackFps;

    p.attacking = true;
    p.attackTime = 0;
    p.attackAim = aim;
    p.attackCd = cd;
    p.attackDur = Math.max(0.15, Math.min(natural, cd * 0.9));
    p.hitAt = p.attackDur * (ch.id === "archer" ? 0.55 : 0.45);
    p.hitDone = false;
    if (Math.abs(Math.cos(aim)) > 0.05) p.facingX = Math.cos(aim) < 0 ? -1 : 1;

    if (ch.id !== "archer") Sound.play("swing");
}

function fireWeapon(aim) {
    const id = G.character.id;
    if (id === "warrior") warriorSwing(aim, false);
    else if (id === "lancer") lancerThrust(aim, false);
    else archerShoot();
}

function warriorSwing(aim, second) {
    const p = G.player;
    const L = G.weaponLevel;
    const evo = G.evolved;
    const reach = (105 + (L - 1) * 10 + (evo ? 35 : 0)) * p.areaMult;
    const half = evo ? Math.PI : (L >= 3 ? 1.2 : 0.95);
    const mult = 1 + 0.15 * (L - 1) + (evo ? 0.5 : 0);

    G.effects.push({
        kind: "arc", x: p.x, y: p.y, aim, reach, half, full: evo,
        t: 0.22, max: 0.22, color: evo ? "#ff8a3d" : "#f0d69a"
    });
    if (second) Sound.play("swing");

    G.enemies.forEach((e) => {
        if (e.dead) return;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach + e.r) return;
        if (!evo && Math.abs(normAngle(Math.atan2(dy, dx) - aim)) > half) return;
        damageEnemy(e, rollDamage(mult), { kb: 260, burn: evo });
    });

    if (evo && !second) {
        G.timers.push({ t: 0.18, fn: () => { if (!G.dead) warriorSwing(aim, true); } });
    }
}

function lancerThrust(aim, second) {
    const p = G.player;
    const L = G.weaponLevel;
    const evo = G.evolved;
    const len = (175 + (L - 1) * 18 + (evo ? 60 : 0)) * p.areaMult;
    const width = 50 + (L - 1) * 6 + (evo ? 20 : 0);
    const mult = 1 + 0.12 * (L - 1) + (evo ? 0.4 : 0);
    const dirX = Math.cos(aim);
    const dirY = Math.sin(aim);

    G.effects.push({
        kind: "thrust", x: p.x, y: p.y, aim, len, width,
        t: 0.2, max: 0.2, color: evo ? "#8fd8ff" : "#f0d69a"
    });
    if (second) Sound.play("swing");

    const hitList = [];
    G.enemies.forEach((e) => {
        if (e.dead) return;
        const rx = e.x - p.x;
        const ry = e.y - p.y;
        const along = rx * dirX + ry * dirY;
        const across = Math.abs(-rx * dirY + ry * dirX);
        if (along < -e.r || along > len + e.r) return;
        if (across > width / 2 + e.r) return;
        hitList.push(e);
    });

    hitList.forEach((e) => damageEnemy(e, rollDamage(mult), { kb: 200 }));

    // 進化：連鎖閃電
    if (evo) {
        const chained = hitList.slice();
        let chains = 0;
        for (const src of hitList.slice(0, 3)) {
            for (let k = 0; k < 2 && chains < 6; k++) {
                const next = nearestEnemy(src.x, src.y, 170, chained);
                if (!next) break;
                chained.push(next);
                chains++;
                G.effects.push({ kind: "bolt", x1: src.x, y1: src.y, x2: next.x, y2: next.y, t: 0.25, max: 0.25 });
                damageEnemy(next, rollDamage(mult * 0.55), { kb: 60, fromX: src.x, fromY: src.y });
            }
        }
    }

    if (L >= 3 && !second) {
        G.timers.push({ t: 0.18, fn: () => { if (!G.dead) lancerThrust(aim, true); } });
    }
}

function archerShoot() {
    const p = G.player;
    const L = G.weaponLevel;
    const evo = G.evolved;
    const count = evo ? 5 : 1 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0);
    const pierce = evo ? 3 : (L >= 3 ? 1 : 0);
    const mult = 1 + 0.1 * (L - 1) + (evo ? 0.3 : 0);
    const speed = 640;

    // 選取最近的不同目標
    const targets = [];
    for (let i = 0; i < count; i++) {
        const t = nearestEnemy(p.x, p.y, 520, targets);
        if (!t) break;
        targets.push(t);
    }
    if (targets.length === 0) return;

    Sound.play("shoot");

    for (let i = 0; i < count; i++) {
        const tgt = targets[i % targets.length];
        let aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        if (i >= targets.length) aim += (i - targets.length + 1) * 0.16 * (i % 2 ? 1 : -1);
        else if (evo) aim += (i - (count - 1) / 2) * 0.12;

        const hit = rollDamage(mult);
        G.projectiles.push({
            x: p.x, y: p.y,
            vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed,
            speed, r: 9 * p.areaMult, life: 1.7,
            dmg: hit.dmg, crit: hit.crit, pierce, hits: [],
            target: tgt, evo
        });
    }
}

function updateProjectiles(dt) {
    const p = G.player;
    for (const a of G.projectiles) {
        a.life -= dt;

        if (!a.target || a.target.dead || a.hits.indexOf(a.target) !== -1) {
            a.target = nearestEnemy(a.x, a.y, 600, a.hits);
        }
        if (a.target) {
            const desired = Math.atan2(a.target.y - a.y, a.target.x - a.x);
            const cur = Math.atan2(a.vy, a.vx);
            const diff = normAngle(desired - cur);
            const turn = clamp(diff, -6 * dt, 6 * dt);
            a.vx = Math.cos(cur + turn) * a.speed;
            a.vy = Math.sin(cur + turn) * a.speed;
        }

        a.x += a.vx * dt;
        a.y += a.vy * dt;

        for (const e of G.enemies) {
            if (e.dead || a.hits.indexOf(e) !== -1) continue;
            if (Math.hypot(e.x - a.x, e.y - a.y) < e.r + a.r) {
                a.hits.push(e);
                damageEnemy(e, { dmg: a.dmg, crit: a.crit }, { kb: 140, fromX: a.x - a.vx * 0.05, fromY: a.y - a.vy * 0.05 });
                if (a.pierce <= 0) { a.life = 0; break; }
                a.pierce--;
            }
        }

        if (Math.hypot(a.x - p.x, a.y - p.y) > 1400) a.life = 0;
    }
    G.projectiles = G.projectiles.filter((a) => a.life > 0);
}

/* 聖光符文 */
function updateAura(dt) {
    const lv = itemLv("aura");
    if (lv <= 0) return;
    const p = G.player;
    p.auraTimer -= dt;
    if (p.auraTimer > 0) return;
    p.auraTimer = 0.8;
    const radius = (80 + 14 * lv) * p.areaMult;
    G.effects.push({ kind: "ring", x: p.x, y: p.y, r0: 20, r1: radius, t: 0.4, max: 0.4, color: "#fff2b0", width: 3, follow: true });
    G.enemies.forEach((e) => {
        if (e.dead) return;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= radius + e.r) {
            damageEnemy(e, rollDamage(0.2 + 0.12 * lv), { kb: 40, silent: true, type: "fire" });
        }
    });
}

/* ============================== 更新：玩家 / 經驗球 / 特效 ============================== */
function updatePlayer(dt) {
    const p = G.player;

    let mx = 0;
    let my = 0;
    if (keys["w"] || keys["arrowup"]) my -= 1;
    if (keys["s"] || keys["arrowdown"]) my += 1;
    if (keys["a"] || keys["arrowleft"]) mx -= 1;
    if (keys["d"] || keys["arrowright"]) mx += 1;
    if (mx !== 0 && my !== 0) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
    if (joy.active && (joy.x !== 0 || joy.y !== 0)) { mx = joy.x; my = joy.y; }

    const spd = playerSpeed() * (p.attacking ? 0.6 : 1);
    p.x += mx * spd * dt;
    p.y += my * spd * dt;
    p.moving = mx !== 0 || my !== 0;
    if (!p.attacking && mx !== 0) p.facingX = mx < 0 ? -1 : 1;

    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    p.invincible = Math.max(0, p.invincible - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);

    if (p.attacking) {
        p.attackTime += dt;
        if (!p.hitDone && p.attackTime >= p.hitAt) {
            p.hitDone = true;
            fireWeapon(p.attackAim);
        }
        if (p.attackTime >= p.attackDur) p.attacking = false;
    }
}

function runTimers(dt) {
    if (G.timers.length === 0) return;
    const due = [];
    G.timers = G.timers.filter((tm) => {
        tm.t -= dt;
        if (tm.t <= 0) { due.push(tm); return false; }
        return true;
    });
    due.forEach((tm) => tm.fn());
}

function updateOrbs(dt) {
    const p = G.player;
    const range = 80 * p.pickupMult;
    for (let i = G.orbs.length - 1; i >= 0; i--) {
        const o = G.orbs[i];
        o.phase += dt * 4;
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < range) o.attracted = true;
        if (o.attracted) {
            o.speed = Math.min(900, o.speed + 1400 * dt);
            o.x += (dx / dist) * Math.max(o.speed, 260) * dt;
            o.y += (dy / dist) * Math.max(o.speed, 260) * dt;
        }
        if (dist < p.r + 8) {
            gainExp(o.exp);
            Sound.play("orb");
            G.orbs.splice(i, 1);
        }
    }
}

function updateEffects(dt) {
    G.effects.forEach((f) => { f.t -= dt; });
    G.effects = G.effects.filter((f) => f.t > 0);

    G.particles.forEach((q) => {
        q.t -= dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= Math.exp(-5 * dt);
        q.vy *= Math.exp(-5 * dt);
    });
    G.particles = G.particles.filter((q) => q.t > 0);

    G.numbers.forEach((n) => { n.t -= dt; n.y -= 46 * dt; });
    G.numbers = G.numbers.filter((n) => n.t > 0);

    if (G.banner) {
        G.banner.t -= dt;
        if (G.banner.t <= 0) G.banner = null;
    }
    G.shake = Math.max(0, G.shake - dt * 40);
}

function updateCamera(dt) {
    const p = G.player;
    const tx = p.x - VIEW_W / zoom / 2;
    const ty = p.y - VIEW_H / zoom / 2;
    const k = Math.min(1, dt * 8);
    G.cam.x += (tx - G.cam.x) * k;
    G.cam.y += (ty - G.cam.y) * k;
}

function die() {
    G.dead = true;
    G.player.hp = 0;
    G.player.attacking = false;
    clearKeys();
    Sound.play("death");
    commitRecords();
    showDeathScreen();
}

function showDeathScreen() {
    const nr = G.newRecords;
    const tag = (k) => (nr[k] ? '<span class="new">NEW</span>' : "");
    dom.deathStats.innerHTML =
        `<span>存活時間${tag("time")}</span><b>${fmtTime(G.time)}</b>` +
        `<span>等級${tag("level")}</span><b>${G.player.level}</b>` +
        `<span>抵達波次${tag("wave")}</span><b>${G.wave}</b>` +
        `<span>擊殺數${tag("kills")}</span><b>${G.kills}</b>` +
        `<span>擊敗 Boss${tag("boss")}</span><b>${G.bossKills}</b>` +
        `<span>造成總傷害</span><b>${Math.round(G.damageDealt)}</b>` +
        `<span>最長存活紀錄</span><b>${fmtTime(save.bestTime)}</b>`;
    dom.deathOverlay.classList.remove("hidden");
}

/* ============================== 主更新 ============================== */
function updateGame(dt) {
    const p = G.player;
    G.time += dt;
    G.anim += dt;

    updateWave(dt);
    updateSpawner(dt);
    updatePlayer(dt);
    updateAutoAttack();
    runTimers(dt);
    updateEnemies(dt);
    updateAura(dt);
    updateSkills(dt);
    updateSkillShots(dt);
    updateZones(dt);
    updateProjectiles(dt);
    updateOrbs(dt);
    updateEffects(dt);
    updateCamera(dt);

    G.enemies = G.enemies.filter((e) => !e.dead);

    if (p.hp <= 0) { die(); return; }
    if (!G.choosing && G.queue.length > 0) openUpgrade();
}

/* ============================== 繪製：地圖 ============================== */
function drawFloor() {
    const cam = G.cam;
    const tx0 = Math.floor(cam.x / TILE) - 1;
    const ty0 = Math.floor(cam.y / TILE) - 1;
    const tx1 = Math.ceil((cam.x + VIEW_W / zoom) / TILE) + 1;
    const ty1 = Math.ceil((cam.y + VIEW_H / zoom) / TILE) + 1;

    for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            const x = tx * TILE;
            const y = ty * TILE;
            const h = hash2(tx, ty);

            ctx.fillStyle = (tx + ty) & 1 ? "#252833" : "#20232c";
            ctx.fillRect(x, y, TILE, TILE);
            ctx.strokeStyle = "#303440";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

            if (h < 0.07) {                       // 裂痕
                ctx.strokeStyle = "#171921";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 10 + h * 200, y + 8);
                ctx.lineTo(x + 30, y + 30);
                ctx.lineTo(x + 24 + h * 300, y + 56);
                ctx.stroke();
            } else if (h < 0.11) {                // 金色符文
                ctx.strokeStyle = "rgba(217, 182, 111, 0.22)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x + TILE / 2, y + TILE / 2, 12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + TILE / 2 - 8, y + TILE / 2);
                ctx.lineTo(x + TILE / 2 + 8, y + TILE / 2);
                ctx.stroke();
            } else if (h < 0.15) {                // 碎石
                ctx.fillStyle = "#2e313d";
                ctx.fillRect(x + 14 + h * 100, y + 36, 9, 6);
                ctx.fillRect(x + 36, y + 20 + h * 60, 6, 5);
            }
        }
    }
}

/* ============================== 繪製：實體 ============================== */
function drawShadow(x, y, w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
}

function drawEnemy(e) {
    const def = ENEMY_TYPES[e.type];
    const size = e.size;

    drawShadow(e.x, e.y + size * 0.3, size * 0.36, size * 0.11);

    let img;
    let frames;
    let frame;
    if (e.atkAnim > 0) {
        img = SLIME.attack[e.dir]; frames = 5;
        frame = Math.min(frames - 1, Math.floor((0.5 - e.atkAnim) / 0.1));
    } else if (e.moving) {
        img = SLIME.move[e.dir]; frames = 6;
        frame = Math.floor(e.animT * 9) % frames;
    } else {
        img = SLIME.idle; frames = 4;
        frame = Math.floor(e.animT * 8) % frames;
    }

    let src = img;
    if (e.flash > 0) src = getTinted(img, "white", "#ffffff", 0.9);
    else if (e.slow > 0) src = getTinted(img, "ice", "#7ad0ff", 0.55);
    else if (def.tint) src = getTinted(img, e.type, def.tint[0], def.tint[1]);

    if (src && img && img.ready) {
        ctx.drawImage(src, frame * 32, 0, 32, 32, e.x - size / 2, e.y - size / 2 - size * 0.08, size, size);
    } else {
        ctx.fillStyle = e.isBoss ? "#8a4bd0" : "#56b34a";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
    }

    if (!e.isBoss && e.hp < e.maxHp) {
        const w = size * 0.7;
        const bx = e.x - w / 2;
        const by = e.y - size / 2 - 12;
        ctx.fillStyle = "#3b171b";
        ctx.fillRect(bx, by, w, 5);
        ctx.fillStyle = "#e34d58";
        ctx.fillRect(bx, by, w * clamp(e.hp / e.maxHp, 0, 1), 5);
    }

    if (e.burn > 0) {
        ctx.fillStyle = "rgba(255, 140, 50, 0.8)";
        ctx.beginPath();
        ctx.arc(e.x + Math.sin(G.anim * 12) * 6, e.y - size * 0.35, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPlayer() {
    const p = G.player;
    const ch = G.character;
    const im = ch.images;
    const size = 120 * ch.drawScale;

    let img = im.idle;
    let frames = ch.idleFrames;
    let frame = Math.floor(G.anim * ch.idleFps) % frames;
    let flip = p.facingX < 0;

    if (p.attacking) {
        let atkImg = im.attack;
        if (im.attackDirs) {
            const ax = Math.cos(p.attackAim);
            const ay = Math.sin(p.attackAim);
            let dir;
            if (Math.abs(ax) > Math.abs(ay)) dir = "right";
            else if (ay > 0) dir = Math.abs(ax) > 0.3 ? "downRight" : "down";
            else dir = Math.abs(ax) > 0.3 ? "upRight" : "up";
            atkImg = im.attackDirs[dir];
            flip = ax < 0;
        }
        if (atkImg && atkImg.ready) {
            img = atkImg;
            frames = ch.attackFrames;
            frame = Math.min(frames - 1, Math.floor((p.attackTime / p.attackDur) * frames));
        }
    } else if (p.moving && im.run.ready) {
        img = im.run;
        frames = ch.runFrames;
        frame = Math.floor(G.anim * ch.runFps) % frames;
    }

    drawShadow(p.x, p.y + size * 0.28, size * 0.22, size * 0.07);

    ctx.save();
    if (p.invincible > 0 && Math.floor(G.anim * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.translate(p.x, p.y);
    if (flip) ctx.scale(-1, 1);

    if (img && img.ready) {
        ctx.drawImage(img, frame * ch.frameW, 0, ch.frameW, ch.frameH, -size / 2, -size / 2, size, size);
    } else {
        ctx.fillStyle = "#d9b66f";
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawEntities() {
    const cam = G.cam;
    const list = [{ y: G.player.y, e: null }];
    for (const e of G.enemies) {
        if (e.dead) continue;
        if (e.x < cam.x - 200 || e.x > cam.x + VIEW_W / zoom + 200 || e.y < cam.y - 200 || e.y > cam.y + VIEW_H / zoom + 200) continue;
        list.push({ y: e.y, e });
    }
    list.sort((a, b) => a.y - b.y);
    list.forEach((it) => { if (it.e) drawEnemy(it.e); else drawPlayer(); });
}

function drawOrbs() {
    G.orbs.forEach((o) => {
        const floatY = Math.sin(o.phase) * 4;
        const big = o.exp >= 30;
        ctx.save();
        ctx.shadowColor = big ? "#ffd05a" : "#48aaff";
        ctx.shadowBlur = 16;
        ctx.fillStyle = big ? "#ffd86b" : "#53baff";
        ctx.beginPath();
        ctx.arc(o.x, o.y + floatY, big ? 11 : 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function drawBossTelegraph() {
    const b = G.boss;
    if (!b || b.dead || b.state !== "tele") return;
    const prog = 1 - clamp(b.stateT / 0.9, 0, 1);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.dirY, b.dirX));
    ctx.fillStyle = `rgba(255, 60, 60, ${0.12 + prog * 0.25})`;
    ctx.fillRect(0, -b.r, 640 * 0.9, b.r * 2);
    ctx.strokeStyle = "rgba(255, 90, 90, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, -b.r, 640 * 0.9, b.r * 2);
    ctx.restore();
}

function drawProjectiles() {
    G.projectiles.forEach((a) => {
        const ang = Math.atan2(a.vy, a.vx);
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(ang);
        if (a.evo) {
            ctx.shadowColor = "#ffb23e";
            ctx.shadowBlur = 14;
        }
        ctx.strokeStyle = a.evo ? "#ffd27a" : "#e8dcc0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        ctx.fillStyle = a.evo ? "#ff9a3a" : "#c9c6d0";
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(7, -5);
        ctx.lineTo(7, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });
}

function drawEffects() {
    const p = G.player;
    G.effects.forEach((f) => {
        const prog = 1 - f.t / f.max;
        const alpha = clamp(1 - prog, 0, 1);
        ctx.save();

        if (f.kind === "arc") {
            ctx.translate(f.x, f.y);
            ctx.rotate(f.aim);
            const rr = f.reach * (0.7 + 0.3 * prog);
            ctx.globalAlpha = alpha * 0.55;
            ctx.fillStyle = f.color;
            ctx.beginPath();
            if (f.full) ctx.arc(0, 0, rr, 0, Math.PI * 2);
            else { ctx.moveTo(0, 0); ctx.arc(0, 0, rr, -f.half, f.half); ctx.closePath(); }
            ctx.fill();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#fff6d8";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, rr, f.full ? 0 : -f.half, f.full ? Math.PI * 2 : f.half);
            ctx.stroke();
        } else if (f.kind === "thrust") {
            ctx.translate(f.x, f.y);
            ctx.rotate(f.aim);
            const len = f.len * Math.min(1, prog * 3 + 0.4);
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.moveTo(0, -f.width * 0.15);
            ctx.lineTo(len, 0);
            ctx.lineTo(0, f.width * 0.15);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = alpha * 0.25;
            ctx.fillRect(0, -f.width / 2, f.len, f.width);
        } else if (f.kind === "bolt") {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#bfe8ff";
            ctx.shadowColor = "#6ec8ff";
            ctx.shadowBlur = 12;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(f.x1, f.y1);
            const segs = 5;
            for (let i = 1; i < segs; i++) {
                const t = i / segs;
                ctx.lineTo(
                    f.x1 + (f.x2 - f.x1) * t + rand(-10, 10),
                    f.y1 + (f.y2 - f.y1) * t + rand(-10, 10)
                );
            }
            ctx.lineTo(f.x2, f.y2);
            ctx.stroke();
        } else if (f.kind === "ring") {
            const cx = f.follow ? p.x : f.x;
            const cy = f.follow ? p.y : f.y;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = f.color;
            ctx.lineWidth = f.width || 3;
            ctx.beginPath();
            ctx.arc(cx, cy, f.r0 + (f.r1 - f.r0) * prog, 0, Math.PI * 2);
            ctx.stroke();
        } else if (f.kind === "warn") {
            ctx.globalAlpha = 0.3 + prog * 0.5;
            ctx.fillStyle = "rgba(255, 90, 40, 0.25)";
            ctx.strokeStyle = "#ff6a2a";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * prog), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (f.kind === "strike") {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = f.color || "#e6f4ff";
            ctx.shadowColor = "#8fd8ff";
            ctx.shadowBlur = 16;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(f.x + rand(-12, 12), f.y - 520);
            for (let i = 1; i < 6; i++) {
                ctx.lineTo(f.x + rand(-16, 16), f.y - 520 + (520 / 6) * i);
            }
            ctx.lineTo(f.x, f.y);
            ctx.stroke();
        } else if (f.kind === "levelup") {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 30 + prog * 110, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#ffd700";
            ctx.shadowColor = "#ff9900";
            ctx.shadowBlur = 18;
            ctx.font = "bold 30px Georgia, serif";
            ctx.textAlign = "center";
            ctx.fillText("LEVEL UP!", p.x, p.y - 80 - prog * 40);
        }
        ctx.restore();
    });
}

function drawParticles() {
    G.particles.forEach((q) => {
        ctx.globalAlpha = clamp(q.t / q.max, 0, 1);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    });
    ctx.globalAlpha = 1;
}

function drawNumbers() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    G.numbers.forEach((n) => {
        const alpha = clamp(n.t / n.max, 0, 1);
        let color = "#ff6a6a";
        let size = 24;
        if (n.type === "crit") { color = "#ffe04a"; size = 32; }
        else if (n.type === "fire") { color = "#ff9a3a"; size = 19; }
        else if (n.type === "heal") { color = "#7dff9a"; size = 22; }
        else if (n.type === "hurt") { color = "#ff3b3b"; size = 28; }
        else if (n.type === "poison") { color = "#8be05a"; size = 19; }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${size}px Arial`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
        ctx.strokeText(n.text, n.x, n.y);
        ctx.fillStyle = color;
        ctx.fillText(n.text, n.x, n.y);
        ctx.restore();
    });
}

/* ============================== 繪製：畫面層 UI ============================== */
function drawVignette() {
    if (!vignetteGrad) {
        vignetteGrad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
        vignetteGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignetteGrad.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    }
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (G.player.hp < G.player.maxHp * 0.3 && !G.dead) {
        const pulse = 0.12 + 0.08 * Math.sin(G.anim * 6);
        ctx.fillStyle = `rgba(200, 20, 30, ${pulse})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
}

function drawBossUI() {
    const b = G.boss;
    if (!b || b.dead) return;

    const w = Math.min(520, VIEW_W - 50);
    const x = (VIEW_W - w) / 2;
    const y = 18;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(x - 10, y - 6, w + 20, 50);
    ctx.strokeStyle = "rgba(217, 182, 111, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 10, y - 6, w + 20, 50);

    ctx.fillStyle = "#f0d69a";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(ENEMY_TYPES.boss.name + (b.hp < b.maxHp * 0.5 ? "　【狂暴】" : ""), VIEW_W / 2, y + 12);

    ctx.fillStyle = "#3b171b";
    ctx.fillRect(x, y + 20, w, 14);
    ctx.fillStyle = "#b44cff";
    ctx.fillRect(x, y + 20, w * clamp(b.hp / b.maxHp, 0, 1), 14);
    ctx.restore();

    // 螢幕外指示箭頭
    const cam = G.cam;
    const sx = (b.x - cam.x) * zoom;
    const sy = (b.y - cam.y) * zoom;
    if (sx < 0 || sx > VIEW_W || sy < 0 || sy > VIEW_H) {
        const cx = VIEW_W / 2;
        const cy = VIEW_H / 2;
        const ang = Math.atan2(sy - cy, sx - cx);
        const ex = clamp(cx + Math.cos(ang) * 1000, 40, VIEW_W - 40);
        const ey = clamp(cy + Math.sin(ang) * 1000, 90, VIEW_H - 40);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = "#b44cff";
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const prog = 1 - b.t / b.max;
    const alpha = prog < 0.12 ? prog / 0.12 : (prog > 0.75 ? (1 - prog) / 0.25 : 1);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = b.color;
    ctx.font = "bold 54px Georgia, serif";
    ctx.fillText(b.text, VIEW_W / 2, 150);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#e8e5dc";
    ctx.font = "20px sans-serif";
    ctx.fillText(b.sub, VIEW_W / 2, 200);
    ctx.restore();
}

function renderGame() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    const cam = G.cam;
    const sx = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0;
    const sy = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0;

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(Math.round(-cam.x + sx), Math.round(-cam.y + sy));
    drawFloor();
    drawSkillGround();
    drawOrbs();
    drawBossTelegraph();
    drawEntities();
    drawSkillAir();
    drawProjectiles();
    drawEffects();
    drawParticles();
    drawNumbers();
    ctx.restore();

    drawVignette();
    drawBossUI();
    drawBanner();
}

/* ============================== HUD（HTML） ============================== */
function setText(el, key, val) {
    if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; }
}
function setWidth(el, key, pctVal) {
    const v = pctVal.toFixed(1);
    if (hudCache[key] !== v) { hudCache[key] = v; el.style.width = v + "%"; }
}

function updateHud() {
    const p = G.player;
    const hp = Math.max(0, Math.ceil(p.hp));

    setText(dom.level, "lv", `LV. ${p.level}`);
    setText(dom.hpText, "hpT", `${hp} / ${p.maxHp}`);
    setWidth(dom.hpBar, "hpB", clamp(p.hp / p.maxHp * 100, 0, 100));
    setText(dom.expText, "xpT", `${Math.floor(p.exp)} / ${p.maxExp}`);
    setWidth(dom.expBar, "xpB", clamp(p.exp / p.maxExp * 100, 0, 100));
    setText(dom.hudTime, "time", fmtTime(G.time));
    setText(dom.hudWave, "wave", String(G.wave));
    setText(dom.hudKills, "kills", String(G.kills));
    setText(dom.hudBest, "best", fmtTime(Math.max(save.bestTime, G.time)));

    let html = `<span class="chip ${G.evolved ? "evo" : "weapon"}">${weaponLabel()}</span>`;
    Object.keys(G.items).forEach((id) => {
        if (G.items[id] > 0) html += `<span class="chip">${ITEM_NAMES[id]} Lv.${G.items[id]}</span>`;
    });
    Object.keys(G.skills).forEach((id) => {
        const lv = G.skills[id].lv;
        const maxed = lv >= SKILL_MAX;
        const ready = maxed && FUSIONS.some((f) => (f.a === id || f.b === id) && fusionReady(f));
        html += `<span class="chip ${ready ? "fusion-ready" : (maxed ? "max" : "skill")}">${SKILLS[id].icon} ${SKILLS[id].name} ${ready ? "可融合" : (maxed ? "MAX" : "Lv." + lv)}</span>`;
    });
    Object.keys(G.ults).forEach((id) => {
        const f = FUSIONS.find((x) => x.id === id);
        html += `<span class="chip evo">${f.icon} ${f.name}</span>`;
    });
    if (hudCache.passives !== html) {
        hudCache.passives = html;
        dom.passives.innerHTML = html;
    }
}

/* ============================== 選角畫面動畫 ============================== */
function drawSelectionCharacters() {
    CHARACTERS.forEach((ch) => {
        const canvas = selectionCanvases[ch.id];
        const img = ch.images.idle;
        if (!canvas || !img.ready) return;
        const c = canvas.getContext("2d");
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.imageSmoothingEnabled = false;
        const frame = Math.floor(animTime * ch.idleFps) % ch.idleFrames;
        const size = selectionSizes[ch.id] || 150;
        c.drawImage(
            img, frame * ch.frameW, 0, ch.frameW, ch.frameH,
            (canvas.width - size) / 2, canvas.height - size - 8, size, size
        );
    });
}

/* ============================== 暫停 / 音效開關 ============================== */
function togglePause() {
    if (scene !== "playing" || !G || G.dead || G.choosing) return;
    G.paused = !G.paused;
    clearKeys();
    dom.pauseOverlay.classList.toggle("hidden", !G.paused);
    Sound.play("click");
}

function updateSoundButtons() {
    dom.soundBtn.classList.toggle("off", save.muted);
    dom.pauseSoundBtn.textContent = "音效：" + (save.muted ? "關" : "開");
}

function toggleMute() {
    save.muted = !save.muted;
    writeSave();
    updateSoundButtons();
    Sound.play("click");
}

/* ============================== 主迴圈 ============================== */
function frame(ts) {
    const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
    lastTs = ts;
    animTime += dt;

    if (scene === "selection") {
        drawSelectionCharacters();
    } else if (scene === "playing" && G) {
        if (!G.paused && !G.choosing && !G.dead) updateGame(dt);
        if (G) {
            renderGame();
            updateHud();
        }
    }
    requestAnimationFrame(frame);
}

/* ============================== 輸入與按鈕 ============================== */
window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    Sound.ensure();

    if (scene === "playing" &&
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
    }

    // ESC：回到獨立主頁
    if (key === "escape") {
        if (scene === "playing") { event.preventDefault(); exitToHome(); }
        else if (scene === "selection") { event.preventDefault(); setScene("home"); }
        return;
    }

    if (scene !== "playing" || !G) return;

    if (key === "m") { toggleMute(); return; }

    if (G.dead) {
        if (key === "enter") restartRun();
        return;
    }

    if (G.choosing) {
        if (key === "1") chooseUpgrade(0);
        else if (key === "2") chooseUpgrade(1);
        else if (key === "3") chooseUpgrade(2);
        return;
    }

    if (key === "p") { togglePause(); return; }
    if (G.paused) return;

    keys[key] = true;
});

window.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", () => {
    clearKeys();
    if (scene === "playing" && G && !G.dead && !G.choosing && !G.paused) togglePause();
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden && scene === "playing" && G && !G.dead && !G.choosing && !G.paused) togglePause();
});

window.addEventListener("beforeunload", () => {
    if (scene === "playing" && G) commitRecords();
});

window.addEventListener("pointerdown", () => Sound.ensure());

/* ---------- 觸控：浮動虛擬搖桿 ---------- */
document.body.classList.toggle("touch", IS_TOUCH);
let resizeTimer = 0;
function onViewportChange() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (scene === "playing" && G) fitCanvas();
        else updateZoom();
    }, 120);
}
window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", () => setTimeout(onViewportChange, 250));
window.addEventListener("touchend", () => Sound.ensure(), { passive: true });

dom.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

dom.canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    if (scene !== "playing" || !G || G.paused || G.dead || G.choosing || joy.active) return;
    e.preventDefault();
    joy.active = true;
    joy.id = e.pointerId;
    joy.ox = e.clientX;
    joy.oy = e.clientY;
    joy.x = 0;
    joy.y = 0;
    try { dom.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    dom.joy.style.left = e.clientX + "px";
    dom.joy.style.top = e.clientY + "px";
    dom.joyKnob.style.transform = "translate(0px, 0px)";
    dom.joy.classList.remove("hidden");
});

dom.canvas.addEventListener("pointermove", (e) => {
    if (!joy.active || e.pointerId !== joy.id) return;
    e.preventDefault();
    let dx = e.clientX - joy.ox;
    let dy = e.clientY - joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_R) { dx = (dx / len) * JOY_R; dy = (dy / len) * JOY_R; }
    if (len < 10) { joy.x = 0; joy.y = 0; }
    else { joy.x = dx / JOY_R; joy.y = dy / JOY_R; }
    dom.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
});

const joyEnd = (e) => { if (joy.active && e.pointerId === joy.id) resetJoystick(); };
dom.canvas.addEventListener("pointerup", joyEnd);
dom.canvas.addEventListener("pointercancel", joyEnd);

/* 主頁 → 選角 */
$("homeStartButton").addEventListener("click", () => {
    Sound.ensure();
    Sound.play("click");
    setScene("selection");
});

/* 選角 */
document.querySelectorAll(".character-card").forEach((card) => {
    card.addEventListener("click", () => {
        const ch = CHARACTERS.find((c) => c.id === card.dataset.character);
        if (!ch) return;
        selectedCharacter = ch;
        document.querySelectorAll(".character-card").forEach((el) => {
            el.classList.toggle("selected", el === card);
        });
        dom.selStatus.textContent = `已選擇 ${ch.name}（${ch.title}）`;
        dom.startBtn.disabled = false;
        Sound.play("select");
    });
});

$("backButton").addEventListener("click", () => { Sound.play("click"); setScene("home"); });

dom.startBtn.addEventListener("click", () => {
    if (!selectedCharacter) {
        dom.selStatus.textContent = "請先選擇一名角色！";
        return;
    }
    Sound.play("click");
    startRun();
});

/* 遊戲內按鈕 */
$("pauseButton").addEventListener("click", togglePause);
dom.soundBtn.addEventListener("click", toggleMute);
dom.pauseSoundBtn.addEventListener("click", toggleMute);
$("resumeButton").addEventListener("click", togglePause);
$("pauseRestartButton").addEventListener("click", restartRun);
$("pauseHomeButton").addEventListener("click", exitToHome);
$("deathRestartButton").addEventListener("click", restartRun);
$("deathHomeButton").addEventListener("click", exitToHome);

/* ============================== 啟動 ============================== */
dom.startBtn.disabled = true;
updateSoundButtons();
setScene("home");
requestAnimationFrame(frame);
