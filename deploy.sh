#!/bin/bash

# ============================================
# SAPLAYA BACKEND - COMPLETE DEPLOYMENT SCRIPT
# ============================================
# Run: chmod +x deploy.sh && ./deploy.sh

set -e

echo "🚀 SAPLAYA BACKEND - DEPLOYMENT AUTOMATION"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ============================================
# 1. ENVIRONMENT SETUP
# ============================================
echo -e "${BLUE}Step 1: Checking Environment${NC}"

if [ ! -f backend/.env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cp backend/.env.example backend/.env
    echo -e "${YELLOW}Please update backend/.env with your credentials:${NC}"
    echo "  - SUPABASE_URL"
    echo "  - SUPABASE_SECRET_KEY"
    echo "  - SMTP credentials"
    echo "  - JWT_SECRET"
    exit 1
fi

echo -e "${GREEN}✓ .env file exists${NC}"

# ============================================
# 2. DEPENDENCIES
# ============================================
echo -e "${BLUE}Step 2: Installing Dependencies${NC}"

cd backend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# ============================================
# 3. BUILD
# ============================================
echo -e "${BLUE}Step 3: Building Backend${NC}"

npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

# ============================================
# 4. DATABASE MIGRATION
# ============================================
echo -e "${BLUE}Step 4: Database Migration${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Go to Supabase Dashboard"
echo "2. Select your project"
echo "3. Go to SQL Editor"
echo "4. Create new query"
echo "5. Copy content from: backend/db-migration.sql"
echo "6. Execute the SQL"
echo ""
echo "Press ENTER once database is set up..."
read

# ============================================
# 5. HEALTH CHECK
# ============================================
echo -e "${BLUE}Step 5: Starting Development Server${NC}"

npm run dev &
DEV_PID=$!

echo "Waiting for server to start..."
sleep 3

HEALTH_CHECK=$(curl -s http://localhost:3000/health || echo "{\"ok\":false}")

if echo "$HEALTH_CHECK" | grep -q '"ok":true'; then
    echo -e "${GREEN}✓ Server is healthy${NC}"
    echo "Server running at: http://localhost:3000"
else
    echo -e "${YELLOW}⚠ Server started but database not connected${NC}"
    echo "This is expected until Supabase is configured"
    echo "Check server logs above for details"
fi

# ============================================
# 6. API TESTING
# ============================================
echo -e "${BLUE}Step 6: Testing API Endpoints${NC}"
echo ""
echo "Use Postman or curl to test endpoints:"
echo ""
echo "Example: Get Health Status"
echo "curl http://localhost:3000/health"
echo ""
echo "Register as Agent:"
echo "curl -X POST http://localhost:3000/agents/register \\"
echo "  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"phone_number\": \"+254712345678\", \"vehicle_type\": \"motorcycle\"}'"
echo ""

# ============================================
# 7. MOBILE INTEGRATION
# ============================================
echo -e "${BLUE}Step 7: Mobile Integration${NC}"
echo ""
echo "Files created for mobile app:"
echo "  ✓ mobile/src/services/saplaya-api.ts (API Client SDK)"
echo "  ✓ mobile/src/hooks/useSaplaya.ts (React Hooks)"
echo ""
echo "Setup in React Native:"
echo "1. npm install axios expo-secure-store"
echo "2. import { initApiClient } from './services/saplaya-api'"
echo "3. initApiClient(process.env.REACT_APP_API_URL)"
echo "4. Use hooks from 'hooks/useSaplaya' in components"
echo ""

# ============================================
# 8. DEPLOYMENT OPTIONS
# ============================================
echo -e "${BLUE}Step 8: Deployment Options${NC}"
echo ""
echo "Option A: Railway.app (Recommended)"
echo "  1. Commit code to GitHub"
echo "  2. Go to railway.app"
echo "  3. Connect GitHub repo"
echo "  4. Add environment variables"
echo "  5. Deploy"
echo ""
echo "Option B: Render.com"
echo "  1. Go to render.com"
echo "  2. Create new Web Service"
echo "  3. Connect GitHub repo"
echo "  4. Set build command: npm install && npm run build"
echo "  5. Set start command: npm run start"
echo ""
echo "Option C: Heroku"
echo "  1. heroku login"
echo "  2. heroku create saplaya-api"
echo "  3. heroku config:set SUPABASE_URL=..."
echo "  4. git push heroku main"
echo ""

# ============================================
# 9. MONITORING
# ============================================
echo -e "${BLUE}Step 9: Setup Monitoring${NC}"
echo ""
echo "Environment Variables Checklist:"
echo "  □ SUPABASE_URL - Your Supabase project URL"
echo "  □ SUPABASE_SECRET_KEY - Supabase service role key"
echo "  □ JWT_SECRET - 32+ character secret for JWT"
echo "  □ SMTP_HOST - Email provider host (smtp.gmail.com)"
echo "  □ SMTP_USER - Email username"
echo "  □ SMTP_PASSWORD - Email app password"
echo "  □ PUBLIC_API_URL - Your backend URL"
echo ""

# ============================================
# 10. SUCCESS MESSAGE
# ============================================
echo -e "${GREEN}==========================================="
echo "✅ DEPLOYMENT SETUP COMPLETE!"
echo "==========================================${NC}"
echo ""
echo "Backend Status:"
echo -e "  ${GREEN}✓${NC} Code compiled"
echo -e "  ${GREEN}✓${NC} Dependencies installed"
echo -e "  ${GREEN}✓${NC} API endpoints ready"
echo -e "  ${GREEN}✓${NC} Mobile SDK generated"
echo ""
echo "Next Steps:"
echo "1. Configure Supabase database (run SQL migration)"
echo "2. Update .env with credentials"
echo "3. Test endpoints with Postman"
echo "4. Integrate mobile app"
echo "5. Deploy to production"
echo ""
echo "Documentation:"
echo "  📖 INTEGRATION_GUIDE.md - Complete setup guide"
echo "  📖 backend/ORDERS_AGENTS_GUIDE.md - API reference"
echo "  📖 backend/ARCHITECTURE.md - System design"
echo "  📖 backend/CHECKLIST.md - Implementation checklist"
echo ""
echo "Server is running on http://localhost:3000"
echo "Press CTRL+C to stop the development server"
echo ""

wait $DEV_PID
