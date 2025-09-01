/**
 * Delete Exam Marks Function
 *
 * This function deletes all exam marks for students in a specified school
 */

import { admin, cors } from "../utilities/dependencyImports.js";
import { writeErrorLog, writeLog, LOG_LEVELS } from "../utilities/errorLogging.js";
import { createHttpFunction } from "../utilities/functionFactory.js";
import { COLLECTIONS } from "../utilities/config.js";

const functionName = "deleteExamMarks";

// Configure CORS to allow requests from your domains
const corsHandler = cors({ origin: true });

/**
 * Handler for deleting exam marks
 * @param {Object} req - The HTTP request object
 * @param {Object} res - The HTTP response object
 * @param {string} fnName - The function name for logging
 */
const deleteExamMarksHandler = (req, res, fnName) => new Promise((resolve) => {
    corsHandler(req, res, async () => {
      try {
        // Get the schoolID from the request body
        const {schoolID} = req.body;

        // Validate the schoolID parameter before proceeding
        if (!schoolID) {
            await writeLog(LOG_LEVELS.WARNING, "Missing or invalid required parameter: schoolID", fnName);
            res.status(400).json({
                Succeeded: false,
                message: "Missing or invalid required parameter: schoolID",
            });
            return resolve();
        }

    try {
        await writeLog(LOG_LEVELS.INFO, `Processing exam marks deletion for school ID: ${schoolID}`, fnName);

        const firestore = admin.firestore();
        const schoolDocRef = firestore.collection(COLLECTIONS.SCHOOLS).doc(schoolID);

        const studentsSnapshot = await firestore.collection(COLLECTIONS.STUDENTS)
            .where("schoolRef", "==", schoolDocRef)
            .get();

        if (studentsSnapshot.empty) {
            await writeLog(LOG_LEVELS.WARNING, `No students found for school ID: ${schoolID}`, fnName);
            return res.status(404).json({
                Succeeded: false,
                message: "No students found for the provided schoolRef",
            });
        }

        // Function to delete all documents in a subcollection
        const deleteSubcollectionDocs = async (subcollectionRef) => {
            const snapshot = await subcollectionRef.get();
            if (snapshot.empty) {return;}
            const batch = firestore.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            await writeLog(LOG_LEVELS.INFO, `Deleted ${snapshot.size} documents from ${subcollectionRef.path}`, fnName);
        };

        // Prepare deletion promises for both subcollections of each student
        const deletionPromises = [];
        let studentCount = 0;

        studentsSnapshot.forEach(student => {
            studentCount++;
            const examMarkRef = student.ref.collection("ExamMark");
            const subjectMarkRef = student.ref.collection("SubjectMark");

            deletionPromises.push(deleteSubcollectionDocs(examMarkRef));
            deletionPromises.push(deleteSubcollectionDocs(subjectMarkRef));
        });

        await Promise.all(deletionPromises);
        await writeLog(
            LOG_LEVELS.INFO,
            `Successfully processed ${studentCount} students for exam marks deletion`,
            fnName,
        );

        res.status(200).json({
            Succeeded: true,
            message: "Subcollections ExamMark and SubjectMark deleted successfully for matching students",
        });
        resolve();
      } catch (error) {
        await writeErrorLog(error, fnName, { schoolID });
        res.status(500).json({
            Succeeded: false,
            message: "Internal server error",
        });
        resolve();
      }
      } catch (error) {
        await writeErrorLog(error, fnName, { schoolID: req.body.schoolID });
        res.status(500).json({
            Succeeded: false,
            message: "Internal server error",
        });
        resolve();
      }
    });
  });

// Export the function using the function factory
export const deleteExamMarks = createHttpFunction(
    functionName,
    deleteExamMarksHandler,
);
