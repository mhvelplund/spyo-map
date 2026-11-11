import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// TextEncoder/TextDecoder needed for jsdom + react-router
if (typeof global.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global.TextEncoder as any) = TextEncoder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global.TextDecoder as any) = TextDecoder;
}

// jsdom has no PointerEvent; without it fireEvent.pointer* drops clientX/pointerId.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = PointerEventPolyfill;
}
