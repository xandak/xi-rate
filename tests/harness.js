// Minimal in-browser test harness: test(name, fn), assert helpers, runTests().
// Results render into the page and are exposed as window.testResults.
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ': ' : ''}expected ${e}, got ${a}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

async function runTests() {
  const ol = document.getElementById('results');
  const results = [];
  for (const t of tests) {
    const li = document.createElement('li');
    try {
      await t.fn();
      li.className = 'pass';
      li.textContent = t.name;
      results.push({ name: t.name, ok: true });
    } catch (e) {
      li.className = 'fail';
      li.textContent = t.name;
      const pre = document.createElement('pre');
      pre.textContent = e.message;
      li.appendChild(pre);
      results.push({ name: t.name, ok: false, error: e.message });
    }
    ol.appendChild(li);
  }
  const failed = results.filter((r) => !r.ok).length;
  document.getElementById('summary').textContent = `${results.length - failed}/${results.length} passed`;
  document.getElementById('summary').className = failed ? 'fail' : 'pass';
  window.testResults = { total: results.length, failed, results };
}
