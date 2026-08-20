import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// The app is behind sign-in, so the shell tests below have to say who is signed
// in. Mocking the session module (rather than the network) keeps these tests
// about the shell, and leaves the real sign-in logic to its own tests.
const auth = vi.hoisted(() => ({
  phase: 'signed-in' as 'checking' | 'signed-out' | 'signed-in',
  email: 'student@example.edu' as string | null,
  userId: 'u1' as string | null,
}));
const adminAccess = vi.hoisted(() => ({ allowed: false }));

vi.mock('../features/auth/session', () => ({
  useAuth: () => auth,
  signOut: vi.fn(),
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
}));

vi.mock('../lib/admin', () => ({
  checkAdmin: vi.fn(async () => adminAccess.allowed),
  clearAdminCache: vi.fn(),
}));

beforeEach(() => {
  auth.phase = 'signed-in';
  adminAccess.allowed = false;
});

describe('App shell (signed in)', () => {
  it('renders the brand, full nav, and the lazy dashboard route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // brand identity present
    expect(screen.getAllByText('Yanal').length).toBeGreaterThan(0);
    expect(screen.getByText('by Yanal · Cairo 2026')).toBeTruthy();

    // The core study destinations are visible without operational clutter.
    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
    for (const label of [
      'Dashboard',
      'Study',
      'Flashcards',
      'Question Bank',
      'Community',
      'Settings',
    ]) {
      expect(within(primaryNav).getByRole('link', { name: label })).toBeTruthy();
    }
    expect(within(primaryNav).queryByRole('link', { name: 'Subjects' })).toBeNull();
    expect(within(primaryNav).queryByRole('link', { name: 'Admin' })).toBeNull();

    // Less-frequent personal tools remain available behind one disclosure.
    fireEvent.click(screen.getByText('More tools'));
    for (const label of [
      'Planner',
      'Notes',
      'Calculators',
      'Mnemonics',
      'Resources',
    ]) {
      expect(within(primaryNav).getByRole('link', { name: label })).toBeTruthy();
    }

    // The lazy home is action-oriented rather than a decorative analytics wall.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Study today' })).toBeTruthy());
    expect(document.querySelector('.haki-hero')).toBeNull();

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile study navigation' });
    for (const label of ['Home', 'Study', 'Review', 'Questions']) {
      expect(within(mobileNav).getByRole('link', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Open more study tools' })).toBeTruthy();

    // watermark seal present
    expect(document.querySelector('.watermark')).toBeTruthy();
    expect(document.querySelector('.watermark')?.textContent).not.toContain(auth.email);
  });

  it('renders a lazy non-index route', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'AI tutor' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Administrator' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Card engine' })).toBeNull();
  });

  it('shows the operations route only to a server-confirmed administrator', async () => {
    adminAccess.allowed = true;
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('link', { name: 'Admin' })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Admin' })).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Shared study content' })).toBeTruthy();
  });

  it('denies a student who enters the admin URL directly', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Administrator access required' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Shared study content' })).toBeNull();
  });
});

describe('App shell (signed out)', () => {
  // The security property, asserted rather than assumed: with no session there is
  // no app — no navigation, no routes, nothing a visitor could read.
  it('shows sign-in and none of the app', () => {
    auth.phase = 'signed-out';
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(document.querySelector('.signin')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Study' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Question Bank' })).toBeNull();
    expect(document.querySelector('.sidebar')).toBeNull();
  });

  it('renders nothing at all while the stored session is still being read', () => {
    auth.phase = 'checking';
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    // Neither the app nor the sign-in form — the pre-React loading shell is still
    // showing, which is what stops a returning student seeing a sign-in flash.
    expect(container.querySelector('.signin')).toBeNull();
    expect(container.querySelector('.sidebar')).toBeNull();
  });
});
