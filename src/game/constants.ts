export const ROOM_W = 900;
export const WORLD_H = 1000;

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const FIXED_DT = 1 / 60;

export const PLAYER_RADIUS = 16;
export const DASH_SPEED = 640;
export const DASH_DURATION = 0.18;
export const DASH_IFRAME = 0.2;

export const ENEMY_RADIUS = 15;

export const MELEE_RANGE = 46;
export const MELEE_ARC = Math.PI / 2.2;
export const MELEE_DAMAGE = 45;
export const MELEE_COOLDOWN = 0.5;

export const DOOR_BASE_COST = 650;
export const DOOR_COST_STEP = 500;
export const MYSTERY_BOX_BASE_COST = 400;
export const MYSTERY_BOX_COST_STEP = 150;
export const WORKBENCH_BASE_COST = 500;
export const WORKBENCH_COST_STEP = 350;
export const TREASURE_BASE_BONUS = 150;

export const ROUND_INTERMISSION = 4;
export const BOSS_ROUND_INTERVAL = 4;

export const META_STORAGE_KEY = 'outbreak2d_meta_v2';
export const KEYBINDS_STORAGE_KEY = 'outbreak2d_keybinds_v1';
export const SETTINGS_STORAGE_KEY = 'outbreak2d_settings_v1';

// spotlight / lighting
export const BASE_VISION_RADIUS = 210;
export const AMBIENT_LIGHT = 0.18; // fraction of full brightness visible outside the spotlight

// downed / revive
export const DOWN_BLEEDOUT = 18; // seconds before a downed player is lost
export const REVIVE_HOLD_TIME = 2.2; // seconds a teammate must stand close
export const REVIVE_RANGE = 78;
export const REVIVE_HP_FRAC = 0.5;
