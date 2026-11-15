-- ============================================
-- SAPLAYA ORDER & AGENT SYSTEM - DATABASE SCHEMA
-- ============================================
-- Run this SQL in Supabase SQL Editor
-- This creates all necessary tables for the Uber-like order system

-- ============================================
-- 1. AGENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL, -- 'bike', 'motorcycle', 'car', 'van'
  vehicle_plate TEXT,
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  is_active BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  total_deliveries INTEGER DEFAULT 0,
  total_earnings DECIMAL(12, 2) DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 5.0,
  status TEXT DEFAULT 'offline', -- 'online', 'offline', 'on_delivery'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT vehicle_type_check CHECK (vehicle_type IN ('bike', 'motorcycle', 'car', 'van'))
);

-- ============================================
-- 2. ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'picked_up', 'delivered', 'cancelled'
  pickup_address TEXT NOT NULL,
  pickup_latitude DECIMAL(10, 8) NOT NULL,
  pickup_longitude DECIMAL(11, 8) NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_latitude DECIMAL(10, 8) NOT NULL,
  delivery_longitude DECIMAL(11, 8) NOT NULL,
  estimated_distance_km DECIMAL(8, 2),
  estimated_delivery_time_minutes INTEGER,
  order_subtotal DECIMAL(12, 2) NOT NULL,
  delivery_fee DECIMAL(12, 2),
  total_amount DECIMAL(12, 2) NOT NULL,
  payment_method TEXT, -- 'card', 'mpesa', 'wallet'
  payment_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  special_instructions TEXT,
  pickup_proof_image_url TEXT,
  delivery_proof_image_url TEXT,
  claimed_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT status_check CHECK (status IN ('pending', 'accepted', 'picked_up', 'delivered', 'cancelled')),
  CONSTRAINT payment_method_check CHECK (payment_method IN ('card', 'mpesa', 'wallet')),
  CONSTRAINT payment_status_check CHECK (payment_status IN ('pending', 'completed', 'failed'))
);

-- ============================================
-- 3. ORDER RECIPIENTS TABLE (for order-for-others)
-- ============================================
CREATE TABLE IF NOT EXISTS order_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_email TEXT,
  is_recipient_notified BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 4. COMMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  percentage DECIMAL(5, 2) DEFAULT 10,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'withdrawn'
  withdrawal_id UUID REFERENCES withdrawals(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT status_check CHECK (status IN ('pending', 'approved', 'withdrawn'))
);

-- ============================================
-- 5. WITHDRAWALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  payment_method TEXT, -- 'mpesa', 'bank', 'wallet'
  mpesa_phone TEXT,
  bank_account TEXT,
  bank_name TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  CONSTRAINT status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT payment_method_check CHECK (payment_method IN ('mpesa', 'bank', 'wallet'))
);

-- ============================================
-- 6. NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'order_placed', 'order_claimed', 'order_picked_up', 'order_delivered', 'commission_earned', 'withdrawal_approved'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 7. ORDER RATINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS order_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 8. ACTIVITY LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT, -- 'order', 'agent', 'withdrawal', etc.
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Agents
CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_location ON agents(current_latitude, current_longitude);

-- Orders
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_agent_id ON orders(agent_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_location ON orders(pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude);

-- Commissions
CREATE INDEX idx_commissions_agent_id ON commissions(agent_id);
CREATE INDEX idx_commissions_order_id ON commissions(order_id);
CREATE INDEX idx_commissions_status ON commissions(status);

-- Withdrawals
CREATE INDEX idx_withdrawals_agent_id ON withdrawals(agent_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);

-- Notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Activity Logs
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Agents: Users can only view/edit their own profile
CREATE POLICY "Users can view their own agent profile"
  ON agents FOR SELECT
  USING (user_id = auth.uid() OR true); -- Allow public view for customer ordering

CREATE POLICY "Users can update their own agent profile"
  ON agents FOR UPDATE
  USING (user_id = auth.uid());

-- Orders: Users can only view/edit their own orders
CREATE POLICY "Users can view their own orders"
  ON orders FOR SELECT
  USING (user_id = auth.uid() OR agent_id = (SELECT id FROM agents WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own orders"
  ON orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Commissions: Agents can only view their own commissions
CREATE POLICY "Agents can view their own commissions"
  ON commissions FOR SELECT
  USING (agent_id = (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Withdrawals: Agents can only view their own withdrawals
CREATE POLICY "Agents can view their own withdrawals"
  ON withdrawals FOR SELECT
  USING (agent_id = (SELECT id FROM agents WHERE user_id = auth.uid()));

-- Notifications: Users can only view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- VIEWS for Common Queries
-- ============================================

CREATE OR REPLACE VIEW agent_earnings_summary AS
SELECT 
  a.id,
  a.user_id,
  a.total_deliveries,
  a.total_earnings,
  COUNT(c.id) as pending_commissions,
  SUM(CASE WHEN c.status = 'pending' THEN c.amount ELSE 0 END) as pending_commission_amount,
  a.average_rating,
  a.status,
  a.updated_at
FROM agents a
LEFT JOIN commissions c ON a.id = c.agent_id AND c.status = 'pending'
GROUP BY a.id, a.user_id;

CREATE OR REPLACE VIEW order_status_summary AS
SELECT 
  u.id as user_id,
  COUNT(*) as total_orders,
  COUNT(CASE WHEN o.status = 'pending' THEN 1 END) as pending_orders,
  COUNT(CASE WHEN o.status = 'accepted' THEN 1 END) as accepted_orders,
  COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as delivered_orders,
  COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
  SUM(o.total_amount) as total_spent
FROM auth.users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;

-- ============================================
-- FUNCTIONS for Business Logic
-- ============================================

-- Function to calculate Haversine distance (in km)
CREATE OR REPLACE FUNCTION calculate_distance(lat1 DECIMAL, lon1 DECIMAL, lat2 DECIMAL, lon2 DECIMAL)
RETURNS DECIMAL AS $$
DECLARE
  earth_radius_km DECIMAL := 6371;
  lat1_rad DECIMAL;
  lat2_rad DECIMAL;
  delta_lat DECIMAL;
  delta_lon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  lat1_rad := RADIANS(lat1);
  lat2_rad := RADIANS(lat2);
  delta_lat := RADIANS(lat2 - lat1);
  delta_lon := RADIANS(lon2 - lon1);
  
  a := POWER(SIN(delta_lat/2), 2) + COS(lat1_rad) * COS(lat2_rad) * POWER(SIN(delta_lon/2), 2);
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN earth_radius_km * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to auto-calculate commission on order delivery
CREATE OR REPLACE FUNCTION calculate_commission_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    INSERT INTO commissions (agent_id, order_id, amount, percentage, status)
    VALUES (
      NEW.agent_id,
      NEW.id,
      (NEW.order_subtotal * 10 / 100),
      10,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create commission
CREATE TRIGGER trg_calculate_commission_on_delivery
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION calculate_commission_on_delivery();

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================
-- Uncomment to insert test data

-- INSERT INTO agents (user_id, phone_number, vehicle_type, vehicle_plate, is_active, is_verified)
-- VALUES (
--   'user-uuid-here',
--   '+254712345678',
--   'motorcycle',
--   'KBD 123A',
--   true,
--   true
-- );
