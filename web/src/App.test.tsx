import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// jsdom has no <dialog> methods
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};

describe('Reel Studio (demo mode)', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('asks visitors to sign in before creating', async () => {
    render(<App />);
    expect(screen.getByText(/you'll see a sample clip/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to create' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signs in, shows the cost and makes a video', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1)!);
    await screen.findByText('credits', { exact: false, selector: '.credits' });
    expect(screen.getByText('10 credits')).toBeInTheDocument();

    fireEvent.click(screen.getByText('With sound'));
    expect(screen.getByText('15 credits')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Describe your video'), {
      target: { value: 'A drone shot over Victoria Falls at sunrise' },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Create video' }));
    await screen.findByText(/Getting started|Waiting in line|Rendering your/, { selector: '.busy-label' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Download video' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Your videos' })).toBeInTheDocument();
  });

  it('opens the admin page with ?admin', () => {
    window.history.pushState({}, '', '/?admin');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });
});
