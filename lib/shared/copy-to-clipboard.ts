// Copy text to the clipboard, resolving to whether it succeeded. Wraps the
// async Clipboard API so callers can give simple "Copied!" feedback without
// each handling the permission/secure-context rejection themselves.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
