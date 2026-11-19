/** Minimal structured logger: one JSON line per event, filtered by level. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level = 'info') {
  const min = LEVELS[level] ?? LEVELS.info;
  const write = (lvl, msg, meta) => {
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...meta });
    (lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  };
  return {
    debug: (m, meta) => write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
  };
}
