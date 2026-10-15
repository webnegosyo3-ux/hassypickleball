import '@testing-library/jest-dom/vitest'

/**
 * Node 22+ ships an experimental global `localStorage` that is inert unless
 * started with --localstorage-file, and it shadows jsdom's working one. Pin an
 * in-memory Storage so tests see the browser behaviour the app expects.
 */
if (typeof window.localStorage?.setItem !== 'function') {
  const data = new Map<string, string>()
  const storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  }

  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
}
