import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// TextEncoder/TextDecoder needed for jsdom + react-router
if (typeof global.TextEncoder === 'undefined') {
  (global.TextEncoder as any) = TextEncoder;
  (global.TextDecoder as any) = TextDecoder;
}
