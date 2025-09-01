/**
 * Temporary Supabase Edge Function: Check for duplicate fees payment manager documents
 *
 * This function identifies students who have more than 1 document in their
 * fees payment manager records, which should ideally contain only 1 document per student.
 *
 * This is a diagnostic function to identify data anomalies.
 */

import { serve } from "std/http/server.ts";
import { getClient, COLLECTIONS, log, logError, LOG_LEVELS, notifications } from "@shared/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const functionName = "check-duplicate-fees-payment-manager";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabase = getClient()

    await log(LOG_LEVELS.INFO, "Starting duplicate fees payment manager check", functionName);

    const duplicateStudents = [];
    let totalStudentsChecked = 0;
    let studentsWithMultipleDocs = 0;

    // Get all students
    const { data: students, error: studentsError } = await supabase
      .from(COLLECTIONS.STUDENTS)
      .select('id, name, school_id, class_name');

    if (studentsError) {
      await logError(new Error(`Failed to fetch students: ${studentsError.message}`), functionName);
      throw studentsError;
    }

    if (!students) {
      throw new Error("No students found");
    }

    await log(LOG_LEVELS.INFO, `Found ${students.length} students to check`, functionName);

    // Check each student's fees payment manager records
    for (const student of students) {
      try {
        const studentId = student.id;

        // Get fees payment manager records for this student
        const { data: feesPaymentManagerRecords, error: feesError } = await supabase
          .from(COLLECTIONS.FEES_PAYMENT_MANAGER)
          .select('id, created_at, updated_at, school_id, student_id')
          .eq('student_id', studentId);

        if (feesError) {
          await logError(
            new Error(`Failed to fetch fees payment manager for student ${studentId}: ${feesError.message}`), 
            functionName,
            { studentId }
          );
          continue; // Continue with next student
        }

        totalStudentsChecked++;

        if (feesPaymentManagerRecords && feesPaymentManagerRecords.length > 1) {
          studentsWithMultipleDocs++;

          const documentDetails = feesPaymentManagerRecords.map(record => ({
            documentId: record.id,
            createdAt: record.created_at,
            updatedAt: record.updated_at,
            schoolId: record.school_id,
            studentId: record.student_id,
          }));

          duplicateStudents.push({
            studentId,
            studentName: student.name || "Unknown",
            schoolId: student.school_id || "Unknown",
            className: student.class_name || "Unknown",
            documentsCount: feesPaymentManagerRecords.length,
            documents: documentDetails,
          });

          await log(LOG_LEVELS.WARNING,
            `Student ${studentId} (${student.name}) has ${feesPaymentManagerRecords.length} fees payment manager documents`,
            functionName,
            { studentId, documentsCount: feesPaymentManagerRecords.length },
          );
        }

        // Log progress every 100 students
        if (totalStudentsChecked % 100 === 0) {
          await log(LOG_LEVELS.INFO,
            `Progress: Checked ${totalStudentsChecked}/${students.length} students`,
            functionName,
          );
        }

      } catch (studentError) {
        await logError(
          studentError instanceof Error ? studentError : new Error(String(studentError)), 
          functionName, 
          {
            context: `Processing student ${student.id}`,
            studentId: student.id,
          }
        );
        // Continue with next student
      }
    }

    const result = {
      totalStudentsChecked,
      studentsWithMultipleDocs,
      duplicateStudents,
      summary: {
        affectedStudentsCount: duplicateStudents.length,
        totalDuplicateDocuments: duplicateStudents.reduce((sum, student) => sum + (student.documentsCount - 1), 0),
      },
    };

    await log(LOG_LEVELS.INFO,
      `Duplicate check completed. Found ${studentsWithMultipleDocs} students with multiple docs`,
      functionName,
      result.summary,
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    await logError(error instanceof Error ? error : new Error(String(error)), functionName);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
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