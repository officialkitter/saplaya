#!/bin/bash
# Quick Start Guide for Saplaya Backend

echo "========================================="
echo "Saplaya Backend - Quick Start"
echo "========================================="
echo ""

# Check Node version
echo "📌 Node Version:"
node --version
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
if [ $? -eq 0 ]; then
  echo "✅ Build successful!"
else
  echo "❌ Build failed - check errors above"
  exit 1
fi
echo ""

# Show what was built
echo "📁 Compiled files:"
ls -lh dist/ | grep -E "\.js$" | awk '{print "   " $9 " (" $5 ")"}'
echo ""

echo "========================================="
echo "✅ Backend Ready!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "1️⃣  Set up .env file:"
echo "   cp .env.example .env"
echo "   # Edit .env with your Supabase credentials"
echo ""
echo "2️⃣  Create database tables:"
echo "   # See ORDERS_AGENTS_GUIDE.md for SQL schema"
echo ""
echo "3️⃣  Start development server:"
echo "   npm run dev"
echo ""
echo "4️⃣  API will run on:"
echo "   http://localhost:3000"
echo ""
echo "📚 Documentation:"
echo "   - BACKEND_UPDATES.md (overview)"
echo "   - ORDERS_AGENTS_GUIDE.md (complete API docs)"
echo "   - PESAPAL.md (payment integration)"
echo ""
