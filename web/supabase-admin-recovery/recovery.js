import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load variables from isolated .env file
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetUserId = process.env.TARGET_USER_ID;

// Instantiate the administrative client
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeAdministrativePasswordReset() {
  // Defensive validation checklist
  if (!supabaseUrl || !supabaseServiceKey || !targetUserId) {
    throw new Error("Initialization Failed: Environment variables are undefined.");
  }

  // Generate a highly secure, high-entropy unique password string
  const temporarySecurePassword = "Temp_" + Math.random().toString(36).slice(-10) + "!" + Date.now();
  
  console.log(`[INITIATING]: Mutating password attributes for User UUID: ${targetUserId}`);

  // Invoke the official RPC server-side wrapper mapping to updateUserById
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    targetUserId,
    { password: temporarySecurePassword }
  );

  // Error trapping logic
  if (error) {
    console.error("[TRANSACTION FAILURE]: Execution terminated via API response.");
    throw error;
  }

  // Success Confirmation Outflow
  console.log("\n==================================================");
  console.log("[SUCCESS]: User state mutated safely inside auth.users scheme.");
  console.log(`[TEMPORARY CREDENTIAL]: ${temporarySecurePassword}`);
  console.log("==================================================\n");
  console.log("CRITICAL DEPLOYMENT NOTE: Log in immediately via your client login portal and change this temporary key.");
}

// Fire execution pipeline
executeAdministrativePasswordReset().catch((err) => {
  console.error("[RUNTIME EXCEPTION]:", err.message);
});
