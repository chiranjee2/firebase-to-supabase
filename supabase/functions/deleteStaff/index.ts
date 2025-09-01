// Migrated from Firestore trigger: deleteStaff
// Original trigger: staff document deletion
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getClient, COLLECTIONS, log, logError, LOG_LEVELS, notifications } from "@shared/index.ts";

const functionName = "deleteStaff";

/**
 * Validates staff data and returns validation result
 */
async function validateStaffData(staffData: any, fnName: string) {
  const { user_ref, school_ref } = staffData;

  if (!school_ref) {
    await log(
      LOG_LEVELS.INFO,
      "No school_ref found in the staff document. Cannot proceed with deletion",
      fnName,
    );
    return { isValid: false };
  }

  if (!user_ref) {
    await log(
      LOG_LEVELS.INFO,
      "No user_ref found in the staff document. Will skip user-related deletions but proceed with staff cleanup",
      fnName,
    );
    return { isValid: true, school_ref, hasUserRef: false };
  }

  return { isValid: true, user_ref, school_ref, hasUserRef: true };
}

/**
 * Deletes chat messages associated with the staff member
 */
async function deleteChatMessages(supabase: any, userRef: string, schoolRef: string, fnName: string) {
  try {
    const { data: chatMessages, error } = await supabase
      .from(COLLECTIONS.CHAT_MESSAGES)
      .select('id')
      .eq('user_ref', userRef)
      .eq('school_ref', schoolRef);

    if (error) throw error;

    if (!chatMessages || chatMessages.length === 0) {
      await log(LOG_LEVELS.INFO, "No chat messages found for this staff member", fnName);
      return;
    }

    const { error: deleteError } = await supabase
      .from(COLLECTIONS.CHAT_MESSAGES)
      .delete()
      .eq('user_ref', userRef)
      .eq('school_ref', schoolRef);

    if (deleteError) throw deleteError;

    await log(LOG_LEVELS.INFO, `Successfully deleted ${chatMessages.length} chat messages`, fnName);
  } catch (error) {
    await logError(error as Error, fnName, { userRef, schoolRef });
  }
}

/**
 * Deletes the user document
 */
async function deleteUserDocument(supabase: any, userRef: string, staffId: string, fnName: string) {
  try {
    const { error } = await supabase
      .from(COLLECTIONS.USERS)
      .delete()
      .eq('id', userRef);

    if (error) throw error;

    await log(
      LOG_LEVELS.INFO,
      `Successfully deleted user from Users collection with ID: ${staffId}`,
      fnName,
    );
  } catch (error) {
    await logError(error as Error, fnName, { userRef, staffId });
  }
}

/**
 * Removes user reference from chats
 */
async function removeUserFromChats(supabase: any, userRef: string, schoolRef: string, fnName: string) {
  try {
    // Get chats that include this user
    const { data: chats, error: fetchError } = await supabase
      .from(COLLECTIONS.CHATS)
      .select('id, users')
      .eq('school_ref', schoolRef)
      .contains('users', [userRef]);

    if (fetchError) throw fetchError;

    if (!chats || chats.length === 0) {
      await log(LOG_LEVELS.INFO, "No chats found containing this user", fnName);
      return;
    }

    // Update each chat to remove the user
    for (const chat of chats) {
      const updatedUsers = (chat.users || []).filter((uid: string) => uid !== userRef);
      
      const { error: updateError } = await supabase
        .from(COLLECTIONS.CHATS)
        .update({ users: updatedUsers })
        .eq('id', chat.id);

      if (updateError) throw updateError;

      await log(
        LOG_LEVELS.INFO,
        `Removed user reference from chat document with ID: ${chat.id}`,
        fnName,
      );
    }

    await log(LOG_LEVELS.INFO, `Successfully processed ${chats.length} chat documents`, fnName);
  } catch (error) {
    await logError(error as Error, fnName, { userRef, schoolRef });
  }
}

/**
 * Handles manager references and deletes pending staff leaves
 */
async function handleManagerReferences(supabase: any, staffId: string, fnName: string) {
  try {
    // Find staff members managed by the deleted staff
    const { data: managedStaff, error: fetchError } = await supabase
      .from(COLLECTIONS.STAFF)
      .select('id')
      .eq('manager_ref', staffId);

    if (fetchError) throw fetchError;

    if (!managedStaff || managedStaff.length === 0) {
      await log(LOG_LEVELS.INFO, "No staff documents with matching manager_ref found", fnName);
      return;
    }

    for (const staff of managedStaff) {
      // Delete pending staff leaves for this manager
      const { error: deleteLeavesError } = await supabase
        .from(COLLECTIONS.STAFF_LEAVES)
        .delete()
        .eq('staff_ref', staff.id)
        .eq('manager_ref', staffId)
        .eq('status', 'Pending');

      if (deleteLeavesError) {
        await logError(deleteLeavesError, fnName, { staffId: staff.id });
      } else {
        await log(
          LOG_LEVELS.INFO,
          `Deleted pending StaffLeave documents for staff: ${staff.id}`,
          fnName,
        );
      }

      // Remove manager reference
      const { error: updateError } = await supabase
        .from(COLLECTIONS.STAFF)
        .update({ manager_ref: null })
        .eq('id', staff.id);

      if (updateError) {
        await logError(updateError, fnName, { staffId: staff.id });
      } else {
        await log(
          LOG_LEVELS.INFO,
          `Removed manager_ref from staff document with ID: ${staff.id}`,
          fnName,
        );
      }
    }

    await log(LOG_LEVELS.INFO, `Successfully processed ${managedStaff.length} staff documents for manager references`, fnName);
  } catch (error) {
    await logError(error as Error, fnName, { staffId });
  }
}

/**
 * Resets subject allocations associated with the staff member
 */
async function resetSubjectAllocations(supabase: any, staffId: string, schoolRef: string, fnName: string) {
  try {
    const { data: allocations, error: fetchError } = await supabase
      .from(COLLECTIONS.SUBJECT_ALLOCATION)
      .select('id')
      .eq('teacher_ref', staffId)
      .eq('school_ref', schoolRef);

    if (fetchError) throw fetchError;

    if (!allocations || allocations.length === 0) {
      await log(LOG_LEVELS.INFO, "No subject allocations found for this staff member", fnName);
      return;
    }

    const { error: updateError } = await supabase
      .from(COLLECTIONS.SUBJECT_ALLOCATION)
      .update({ 
        teacher_ref: null,
        teacher_name: null 
      })
      .eq('teacher_ref', staffId)
      .eq('school_ref', schoolRef);

    if (updateError) throw updateError;

    await log(
      LOG_LEVELS.INFO,
      `Successfully reset teacher_ref and teacher_name fields in ${allocations.length} subject allocation documents`,
      fnName,
    );
  } catch (error) {
    await logError(error as Error, fnName, { staffId, schoolRef });
  }
}

serve(async (req) => {
  // Verify webhook authenticity
  const webhookSecret = Deno.env.get('SUPABASE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  
  if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { type, table, record, old_record } = await req.json()
    
    // Only process DELETE operations on staff table
    if (type !== 'DELETE' || table !== 'staff') {
      return new Response('OK', { status: 200 })
    }

    const staffId = old_record.id
    await log(LOG_LEVELS.INFO, `Processing deletion of staff with ID: ${staffId}`, functionName);

    const validation = await validateStaffData(old_record, functionName);

    if (!validation.isValid) {
      return new Response('OK', { status: 200 })
    }

    const { user_ref, school_ref, hasUserRef } = validation;
    const supabase = getClient()

    // Always perform staff-related cleanup operations
    await handleManagerReferences(supabase, staffId, functionName);
    await resetSubjectAllocations(supabase, staffId, school_ref, functionName);

    // Only perform user-related operations if user_ref exists
    if (hasUserRef) {
      await deleteChatMessages(supabase, user_ref, school_ref, functionName);
      await deleteUserDocument(supabase, user_ref, staffId, functionName);
      await removeUserFromChats(supabase, user_ref, school_ref, functionName);
      await log(LOG_LEVELS.INFO, `Successfully completed user-related deletion operations for staff: ${staffId}`, functionName);
    } else {
      await log(LOG_LEVELS.INFO, `Skipped user-related deletion operations (no user_ref) for staff: ${staffId}`, functionName);
    }

    await log(LOG_LEVELS.INFO, `Successfully completed all deletion operations for staff: ${staffId}`, functionName);
    
    return new Response('OK', { status: 200 })
  } catch (error) {
    await logError(error as Error, functionName);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
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