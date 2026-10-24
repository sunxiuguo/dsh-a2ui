// Export only an allowlisted harness basename and numeric line. Never export
// messages, assertion actual/expected values, URLs, arguments or raw stacks.
const files = new Set(['run.mjs', 'scenario.mjs', 'shell-scenario.mjs']);
export function failureSite(error) {
  const stack = typeof error?.stack === 'string' ? error.stack : '';
  for (const line of stack.split('\n').slice(1)) {
    const match = line.match(/\/scripts\/full-host\/([a-z-]+\.mjs):(\d{1,6}):(\d{1,6})\)?$/u);
    if (match && files.has(match[1])) return {file: match[1], line: Number(match[2])};
  }
  return {file: 'unavailable'};
}
