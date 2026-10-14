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

/* 幸運：每張升級卡片獨立判定，觸發時效果 ×2（技能 / 道具 / 武器一次升兩級） */
const LUCK_BASE = 0.10;        // 基礎幸運機率
const LUCK_PER_CHARM = 0.05;   // 幸運符每級增加
const LUCK_CHEST_BONUS = 0.35; // Boss 寶箱額外加成
const LUCK_MAX = 0.75;

/* 吸血平衡：每級 1% 傷害轉生命，且每秒回復量有上限（最大生命的 0.6% / 級） */
const LIFESTEAL_RATE = 0.01;
const LIFESTEAL_CAP = 0.006;

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
      text: (lv) => `受到的傷害 -${7 * lv}%` },
    { id: "lifesteal", kind: "item", max: 5, name: "吸血戒指", icon: "❦",
      text: (lv) => `造成傷害的 ${Math.round(LIFESTEAL_RATE * 100 * lv)}% 轉為生命<br>每秒最多回復 ${(LIFESTEAL_CAP * 100 * lv).toFixed(1)}% 最大生命` },
    { id: "boots", kind: "item", max: 5, name: "疾風長靴", icon: "➶",
      text: (lv) => `移動速度 +${6 * lv}%` },
    { id: "luck", kind: "item", max: 5, name: "幸運符", icon: "☘",
      text: (lv) => `升級卡片觸發「幸運」機率 ${Math.round((LUCK_BASE + LUCK_PER_CHARM * lv) * 100)}%（幸運卡效果 ×2）` },
    { id: "thorns", kind: "item", max: 5, name: "荊棘之環", icon: "✺",
      text: (lv) => `被碰撞時反彈 (5 + 波次) × ${lv} 點傷害給敵人` },
    { id: "aura", kind: "item", max: 5, name: "聖光符文", icon: "☼",
      text: (lv) => `每 0.8 秒對半徑 ${80 + 14 * lv} 內的敵人造成 ${Math.round((0.2 + 0.12 * lv) * 100)}% 光傷害` },

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
            G.effects.push({ kind: "shards", x: p.x, y: p.y, r, n: 14, t: 0.5, max: 0.5, color: "#bfeaff", rot: Math.random() * 6 });
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
            G.effects.push({ kind: "cracks", x: p.x, y: p.y, r, n: 9, t: 0.8, max: 0.8, seed: Math.random() * 1000 });
            addParticles(p.x, p.y, 18, "#8a6a3e", 380, 7);
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
                G.effects.push({ kind: "warn", x, y, r: 95, t: delay, max: delay, meteor: true });
                G.timers.push({ t: delay, fn: () => {
                    if (!G || G.dead) return;
                    G.effects.push({ kind: "cracks", x, y, r: 95, n: 6, t: 0.6, max: 0.6, seed: Math.random() * 1000 });
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
            G.effects.push({ kind: "shards", x: p.x, y: p.y, r: 420, n: 28, t: 0.7, max: 0.7, color: "#e4f7ff", rot: Math.random() * 6 });
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

/* =====================================================================
   圖示：技能使用自繪 SVG（漸層定義在 index.html 的 #iconDefs），其他用符號徽章
===================================================================== */
const SKILL_SVG = {
    fireball:
        '<path d="M4 60 L28 24 L46 40 Z" fill="url(#gFire)" opacity=".35"/>' +
        '<path d="M12 56 L31 30 L41 38 Z" fill="url(#gFire)" opacity=".7"/>' +
        '<circle cx="40" cy="24" r="15" fill="url(#gFire)"/>' +
        '<circle cx="43" cy="21" r="7" fill="#fff6c8"/>',
    frostnova:
        '<g stroke="url(#gIce)" stroke-width="4.5" stroke-linecap="round" fill="none">' +
        [0, 60, 120].map((r) => `<g transform="rotate(${r} 32 32)"><path d="M32 5V59M32 14l-7-7M32 14l7-7M32 50l-7 7M32 50l7 7"/></g>`).join("") +
        '</g><path d="M32 22l9 5v10l-9 5-9-5V27z" fill="#e8f8ff"/>',
    lightning:
        '<path d="M39 3 L13 37 H29 L23 61 L51 24 H34 Z" fill="url(#gBolt)" stroke="#fffbe0" stroke-width="2" stroke-linejoin="round"/>',
    orbit:
        '<circle cx="32" cy="32" r="21" fill="none" stroke="#9fc4ff" stroke-width="2" stroke-dasharray="5 6" opacity=".7"/>' +
        '<circle cx="32" cy="32" r="8" fill="url(#gArcane)"/>' +
        [0, 120, 240].map((r) => `<path transform="rotate(${r} 32 32)" d="M32 1 L38 11 L32 21 L26 11 Z" fill="url(#gSteel)" stroke="#fff" stroke-width="1"/>`).join(""),
    poison:
        '<circle cx="21" cy="38" r="13" fill="url(#gPoison)"/><circle cx="36" cy="30" r="15" fill="url(#gPoison)"/>' +
        '<circle cx="46" cy="41" r="11" fill="url(#gPoison)"/>' +
        '<circle cx="30" cy="31" r="3.5" fill="#132a0c"/><circle cx="41" cy="31" r="3.5" fill="#132a0c"/>' +
        '<path d="M30 40 h11" stroke="#132a0c" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="16" cy="16" r="4" fill="#c8ff9a"/><circle cx="50" cy="12" r="3" fill="#c8ff9a"/><circle cx="26" cy="8" r="2" fill="#c8ff9a"/>',
    boomerang:
        '<path d="M8 40 A26 26 0 0 1 40 8" fill="none" stroke="#dfe9ff" stroke-width="2" opacity=".45"/>' +
        '<path d="M14 54 A30 30 0 0 1 54 14" fill="none" stroke="#dfe9ff" stroke-width="2" opacity=".25"/>' +
        '<path d="M40 16 L20 48" stroke="#9a7444" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M38 19 C26 8 44 2 54 8 C50 16 48 24 38 19 Z" fill="url(#gSteel)" stroke="#fff" stroke-width="1"/>' +
        '<path d="M38 19 C42 32 54 26 56 18 C50 16 44 14 38 19 Z" fill="url(#gSteel)" opacity=".8"/>',
    quake:
        '<path d="M2 44 H62 V62 H2 Z" fill="url(#gEarth)"/>' +
        '<path d="M32 44 L27 50 L34 55 L29 62 M32 44 L40 52 L37 58" stroke="#1d1208" stroke-width="2.5" fill="none"/>' +
        '<path d="M10 36 l6-8 6 6 -4 6z M44 30 l8-6 4 8 -6 4z M27 20 l5-6 5 5 -5 5z" fill="#c9a56a" stroke="#6b4a22"/>' +
        '<path d="M6 40 Q32 24 58 40" stroke="#ffe0a0" stroke-width="2" fill="none" opacity=".6"/>',
    shield:
        '<path d="M32 4 L56 15 V33 C56 47 45 56 32 60 C19 56 8 47 8 33 V15 Z" fill="url(#gArcane)" stroke="#d6f0ff" stroke-width="2.5"/>' +
        '<path d="M32 16 L44 23 V37 L32 44 L20 37 V23 Z" fill="none" stroke="#ffffff" stroke-width="2.5" opacity=".85"/>' +
        '<circle cx="32" cy="30" r="4" fill="#fff"/>'
};

/* 每種技能 / 類別的主題色（卡片、徽章、晶片共用） */
const SKILL_COLOR = {
    fireball: "#ff8a3a", frostnova: "#7fd4ff", lightning: "#ffe04a", orbit: "#9fb8ff",
    poison: "#8be05a", boomerang: "#d8e2ff", quake: "#d9a95f", shield: "#7ecbff"
};
const KIND_INFO = {
    stat:   { label: "屬性強化", color: "#c6c3d6" },
    item:   { label: "被動道具", color: "#6fe0b0" },
    weapon: { label: "武器精煉", color: "#ff9d4a" },
    evolve: { label: "武器進化", color: "#ffb23e" },
    skill:  { label: "主動技能", color: "#5fb4ff" },
    fusion: { label: "終極融合", color: "#ffb23e" },
    heal:   { label: "消耗品",   color: "#ff7a8a" }
};

function svgIcon(inner) {
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
}

/* 回傳 { color, html }，html 為徽章內容 */
function iconFor(kind, id) {
    if (kind === "skill" && SKILL_SVG[id]) {
        return { color: SKILL_COLOR[id], html: svgIcon(SKILL_SVG[id]) };
    }
    if (kind === "fusion" || kind === "ult") {
        const f = FUSIONS.find((x) => x.id === id || "fuse_" + x.id === id);
        if (f) {
            return {
                color: "#ffb23e",
                html: svgIcon(
                    `<g transform="translate(-2 -2) scale(.62)" opacity=".95">${SKILL_SVG[f.a]}</g>` +
                    `<g transform="translate(26 26) scale(.62)">${SKILL_SVG[f.b]}</g>` +
                    '<path d="M32 18 l3 9 9 3 -9 3 -3 9 -3-9 -9-3 9-3z" fill="#fff4c8"/>'
                )
            };
        }
    }
    const def = UPGRADES.find((u) => u.id === id);
    const info = KIND_INFO[kind] || KIND_INFO.stat;
    return { color: info.color, html: `<span class="ico-glyph">${def ? def.icon : "?"}</span>` };
}

function badgeHTML(kind, id, extraClass) {
    const ic = iconFor(kind, id);
    return `<span class="ico ${extraClass || ""}" style="--ic:${ic.color}"><span class="ico-in">${ic.html}</span></span>`;
}

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
    G.effects.push({ kind: "burst", x, y, r: radius, t: 0.32, max: 0.32, color });
    G.effects.push({ kind: "ring", x, y, r0: radius * 0.3, r1: radius, t: 0.35, max: 0.35, color, width: 7 });
    G.effects.push({ kind: "ring", x, y, r0: radius * 0.1, r1: radius * 1.15, t: 0.5, max: 0.5, color: "#ffffff", width: 2 });
    addParticles(x, y, 16, color, 320, 5, true);
    addParticles(x, y, 6, "#ffffff", 200, 3, true);
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
    G.effects.push({ kind: "strike", x, y, t: 0.35, max: 0.35, color, seed: Math.random() * 1000 });
    explode(x, y, 60, mult, { color: "#bfe8ff", kb: 80 });
    G.shake = Math.max(G.shake, 3);
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
            s.trail = (s.trail || 0) - dt;
            if (s.trail <= 0) {
                s.trail = 0.025;
                G.particles.push({ x: s.x + rand(-4, 4), y: s.y + rand(-4, 4), vx: -s.vx * 0.15 + rand(-30, 30), vy: -s.vy * 0.15 + rand(-30, 30),
                    t: 0.35, max: 0.35, color: Math.random() < 0.5 ? "#ffcf5a" : "#ff6a2a", size: rand(5, 9), glow: true });
            }
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
            s.ghosts = s.ghosts || [];
            s.ghosts.unshift({ x: s.x, y: s.y, spin: s.spin });
            if (s.ghosts.length > 5) s.ghosts.pop();
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
function glowCircle(x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function drawSkillGround() {
    const p = G.player;
    G.zones.forEach((z) => {
        const a = clamp(z.t / z.max, 0, 1);
        const fade = Math.min(1, a * 3, (1 - a) * 8 + 0.2);
        const rr = z.r * (0.94 + 0.06 * Math.sin(G.anim * 4 + z.x));
        ctx.save();
        const g = ctx.createRadialGradient(z.x, z.y, rr * 0.1, z.x, z.y, rr);
        g.addColorStop(0, "rgba(150, 255, 90, 0.55)");
        g.addColorStop(0.6, "rgba(70, 170, 40, 0.35)");
        g.addColorStop(1, "rgba(40, 110, 20, 0)");
        ctx.globalAlpha = fade;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(z.x, z.y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#b8ff8a";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = G.anim * 20;
        ctx.globalAlpha = 0.7 * fade;
        ctx.stroke();
        ctx.setLineDash([]);
        // 冒泡
        for (let i = 0; i < 7; i++) {
            const h = hash2(i + 1, Math.floor(z.x)) * 6.28;
            const life = (G.anim * 0.8 + i / 7) % 1;
            const bx = z.x + Math.cos(h) * rr * 0.6 * hash2(i, 7);
            const by = z.y + Math.sin(h) * rr * 0.5 - life * 40;
            ctx.globalAlpha = (1 - life) * 0.8 * fade;
            ctx.strokeStyle = "#d8ffb0";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(bx, by, 3 + life * 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    });
    const pl = G.ults.plague;
    if (pl) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        glowCircle(p.x, p.y, pl.radius, "rgba(140, 255, 70, 0.32)", 0.8 + 0.2 * Math.sin(G.anim * 5));
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = "#c2ff7a";
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -G.anim * 30;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pl.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
}

/* 技能繪製：空中層（投射物 / 飛刃 / 護盾） */
function drawBlade(size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.5, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.5, 0);
    ctx.closePath();
    ctx.fill();
}

function drawAxeShape() {
    ctx.beginPath();
    ctx.moveTo(-20, -4); ctx.lineTo(0, -22); ctx.lineTo(20, -4);
    ctx.lineTo(4, 0); ctx.lineTo(20, 4); ctx.lineTo(0, 22);
    ctx.lineTo(-20, 4); ctx.closePath();
}

function drawSkillAir() {
    const p = G.player;

    G.skillShots.forEach((s) => {
        ctx.save();
        if (s.kind === "fire") {
            ctx.globalCompositeOperation = "lighter";
            glowCircle(s.x, s.y, 34, "rgba(255, 120, 40, 0.9)", 0.9);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
            const ang = Math.atan2(s.vy, s.vx);
            ctx.translate(s.x, s.y);
            ctx.rotate(ang);
            ctx.fillStyle = "#ff7a2a";
            ctx.beginPath();
            ctx.moveTo(-30, 0);
            ctx.quadraticCurveTo(-8, -13, 4, -12);
            ctx.arc(4, 0, 12, -Math.PI / 2, Math.PI / 2);
            ctx.quadraticCurveTo(-8, 13, -30, 0);
            ctx.fill();
            ctx.fillStyle = "#ffd36a";
            ctx.beginPath();
            ctx.arc(4, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fffbe6";
            ctx.beginPath();
            ctx.arc(6, 0, 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 殘影
            (s.ghosts || []).forEach((gh, i) => {
                ctx.save();
                ctx.translate(gh.x, gh.y);
                ctx.rotate(gh.spin);
                ctx.globalAlpha = 0.28 * (1 - i / 5);
                ctx.fillStyle = "#9fc4ff";
                drawAxeShape();
                ctx.fill();
                ctx.restore();
            });
            ctx.translate(s.x, s.y);
            ctx.rotate(s.spin);
            ctx.globalCompositeOperation = "lighter";
            glowCircle(0, 0, 36, "rgba(160, 200, 255, 0.5)", 0.8);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#eef4ff";
            ctx.strokeStyle = "#6f7fa8";
            ctx.lineWidth = 2;
            drawAxeShape();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    });

    [G.skills.orbit, G.ults.bladestorm].forEach((s) => {
        if (!s || !s.count) return;
        const big = s === G.ults.bladestorm;
        const size = s.bladeSize || 14;
        // 刀光軌跡
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let i = 0; i < s.count; i++) {
            const a = s.angle + (i * Math.PI * 2) / s.count;
            for (let k = 0; k < 4; k++) {
                ctx.globalAlpha = 0.22 - k * 0.05;
                ctx.strokeStyle = big ? "#ffd27a" : "#9fc4ff";
                ctx.lineWidth = size * (0.9 - k * 0.18);
                ctx.beginPath();
                ctx.arc(p.x, p.y, s.radius, a - 0.12 * (k + 1), a - 0.12 * k);
                ctx.stroke();
            }
        }
        ctx.restore();
        for (let i = 0; i < s.count; i++) {
            const a = s.angle + (i * Math.PI * 2) / s.count;
            const bx = p.x + Math.cos(a) * s.radius;
            const by = p.y + Math.sin(a) * s.radius;
            ctx.save();
            ctx.translate(bx, by);
            ctx.globalCompositeOperation = "lighter";
            glowCircle(0, 0, size * 1.8, big ? "rgba(255, 190, 90, 0.7)" : "rgba(130, 180, 255, 0.7)", 0.9);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
            ctx.rotate(a + Math.PI / 2);
            drawBlade(size, big ? "#fff0c8" : "#eef4ff");
            drawBlade(size * 0.5, big ? "#ffb23e" : "#7fa8ff");
            ctx.restore();
        }
    });

    [[G.skills.shield, "#7ecbff"], [G.ults.titan, "#ffd27a"]].forEach((pair) => {
        const s = pair[0];
        if (!s || s.charges <= 0) return;
        ctx.save();
        ctx.translate(p.x, p.y - 6);
        ctx.globalCompositeOperation = "lighter";
        glowCircle(0, 0, 70, pair[1] === "#7ecbff" ? "rgba(90, 170, 255, 0.25)" : "rgba(255, 200, 90, 0.25)", 0.7 + 0.2 * Math.sin(G.anim * 4));
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = pair[1];
        for (let i = 0; i < s.charges; i++) {
            const r = 46 + i * 9;
            ctx.save();
            ctx.rotate(G.anim * (i % 2 ? -0.8 : 0.8));
            ctx.globalAlpha = 0.65 + 0.2 * Math.sin(G.anim * 5 + i);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let k = 0; k <= 6; k++) {
                const a = (k / 6) * Math.PI * 2;
                if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    });
}

/* ============================== 存檔 ============================== */
function defaultSave() {
    return {
        bestTime: 0, bestKills: 0, bestLevel: 1, bestWave: 1, bestBoss: 0, runs: 0,
        bestScore: 0, bestChar: "", playerName: "冒險者",
        muted: false, volume: 0.8, shake: true, numbers: true
    };
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
            this.applyVolume();
            this.master.connect(this.ctx.destination);
        } catch (e) { this.ctx = null; }
    },

    applyVolume() {
        if (this.master) this.master.gain.value = 0.4 * clamp(save.volume, 0, 1);
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
            case "lucky":   [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.16, "sine", 0.1, 0, i * 0.05)); break;
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
    pauseSkills: $("pauseSkills"),
    joy: $("joystick"),
    joyKnob: $("joyKnob"),
    tip: $("skillTip"),
    settings: $("settingsModal"),
    volume: $("setVolume"),
    volumeVal: $("setVolumeVal"),
    mute: $("setMute"),
    fullscreen: $("setFullscreen"),
    shake: $("setShake"),
    numbers: $("setNumbers"),
    playerName: $("setName"),
    board: $("boardModal"),
    boardList: $("boardList"),
    boardMe: $("boardMe")
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
            facingX: 1, moving: false, auraTimer: 0,
            lsBudget: 0
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
    hideTip();
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
    G.score = runScore(G.time, G.kills, G.player.level, G.bossKills, G.wave);
    G.rankBefore = playerRank();
    if (G.score > save.bestScore) {
        save.bestScore = G.score;
        save.bestChar = G.character.id;
        save.bestRun = { time: G.time, wave: G.wave, kills: G.kills };
        nr.score = true;
    }
    G.rankAfter = playerRank();
    save.runs++;
    G.newRecords = nr;
    writeSave();
}

function refreshRecords() {
    const rec = (label, val) => `<div class="rec"><span>${label}</span><b>${val}</b></div>`;
    dom.homeRecords.innerHTML =
        rec("排行榜", "#" + playerRank()) +
        rec("最高積分", save.bestScore.toLocaleString()) +
        rec("最長存活", fmtTime(save.bestTime)) +
        rec("最高波次", save.bestWave) +
        rec("最多擊殺", save.bestKills) +
        rec("遊玩次數", save.runs);
}

/* ============================== 虛擬排行榜 ==============================
   排行榜資料為固定種子產生的虛構玩家（非真實資料），只顯示第 1~100 名。
   玩家初始積分為 0，排在第 100 名；最佳積分超過誰就往上爬。 */
function runScore(time, kills, level, bosses, wave) {
    return Math.round(time * 8 + kills * 6 + level * 40 + bosses * 600 + (wave - 1) * 120);
}

const FAKE_BOARD = (() => {
    let seed = 20261014;
    const rnd = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const pre = ["暗影", "烈焰", "霜月", "鐵血", "孤狼", "星辰", "赤焰", "幽冥", "蒼穹", "雷鳴", "黑曜", "銀翼", "血薔薇", "夜鴉", "龍息", "聖騎", "無名", "狂戰"];
    const suf = ["劍聖", "獵手", "行者", "騎士", "遊俠", "之刃", "守望", "旅人", "君王", "槍神", "魔弓", "勇者", "殺手", "少女", "大叔", "喵"];
    const eng = ["Shadow", "Nova", "Kael", "Ryu", "Lumi", "Vex", "Aria", "Zed", "Mira", "Orion", "Kira", "Blaze", "Frost", "Echo", "Raven", "Jin"];
    const chars = ["warrior", "lancer", "archer"];
    const used = new Set();
    const list = [];
    for (let r = 1; r <= 99; r++) {
        let name;
        do {
            const k = rnd();
            if (k < 0.45) name = pick(pre) + pick(suf);
            else if (k < 0.8) name = pick(eng) + (rnd() < 0.5 ? "_" : "") + Math.floor(rnd() * 999);
            else name = pick(pre) + "の" + pick(eng);
        } while (used.has(name));
        used.add(name);
        const time = 50 * Math.pow(2700 / 50, (99 - r) / 98) * (0.94 + rnd() * 0.12);
        const wave = Math.floor(time / WAVE_DURATION) + 1;
        const level = Math.max(2, Math.round((2 + time / 20) * (0.9 + rnd() * 0.2)));
        const kills = Math.round(time * (1.1 + time / 700) * (0.85 + rnd() * 0.3));
        const bosses = Math.max(0, Math.floor(wave / BOSS_EVERY) - (rnd() < 0.3 ? 1 : 0));
        list.push({ name, char: pick(chars), time, wave, kills, score: runScore(time, kills, level, bosses, wave) });
    }
    list.sort((a, b) => b.score - a.score);
    return list;
})();

function playerRank() {
    if (save.bestScore <= 0) return 100;
    const above = FAKE_BOARD.filter((f) => f.score >= save.bestScore).length;
    return Math.min(100, above + 1);
}

const CHAR_LABEL = { warrior: "戰士", lancer: "槍兵", archer: "弓箭手" };

function renderBoard() {
    const rank = playerRank();
    const me = {
        me: true, name: save.playerName || "冒險者", char: save.bestChar,
        time: save.bestRun ? save.bestRun.time : 0,
        wave: save.bestRun ? save.bestRun.wave : 0,
        kills: save.bestRun ? save.bestRun.kills : 0,
        score: save.bestScore
    };
    const rows = FAKE_BOARD.slice(0, rank - 1).concat([me], FAKE_BOARD.slice(rank - 1, 99)).slice(0, 100);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    dom.boardList.innerHTML = rows.map((r, i) => {
        const n = i + 1;
        const medal = n <= 3 ? ` top top${n}` : "";
        return `<li class="board-row${medal}${r.me ? " me" : ""}">` +
            `<span class="b-rank">${n <= 3 ? ["🥇", "🥈", "🥉"][n - 1] : n}</span>` +
            `<span class="b-name">${esc(r.name)}${r.me ? ' <em>YOU</em>' : ""}</span>` +
            `<span class="b-char">${CHAR_LABEL[r.char] || "—"}</span>` +
            `<span class="b-time">${r.time ? fmtTime(r.time) : "--:--"}</span>` +
            `<span class="b-wave">${r.wave ? "W" + r.wave : "—"}</span>` +
            `<span class="b-score">${r.score.toLocaleString()}</span></li>`;
    }).join("");
    const next = rank > 1 ? FAKE_BOARD[rank - 2] : null;
    dom.boardMe.innerHTML =
        `<div><small>你的排名</small><b>#${rank}</b></div>` +
        `<div><small>最佳積分</small><b>${save.bestScore.toLocaleString()}</b></div>` +
        `<div><small>${next ? "距離上一名" : "榮耀"}</small><b>${next ? "+" + (next.score - save.bestScore + 1).toLocaleString() : "第一名！"}</b></div>`;
}

function openBoard() {
    renderBoard();
    openModal(dom.board);
    // 自己那一列是 sticky，因此依名次計算捲動位置
    requestAnimationFrame(() => {
        const first = dom.boardList.firstElementChild;
        const rowH = first ? first.offsetHeight : 38;
        dom.boardList.scrollTop = (playerRank() - 1) * rowH - dom.boardList.clientHeight / 2 + rowH / 2;
    });
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

function addParticles(x, y, n, color, speed, size, glow) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rand(0.3, 1) * speed;
        G.particles.push({
            x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            t: rand(0.25, 0.55), max: 0.55, color, size: size || 4, glow: !!glow
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

    // 吸血：比例降低，且受每秒上限（lsBudget）限制，避免大範圍技能瞬間回滿
    const ls = itemLv("lifesteal");
    if (ls > 0 && !opts.silent && p.lsBudget > 0) {
        const amount = Math.min(hit.dmg * LIFESTEAL_RATE * ls, p.lsBudget);
        p.lsBudget -= amount;
        healPlayer(amount, false);
    }

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
        setBanner("BOSS 擊破！", "寶藏強化：幸運機率大幅提升", "#ffb23e");
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

function luckChance(chest) {
    return Math.min(LUCK_MAX, LUCK_BASE + LUCK_PER_CHARM * itemLv("luck") + (chest ? LUCK_CHEST_BONUS : 0));
}

/* 只有「效果真的能翻倍」的卡片才會觸發幸運（例如 Lv.4 技能再升兩級會超過上限，就不判定） */
function canBeLucky(def) {
    switch (def.kind) {
        case "stat":
        case "heal":   return true;
        case "item":   return itemLv(def.id) + 2 <= def.max;
        case "skill":  return skillLv(def.id) + 2 <= SKILL_MAX;
        case "weapon": return G.weaponLevel + 2 <= 4;
        default:       return false;   // 進化、融合不受幸運影響
    }
}

function buildChoices(chest) {
    const avail = UPGRADES.filter(isAvailable);

    // 武器進化、技能融合：條件達成時優先出現
    const forced = avail.filter((u) => u.kind === "evolve" || u.kind === "fusion");
    const picks = forced.slice(0, 3).map((def) => ({ def, lucky: false }));

    const pool = avail.filter((u) => u.kind !== "evolve" && u.kind !== "fusion");
    const chance = luckChance(chest);
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
        picks.push({ def, lucky: canBeLucky(def) && Math.random() < chance });
    }
    return picks;
}

function upgradeGain(c) { return c.lucky ? 2 : 1; }

function cardText(c) {
    const d = c.def;
    const m = upgradeGain(c);
    const ch = G.character;
    switch (d.kind) {
        case "stat": return d.text(m);
        case "item": {
            const cur = itemLv(d.id);
            const next = Math.min(d.max, cur + m);
            return `${d.text(next)}<br><span class="lv-step">Lv.${cur} → Lv.${next}</span>`;
        }
        case "weapon": {
            const next = Math.min(4, G.weaponLevel + m);
            return `${ch.weaponUp}<br><span class="lv-step">Lv.${G.weaponLevel} → Lv.${next}</span>`;
        }
        case "evolve": return `${ch.evoName}<br>${ch.evoText}`;
        case "skill": {
            const sk = SKILLS[d.id];
            const cur = skillLv(d.id);
            const next = Math.min(SKILL_MAX, cur + m);
            const partners = FUSIONS
                .filter((f) => f.a === d.id || f.b === d.id)
                .map((f) => `${SKILLS[f.a === d.id ? f.b : f.a].name} → ${f.name}`)
                .join("、");
            return sk.text(next) +
                (cur === 0
                    ? `<br><span class="lv-step">【習得新技能】${next > 1 ? " 直接 Lv." + next : ""}</span>`
                    : `<br><span class="lv-step">Lv.${cur} → Lv.${next}${next >= SKILL_MAX ? "（滿級）" : ""}</span>`) +
                `<br><small>融合：${partners}</small>`;
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
    if (c.def.kind === "weapon") return G.character.weaponName;
    return c.def.name;
}

function openUpgrade() {
    if (!G || G.choosing || G.queue.length === 0) return;
    const entry = G.queue.shift();
    G.chestChoice = entry.chest;
    G.choices = buildChoices(entry.chest);
    G.choosing = true;
    clearKeys();
    hideTip();

    dom.upgradeTitle.textContent = entry.fusion ? "FUSION" : (entry.chest ? "BOSS 寶藏" : "LEVEL UP");
    dom.upgradeSubtitle.textContent = entry.fusion
        ? "兩項技能已滿級 — 選擇融合卡即可獲得終極技能（選別張則稍後升級時再次出現）"
        : (entry.chest
            ? `擊敗 Boss 的獎勵 — 幸運機率提升至 ${Math.round(luckChance(true) * 100)}%`
            : `等級 ${G.player.level} — 選擇一項能力（幸運機率 ${Math.round(luckChance(false) * 100)}%）`);

    renderUpgradeCards();
    dom.upgradeOverlay.classList.remove("hidden");
    if (G.choices.some((c) => c.lucky)) setTimeout(() => Sound.play("lucky"), 250);
}

function renderUpgradeCards() {
    dom.upgradeCards.replaceChildren();
    G.choices.forEach((c, index) => {
        const d = c.def;
        const info = KIND_INFO[d.kind] || KIND_INFO.stat;
        const ic = iconFor(d.kind, d.kind === "fusion" ? d.fusion.id : d.id);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "upgrade-card k-" + d.kind + (c.lucky ? " lucky" : "");
        card.style.setProperty("--card-index", index);
        card.style.setProperty("--rc", ic.color || info.color);
        card.innerHTML =
            `<span class="upgrade-number">${index + 1}</span>` +
            `<span class="upgrade-kind">${info.label}</span>` +
            (c.lucky ? `<span class="lucky-badge">☘ 幸運！${d.kind === "stat" || d.kind === "heal" ? "效果 ×2" : "一次升兩級"}</span>` : "") +
            badgeHTML(d.kind, d.kind === "fusion" ? d.fusion.id : d.id, "big") +
            `<span class="upgrade-card-title"></span>` +
            `<span class="upgrade-card-description"></span>` +
            `<span class="upgrade-card-action">選擇 ›</span>`;
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
    const m = upgradeGain(c);

    switch (d.kind) {
        case "stat":
            d.apply(p, m);
            break;
        case "item":
            G.items[d.id] = Math.min(d.max, itemLv(d.id) + m);
            break;
        case "weapon":
            G.weaponLevel = Math.min(4, G.weaponLevel + m);
            break;
        case "evolve":
            G.evolved = true;
            setBanner("武器進化！", G.character.evoName, "#ffb23e");
            G.effects.push({ kind: "ring", x: p.x, y: p.y, r0: 20, r1: 320, t: 0.9, max: 0.9, color: "#ffb23e", width: 8 });
            G.effects.push({ kind: "pillar", t: 1.2, max: 1.2, color: "#ffb23e" });
            Sound.play("evolve");
            break;
        case "skill": {
            const cur = skillLv(d.id);
            const nl = Math.min(SKILL_MAX, cur + m);
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
            G.effects.push({ kind: "pillar", t: 1.2, max: 1.2, color: "#ffb23e" });
            break;
        case "heal":
            healPlayer(p.maxHp * 0.35 * m, true);
            Sound.play("heal");
            break;
        default:
            break;
    }

    if (c.lucky) {
        addNumber(p.x, p.y - 90, "☘ LUCKY ×2", "lucky");
        G.effects.push({ kind: "pillar", t: 1, max: 1, color: "#7dffb0" });
        addParticles(p.x, p.y, 26, "#9dffc0", 300, 5, true);
        Sound.play("lucky");
    } else if (d.kind !== "evolve" && d.kind !== "fusion") {
        Sound.play("select");
    }

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
    const ls = itemLv("lifesteal");
    if (ls > 0) {
        const cap = p.maxHp * LIFESTEAL_CAP * ls;      // 每秒可吸取的上限
        p.lsBudget = Math.min(cap, p.lsBudget + cap * dt);
    }
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
    if (G.particles.length > 450) G.particles.splice(0, G.particles.length - 450);
    if (G.effects.length > 160) G.effects.splice(0, G.effects.length - 160);

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
        `<span>本局積分${tag("score")}</span><b>${G.score.toLocaleString()}</b>` +
        `<span>排行榜名次</span><b>#${G.rankAfter}${G.rankAfter < G.rankBefore ? ` <i class="up">▲${G.rankBefore - G.rankAfter}</i>` : ""}</b>`;
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
            const rr = f.r0 + (f.r1 - f.r0) * (1 - Math.pow(1 - prog, 2));
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha * 0.35;
            ctx.strokeStyle = f.color;
            ctx.lineWidth = (f.width || 3) * 3;
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha;
            ctx.lineWidth = f.width || 3;
            ctx.stroke();
        } else if (f.kind === "burst") {
            // 爆炸閃光：白色核心 → 技能色 → 透明
            const rr = f.r * (0.5 + 0.6 * prog);
            const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
            g.addColorStop(0, "rgba(255,255,255,0.95)");
            g.addColorStop(0.35, f.color);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha * 0.85;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
            ctx.fill();
        } else if (f.kind === "shards") {
            // 冰刺向外爆開
            ctx.translate(f.x, f.y);
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha;
            ctx.fillStyle = f.color;
            const ease = 1 - Math.pow(1 - prog, 3);
            for (let i = 0; i < f.n; i++) {
                const a = f.rot + (i / f.n) * Math.PI * 2;
                const d = f.r * (0.25 + 0.75 * ease) * (0.8 + 0.2 * hash2(i, 3));
                const len = 26 + 22 * hash2(i, 9);
                ctx.save();
                ctx.rotate(a);
                ctx.beginPath();
                ctx.moveTo(d + len, 0);
                ctx.lineTo(d, -6);
                ctx.lineTo(d - len * 0.4, 0);
                ctx.lineTo(d, 6);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        } else if (f.kind === "cracks") {
            // 大地裂痕
            ctx.translate(f.x, f.y);
            ctx.globalAlpha = Math.min(1, alpha * 1.6);
            ctx.lineCap = "round";
            const grow = Math.min(1, prog * 4);
            for (let i = 0; i < f.n; i++) {
                const a = (i / f.n) * Math.PI * 2 + hash2(i, Math.floor(f.seed)) * 0.6;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                let x = 0, y = 0;
                const steps = 4;
                for (let k = 1; k <= steps; k++) {
                    const d = f.r * grow * (k / steps);
                    const j = (hash2(i * 7 + k, Math.floor(f.seed)) - 0.5) * 0.7;
                    x = Math.cos(a + j) * d;
                    y = Math.sin(a + j) * d;
                    ctx.lineTo(x, y);
                }
                ctx.strokeStyle = "#1a1008";
                ctx.lineWidth = 6;
                ctx.stroke();
                ctx.strokeStyle = "#ffb060";
                ctx.lineWidth = 2;
                ctx.globalCompositeOperation = "lighter";
                ctx.stroke();
                ctx.globalCompositeOperation = "source-over";
            }
        } else if (f.kind === "pillar") {
            // 升級 / 幸運 / 進化：光柱
            const w = 70 * (1 - prog * 0.5);
            const g = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0);
            g.addColorStop(0, "rgba(0,0,0,0)");
            g.addColorStop(0.5, f.color);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = g;
            ctx.fillRect(p.x - w, p.y - 900, w * 2, 940);
            ctx.globalAlpha = alpha;
            for (let i = 0; i < 10; i++) {
                const a = i / 10 * Math.PI * 2 + G.anim * 2;
                const rr = 40 + prog * 80;
                ctx.fillStyle = f.color;
                ctx.beginPath();
                ctx.arc(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.4 - prog * 60, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (f.kind === "warn") {
            ctx.globalAlpha = 0.3 + prog * 0.5;
            ctx.fillStyle = "rgba(255, 90, 40, 0.25)";
            ctx.strokeStyle = "#ff6a2a";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * prog), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (f.meteor) {
                // 從天而降的隕石
                const mx = f.x + (1 - prog) * 260;
                const my = f.y - (1 - prog) * 520;
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = "lighter";
                const tg = ctx.createLinearGradient(mx, my, mx + 120, my - 240);
                tg.addColorStop(0, "rgba(255, 170, 60, 0.9)");
                tg.addColorStop(1, "rgba(255, 60, 20, 0)");
                ctx.strokeStyle = tg;
                ctx.lineWidth = 22;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(mx + 120, my - 240);
                ctx.stroke();
                glowCircle(mx, my, 46, "rgba(255, 150, 60, 0.9)", 1);
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = 1;
                ctx.fillStyle = "#ffe6a0";
                ctx.beginPath();
                ctx.arc(mx, my, 14, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (f.kind === "strike") {
            // 落雷：外層光暈 + 白色核心 + 分岔
            const pts = [];
            const sd = f.seed || 0;
            let lx = f.x;
            for (let i = 0; i <= 7; i++) {
                const yy = f.y - 560 + (560 / 7) * i;
                lx = i === 7 ? f.x : f.x + (hash2(i, Math.floor(sd + G.anim * 30)) - 0.5) * 50;
                pts.push([lx, yy]);
            }
            const path = () => {
                ctx.beginPath();
                pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
            };
            ctx.globalCompositeOperation = "lighter";
            ctx.lineJoin = "round";
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = "#5ab8ff";
            ctx.lineWidth = 16;
            path(); ctx.stroke();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = f.color || "#e6f4ff";
            ctx.lineWidth = 6;
            path(); ctx.stroke();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            path(); ctx.stroke();
            // 分岔
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#bfe8ff";
            [2, 4].forEach((k) => {
                const q = pts[k];
                const dir = hash2(k, Math.floor(sd)) < 0.5 ? -1 : 1;
                ctx.beginPath();
                ctx.moveTo(q[0], q[1]);
                ctx.lineTo(q[0] + dir * 40, q[1] + 40);
                ctx.lineTo(q[0] + dir * 55, q[1] + 90);
                ctx.stroke();
            });
            glowCircle(f.x, f.y, 70, "rgba(170, 220, 255, 0.9)", alpha);
        } else if (f.kind === "levelup") {
            ctx.globalCompositeOperation = "lighter";
            glowCircle(p.x, p.y, 60 + prog * 120, "rgba(255, 215, 0, 0.5)", alpha * 0.8);
            ctx.globalCompositeOperation = "source-over";
            // 旋轉光芒
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(prog * 2);
            ctx.globalAlpha = alpha * 0.6;
            ctx.fillStyle = "#ffe680";
            for (let i = 0; i < 12; i++) {
                ctx.rotate(Math.PI / 6);
                ctx.beginPath();
                ctx.moveTo(0, -20);
                ctx.lineTo(6, -60 - prog * 90);
                ctx.lineTo(-6, -60 - prog * 90);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
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
        if (q.glow) return;
        ctx.globalAlpha = clamp(q.t / q.max, 0, 1);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    });
    // 發光粒子：疊加混色
    ctx.globalCompositeOperation = "lighter";
    G.particles.forEach((q) => {
        if (!q.glow) return;
        const a = clamp(q.t / q.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (0.5 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a * 0.35;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * 1.8, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
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
        else if (n.type === "lucky") { color = "#7dffb0"; size = 34; }
        if (!save.numbers && n.type !== "lucky" && n.type !== "heal" && n.type !== "hurt") return;
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
    const shaking = G.shake > 0 && save.shake;
    const sx = shaking ? rand(-G.shake, G.shake) * 0.5 : 0;
    const sy = shaking ? rand(-G.shake, G.shake) * 0.5 : 0;

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

    const html = ownedChipsHTML();
    if (hudCache.passives !== html) {
        hudCache.passives = html;
        dom.passives.innerHTML = html;
        if (tipState.key && !dom.passives.querySelector(`[data-tip="${tipState.key}"]`) && tipState.from === dom.passives) hideTip();
    }
}

/* 已持有的武器 / 技能 / 道具 → 可點擊（或滑鼠移入）查看介紹的晶片 */
function ownedChipsHTML() {
    const chip = (cls, tip, kind, id, label) =>
        `<button type="button" class="chip ${cls}" data-tip="${tip}">${badgeHTML(kind, id, "mini")}<span>${label}</span></button>`;
    let html = chip(G.evolved ? "evo" : "weapon", "weapon:", G.evolved ? "evolve" : "weapon", G.evolved ? "evolve" : "weapon", weaponLabel());
    Object.keys(G.ults).forEach((id) => {
        const f = FUSIONS.find((x) => x.id === id);
        html += chip("evo", "ult:" + id, "fusion", id, f.name);
    });
    Object.keys(G.skills).forEach((id) => {
        const lv = G.skills[id].lv;
        const maxed = lv >= SKILL_MAX;
        const ready = maxed && FUSIONS.some((f) => (f.a === id || f.b === id) && fusionReady(f));
        html += chip(ready ? "fusion-ready" : (maxed ? "max" : "skill"), "skill:" + id, "skill", id,
            `${SKILLS[id].name} ${ready ? "可融合" : (maxed ? "MAX" : "Lv." + lv)}`);
    });
    Object.keys(G.items).forEach((id) => {
        if (G.items[id] > 0) html += chip("item", "item:" + id, "item", id, `${ITEM_NAMES[id]} Lv.${G.items[id]}`);
    });
    html += chip("stats", "stats:", "stat", "attack", "屬性");
    return html;
}

/* ---------- 技能介紹浮動視窗 ---------- */
const tipState = { key: null, pinned: false, from: null, timer: 0 };

function tipContent(key) {
    const [type, id] = key.split(":");
    const p = G.player;
    const ch = G.character;
    let kind = type, iconId = id, title = "", tag = "", body = "", foot = "";
    if (type === "skill") {
        const sk = SKILLS[id];
        const lv = skillLv(id);
        title = sk.name;
        tag = `主動技能 · Lv.${lv}${lv >= SKILL_MAX ? " (MAX)" : ""}`;
        body = sk.text(lv);
        if (lv < SKILL_MAX) foot += `<div class="tip-next"><b>下一級</b>${sk.text(lv + 1)}</div>`;
        const fus = FUSIONS.filter((f) => f.a === id || f.b === id).map((f) => {
            const other = f.a === id ? f.b : f.a;
            return `<li>${G.ults[f.id] ? "✔ " : ""}${SKILLS[other].name} <span>→</span> <b>${f.name}</b></li>`;
        }).join("");
        foot += `<div class="tip-fusion"><b>融合配方</b>（兩者皆滿級）<ul>${fus}</ul></div>`;
    } else if (type === "ult") {
        const f = FUSIONS.find((x) => x.id === id);
        kind = "fusion";
        title = f.name;
        tag = "終極技能";
        body = f.text;
        foot = `<div class="tip-next"><b>來源</b>${SKILLS[f.a].name} + ${SKILLS[f.b].name}</div>`;
    } else if (type === "item") {
        const def = UPGRADES.find((u) => u.id === id);
        const lv = itemLv(id);
        title = def.name;
        tag = `被動道具 · Lv.${lv}${lv >= def.max ? " (MAX)" : ""}`;
        body = def.text(lv);
        if (lv < def.max) foot = `<div class="tip-next"><b>下一級</b>${def.text(lv + 1)}</div>`;
    } else if (type === "weapon") {
        kind = G.evolved ? "evolve" : "weapon";
        iconId = kind;
        title = G.evolved ? ch.evoName : ch.weaponName;
        tag = G.evolved ? "已進化武器" : `主武器 · Lv.${G.weaponLevel} / 4`;
        body = G.evolved ? ch.evoText : ch.weaponUp;
        if (!G.evolved) foot = `<div class="tip-next"><b>進化條件</b>武器 Lv.4 + ${ITEM_NAMES[ch.evoNeeds]} → ${ch.evoName}</div>`;
    } else if (type === "stats") {
        kind = "stat"; iconId = "attack";
        title = "角色屬性";
        tag = `${ch.title} · LV.${p.level}`;
        body =
            `<div class="tip-stats">` +
            `<span>攻擊傷害</span><b>${pct(p.dmgMult)}</b>` +
            `<span>攻擊冷卻</span><b>${cooldownNow().toFixed(2)}s</b>` +
            `<span>暴擊率</span><b>${pct(p.crit)}</b>` +
            `<span>暴擊傷害</span><b>${pct(p.critMult)}</b>` +
            `<span>移動速度</span><b>${Math.round(playerSpeed())}</b>` +
            `<span>攻擊範圍</span><b>${pct(p.areaMult)}</b>` +
            `<span>生命回復</span><b>${p.regen.toFixed(1)}/s</b>` +
            `<span>傷害減免</span><b>${pct(damageReduction())}</b>` +
            `<span>幸運機率</span><b>${pct(luckChance(false))}</b>` +
            `</div>`;
    }
    return `<div class="tip-head">${badgeHTML(kind, iconId, "mid")}<div><div class="tip-title">${title}</div><div class="tip-tag">${tag}</div></div></div>` +
        `<div class="tip-body">${body}</div>${foot}`;
}

function showTip(el, pinned) {
    if (!G) return;
    const key = el.dataset.tip;
    dom.tip.innerHTML = tipContent(key);
    dom.tip.classList.remove("hidden");
    tipState.key = key;
    tipState.pinned = pinned;
    tipState.from = el.parentElement;
    // 位置：晶片上方，放不下就放下方；水平方向限制在視窗內
    const r = el.getBoundingClientRect();
    const tw = dom.tip.offsetWidth;
    const th = dom.tip.offsetHeight;
    let x = clamp(r.left + r.width / 2 - tw / 2, 8, window.innerWidth - tw - 8);
    let y = r.top - th - 10;
    if (y < 8) y = Math.min(r.bottom + 10, window.innerHeight - th - 8);
    dom.tip.style.left = x + "px";
    dom.tip.style.top = Math.max(8, y) + "px";
    clearTimeout(tipState.timer);
    if (pinned && IS_TOUCH && !G.paused) tipState.timer = setTimeout(hideTip, 5000);
}

function hideTip() {
    tipState.key = null;
    tipState.pinned = false;
    clearTimeout(tipState.timer);
    if (dom.tip) dom.tip.classList.add("hidden");
}

function bindTipContainer(container) {
    container.addEventListener("mouseover", (e) => {
        const el = e.target.closest("[data-tip]");
        if (!el || tipState.pinned) return;
        showTip(el, false);
    });
    container.addEventListener("mouseout", (e) => {
        const el = e.target.closest("[data-tip]");
        if (!el || tipState.pinned) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        hideTip();
    });
    container.addEventListener("click", (e) => {
        const el = e.target.closest("[data-tip]");
        if (!el) return;
        e.stopPropagation();
        if (tipState.pinned && tipState.key === el.dataset.tip) hideTip();
        else showTip(el, true);
    });
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
    hideTip();
    if (G.paused) dom.pauseSkills.innerHTML = ownedChipsHTML();
    else closeModal(dom.settings);
    dom.pauseOverlay.classList.toggle("hidden", !G.paused);
    Sound.play("click");
}

function updateSoundButtons() {
    dom.soundBtn.classList.toggle("off", save.muted);
    dom.pauseSoundBtn.textContent = "音效：" + (save.muted ? "關" : "開");
    if (dom.mute) dom.mute.checked = !save.muted;
}

function toggleMute() {
    save.muted = !save.muted;
    writeSave();
    updateSoundButtons();
    Sound.play("click");
}

/* ============================== 視窗（設定 / 排行榜） ============================== */
function anyModalOpen() {
    return !dom.settings.classList.contains("hidden") || !dom.board.classList.contains("hidden");
}

function openModal(el) {
    hideTip();
    // 遊戲中開啟視窗時自動暫停
    if (scene === "playing" && G && !G.dead && !G.choosing && !G.paused) togglePause();
    el.classList.remove("hidden");
    Sound.play("click");
}

function closeModal(el) {
    if (!el || el.classList.contains("hidden")) return;
    el.classList.add("hidden");
}

/* ---------- 設定 ---------- */
function fullscreenSupported() {
    const d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen);
}
function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function setFullscreen(on) {
    try {
        if (on && !isFullscreen()) {
            const d = document.documentElement;
            const req = d.requestFullscreen || d.webkitRequestFullscreen;
            const r = req.call(d);
            if (r && r.catch) r.catch(() => syncSettingsUI());
        } else if (!on && isFullscreen()) {
            const ex = document.exitFullscreen || document.webkitExitFullscreen;
            ex.call(document);
        }
    } catch (e) { /* 不支援 */ }
}

function syncSettingsUI() {
    const v = Math.round(save.volume * 100);
    dom.volume.value = v;
    dom.volumeVal.textContent = v + "%";
    dom.volume.style.setProperty("--fill", v + "%");
    dom.mute.checked = !save.muted;
    dom.shake.checked = !!save.shake;
    dom.numbers.checked = !!save.numbers;
    dom.fullscreen.checked = isFullscreen();
    dom.fullscreen.disabled = !fullscreenSupported();
    dom.playerName.value = save.playerName || "";
}

function openSettings() {
    syncSettingsUI();
    openModal(dom.settings);
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

    // 視窗開啟時：ESC 關閉視窗，其餘按鍵不影響遊戲
    if (anyModalOpen()) {
        if (key === "escape") { event.preventDefault(); closeModal(dom.settings); closeModal(dom.board); }
        return;
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

/* 設定 / 排行榜 */
$("homeSettingsButton").addEventListener("click", openSettings);
$("homeBoardButton").addEventListener("click", openBoard);
$("settingsButton").addEventListener("click", openSettings);
$("pauseSettingsButton").addEventListener("click", openSettings);
$("deathBoardButton").addEventListener("click", openBoard);
document.querySelectorAll("[data-close]").forEach((b) => {
    b.addEventListener("click", () => { closeModal($(b.dataset.close)); Sound.play("click"); });
});
[dom.settings, dom.board].forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m) closeModal(m); });
});

dom.volume.addEventListener("input", () => {
    save.volume = clamp(Number(dom.volume.value) / 100, 0, 1);
    dom.volumeVal.textContent = dom.volume.value + "%";
    dom.volume.style.setProperty("--fill", dom.volume.value + "%");
    Sound.applyVolume();
});
dom.volume.addEventListener("change", () => { writeSave(); Sound.play("select"); });
dom.mute.addEventListener("change", () => {
    save.muted = !dom.mute.checked;
    writeSave();
    updateSoundButtons();
    Sound.play("click");
});
dom.shake.addEventListener("change", () => { save.shake = dom.shake.checked; writeSave(); });
dom.numbers.addEventListener("change", () => { save.numbers = dom.numbers.checked; writeSave(); });
dom.fullscreen.addEventListener("change", () => setFullscreen(dom.fullscreen.checked));
dom.playerName.addEventListener("change", () => {
    save.playerName = dom.playerName.value.trim().slice(0, 12) || "冒險者";
    dom.playerName.value = save.playerName;
    writeSave();
});
["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => {
    document.addEventListener(ev, () => { dom.fullscreen.checked = isFullscreen(); onViewportChange(); });
});

/* 技能介紹浮窗 */
bindTipContainer(dom.passives);
bindTipContainer(dom.pauseSkills);
document.addEventListener("pointerdown", (e) => {
    if (tipState.key && !e.target.closest("[data-tip]") && !e.target.closest("#skillTip")) hideTip();
});

/* ============================== 啟動 ============================== */
dom.startBtn.disabled = true;
updateSoundButtons();
setScene("home");
requestAnimationFrame(frame);
