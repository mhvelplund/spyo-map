import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter, useLocation } from 'react-router';

const native = { isNativeApp: jest.fn<() => boolean>() };
jest.unstable_mockModule('../src/utils/native', () => native);

const { default: HeaderAccount } = await import('../src/components/HeaderAccount');

const LocationProbe = () => <div data-testid="search">{useLocation().search}</div>;

const renderAt = (
  me: { displayName: string; isAdmin: boolean } | null | undefined,
  onSignOut = jest.fn<() => Promise<void>>(),
  entry = '/map',
) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <HeaderAccount me={me} onSignOut={onSignOut} />
      <LocationProbe />
    </MemoryRouter>,
  );

describe('HeaderAccount', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    native.isNativeApp.mockReturnValue(false);
  });

  it('renders nothing while loading', () => {
    renderAt(undefined);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a sign-in link when signed out', () => {
    renderAt(null);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login/google?return=map');
    expect(screen.queryByRole('link', { name: 'Upload photos' })).not.toBeInTheDocument();
  });

  it('shows upload link then sign-out button when signed in', () => {
    const onSignOut = jest.fn<() => Promise<void>>().mockResolvedValue();
    renderAt({ displayName: 'MH', isAdmin: false }, onSignOut);
    const upload = screen.getByRole('link', { name: 'Upload photos' });
    expect(upload).toHaveAttribute('href', '#/upload');
    const out = screen.getByRole('button', { name: 'Sign out MH' });
    expect(out).toHaveAttribute('title', 'MH');
    expect(upload.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(out);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it.each([null, { displayName: 'MH', isAdmin: false }])('renders nothing in the native app (%p)', (me) => {
    native.isNativeApp.mockReturnValue(true);
    renderAt(me);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the denied notice and clears the search on dismiss', () => {
    renderAt(null, undefined, '/map?signin=denied');
    expect(screen.getByText("This Google account isn't allowed to sign in.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText("This Google account isn't allowed to sign in.")).not.toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('swallows a rejecting onSignOut', async () => {
    const onSignOut = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('boom'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    renderAt({ displayName: 'MH', isAdmin: false }, onSignOut);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out MH' }));
    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', unhandled);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('shows the error notice', () => {
    renderAt(null, undefined, '/map?signin=error');
    expect(screen.getByText('Sign-in failed — please try again.')).toBeInTheDocument();
  });

  it('drops the param after a successful sign-in', () => {
    renderAt({ displayName: 'MH', isAdmin: false }, undefined, '/map?signin=denied');
    expect(screen.getByTestId('search').textContent).toBe('');
  });
});
