import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
const cache = new Map<string, string>();
/** Exercise real JSX components without adding a second test runner or dependency. */
export function tsxModule(url: URL): string {
  const cached = cache.get(url.href);
  if (cached) return cached;
  const output = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  }).outputText.replace(/from (['"])([^'"]+)\1/g, (_, _quote, specifier: string) => {
    if (!specifier.startsWith('.')) return `from ${JSON.stringify(import.meta.resolve(specifier))}`;
    let resolved = new URL(specifier, url);
    if (!existsSync(resolved)) {
      resolved = ['.tsx', '.ts'].map(ext => new URL(specifier + ext, url)).find(file => existsSync(file))!;
      if (!resolved) throw new Error(`Unresolved test import: ${specifier}`);
    }
    return `from ${JSON.stringify(resolved.pathname.endsWith('.tsx') ? tsxModule(resolved) : resolved.href)}`;
  });
  const module = 'data:text/javascript;base64,' + Buffer.from(output).toString('base64');
  cache.set(url.href, module);
  return module;
}
