# Saplaya Backend Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATIONS                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Mobile App      │  │  Web Dashboard   │  │  Admin Panel │  │
│  │  (Customer)      │  │  (Agent)         │  │              │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                   HTTP/REST API Calls
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                    EXPRESS.JS BACKEND                             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    API Routes                              │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ /api/orders-agents/*    ← NEW ORDERS & AGENTS API  │   │  │
│  │  │   • /agents/:id         (profiles, stats)          │   │  │
│  │  │   • /orders/available   (list claimable orders)    │   │  │
│  │  │   • /orders/claim       (agent claims order)       │   │  │
│  │  │   • /orders/:id/pickup  (mark picked up)           │   │  │
│  │  │   • /orders/:id/delivered (mark delivered)         │   │  │
│  │  │   • /orders/for-other   (order for someone else)   │   │  │
│  │  │   • /commissions        (earnings management)      │   │  │
│  │  │   • /notifications      (alerts & updates)         │   │  │
│  │  │   • /admin/*            (admin operations)         │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ Existing Routes                                     │   │  │
│  │  │   • /products          (storefront)                 │   │  │
│  │  │   • /locations/*       (geography)                  │   │  │
│  │  │   • /admin/*           (management)                 │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Authentication & Middleware                   │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │ • authenticateUser()  → JWT token validation        │  │  │
│  │  │ • handleZodError()    → validation error formatting │  │  │
│  │  │ • errorHandler()      → unified error responses     │  │  │
│  │  │ • Express.Request<user> → type-safe user context   │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐         ┌────▼────┐        ┌────▼────┐
    │ Supabase │         │ Firebase │       │ Email   │
    │   DB    │         │  (Auth)  │       │ Service │
    └─────────┘         └──────────┘       └─────────┘
```

## Data Flow: Order Claiming (Uber-like)

```
AGENT APP                    BACKEND                         DB
     │                          │                            │
     ├─ Opens app ─────────────▶ GET /orders/available ─────▶│
     │                          │  (location filtered)       │
     │◀────── Available Orders ──│◀──────── List Orders ──────┤
     │                          │                            │
     ├─ Taps "Claim" ──────────▶ POST /orders/claim ─────────▶│
     │  (sends agentId, orderId)│                            │
     │                          │  1. Verify agent owns    │
     │                          │  2. Check order not      │
     │                          │     already claimed      │
     │                          │  3. Update order table   │
     │                          │     status→"accepted"    │
     │                          │  4. Create order_claims  │
     │                          │     record               │
     │◀── Order Accepted ───────│◀──── Success Response ────┤
     │                          │                            │
     ├─ Navigates to pickup ──▶ (GPS tracking via app)      │
     │                                                        │
     ├─ At pickup location ────▶ PATCH /orders/:id/pickup ──▶│
     │                          │                            │
     │                          │  1. Verify agent         │
     │                          │  2. Update status→       │
     │                          │     "picked_up"          │
     │                          │  3. Set picked_up_at     │
     │◀── Pickup Confirmed ────│                            │
     │                          │                            │
     ├─ Takes proof photo ───▶ PATCH /orders/:id/delivered ─▶│
     │                          │                            │
     │                          │  1. Verify agent         │
     │                          │  2. Update status→       │
     │                          │     "delivered"          │
     │                          │  3. Save proof image     │
     │                          │  4. Calculate commission │
     │                          │     (10% of subtotal)    │
     │                          │  5. Create commission    │
     │                          │     record               │
     │◀─ Delivery Complete ────│◀── Earnings Updated ──────┤
```

## Data Flow: Order for Others

```
CUSTOMER APP                 BACKEND                        DB
     │                          │                           │
     ├─ Fill order form ─────────────────────────────────────│
     │  (recipient name, phone, email)                       │
     │                                                        │
     ├─ Add items ───────────────────────────────────────────│
     │  (qty, price, etc.)                                   │
     │                                                        │
     ├─ Submit ──────────────▶ POST /orders/for-other ──────▶│
     │                          │                            │
     │                          │  1. Validate input       │
     │                          │  2. Get product prices   │
     │                          │  3. Calculate subtotal   │
     │                          │  4. Create order record  │
     │                          │  5. Create order_items   │
     │                          │  6. Set ordered_by to    │
     │                          │     current user         │
     │◀─ Order Confirmed ─────│                            │
     │                          │                           │
     │  ─────────────────────▶  Send email to recipient     │
     │                          (order details, tracking)
     │                                                        │
     │  (Later) Agents claim & deliver...
     │
```

## Commission Flow

```
ORDER DELIVERY                 BACKEND                       DB
       │                           │                        │
       ├─ Agent delivers ─────────▶ PATCH /delivered ──────▶│
       │                           │                        │
       │                           │  1. Update order     │
       │                           │  2. Create:          │
       │                           │     commissions {    │
       │                           │       amount: 5000,  │
       │                           │       status:        │
       │                           │       "pending"      │
       │                           │     }               │
       │                           │                    │
       │◀─ Earnings added ────────│                     │
       │                           │                    │
    (Later)                                            │
    ADMIN APPROVAL                                    │
       │                           │                 │
       │◀────── Commissions ───────│◀─ UPDATE status  │
       │        (pending total)    │   "approved"     │
       │                           │                 │
    AGENT WITHDRAWAL                                 │
       │                           │                │
       ├─ Click "Withdraw" ───────▶ POST /withdraw ─▶│
       │                           │                 │
       │                           │  1. Create:     │
       │                           │     withdrawals │
       │                           │     {amount}    │
       │                           │  2. Commission  │
       │                           │     → "paid"    │
       │◀─ Request Sent ─────────│                  │
       │                           │                 │
    (Payment Processing...)         (Transfer to bank)
       │◀─── Payout Complete ─────│◀─ UPDATE status │
       │                           │   "completed"   │
```

## Component Relationships

```
┌─────────────────────────────────────────┐
│          Middleware (middleware.ts)      │
│  ├─ authenticateUser()                  │
│  ├─ handleZodError()                    │
│  └─ errorHandler()                      │
└────────┬────────────────────────────────┘
         │ uses
         ▼
┌─────────────────────────────────────────┐
│      Orders & Agents (orders-agents.ts) │
│  ├─ Agent Endpoints (6)                 │
│  ├─ Order Claiming (3)                  │
│  ├─ Order for Others (1)                │
│  ├─ Commission Management (2)           │
│  ├─ Notifications (2)                   │
│  └─ Admin Operations (2)                │
└────────┬────────────────────────────────┘
         │ connects to
         ▼
┌─────────────────────────────────────────┐
│        Supabase Database                 │
│  ├─ agents                              │
│  ├─ orders                              │
│  ├─ order_items                         │
│  ├─ order_claims                        │
│  ├─ commissions                         │
│  ├─ withdrawals                         │
│  └─ notifications                       │
└─────────────────────────────────────────┘
```

## Technology Stack

```
┌──────────────────┐
│  TypeScript 5.6  │  Language
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  Express.js 4.21 │  HTTP Framework
└──────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Supabase PostgreSQL API │  Database
└──────────────────────────┘
         │
    ┌────┴────┬─────────┬─────────┐
    │          │         │         │
    ▼          ▼         ▼         ▼
  Auth      Database  Realtime  Storage
```

## Key Files

```
src/
├── index.ts                    (Main app, 900+ lines)
│   ├─ Setup Express, CORS, middleware
│   ├─ Location endpoints
│   ├─ Product browsing
│   ├─ Admin dashboard
│   └─ Mounts: ordersAgentsRouter
│
├── middleware.ts              (NEW - 50 lines)
│   ├─ authenticateUser()
│   ├─ handleZodError()
│   └─ errorHandler()
│
├── orders-agents.ts           (REFACTORED - 650 lines)
│   ├─ Agent profile management
│   ├─ Order claiming system
│   ├─ Order-for-others functionality
│   ├─ Commission tracking
│   ├─ Notifications
│   └─ Admin operations
│
└── [existing files]
    ├─ storefront.ts
    ├─ customer-orders.ts
    ├─ team-auth.ts
    ├─ management.ts
    └─ pesapal.ts
```

## Error Handling Flow

```
USER REQUEST
     │
     ▼
MIDDLEWARE: authenticateUser()
     │
     ├─ Valid token? ──YES──▶ Extract user info
     │                           │
     │                           ▼
     │                    ROUTE HANDLER
     │                           │
     │                      Parse/Validate
     │                           │
     │ Invalid ◀────────────────┘
     │ token?                  Zod Error?
     │                           │
     ▼                           ▼
401 Unauthorized         ┌──────────────────┐
                         │ handleZodError() │
                         └──────────────────┘
                                 │
                                 ▼
                           400 Bad Request
                         (validation details)

                        ┌──────────────────────┐
                        │  errorHandler()      │
                        │  (catches unknown)   │
                        └──────────────────────┘
                                 │
                                 ▼
                           500 Server Error
```

---

**See also:**
- BACKEND_UPDATES.md - Implementation summary
- ORDERS_AGENTS_GUIDE.md - Complete API documentation
- PESAPAL.md - Payment integration details
