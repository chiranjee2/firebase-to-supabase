import { getFirestoreInstance, cleanUp, writeRecord } from './utils';
import * as fs from 'fs';
const args = process.argv.slice(2);

let processDocument: any;
if (fs.existsSync(`./${args[0]}.js`)) {
    // read file to string
    processDocument = require(`./${args[0]}.js`);
}

let db: any;

const recordCounters: {[key: string]: number} = {};

if (args.length < 1) {
    console.log('Usage: firestore2json.ts <collectionName> [<batchSize>] [<limit>] [--include-subcollections] [--max-depth=3] [--subcollection-limit=100]');
    process.exit(1);
} else {
    db = getFirestoreInstance();
    const includeSubcollections = args.includes('--include-subcollections');
    
    // Parse max-depth parameter
    const maxDepthArg = args.find(arg => arg.startsWith('--max-depth='));
    const maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1]) : 3;
    
    // Parse subcollection-limit parameter
    const subcollectionLimitArg = args.find(arg => arg.startsWith('--subcollection-limit='));
    const subcollectionLimit = subcollectionLimitArg ? parseInt(subcollectionLimitArg.split('=')[1]) : 100;
    
    // Filter out all flags from numeric arguments
    const numericArgs = args.filter(arg => !arg.startsWith('--'));
    
    console.log('Configuration:');
    console.log('- Include subcollections:', includeSubcollections);
    console.log('- Max depth:', maxDepth);
    console.log('- Subcollection limit:', subcollectionLimit);
    
    main(numericArgs[0], numericArgs[1] || '1000', numericArgs[2] || '0', includeSubcollections, maxDepth, subcollectionLimit);
}


async function main(collectionName: string, batchSize: string, limit: string, includeSubcollections: boolean = false, maxDepth: number = 3, subcollectionLimit: number = 100) {
    // if (fs.existsSync(`./${collectionName}.json`)) {
    //     console.log(`${collectionName}.json already exists, aborting...`);
    //     process.exit(1);
    // } else {
        await getAll(collectionName, 0, parseInt(batchSize), parseInt(limit), includeSubcollections, maxDepth, subcollectionLimit);
    // }    
}

async function getAll(collectionName: string, offset: number, batchSize: number, limit: number, includeSubcollections: boolean = false, maxDepth: number = 3, subcollectionLimit: number = 100) {
    const {data } = await getBatch(collectionName, offset, batchSize, limit, includeSubcollections, maxDepth, subcollectionLimit);
    if (data.length > 0) {
        await getAll(collectionName, offset + data.length, batchSize, limit, includeSubcollections, maxDepth, subcollectionLimit);
    } else {
        cleanUp(recordCounters);
        for (let key in recordCounters) {
            console.log(`${recordCounters[key]} records written to ${key}.json`);
        }
    }
}

async function getBatch(collectionName: string, offset: number, batchSize: number, limit: number, includeSubcollections: boolean = false, maxDepth: number = 3, subcollectionLimit: number = 100): Promise<{data: any[], error: any}> {
    const data: any[] = [];
    let error = null;
    if (recordCounters[collectionName] >= limit) {
        return {data, error};
    }
    if (typeof recordCounters[collectionName] === 'undefined') {
        recordCounters[collectionName] = 0;
    }
    if (limit > 0) {
        batchSize = Math.min(batchSize, limit - recordCounters[collectionName]);
    }
    await db.collection(collectionName)
    .limit(batchSize)
    .offset(offset)
    .get()
    .then(async (snapshot: any) => {
      for (const fsdoc of snapshot.docs) {
        let doc = fsdoc.data();
        if (!doc.firestore_id) doc.firestore_id = fsdoc.id;
        else if (!doc.firestoreid) doc.firestoreid = fsdoc.id;   
        else if (!doc.original_id) doc.original_id = fsdoc.id;
        else if (!doc.originalid) doc.originalid = fsdoc.id;
        
        // Process subcollections if enabled
        if (includeSubcollections) {
          doc.subcollections = await getSubcollections(fsdoc.ref, maxDepth, 0, subcollectionLimit);
        }
        
        console.log('processDocument', typeof processDocument);
        if (processDocument) {
            doc = processDocument(collectionName, doc, recordCounters, writeRecord);
        }
        writeRecord(collectionName, doc, recordCounters);
        data.push(doc);
      }
    })
    .catch((err: any) => {
        error = err;
    });
    return {data, error};        
}

// Function to get all subcollections for a document with improved error handling
async function getSubcollections(docRef: any, maxDepth: number = 3, currentDepth: number = 0, subcollectionLimit: number = 100): Promise<any> {
    const subcollections: any = {};
    
    // Prevent infinite recursion by limiting depth
    if (currentDepth >= maxDepth) {
        console.log(`Max depth (${maxDepth}) reached, skipping deeper subcollections`);
        return subcollections;
    }
    
    try {
        // Get list of subcollections for this document
        const collections = await docRef.listCollections();
        
        // If no subcollections, return empty object quickly
        if (collections.length === 0) {
            return subcollections;
        }
        
        console.log(`Found ${collections.length} subcollections at depth ${currentDepth + 1}`);
        
        for (const collection of collections) {
            const subcollectionName = collection.id;
            console.log(`Processing subcollection: ${subcollectionName} at depth ${currentDepth + 1}`);
            
            try {
                // Get limited documents in this subcollection to prevent memory issues
                const snapshot = await collection.limit(subcollectionLimit).get();
                const subcollectionDocs: any[] = [];
                
                console.log(`Found ${snapshot.docs.length} documents in ${subcollectionName}`);
                
                for (const doc of snapshot.docs) {
                    let docData = doc.data();
                    // Add document ID
                    if (!docData.firestore_id) docData.firestore_id = doc.id;
                    
                    // Only recurse if we haven't hit max depth
                    if (currentDepth + 1 < maxDepth) {
                        docData.subcollections = await getSubcollections(doc.ref, maxDepth, currentDepth + 1, subcollectionLimit);
                    } else {
                        docData.subcollections = {}; // Empty object for max depth
                    }
                    
                    subcollectionDocs.push(docData);
                }
                
                subcollections[subcollectionName] = subcollectionDocs;
                
            } catch (collectionError: any) {
                console.error(`Error processing subcollection ${subcollectionName}:`, collectionError.message);
                subcollections[subcollectionName] = []; // Empty array on error
            }
        }
    } catch (error: any) {
        console.error('Error listing subcollections:', error.message);
    }
    
    return subcollections;
}
