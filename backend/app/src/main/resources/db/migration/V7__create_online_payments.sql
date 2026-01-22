-- V7__create_online_payments.sql
-- Online payment gateway integration (Razorpay/PayU)

CREATE TABLE payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED')),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('RAZORPAY', 'PAYU', 'MANUAL')),
    "providerOrderId" VARCHAR(100),
    "providerPaymentId" VARCHAR(100),
    "providerSignature" VARCHAR(256),
    "attemptCount" INTEGER DEFAULT 0,
    "lastAttemptAt" TIMESTAMP WITH TIME ZONE,
    "paidAt" TIMESTAMP WITH TIME ZONE,
    "failureReason" TEXT,
    metadata JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE payment_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID,
    provider VARCHAR(20) NOT NULL,
    "eventType" VARCHAR(50) NOT NULL,
    "eventId" VARCHAR(100),
    payload JSONB NOT NULL,
    "processedAt" TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for payment orders
CREATE INDEX idx_payment_orders_tenant ON payment_orders("tenantId");
CREATE INDEX idx_payment_orders_invoice ON payment_orders("tenantId", "invoiceId");
CREATE INDEX idx_payment_orders_student ON payment_orders("tenantId", "studentId");
CREATE INDEX idx_payment_orders_status ON payment_orders("tenantId", status);
CREATE INDEX idx_payment_orders_provider_id ON payment_orders("providerOrderId");

-- Indexes for webhooks
CREATE INDEX idx_payment_webhooks_event ON payment_webhooks("eventId");
CREATE INDEX idx_payment_webhooks_status ON payment_webhooks(status);

COMMENT ON TABLE payment_orders IS 'Online payment orders created for fee invoices';
COMMENT ON TABLE payment_webhooks IS 'Payment gateway webhook events for audit and processing';
