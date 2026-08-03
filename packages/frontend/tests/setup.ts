import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// TextEncoder/TextDecoder needed for jsdom + react-router
if (typeof global.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global.TextEncoder as any) = TextEncoder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global.TextDecoder as any) = TextDecoder;
}
