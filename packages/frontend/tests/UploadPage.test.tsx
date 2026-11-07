import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { jest } from '@jest/globals';

const getMe = jest.fn<() => Promise<{ displayName: string } | null>>();
const checkHashes = jest.fn<(h: string[]) => Promise<string[]>>();
const uploadFile = jest.fn<(f: File, s: string) => Promise<unknown>>();
const logout = jest.fn<() => Promise<void>>();
const inspectFile = jest.fn<(f: File) => Promise<unknown>>();

jest.unstable_mockModule('../src/services/UploadClient', () => ({
  UPLOAD_FAILED_COPY: 'Upload failed — please retry.',
  UploadClient: class {
    getMe = getMe;
    checkHashes = checkHashes;
    uploadFile = uploadFile;
    logout = logout;
  },
}));
jest.unstable_mockModule('../src/utils/fileInspection', () => ({ inspectFile }));

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
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
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
