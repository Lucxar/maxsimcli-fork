"use strict";
/**
 * Config — Planning config CRUD operations
 *
 * Ported from maxsim/bin/lib/config.cjs
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cmdConfigEnsureSection = cmdConfigEnsureSection;
exports.cmdConfigSet = cmdConfigSet;
exports.cmdConfigGet = cmdConfigGet;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const types_js_1 = require("./types.js");
// ─── Config CRUD commands ───────────────────────────────────────────────────
function cmdConfigEnsureSection(cwd, raw) {
    const configPath = node_path_1.default.join(cwd, '.planning', 'config.json');
    const planningDir = node_path_1.default.join(cwd, '.planning');
    try {
        if (!node_fs_1.default.existsSync(planningDir)) {
            node_fs_1.default.mkdirSync(planningDir, { recursive: true });
        }
    }
    catch (err) {
        return (0, types_js_1.cmdErr)('Failed to create .planning directory: ' + err.message);
    }
    if (node_fs_1.default.existsSync(configPath)) {
        const result = { created: false, reason: 'already_exists' };
        return (0, types_js_1.cmdOk)(result, raw ? 'exists' : undefined);
    }
    // Detect Brave Search API key availability
    const homedir = node_os_1.default.homedir();
    const braveKeyFile = node_path_1.default.join(homedir, '.maxsim', 'brave_api_key');
    const hasBraveSearch = !!(process.env.BRAVE_API_KEY || node_fs_1.default.existsSync(braveKeyFile));
    // Load user-level defaults from ~/.maxsim/defaults.json if available
    const globalDefaultsPath = node_path_1.default.join(homedir, '.maxsim', 'defaults.json');
    let userDefaults = {};
    try {
        if (node_fs_1.default.existsSync(globalDefaultsPath)) {
            userDefaults = JSON.parse(node_fs_1.default.readFileSync(globalDefaultsPath, 'utf-8'));
        }
    }
    catch {
        // Ignore malformed global defaults, fall back to hardcoded
    }
    const hardcoded = {
        ...types_js_1.PLANNING_CONFIG_DEFAULTS,
        brave_search: hasBraveSearch,
    };
    const defaults = {
        ...hardcoded,
        ...userDefaults,
        workflow: {
            ...hardcoded.workflow,
            ...(userDefaults.workflow || {}),
        },
    };
    try {
        node_fs_1.default.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
        const result = { created: true, path: '.planning/config.json' };
        return (0, types_js_1.cmdOk)(result, raw ? 'created' : undefined);
    }
    catch (err) {
        return (0, types_js_1.cmdErr)('Failed to create config.json: ' + err.message);
    }
}
function cmdConfigSet(cwd, keyPath, value, raw) {
    const configPath = node_path_1.default.join(cwd, '.planning', 'config.json');
    if (!keyPath) {
        return (0, types_js_1.cmdErr)('Usage: config-set <key.path> <value>');
    }
    // Parse value (handle booleans and numbers)
    let parsedValue = value;
    if (value === 'true')
        parsedValue = true;
    else if (value === 'false')
        parsedValue = false;
    else if (value !== undefined && !isNaN(Number(value)) && value !== '')
        parsedValue = Number(value);
    // Load existing config or start with empty object
    let config = {};
    try {
        if (node_fs_1.default.existsSync(configPath)) {
            config = JSON.parse(node_fs_1.default.readFileSync(configPath, 'utf-8'));
        }
    }
    catch (err) {
        return (0, types_js_1.cmdErr)('Failed to read config.json: ' + err.message);
    }
    // Set nested value using dot notation
    const keys = keyPath.split('.');
    let current = config;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (current[key] === undefined || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = parsedValue;
    try {
        node_fs_1.default.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        const result = { updated: true, key: keyPath, value: parsedValue };
        return (0, types_js_1.cmdOk)(result, raw ? `${keyPath}=${parsedValue}` : undefined);
    }
    catch (err) {
        return (0, types_js_1.cmdErr)('Failed to write config.json: ' + err.message);
    }
}
function cmdConfigGet(cwd, keyPath, raw) {
    const configPath = node_path_1.default.join(cwd, '.planning', 'config.json');
    if (!keyPath) {
        return (0, types_js_1.cmdErr)('Usage: config-get <key.path>');
    }
    let config = {};
    try {
        if (node_fs_1.default.existsSync(configPath)) {
            config = JSON.parse(node_fs_1.default.readFileSync(configPath, 'utf-8'));
        }
        else {
            return (0, types_js_1.cmdErr)('No config.json found at ' + configPath);
        }
    }
    catch (err) {
        return (0, types_js_1.cmdErr)('Failed to read config.json: ' + err.message);
    }
    const keys = keyPath.split('.');
    let current = config;
    for (const key of keys) {
        if (current === undefined || current === null || typeof current !== 'object') {
            return (0, types_js_1.cmdErr)(`Key not found: ${keyPath}`);
        }
        current = current[key];
    }
    if (current === undefined) {
        return (0, types_js_1.cmdErr)(`Key not found: ${keyPath}`);
    }
    return (0, types_js_1.cmdOk)(current, raw ? String(current) : undefined);
}
//# sourceMappingURL=config.js.map