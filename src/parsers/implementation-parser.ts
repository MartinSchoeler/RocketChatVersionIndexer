export interface ParsedImplementation {
  routeName: string;       // 'channels.addAll'
  fullPath: string;        // '/v1/channels.addAll'
  methods: string[];       // ['post']
  config: string;          // Raw config object text
  handlerCode: string;     // Raw handler object text
  sourceFile: string;
  startLine: number;
  endLine: number;
}

/**
 * Extract a brace-delimited block from source, starting at the `{` at startIndex.
 * Tracks string literals to avoid counting braces inside them.
 */
function extractBlock(source: string, startIndex: number): { text: string; endIndex: number } | null {
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { text: source.slice(startIndex, i + 1), endIndex: i };
      }
    }
  }

  return null;
}

/**
 * Count newlines up to a position to determine the line number.
 */
function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Parse an API implementation file to extract addRoute calls.
 *
 * Looks for patterns like:
 *   API.v1.addRoute(
 *       'channels.addAll',
 *       { authRequired: true, validateParams: isChannelsAddAllProps },
 *       { async post() { ... } },
 *   );
 */
export function parseImplementation(source: string, sourceFile: string): ParsedImplementation[] {
  const results: ParsedImplementation[] = [];

  // Match API.v1.addRoute( or API.v1.addRoute (
  const routeRegex = /API\.v1\.addRoute\s*\(\s*/g;
  let match: RegExpExecArray | null;

  while ((match = routeRegex.exec(source)) !== null) {
    const startLine = lineNumberAt(source, match.index);
    const afterMatch = match.index + match[0].length;

    // Extract route name (first string argument)
    const routeName = extractStringArg(source, afterMatch);
    if (!routeName) continue;

    // Find the position after the route name string + comma
    const afterName = source.indexOf(routeName.quote, afterMatch) + routeName.value.length + 2; // +2 for closing quote and comma search
    const commaAfterName = source.indexOf(',', afterName - 1);
    if (commaAfterName === -1) continue;

    // Find config block (second argument - starts with {)
    const configStart = findNextBrace(source, commaAfterName + 1);
    if (configStart === -1) continue;

    const configBlock = extractBlock(source, configStart);
    if (!configBlock) continue;

    // Find handler block (third argument - starts with {)
    const handlerStart = findNextBrace(source, configBlock.endIndex + 1);
    if (handlerStart === -1) continue;

    const handlerBlock = extractBlock(source, handlerStart);
    if (!handlerBlock) continue;

    const endLine = lineNumberAt(source, handlerBlock.endIndex);

    // Extract HTTP methods from the handler block
    const methods = extractMethods(handlerBlock.text);

    results.push({
      routeName: routeName.value,
      fullPath: `/v1/${routeName.value}`,
      methods,
      config: configBlock.text,
      handlerCode: handlerBlock.text,
      sourceFile,
      startLine,
      endLine,
    });
  }

  return results;
}

/**
 * Extract a string argument (single or double quoted) at the given position.
 */
function extractStringArg(source: string, fromIndex: number): { value: string; quote: string } | null {
  // Skip whitespace
  let i = fromIndex;
  while (i < source.length && /\s/.test(source[i])) i++;

  const quote = source[i];
  if (quote !== "'" && quote !== '"') return null;

  const endQuote = source.indexOf(quote, i + 1);
  if (endQuote === -1) return null;

  return { value: source.slice(i + 1, endQuote), quote };
}

/**
 * Find the next `{` character, skipping whitespace and commas.
 */
function findNextBrace(source: string, fromIndex: number): number {
  for (let i = fromIndex; i < source.length; i++) {
    if (source[i] === '{') return i;
    if (!/[\s,]/.test(source[i])) return -1; // unexpected character
  }
  return -1;
}

/**
 * Extract HTTP method names from a handler block.
 * Looks for: `async get()`, `async post()`, `get()`, `post()`, etc.
 */
function extractMethods(handlerBlock: string): string[] {
  const methodRegex = /(?:async\s+)?(get|post|put|delete|patch)\s*\(\s*\)/gi;
  const methods: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = methodRegex.exec(handlerBlock)) !== null) {
    methods.push(m[1].toUpperCase());
  }

  return methods;
}
