/**
 * OpenAI-compatible providers reject "." in function names, so the registry's
 * dotted tool names are mapped to a legal form on the way out and back.
 */
export function toModelToolName(name: string): string {
    return name.replace(/\./g, '__');
}

export function fromModelToolName(name: string): string {
    return name.replace(/__/g, '.');
}
