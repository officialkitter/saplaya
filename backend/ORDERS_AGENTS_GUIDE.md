# Saplaya Backend - Orders & Agents System

## Overview

The backend has been updated with a complete **Uber-like order fulfillment system** that enables:

- **Dual-role users**: Customers can also become service providers (agents)
- **Order claiming**: Agents browse available orders and claim them for delivery
- **Commission-based earnings**: Agents earn commissions on completed deliveries
- **Real-time tracking**: Location-based order management and delivery tracking
- **Order-for-others**: Customers can place orders for other people (like Uber Eats)

## Fixed Issues

### ✅ TypeScript Errors Resolved
1. **Missing `nodemailer` package** - Added to dependencies with type definitions
2. **ZodError handling** - Fixed `.errors` property (use `.issues` instead)
3. **Request type augmentation** - Created middleware with proper Express type extension
4. **Zod schema validation** - Fixed `.refine()` and `.record()` method signatures

### ✅ Authentication
- Centralized auth middleware in `middleware.ts`
- Proper error handling and validation
- Token-based authentication via Supabase

## Architecture

### Core Files

| File | Purpose |
|------|---------|
| `middleware.ts` | Authentication, error handling, type extensions |
| `orders-agents.ts` | Agents, orders, claims, and commissions endpoints |
| `index.ts` | Main Express app setup and routing |

### Database Schema Requirements

Create these tables in Supabase:

```sql
-- Agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  full_name VARCHAR NOT NULL,
  phone VARCHAR,
  bank_account VARCHAR, -- For commission payouts
  profile_image TEXT,
  bio TEXT,
  rating DECIMAL(3, 2) DEFAULT 5.0,
  total_deliveries INT DEFAULT 0,
  total_earnings BIGINT DEFAULT 0,
  status VARCHAR DEFAULT 'active', -- active, inactive, suspended
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  agent_id UUID REFERENCES agents(id),
  ordered_by UUID REFERENCES auth.users(id), -- Who placed the order (can be different from customer)
  recipient_name VARCHAR,
  recipient_phone VARCHAR,
  recipient_email VARCHAR,
  special_instructions TEXT,
  mode VARCHAR NOT NULL DEFAULT 'retail', -- retail, wholesale
  delivery_lat DECIMAL(10, 8),
  delivery_lng DECIMAL(11, 8),
  subtotal BIGINT NOT NULL, -- in cents
  delivery_fee BIGINT DEFAULT 0,
  status VARCHAR DEFAULT 'pending', -- pending, accepted, picked_up, delivered, cancelled
  proof_image TEXT, -- Base64 or URL of delivery proof
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  qty INT NOT NULL,
  unit_price BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Order claims
CREATE TABLE order_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  claimed_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status VARCHAR DEFAULT 'active' -- active, completed, cancelled
);

-- Commissions
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  amount BIGINT NOT NULL, -- in cents (calculated on delivery)
  status VARCHAR DEFAULT 'pending', -- pending, approved, paid, cancelled
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP
);

-- Withdrawals
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  amount BIGINT NOT NULL,
  status VARCHAR DEFAULT 'pending', -- pending, processing, completed, rejected
  requested_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  transaction_id VARCHAR
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type VARCHAR NOT NULL, -- order_update, payment, system
  subject VARCHAR NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Agent Profile Management

#### Get Agent Profile
```http
GET /api/orders-agents/agents/:agentId
Authorization: Bearer {token}
```

#### Update Agent Profile
```http
PUT /api/orders-agents/agents/:agentId
Authorization: Bearer {token}
Content-Type: application/json

{
  "fullName": "John Doe",
  "phone": "+255789123456",
  "bankAccount": "TZTZ0123456789",
  "profileImage": "https://...",
  "bio": "Reliable delivery partner"
}
```

#### Get Agent Statistics
```http
GET /api/orders-agents/agents/:agentId/stats
Authorization: Bearer {token}
```

Response:
```json
{
  "totalOrdersClaimed": 150,
  "completedOrders": 145,
  "activeOrders": 3,
  "cancelledOrders": 2,
  "avgCompletionTime": 28
}
```

### Order Management (Uber-like)

#### List Available Orders
```http
GET /api/orders-agents/orders/available?latitude=LAT&longitude=LNG&radius=5
Authorization: Bearer {token}
```

Returns nearby unclaimed orders sorted by recency.

#### Claim an Order
```http
POST /api/orders-agents/orders/claim
Authorization: Bearer {token}
Content-Type: application/json

{
  "orderId": "uuid",
  "agentId": "uuid"
}
```

#### Mark Order as Picked Up
```http
PATCH /api/orders-agents/orders/:orderId/pickup
Authorization: Bearer {token}
```

#### Mark Order as Delivered
```http
PATCH /api/orders-agents/orders/:orderId/delivered
Authorization: Bearer {token}
Content-Type: application/json

{
  "proofImage": "base64_encoded_image_or_url"
}
```

### Order for Others (Customer Places Order for Someone Else)

#### Place Order for Another Person
```http
POST /api/orders-agents/orders/for-other
Authorization: Bearer {token}
Content-Type: application/json

{
  "customerId": "uuid",
  "recipientName": "Jane Doe",
  "recipientPhone": "+255789654321",
  "recipientEmail": "jane@example.com",
  "items": [
    {
      "productId": "uuid",
      "qty": 2
    }
  ],
  "mode": "retail",
  "deliveryLat": -6.7924,
  "deliveryLng": 39.2083,
  "specialInstructions": "Ring the bell twice"
}
```

### Commission Management

#### Get Agent Commissions
```http
GET /api/orders-agents/agents/:agentId/commissions
Authorization: Bearer {token}
```

Response:
```json
{
  "commissions": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "order_id": "uuid",
      "amount": 5000,
      "status": "pending",
      "created_at": "2024-11-15T10:30:00Z"
    }
  ],
  "totals": {
    "pending": 50000,
    "approved": 150000,
    "paid": 500000,
    "cancelled": 0
  }
}
```

#### Withdraw Commission
```http
POST /api/orders-agents/agents/:agentId/withdraw
Authorization: Bearer {token}
Content-Type: application/json

{
  "amount": 100000
}
```

### Notifications

#### Get User Notifications
```http
GET /api/orders-agents/notifications
Authorization: Bearer {token}
```

#### Mark Notification as Read
```http
PATCH /api/orders-agents/notifications/:notificationId/read
Authorization: Bearer {token}
```

## Key Features

### 1. Dual-Role System
- Users can be both customers and service providers (agents)
- Separate profile for agents with bank account for withdrawals
- Rating system to track agent performance

### 2. Uber-like Order Claiming
- Agents view available orders in real-time
- Distance-based filtering (5km radius by default)
- Order status tracking: pending → accepted → picked_up → delivered
- Automatic commission calculation (10% default)

### 3. Order for Others
- Customer A can place order for Customer B (like sending a gift)
- Order is marked with `ordered_by` vs `customer_id`
- Notifications sent to recipient
- Supports delivery instructions

### 4. Commission System
- **Automatic calculation**: 10% of order subtotal on delivery
- **Status tracking**: pending → approved → paid
- **Withdrawal requests**: Agents can withdraw earnings
- **Bank integration ready**: Store bank account details for payout

### 5. Real-Time Notifications
- Order claimed notifications
- Pickup alerts
- Delivery confirmation
- Commission updates
- Email support via nodemailer

## Error Handling

All endpoints return proper error responses:

```json
// Validation error
{
  "error": "Validation error",
  "details": [
    {
      "field": "orderId",
      "message": "Invalid UUID"
    }
  ]
}

// Authorization error
{
  "error": "Forbidden - You can only update your own profile"
}

// Not found
{
  "error": "Order not found"
}
```

## Environment Variables

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIs...

# Email (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Admin operations
FARM_DELETE_CODE=secure_delete_code
```

## Running the Backend

### Development
```bash
cd backend
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

## Next Steps

1. **Set up Supabase tables** using the schema above
2. **Configure email provider** (Gmail, SendGrid, etc.)
3. **Add payment integration** (already supports PesaPal)
4. **Deploy to production** with proper environment variables
5. **Set up webhooks** for real-time updates

## Support

For issues or questions about the order system, refer to the API documentation above or check the test files in `./test/`
