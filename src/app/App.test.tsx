import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App shell', () => {
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
