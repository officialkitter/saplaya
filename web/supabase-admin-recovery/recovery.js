import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to the master admin system layer
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createSupplierLoginAccount() {
  const targetEmail = "codespace94@gmail.com"; // Pulled from your table row
  const temporarySecurePassword = "MlimaniSecurePass2026!"; // The new login password

  console.log(`[INITIATING]: Creating authentic login credentials for: ${targetEmail}`);

  // Instruct Supabase Auth to spin up a verified login user account
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: targetEmail,
    password: temporarySecurePassword,
    email_confirm: true // This bypasses email verification links so they can log in instantly
  });

  if (error) {
    // If the account already existed, let's just reset its password instead
    if (error.message.includes("already exists") || error.code === "email_exists") {
      console.log("[INFO]: Auth account exists. Diverting to password reset protocol...");
      
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = listData.users.find(u => u.email === targetEmail);
      
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { password: temporarySecurePassword }
      );
      if (resetError) throw resetError;
      
      printSuccess(targetEmail, temporarySecurePassword);
      return;
    }
    
    console.error("[AUTHENTICATION ERROR]:");
    throw error;
  }

  printSuccess(targetEmail, temporarySecurePassword);
}

function printSuccess(email, password) {
  console.log("\n==================================================");
  console.log("[SUCCESS]: Secure authentication account ready!");
  console.log(`[LOGIN EMAIL]:    ${email}`);
  console.log(`[LOGIN PASSWORD]: ${password}`);
  console.log("==================================================\n");
}

createSupplierLoginAccount().catch((err) => {
  console.error("[RUNTIME EXCEPTION]:", err.message);
});

