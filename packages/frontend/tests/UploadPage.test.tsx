import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { jest } from '@jest/globals';

const getMe = jest.fn<() => Promise<{ displayName: string } | null>>();
const checkHashes = jest.fn<(h: string[]) => Promise<string[]>>();
const uploadFile = jest.fn<(f: File, s: string) => Promise<unknown>>();
const logout = jest.fn<() => Promise<void>>();
const inspectFile = jest.fn<(f: File) => Promise<unknown>>();
const signInWithIdToken = jest.fn<(t: string) => Promise<unknown>>();

type NativeFiles = { files: File[]; failed: string[] };
const native = {
  isNativeApp: jest.fn<() => boolean>(),
  nativeSignIn: jest.fn<(silent: boolean) => Promise<string | null>>(),
  nativeSignOut: jest.fn<() => Promise<void>>(),
  nativeHasSignedInBefore: jest.fn<() => Promise<boolean>>(),
  nativePickPhotos: jest.fn<() => Promise<NativeFiles>>(),
  nativeSharedPhotos: jest.fn<() => Promise<NativeFiles>>(),
  onNativeShare: jest.fn<(cb: () => void) => () => void>(),
};

jest.unstable_mockModule('../src/services/UploadClient', () => ({
  UPLOAD_FAILED_COPY: 'Upload failed — please retry.',
  UploadClient: class {
    getMe = getMe;
    checkHashes = checkHashes;
    uploadFile = uploadFile;
    logout = logout;
    signInWithIdToken = signInWithIdToken;
  },
}));
jest.unstable_mockModule('../src/utils/fileInspection', () => ({ inspectFile }));
jest.unstable_mockModule('../src/utils/native', () => native);

const { default: UploadPage } = await import('../src/components/UploadPage');

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <UploadPage />
    </MemoryRouter>
  );

const dropZone = () => screen.getByText(/Drop JPEG/).parentElement as HTMLElement;

describe('UploadPage', () => {
  const revoke = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    native.isNativeApp.mockReturnValue(false);
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
  });

  it.each([
    ['loading', () => getMe.mockReturnValue(new Promise(() => {}))],
    ['signed out', () => getMe.mockResolvedValue(null)],
    ['signed in', () => getMe.mockResolvedValue({ displayName: 'Ann' })],
  ])('links to the map while %s', async (_state, setup) => {
    setup();
    renderAt('/upload');
    expect(await screen.findByRole('link', { name: 'Show map' })).toHaveAttribute('href', '/map');
  });

  it('shows a sign-in link when signed out', async () => {
    getMe.mockResolvedValue(null);
    renderAt('/upload');
    const link = await screen.findByRole('link', { name: 'Sign in with Google' });
    expect(link).toHaveAttribute('href', '/auth/login/google');
  });

  it('shows the denied copy', async () => {
    getMe.mockResolvedValue(null);
    renderAt('/upload?denied=1');
    expect(await screen.findByText('This account is not allowed to upload.')).toBeInTheDocument();
  });

  it('shows the error copy', async () => {
    getMe.mockResolvedValue(null);
    renderAt('/upload?error=1');
    expect(await screen.findByText('Sign-in failed. Please try again.')).toBeInTheDocument();
  });

  it('sorts a dropped batch into added, duplicates and rejected', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    const good = new File(['1'], 'good.jpg');
    const dup = new File(['2'], 'dup.jpg');
    const nogps = new File(['3'], 'nogps.jpg');
    inspectFile.mockImplementation(async (f) =>
      f === good
        ? { ok: true, sha256: 'a'.repeat(64) }
        : f === dup
          ? { ok: true, sha256: 'b'.repeat(64) }
          : { ok: false, reason: 'No location data' }
    );
    checkHashes.mockResolvedValue(['b'.repeat(64)]);
    uploadFile.mockResolvedValue({ status: 'added' });

    renderAt('/upload');
    await screen.findByText('Ann');
    expect(screen.getByText('Photos showing faces or licence plates will be removed.')).toBeInTheDocument();

    fireEvent.drop(dropZone(), { dataTransfer: { files: [good, dup, nogps] } });

    const added = await screen.findByRole('region', { name: 'Added' });
    expect(within(added).getAllByRole('listitem')).toHaveLength(1);
    expect(within(added).getByText('good.jpg')).toBeInTheDocument();
    const dups = screen.getByRole('region', { name: 'Duplicates skipped' });
    expect(within(dups).getAllByRole('listitem')).toHaveLength(1);
    const rej = screen.getByRole('region', { name: 'Rejected' });
    expect(within(rej).getAllByRole('listitem')).toHaveLength(1);
    expect(within(rej).getByText(/No location data/)).toBeInTheDocument();
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it('keeps local rejection reasons when the hash check fails', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    const good = new File(['1'], 'good.jpg');
    const nogps = new File(['2'], 'nogps.jpg');
    const png = new File(['3'], 'pic.png');
    const huge = new File(['4'], 'huge.jpg');
    const reasons = new Map<File, string>([
      [nogps, 'No location data'],
      [png, 'Not a JPEG or TIFF file.'],
      [huge, 'File is larger than 50 MB.'],
    ]);
    inspectFile.mockImplementation(async (f) =>
      f === good ? { ok: true, sha256: 'a'.repeat(64) } : { ok: false, reason: reasons.get(f) }
    );
    checkHashes.mockRejectedValue(new Error('500'));

    renderAt('/upload');
    await screen.findByText('Ann');
    fireEvent.drop(dropZone(), { dataTransfer: { files: [good, nogps, png, huge] } });

    const rej = await screen.findByRole('region', { name: 'Rejected' });
    await waitFor(() => expect(within(rej).getAllByRole('listitem')).toHaveLength(4));
    const reasonOf = (name: string) =>
      within(rej)
        .getAllByRole('listitem')
        .find((li) => li.textContent?.includes(name))?.textContent;
    expect(reasonOf('good.jpg')).toContain('Upload failed — please retry.');
    expect(reasonOf('nogps.jpg')).toContain('No location data');
    expect(reasonOf('nogps.jpg')).not.toContain('Upload failed');
    expect(reasonOf('pic.png')).toContain('Not a JPEG or TIFF file.');
    expect(reasonOf('huge.jpg')).toContain('File is larger than 50 MB.');
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('returns to sign-in when the server says signed out', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    inspectFile.mockResolvedValue({ ok: true, sha256: 'a'.repeat(64) });
    checkHashes.mockResolvedValue([]);
    const err = new Error('Signed out');
    err.name = 'SignedOutError';
    uploadFile.mockRejectedValue(err);
    renderAt('/upload');
    await screen.findByText('Ann');
    fireEvent.drop(dropZone(), { dataTransfer: { files: [new File(['1'], 'a.jpg')] } });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument()
    );
  });

  it('still signs out locally when logout rejects', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    logout.mockRejectedValue(new Error('network'));
    renderAt('/upload');
    await screen.findByText('Ann');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('revokes object URLs on unmount', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    inspectFile.mockResolvedValue({ ok: true, sha256: 'a'.repeat(64) });
    checkHashes.mockResolvedValue([]);
    uploadFile.mockResolvedValue({ status: 'added' });
    const { unmount } = renderAt('/upload');
    await screen.findByText('Ann');
    fireEvent.drop(dropZone(), { dataTransfer: { files: [new File(['1'], 'a.jpg')] } });
    await screen.findByRole('region', { name: 'Added' });
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});

describe('UploadPage in the app', () => {
  const NOGPS = 'No location data — on Android the browser may have removed it; try a computer.';
  let shareCb: (() => void) | null;
  const off = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true });
    native.isNativeApp.mockReturnValue(true);
    native.nativeHasSignedInBefore.mockResolvedValue(false);
    native.nativeSharedPhotos.mockResolvedValue({ files: [], failed: [] });
    native.nativeSignOut.mockResolvedValue();
    shareCb = null;
    native.onNativeShare.mockImplementation((cb) => {
      shareCb = cb;
      return off;
    });
    inspectFile.mockImplementation(async (f) => ({ ok: true, sha256: (f as File).name.padEnd(64, '0') }));
    checkHashes.mockResolvedValue([]);
    uploadFile.mockResolvedValue({ status: 'added' });
  });

  const added = async () => within(await screen.findByRole('region', { name: 'Added' }));

  it('in app, signed out shows a Sign in button, and success shows "Signed in as Ada"', async () => {
    getMe.mockResolvedValue(null);
    native.nativeSignIn.mockResolvedValue('tok');
    signInWithIdToken.mockResolvedValue({ displayName: 'Ada' });
    renderAt('/upload');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
    expect(native.nativeSignIn).toHaveBeenCalledWith(false);
    expect(signInWithIdToken).toHaveBeenCalledWith('tok');
    expect(screen.queryByRole('link', { name: 'Sign in with Google' })).toBeNull();
  });

  it('in app, denied token shows the not-allowed copy', async () => {
    getMe.mockResolvedValue(null);
    native.nativeSignIn.mockResolvedValue('tok');
    signInWithIdToken.mockResolvedValue('denied');
    renderAt('/upload');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByText('This account is not allowed to upload.')).toBeInTheDocument();
  });

  it('in app, a failed exchange shows the error copy', async () => {
    getMe.mockResolvedValue(null);
    native.nativeSignIn.mockResolvedValue('tok');
    signInWithIdToken.mockRejectedValue(new Error('401'));
    renderAt('/upload');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByText('Sign-in failed. Please try again.')).toBeInTheDocument();
  });

  it('in app, cancel shows no alert', async () => {
    getMe.mockResolvedValue(null);
    native.nativeSignIn.mockResolvedValue(null);
    renderAt('/upload');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
    await waitFor(() => expect(native.nativeSignIn).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('in app, silent sign-in runs on mount when signed in before', async () => {
    getMe.mockResolvedValue(null);
    native.nativeHasSignedInBefore.mockResolvedValue(true);
    native.nativeSignIn.mockResolvedValue('tok');
    signInWithIdToken.mockResolvedValue({ displayName: 'Ada' });
    renderAt('/upload');
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(native.nativeSignIn).toHaveBeenCalledWith(true);
  });

  it('in app, silent sign-in does not run when never signed in', async () => {
    getMe.mockResolvedValue(null);
    renderAt('/upload');
    await screen.findByRole('button', { name: 'Sign in with Google' });
    await waitFor(() => expect(native.nativeHasSignedInBefore).toHaveBeenCalled());
    expect(native.nativeSignIn).not.toHaveBeenCalled();
  });

  it('in app, a silent sign-in that throws leaves the signed-out view without an alert', async () => {
    getMe.mockResolvedValue(null);
    native.nativeHasSignedInBefore.mockResolvedValue(true);
    native.nativeSignIn.mockRejectedValue(new Error('FAILED'));
    renderAt('/upload');
    await screen.findByRole('button', { name: 'Sign in with Google' });
    await waitFor(() => expect(native.nativeSignIn).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('in app, Choose photos uploads picked files and lists failed ones as rejected', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    native.nativePickPhotos.mockResolvedValue({ files: [new File(['1'], 'a.jpg')], failed: ['cloud.jpg'] });
    renderAt('/upload');
    await screen.findByText('Ann');
    expect(screen.queryByLabelText('Choose photos', { selector: 'input' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose photos' }));
    expect((await added()).getByText('a.jpg')).toBeInTheDocument();
    const rej = await screen.findByRole('region', { name: 'Rejected' });
    expect(within(rej).getByText(/cloud\.jpg — Upload failed — please retry\./)).toBeInTheDocument();
  });

  it('in app, shared photos are processed on sign-in and again when a photosShared event fires', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    native.nativeSharedPhotos.mockResolvedValueOnce({ files: [new File(['1'], 'first.jpg')], failed: [] });
    renderAt('/upload');
    expect((await added()).getByText('first.jpg')).toBeInTheDocument();
    native.nativeSharedPhotos.mockResolvedValueOnce({ files: [new File(['2'], 'second.jpg')], failed: [] });
    await waitFor(() => expect(shareCb).not.toBeNull());
    shareCb?.();
    expect(await (await added()).findByText('second.jpg')).toBeInTheDocument();
  });

  it('in app, the share listener is removed on unmount', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    const { unmount } = renderAt('/upload');
    await screen.findByText('Ann');
    await waitFor(() => expect(native.onNativeShare).toHaveBeenCalled());
    unmount();
    expect(off).toHaveBeenCalled();
  });

  it('in app, a no-GPS rejection shows the in-app copy', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    inspectFile.mockResolvedValue({ ok: false, reason: NOGPS });
    native.nativeSharedPhotos.mockResolvedValueOnce({ files: [new File(['1'], 'shared.jpg')], failed: [] });
    renderAt('/upload');
    const rej = await screen.findByRole('region', { name: 'Rejected' });
    expect(within(rej).getByText(/the sharing app may have removed it; use Choose photos instead/)).toBeInTheDocument();
    expect(within(rej).queryByText(/try a computer/)).toBeNull();
  });

  it('in app, log out calls nativeSignOut', async () => {
    getMe.mockResolvedValue({ displayName: 'Ann' });
    logout.mockResolvedValue();
    renderAt('/upload');
    await screen.findByText('Ann');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Sign in with Google' });
    expect(native.nativeSignOut).toHaveBeenCalled();
  });
});
