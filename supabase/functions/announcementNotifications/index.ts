// Migrated from Firestore trigger: announcementNotifications
// Original trigger: Announcements document write operations
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getClient, COLLECTIONS, log, logError, LOG_LEVELS, notifications } from "@shared/index.ts";

const functionName = "announcementNotifications";
const isChatNotification = false;

/**
 * Determines if staff should be notified based on announcement state
 */
const shouldNotifyStaff = (isNew: boolean, before: any, isAllStaffRecipient: boolean, fewStaffRecipients: any[]) => {
    // New announcement → notify if all staff or some staff selected
    if (isNew && (isAllStaffRecipient || (fewStaffRecipients && fewStaffRecipients.length > 0))) {
        return true;
    }

    // Updated announcement → previously no staff, now staff added
    if (!isNew && !before.rec_all_staff && isAllStaffRecipient) {
        return true;
    }
    if (!isNew && (!before.rec_few_staff || before.rec_few_staff.length === 0) && fewStaffRecipients && fewStaffRecipients.length > 0) {
        return true;
    }

    return false;
};

/**
 * Sends notifications to staff members
 */
const notifyStaff = async (
    supabase: any,
    schoolRef: string,
    uRef: string,
    payloadTitle: string,
    desc: string,
    imageUrl: string,
    schoolID: string,
    announcementDocID: string,
    fnName: string,
    isAllStaffRecipient: boolean,
    fewStaffRecipients: any[] = []
) => {
    const { data: users, error } = await supabase
        .from(COLLECTIONS.USERS)
        .select('id, staff_ref')
        .eq('school_ref', schoolRef)
        .not('staff_ref', 'is', null);

    if (error) {
        await logError(error, fnName);
        return;
    }

    let userRefs = [];

    if (isAllStaffRecipient) {
        // All staff except announcer
        userRefs = users
            .filter((user: any) => user.id !== uRef)
            .map((user: any) => user.id);
    } else {
        // Only selected staff from rec_few_staff
        const allowedStaffRefs = fewStaffRecipients.map((s: any) => s.staff_ref);

        userRefs = users
            .filter((user: any) =>
                user.id !== uRef &&
                user.staff_ref &&
                allowedStaffRefs.includes(user.staff_ref)
            )
            .map((user: any) => user.id);
    }

    if (userRefs.length > 0) {
        await notifications.sendPushNotifications({
            title: payloadTitle,
            body: desc,
            imageUrl,
            sound: "default",
            data: JSON.stringify({
                routeTo: JSON.stringify({
                    pageName: "ANNOUNCEMENT_VIEWER",
                    pageParams: {
                        announcementId: announcementDocID,
                    },
                }),
            }),
            userIds: userRefs,
            targetApp: "SCHOOL",
        });

        await log(LOG_LEVELS.INFO, "Staff notifications sent", fnName);
    } else {
        await log(LOG_LEVELS.INFO, "No staff users to notify", fnName);
    }
};

/**
 * Gets newly added grades for notification
 */
const getNewlyAddedGrades = (isNew: boolean, gradesToNotify: string[], before: any, schoolClasses: string[]) => {
    if (isNew) {
        return gradesToNotify;
    }

    const beforeGrades = before.rec_all_grades ? schoolClasses : before.rec_few_grades || [];
    return gradesToNotify.filter((grade: string) => !beforeGrades.includes(grade));
};

/**
 * Sends notifications to parents of students in specified grades
 */
const notifyParents = async (
    supabase: any,
    schoolRef: string,
    newlyAddedGrades: string[],
    uRef: string,
    payloadTitle: string,
    desc: string,
    imageUrl: string,
    schoolID: string,
    announcementDocID: string,
    fnName: string
) => {
    await log(LOG_LEVELS.INFO, `Sending to newly added grades: ${newlyAddedGrades.join(", ")}`, fnName);

    const { data: students, error } = await supabase
        .from(COLLECTIONS.STUDENTS)
        .select('father_ref, mother_ref')
        .eq('school_ref', schoolRef)
        .in('grade', newlyAddedGrades);

    if (error) {
        await logError(error, fnName);
        return;
    }

    const parentUserRefs: string[] = [];

    students.forEach((student: any) => {
        const { father_ref, mother_ref } = student;

        if (father_ref && father_ref !== uRef) {
            parentUserRefs.push(father_ref);
        }
        if (mother_ref && mother_ref !== uRef) {
            parentUserRefs.push(mother_ref);
        }
    });

    if (parentUserRefs.length > 0) {
        await notifications.sendPushNotifications({
            title: payloadTitle,
            body: desc,
            imageUrl,
            sound: "default",
            data: JSON.stringify({
                routeTo: JSON.stringify({
                    pageName: "PARENTS_ANNOUNCEMENT_VIEWER",
                    pageParams: {
                        announcementId: announcementDocID,
                    },
                }),
            }),
            userIds: parentUserRefs,
            targetApp: "PARENT",
        });

        await log(LOG_LEVELS.INFO, "Parent app notifications sent", fnName);
    } else {
        await log(LOG_LEVELS.INFO, "No parent users found", fnName);
    }
};

serve(async (req) => {
  // Verify webhook authenticity
  const webhookSecret = Deno.env.get('SUPABASE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  
  if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { type, table, record, old_record } = await req.json()
    
    // Only process announcements table operations
    if (table !== 'announcements') {
      return new Response('OK', { status: 200 })
    }

    const supabase = getClient()
    const isNew = type === 'INSERT'
    
    // For updates, we need both old and new data
    const before = old_record
    const after = record

    const {
        title,
        desc,
        photo: imageUrl,
        user_ref: uRef,
        user_name: uName,
        rec_all_staff: isAllStaffRecipient,
        rec_few_staff: fewStaffRecipients = [],
        rec_all_grades: isAllGradesRecipient,
        rec_few_grades: recipientGrades = [],
        school_ref: schoolRef,
        id: announcementDocID
    } = after;

    // Get school information
    const { data: school, error: schoolError } = await supabase
        .from(COLLECTIONS.SCHOOLS)
        .select('name, classes')
        .eq('id', schoolRef)
        .single();

    if (schoolError) {
        await logError(schoolError, functionName);
        throw schoolError;
    }

    const schoolName = school.name;
    await log(LOG_LEVELS.INFO, `Processing for school: ${schoolName}`, functionName);

    const gradesToNotify = isAllGradesRecipient ? school.classes : recipientGrades;
    const payloadTitle = uName ? `${uName}: ${title}` : title;

    // Notify Staff (new or newly added)
    if (shouldNotifyStaff(isNew, before, isAllStaffRecipient, fewStaffRecipients)) {
        await notifyStaff(
            supabase,
            schoolRef,
            uRef,
            payloadTitle,
            desc,
            imageUrl,
            schoolRef,
            announcementDocID,
            functionName,
            isAllStaffRecipient,
            fewStaffRecipients
        );
    }

    // Notify Parents of Students (new or newly added grades)
    const newlyAddedGrades = getNewlyAddedGrades(isNew, gradesToNotify, before, school.classes);

    if (newlyAddedGrades.length > 0) {
        await notifyParents(
            supabase,
            schoolRef,
            newlyAddedGrades,
            uRef,
            payloadTitle,
            desc,
            imageUrl,
            schoolRef,
            announcementDocID,
            functionName
        );
    } else {
        await log(LOG_LEVELS.INFO, "No new grades added. Skipping parent notification.", functionName);
    }
    
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