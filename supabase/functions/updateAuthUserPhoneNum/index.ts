// Migrated from Firebase Cloud Function: updateAuthUserPhoneNum
import { serve } from "std/http/server.ts";
import { getClient, COLLECTIONS, log, logError, LOG_LEVELS, notifications } from "@shared/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const functionName = "updateAuthUserPhoneNum";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST method
    if (req.method !== "POST") {
      await log(LOG_LEVELS.WARNING, "Method not allowed, use POST", functionName);
      return new Response(
        JSON.stringify({ status: "error", message: "Method not allowed, use POST" }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request body
    const { uid, newPhoneNumber } = await req.json();

    if (!uid || !newPhoneNumber) {
      await log(LOG_LEVELS.WARNING, "Missing uid or newPhoneNumber parameter", functionName);
      return new Response(
        JSON.stringify({ 
          status: "error", 
          message: "Missing uid or newPhoneNumber parameter" 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    await log(LOG_LEVELS.INFO, `Processing phone number update for UID: ${uid}`, functionName);

    // Get Supabase client
    const supabase = getClient();

    // Get current user data
    const { data: userData, error: fetchError } = await supabase
      .from(COLLECTIONS.USERS)
      .select('phone_number')
      .eq('id', uid)
      .single();

    if (fetchError || !userData) {
      await log(LOG_LEVELS.WARNING, `No user found with UID: ${uid}`, functionName);
      return new Response(
        JSON.stringify({ 
          status: "error", 
          message: `No user found with UID: ${uid}` 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const currentPhoneNumber = userData.phone_number;

    if (currentPhoneNumber === newPhoneNumber) {
      await log(LOG_LEVELS.INFO, `Phone number unchanged for UID: ${uid}`, functionName);
      return new Response(
        JSON.stringify({
          status: "error",
          message: "The new phone number is the same as the current one. No update needed.",
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update user phone number in database
    const { error: updateError } = await supabase
      .from(COLLECTIONS.USERS)
      .update({ 
        phone_number: newPhoneNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', uid);

    if (updateError) {
      await logError(new Error(`Database update failed: ${updateError.message}`), functionName, { uid });
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Failed to update phone number in database",
          error: updateError.message,
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update user in Supabase Auth
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(uid, {
      phone: newPhoneNumber
    });

    if (authUpdateError) {
      await logError(new Error(`Auth update failed: ${authUpdateError.message}`), functionName, { uid });
      // Try to rollback database change
      await supabase
        .from(COLLECTIONS.USERS)
        .update({ phone_number: currentPhoneNumber })
        .eq('id', uid);
        
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Failed to update phone number in authentication system",
          error: authUpdateError.message,
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    await log(LOG_LEVELS.INFO, `Successfully updated phone number for UID: ${uid}`, functionName);
    return new Response(
      JSON.stringify({ 
        status: "success", 
        message: "Phone number updated successfully." 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    await logError(error as Error, functionName);
    return new Response(
      JSON.stringify({ 
        status: "error", 
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

/* Migration Notes:
 * ✅ Successfully migrated from Firebase to Supabase
 * ✅ Using shared utilities for logging, database access, and configuration
 * ✅ Proper error handling and rollback on auth update failure
 * ✅ CORS support for web client access
 */