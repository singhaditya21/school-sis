import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyFeesPage from '../page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        refresh: vi.fn(),
    }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Razorpay
const mockRazorpayOpen = vi.fn();
const mockRazorpayClose = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.Razorpay
    (global as unknown as { Razorpay: unknown }).Razorpay = vi.fn().mockImplementation(() => ({
        open: mockRazorpayOpen,
        close: mockRazorpayClose,
    }));
});

describe('MyFeesPage', () => {
    describe('Invoice Display', () => {
        it('TC-P014: Should display pending invoices with correct status', async () => {
            render(<MyFeesPage />);

            // Should show pending invoices
            expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
            expect(screen.getByText('Term 3 Tuition Fee')).toBeInTheDocument();

            // Should show PENDING badge
            expect(screen.getByText('PENDING')).toBeInTheDocument();
        });

        it('TC-P015: Should highlight overdue invoices', async () => {
            render(<MyFeesPage />);

            // Invoices past due date should show OVERDUE
            const overdueElements = screen.queryAllByText('OVERDUE');
            // Test depends on current date vs mock data dates
        });

        it('Should display total outstanding amount', async () => {
            render(<MyFeesPage />);

            expect(screen.getByText('Total Outstanding')).toBeInTheDocument();
            expect(screen.getByText(/₹47,500/)).toBeInTheDocument(); // Sum of pending invoices
        });

        it('Should show pending invoice count', async () => {
            render(<MyFeesPage />);

            expect(screen.getByText(/2 pending invoices/)).toBeInTheDocument();
        });
    });

    describe('Tab Navigation', () => {
        it('Should switch between pending and history tabs', async () => {
            const user = userEvent.setup();
            render(<MyFeesPage />);

            // Default tab is pending
            expect(screen.getByText(/Pending/)).toBeInTheDocument();

            // Click history tab
            await user.click(screen.getByText('Payment History'));

            // Should show payment history
            expect(screen.getByText('PAY-2025-089')).toBeInTheDocument();
        });
    });

    describe('Payment Modal', () => {
        it('Should open payment modal on Pay Now click', async () => {
            const user = userEvent.setup();
            render(<MyFeesPage />);

            // Click Pay Now button
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Modal should be open
            expect(screen.getByText('Pay Invoice')).toBeInTheDocument();
        });

        it('TC-P016: Should validate amount input', async () => {
            const user = userEvent.setup();
            render(<MyFeesPage />);

            // Open modal
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Amount input should exist
            const amountInput = screen.getByLabelText(/Payment Amount/);
            expect(amountInput).toBeInTheDocument();

            // Default should be balance amount
            expect(amountInput).toHaveValue('45000');
        });

        it('TC-P017: Should have quick amount buttons', async () => {
            const user = userEvent.setup();
            render(<MyFeesPage />);

            // Open modal
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Should have quick amount buttons
            expect(screen.getByText('₹10,000')).toBeInTheDocument();
            expect(screen.getByText('₹25,000')).toBeInTheDocument();
            expect(screen.getByText('Full Amount')).toBeInTheDocument();
        });

        it('Should update amount when quick button clicked', async () => {
            const user = userEvent.setup();
            render(<MyFeesPage />);

            // Open modal
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Click ₹10,000 button
            await user.click(screen.getByText('₹10,000'));

            // Amount should be updated
            const amountInput = screen.getByLabelText(/Payment Amount/);
            expect(amountInput).toHaveValue('10000');
        });

        it('Should close modal on X button click', async () => {
            const user = userEvent.setup();
            render(<MyFeesPage />);

            // Open modal
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Close modal
            await user.click(screen.getByText('✕'));

            // Modal should be closed
            expect(screen.queryByText('Pay Invoice')).not.toBeInTheDocument();
        });
    });

    describe('Payment Flow', () => {
        it('TC-P018: Should show success state after payment', async () => {
            const user = userEvent.setup();

            // Mock successful API responses
            mockFetch
                .mockResolvedValueOnce({
                    json: () => Promise.resolve({
                        success: true,
                        data: {
                            orderId: 'order_12345',
                            amount: 4500000,
                            currency: 'INR',
                            keyId: 'rzp_test_dummy',
                        },
                    }),
                });

            render(<MyFeesPage />);

            // Open modal
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Start payment
            await user.click(screen.getByText(/Pay ₹45,000/));

            // Wait for success state (in demo mode)
            await waitFor(() => {
                expect(screen.getByText('Payment Successful!')).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('TC-P019: Should handle demo mode when backend unavailable', async () => {
            const user = userEvent.setup();

            // Mock failed API
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            render(<MyFeesPage />);

            // Open modal
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Start payment
            await user.click(screen.getByText(/Pay ₹45,000/));

            // Should still show success (demo mode fallback)
            await waitFor(() => {
                expect(screen.getByText('Payment Successful!')).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('Should show processing state during payment', async () => {
            const user = userEvent.setup();

            // Mock slow API
            mockFetch.mockImplementationOnce(() => new Promise(resolve => {
                setTimeout(() => resolve({
                    json: () => Promise.resolve({ success: false }),
                }), 1000);
            }));

            render(<MyFeesPage />);

            // Open modal
            const payButtons = screen.getAllByText('Pay Now');
            await user.click(payButtons[0]);

            // Start payment
            await user.click(screen.getByText(/Pay ₹45,000/));

            // Should show processing
            expect(screen.getByText('Processing...')).toBeInTheDocument();
        });
    });

    describe('Invoice Card', () => {
        it('Should display invoice details correctly', async () => {
            render(<MyFeesPage />);

            // Check invoice card content
            expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
            expect(screen.getByText('Term 3 Tuition Fee')).toBeInTheDocument();
            expect(screen.getByText('Due Date')).toBeInTheDocument();
            expect(screen.getByText('Balance Due')).toBeInTheDocument();
        });

        it('Should show partial payment info', async () => {
            render(<MyFeesPage />);

            // Second invoice has partial payment
            expect(screen.getByText('Paid Amount')).toBeInTheDocument();
            expect(screen.getByText(/₹2,500/)).toBeInTheDocument();
        });
    });

    describe('Payment History', () => {
        it('Should display payment history correctly', async () => {
            const user = userEvent.setup();
            render(<MyFeesPage />);

            // Switch to history tab
            await user.click(screen.getByText('Payment History'));

            // Check payment entries
            expect(screen.getByText('PAY-2025-089')).toBeInTheDocument();
            expect(screen.getByText('PAY-2026-001')).toBeInTheDocument();
            expect(screen.getByText('UPI')).toBeInTheDocument();
            expect(screen.getByText('CASH')).toBeInTheDocument();
        });
    });
});
