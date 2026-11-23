'use strict';

// Applies the minimal workflow_executor arg-mapping fix to a Sim.ai source checkout.
// Usage: node apply.cjs /path/to/sim/apps/sim
// Edits exactly one file (providers/utils.ts) in two places, aborting if either
// anchor no longer matches (so the patch never half-applies to an unknown base).

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { NORMALIZE_FN_SOURCE } = require('./normalize-workflow-arguments.cjs');

const app = process.argv[2];
assert.ok(app && fs.existsSync(path.join(app, 'providers/utils.ts')), 'Provide the Sim.ai apps/sim source directory');

const FUNCTION_ANCHOR = [
  'function stripModelBlockedParams(',
  '  blockedParams: string[] | undefined,',
  '  llmArgs: Record<string, any>',
  '): Record<string, any> {',
  '  if (!blockedParams?.length) return llmArgs',
  '  const blocked = new Set(blockedParams)',
  '  const filtered: Record<string, any> = {}',
  '  for (const [key, value] of Object.entries(llmArgs)) {',
  '    if (!blocked.has(key)) filtered[key] = value',
  '  }',
  '  return filtered',
  '}',
].join('\n');

const CALL_SITE_ANCHOR = '  const modelParams = stripModelBlockedParams(tool.modelBlockedParams, llmArgs)';

const CALL_SITE_NEW = [
  "  const normalizedArgs = tool.id === 'workflow_executor' && tool.parameters",
  '    ? normalizeWorkflowArguments(llmArgs, tool.parameters)',
  '    : llmArgs',
  '  const modelParams = stripModelBlockedParams(tool.modelBlockedParams, normalizedArgs)',
].join('\n');

const target = path.join(app, 'providers/utils.ts');
let text = fs.readFileSync(target, 'utf8');
// Normalize CRLF so anchors match a Linux-extracted file without reflowing anything else.
text = text.replace(/\r\n/g, '\n');

function replaceOnce(haystack, anchor, replacement, label) {
  const count = haystack.split(anchor).length - 1;
  assert.equal(count, 1, `Anchor appeared ${count} times in providers/utils.ts (expected 1): ${label}`);
  return haystack.replace(anchor, () => replacement);
}

// 1) Insert the normalize function right after stripModelBlockedParams.
text = replaceOnce(text, FUNCTION_ANCHOR, FUNCTION_ANCHOR + '\n\n' + NORMALIZE_FN_SOURCE, 'stripModelBlockedParams');

// 2) Route the model args through the normalizer before stripping blocked params.
text = replaceOnce(text, CALL_SITE_ANCHOR, CALL_SITE_NEW, 'call site');

fs.writeFileSync(target, text);
console.log('Applied workflow_executor arg-mapping fix to providers/utils.ts');