import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../features/auth/session', () => ({
  useAuth: () => auth,
  signOut: vi.fn(),
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
}));

beforeEach(() => {
  auth.phase = 'signed-in';
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

    // every view has a nav entry
    for (const label of [
      'Dashboard',
      'Study',
      'Subjects',
      'Flashcards',
      'Question Bank',
      'Planner',
      'Notes',
      'Calculators',
      'Mnemonics',
      'Resources',
      'Settings',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy();
    }

    // the lazily-loaded dashboard view eventually renders (haki hero + signature)
    await waitFor(() => expect(document.querySelector('.haki-hero')).toBeTruthy());
    expect(document.querySelector('.haki-name')?.textContent).toBe('Yanal');

    // watermark seal present
    expect(document.querySelector('.watermark')).toBeTruthy();
  });

  it('renders a lazy non-index route', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy());
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
