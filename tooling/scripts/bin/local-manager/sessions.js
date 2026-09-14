import os from 'node:os';

import { fs, path } from 'zx';

import { PROXY_STATE_FILE, SOCAT_STATE_FILE } from './portless.js';
import { run, runSync } from './utils.js';

const SESSIONS_DIR = path.join(os.tmpdir(), 'portless-scripts-sessions');

/**
 * Registers this process as an active dev session by writing a JSON file
 * keyed by its PID to a shared temp directory. Called once at startup.
 * @returns {Promise<string>} The path of the session file (used later for cleanup).
 */
export async function registerSession(mode) {
    await fs.mkdirp(SESSIONS_DIR);
    const file = path.join(SESSIONS_DIR, String(process.pid));
    await fs
        .writeJson(file, { pid: process.pid, mode, startedAt: Date.now() })
        .catch(() => {});
    return file;
}

// Uses /proc/<pid> existence as a lightweight alive check — no signals sent.
const isAliveSession = (data) =>
    Boolean(data && fs.existsSync(`/proc/${data.pid}`));

/**
 * Returns session metadata for every concurrent dev session on this machine
 * that is not the current process. Prunes stale files for dead PIDs.
 */
export async function otherActiveSessions() {
    const files = await fs.readdir(SESSIONS_DIR).catch(() => []);
    const active = [];
    for (const f of files) {
        if (f === String(process.pid)) continue;
        const full = path.join(SESSIONS_DIR, f);
        const data = await fs.readJson(full).catch(() => null);
        if (isAliveSession(data)) active.push(data);
        else await fs.remove(full).catch(() => {});
    }
    return active;
}

/**
 * Prunes portless routes, removes this session's registry file, and tears
 * down the shared proxy/socat if no other sessions remain.
 */
export async function cleanupSession(
    sessionFile,
    nodeBin,
    portlessCli,
    socatPid,
) {
    await run`portless prune`;
    await fs.remove(sessionFile).catch(() => {});

    if ((await otherActiveSessions()).length === 0) {
        // Tear down the shared portless proxy and socat bridge, then remove
        // their state files.
        if (portlessCli && nodeBin) {
            await run`sudo ${nodeBin} ${portlessCli} proxy stop`;
        }
        if (socatPid) {
            await run`sudo -n kill ${socatPid}`;
            await fs.remove(SOCAT_STATE_FILE).catch(() => {});
        }
        await fs.remove(PROXY_STATE_FILE).catch(() => {});
    }
}

/**
 * Sync twin of {@link cleanupSession}, for `process.on('exit')` handlers.
 * Sudo calls use `-n` so a missing password never hangs process exit.
 */
export function cleanupSessionSync(
    sessionFile,
    nodeBin,
    portlessCli,
    socatPid,
) {
    runSync`portless prune`;
    try {
        fs.removeSync(sessionFile);
    } catch {}

    let files;
    try {
        files = fs.readdirSync(SESSIONS_DIR);
    } catch {
        files = [];
    }
    const others = files
        .filter((f) => f !== String(process.pid))
        .map((f) => {
            try {
                return fs.readJsonSync(path.join(SESSIONS_DIR, f));
            } catch {
                return null;
            }
        })
        .filter(isAliveSession);

    if (others.length === 0) {
        if (portlessCli && nodeBin)
            runSync`sudo -n ${nodeBin} ${portlessCli} proxy stop`;
        if (socatPid) {
            runSync`sudo -n kill ${socatPid}`;
            try {
                fs.removeSync(SOCAT_STATE_FILE);
            } catch {}
        }
        try {
            fs.removeSync(PROXY_STATE_FILE);
        } catch {}
    }
}
