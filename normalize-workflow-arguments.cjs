'use strict';

// Schema-driven lift of flat model args into `inputMapping` for workflow_executor tools.
// No hardcoded field names, no regex: only fields DECLARED in the tool schema
// (schema.properties.inputMapping.properties) are considered.

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value;
}

function normalizeWorkflowArguments(args, schema) {
  const inputSchema = record(record(record(schema)?.properties)?.inputMapping);
  const declared = record(inputSchema?.properties);
  // Not a workflow_executor tool (no inputMapping schema) -> leave args untouched.
  if (!declared) return args;
  const nested = record(args.inputMapping);
  if (Object.hasOwn(args, 'inputMapping') && !nested) {
    throw new Error('Workflow inputMapping must be an object');
  }
  const entries = [];
  for (const field of Object.keys(declared)) {
    const nestedHit = nested && Object.hasOwn(nested, field);
    const flatHit = Object.hasOwn(args, field);
    if (nestedHit && flatHit && !Object.is(nested[field], args[field])) {
      throw new Error('Conflicting workflow input for ' + field);
    }
    if (nestedHit || flatHit) entries.push([field, nestedHit ? nested[field] : args[field]]);
  }
  return { inputMapping: Object.fromEntries(entries) };
}

// Exact TypeScript source to inject into providers/utils.ts (self-contained, no
// module-level helper, so it cannot collide with anything the file already declares).
const NORMALIZE_FN_SOURCE = `function normalizeWorkflowArguments(
  args: Record<string, unknown>,
  schema: unknown,
): Record<string, unknown> {
  const record = (value: unknown): Record<string, unknown> | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  };
  const inputSchema = record(record(record(schema)?.properties)?.inputMapping);
  const declared = record(inputSchema?.properties);
  if (!declared) return args;
  const nested = record(args.inputMapping);
  if (Object.hasOwn(args, 'inputMapping') && !nested) {
    throw new Error('Workflow inputMapping must be an object');
  }
  const entries: [string, unknown][] = [];
  for (const field of Object.keys(declared)) {
    const nestedHit = nested && Object.hasOwn(nested, field);
    const flatHit = Object.hasOwn(args, field);
    if (nestedHit && flatHit && !Object.is(nested[field], args[field])) {
      throw new Error('Conflicting workflow input for ' + field);
    }
    if (nestedHit || flatHit) entries.push([field, nestedHit ? nested[field] : args[field]]);
  }
  return { inputMapping: Object.fromEntries(entries) };
}`;

module.exports = { normalizeWorkflowArguments, NORMALIZE_FN_SOURCE, record };