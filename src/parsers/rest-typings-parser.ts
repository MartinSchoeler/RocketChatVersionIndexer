export interface ParsedEndpoint {
  path: string;        // '/v1/channels.files'
  method: string;      // 'GET'
  paramType: string;   // 'ChannelsFilesListProps' or inline type text
  returnType: string;  // Full return type text
  rawTypeBlock: string; // The full block for this endpoint
  sourceFile: string;
}

/**
 * Extract the block starting from a `{` at `startIndex`, tracking brace depth.
 * Handles strings (single, double, backtick) so braces inside strings are ignored.
 */
function extractBlock(source: string, startIndex: number): { text: string; endIndex: number } | null {
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (inString) {
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }

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
 * Parse a rest-typings file to extract endpoint definitions.
 *
 * Looks for patterns like:
 *   '/v1/channels.create': {
 *       POST: (params: ChannelsCreateProps) => { channel: IRoom };
 *   };
 */
export function parseRestTypings(source: string, sourceFile: string): ParsedEndpoint[] {
  const results: ParsedEndpoint[] = [];

  // Match endpoint path declarations: '/v1/something.action': {
  const pathRegex = /'(\/v1\/[^']+)'\s*:\s*\{/g;
  let pathMatch: RegExpExecArray | null;

  while ((pathMatch = pathRegex.exec(source)) !== null) {
    const endpointPath = pathMatch[1];
    const blockStart = source.indexOf('{', pathMatch.index + pathMatch[0].length - 1);

    const block = extractBlock(source, blockStart);
    if (!block) continue;

    const blockText = block.text;

    // Find HTTP methods within this block
    const methodRegex = /\b(GET|POST|PUT|DELETE|PATCH)\s*:\s*\(/g;
    let methodMatch: RegExpExecArray | null;

    while ((methodMatch = methodRegex.exec(blockText)) !== null) {
      const method = methodMatch[1];

      // Extract parameter type: everything between `(params:` and `)` before `=>`
      // But params can be complex with nested generics, so find the `=> ` after the params
      const afterMethod = blockText.slice(methodMatch.index + methodMatch[0].length);

      // Find the arrow `=>`
      const arrowIndex = findArrow(afterMethod);
      if (arrowIndex === -1) continue;

      const paramSection = afterMethod.slice(0, arrowIndex).trim();
      // paramSection looks like: `params: ChannelsCreateProps) `
      // or: `params: PaginatedRequest<{ ... }>)`
      const paramType = extractParamType(paramSection);

      // Extract return type: everything after `=> ` until `;`
      const afterArrow = afterMethod.slice(arrowIndex + 2).trim();
      const returnType = extractReturnType(afterArrow);

      // Build the raw type block for this specific method
      const rawTypeBlock = `'${endpointPath}': {\n\t${method}: (${paramSection}=> ${returnType};\n};`;

      results.push({
        path: endpointPath,
        method,
        paramType,
        returnType,
        rawTypeBlock,
        sourceFile,
      });
    }
  }

  return results;
}

/**
 * Find the `=>` arrow that is not inside angle brackets or parens.
 * Track depth of `<>` and `()` to skip nested generics.
 */
function findArrow(source: string): number {
  // Start at parenDepth=1 because we're called from inside the opening `(`
  // that the method regex already consumed
  let parenDepth = 1;
  let angleDepth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = 0; i < source.length - 1; i++) {
    const ch = source[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }

    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;
    if (ch === '<') angleDepth++;
    if (ch === '>') angleDepth--;

    // Only match `=>` at the top level (after params close)
    if (ch === '=' && source[i + 1] === '>' && parenDepth === 0 && angleDepth === 0) {
      return i;
    }
  }

  return -1;
}

function extractParamType(paramSection: string): string {
  // paramSection is like: `params: ChannelsCreateProps)`
  // or: `params: PaginatedRequest<{ fields: string }>)`
  const colonIndex = paramSection.indexOf(':');
  if (colonIndex === -1) return paramSection.trim();

  let type = paramSection.slice(colonIndex + 1).trim();
  // Remove trailing `)` if present
  if (type.endsWith(')')) {
    type = type.slice(0, -1).trim();
  }
  return type;
}

function extractReturnType(afterArrow: string): string {
  // The return type goes until `;` at depth 0
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = 0; i < afterArrow.length; i++) {
    const ch = afterArrow[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }

    if (ch === '{' || ch === '<' || ch === '(') depth++;
    if (ch === '}' || ch === '>' || ch === ')') depth--;

    if (ch === ';' && depth === 0) {
      return afterArrow.slice(0, i).trim();
    }
  }

  return afterArrow.trim();
}
