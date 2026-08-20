// jsdom does not implement matchMedia; the state layer guards for its absence, but
// stub it so any component that reads it during smoke tests behaves deterministically.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom has no Canvas implementation. The animated Haki field already treats a
// missing 2D context as an optional visual enhancement, so model that supported
// fallback here instead of letting jsdom throw and abort lazy-route tests.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

// Production activates storage only after Supabase resolves the authenticated
// account. Tests have no real session, so give their isolated jsdom origin a
// deterministic owner before any persistence helper is exercised.
const { setActiveStorageOwner } = await import('../lib/storageScope');
setActiveStorageOwner('foundation-test-user');
