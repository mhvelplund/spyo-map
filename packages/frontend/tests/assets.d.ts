// Vite resolves image imports to URLs; tests type-check without vite/client.
declare module '*.png' {
  const src: string;
  export default src;
}
