// Migrated from Firebase Callable Function: addFcmToken
import { serve } from "std/http/server.ts";
import { getClient, COLLECTIONS, log, logError, LOG_LEVELS, notifications } from "@shared/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const functionName = "addFcmToken";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = getClient()

    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request data
    const data = await req.json()
    
    // Extract and validate data
    const { userDocPath, fcmToken, deviceType } = data;

    if (!userDocPath || !fcmToken || !deviceType ||
        userDocPath.split("/").length <= 1 ||
        !fcmToken.length || !deviceType.length) {
      await log(LOG_LEVELS.WARNING, "Invalid arguments provided", functionName, { userDocPath, deviceType });
      return new Response(
        JSON.stringify({ error: "Invalid arguments encountered when adding FCM token." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is adding their own token
    const userIdFromPath = userDocPath.split("/").pop(); // Get the last part as user ID
    if (user.id !== userIdFromPath) {
      await log(
        LOG_LEVELS.WARNING,
        "User ID mismatch",
        functionName,
        { authUid: user.id, pathUid: userIdFromPath },
      );
      return new Response(
        JSON.stringify({ error: "Failed: Authenticated user doesn't match user provided." }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token already exists
    await log(LOG_LEVELS.INFO, "Checking for existing token", functionName, { fcmToken });
    
    const { data: existingTokens, error: fetchError } = await supabase
      .from(COLLECTIONS.FCM_TOKENS)
      .select('id, user_ref')
      .eq('fcm_token', fcmToken);

    if (fetchError) {
      await logError(fetchError as Error, functionName);
      throw fetchError;
    }

    // Handle existing tokens
    if (existingTokens && existingTokens.length > 0) {
      let userAlreadyHasToken = false;
      
      for (const token of existingTokens) {
        if (token.user_ref !== user.id) {
          // Token exists but belongs to another user - delete it
          const { error: deleteError } = await supabase
            .from(COLLECTIONS.FCM_TOKENS)
            .delete()
            .eq('id', token.id);
            
          if (!deleteError) {
            await log(LOG_LEVELS.INFO, "Deleted token from another user", functionName, { otherUserId: token.user_ref });
          }
        } else {
          userAlreadyHasToken = true;
        }
      }

      if (userAlreadyHasToken) {
        await log(LOG_LEVELS.INFO, "Token already exists for user", functionName, { userId: user.id });
        return new Response(
          JSON.stringify({ message: "FCM token already exists for this user. Ignoring..." }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Add the new token
    await log(LOG_LEVELS.INFO, "Adding new FCM token", functionName, { userId: user.id, deviceType });
    
    const { error: insertError } = await supabase
      .from(COLLECTIONS.FCM_TOKENS)
      .insert({
        user_ref: user.id,
        fcm_token: fcmToken,
        device_type: deviceType,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      await logError(insertError as Error, functionName);
      throw insertError;
    }

    await log(LOG_LEVELS.INFO, "Successfully added FCM token", functionName);
    return new Response(
      JSON.stringify({ message: "Successfully added FCM token!" }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    await logError(error as Error, functionName);
    return new Response(
      JSON.stringify({ error: `Failed to add FCM token: ${error instanceof Error ? error.message : 'Unknown error'}` }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})

/* Migration Notes:
 * ✅ Successfully migrated from Firebase to Supabase
 * ✅ Using shared utilities for logging, database access, and configuration  
 * ✅ Cleaned up and optimized for Supabase Edge Functions
 * 
 * TODO: Review function logic for Supabase-specific optimizations
 * TODO: Test function with appropriate payloads
 */