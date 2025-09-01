"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var utils_1 = require("./utils");
var fs = require("fs");
var args = process.argv.slice(2);
var processDocument;
if (fs.existsSync("./".concat(args[0], "_processDocument.js"))) {
    // read file to string
    processDocument = require("./".concat(args[0], "_processDocument.js"));
    // processDocument = fs.readFileSync(`./${args[0]}_processDocument.js`, 'utf8');
}
var db;
var recordCounters = {};
var limit = 0;
if (args.length < 1) {
    console.log('Usage: firestore2json.ts <collectionName> [<batchSize>] [<limit>] [--include-subcollections] [--max-depth=3] [--subcollection-limit=100]');
    process.exit(1);
}
else {
    db = (0, utils_1.getFirestoreInstance)();
    var includeSubcollections = args.includes('--include-subcollections');
    
    // Parse max-depth parameter
    var maxDepthArg = args.find(function(arg) { return arg.startsWith('--max-depth='); });
    var maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1]) : 3;
    
    // Parse subcollection-limit parameter
    var subcollectionLimitArg = args.find(function(arg) { return arg.startsWith('--subcollection-limit='); });
    var subcollectionLimit = subcollectionLimitArg ? parseInt(subcollectionLimitArg.split('=')[1]) : 100;
    
    // Filter out all flags from numeric arguments
    var numericArgs = args.filter(function(arg) { 
        return !arg.startsWith('--'); 
    });
    
    console.log('Configuration:');
    console.log('- Include subcollections:', includeSubcollections);
    console.log('- Max depth:', maxDepth);
    console.log('- Subcollection limit:', subcollectionLimit);
    
    main(numericArgs[0], numericArgs[1] || '1000', numericArgs[2] || '0', includeSubcollections, maxDepth, subcollectionLimit);
}
function main(collectionName, batchSize, limit, includeSubcollections, maxDepth, subcollectionLimit) {
    if (includeSubcollections === void 0) { includeSubcollections = false; }
    if (maxDepth === void 0) { maxDepth = 3; }
    if (subcollectionLimit === void 0) { subcollectionLimit = 100; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // if (fs.existsSync(`./${collectionName}.json`)) {
                //     console.log(`${collectionName}.json already exists, aborting...`);
                //     process.exit(1);
                // } else {
                return [4 /*yield*/, getAll(collectionName, 0, parseInt(batchSize), parseInt(limit), includeSubcollections, maxDepth, subcollectionLimit)];
                case 1:
                    // if (fs.existsSync(`./${collectionName}.json`)) {
                    //     console.log(`${collectionName}.json already exists, aborting...`);
                    //     process.exit(1);
                    // } else {
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getAll(collectionName, offset, batchSize, limit, includeSubcollections, maxDepth, subcollectionLimit) {
    if (includeSubcollections === void 0) { includeSubcollections = false; }
    if (maxDepth === void 0) { maxDepth = 3; }
    if (subcollectionLimit === void 0) { subcollectionLimit = 100; }
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error, key;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getBatch(collectionName, offset, batchSize, limit, includeSubcollections, maxDepth, subcollectionLimit)];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (!(data.length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, getAll(collectionName, offset + data.length, batchSize, limit, includeSubcollections, maxDepth, subcollectionLimit)];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    (0, utils_1.cleanUp)(recordCounters);
                    for (key in recordCounters) {
                        console.log("".concat(recordCounters[key], " records written to ").concat(key, ".json"));
                    }
                    _b.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
function getBatch(collectionName, offset, batchSize, limit, includeSubcollections, maxDepth, subcollectionLimit) {
    if (includeSubcollections === void 0) { includeSubcollections = false; }
    if (maxDepth === void 0) { maxDepth = 3; }
    if (subcollectionLimit === void 0) { subcollectionLimit = 100; }
    return __awaiter(this, void 0, void 0, function () {
        var data, error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    data = [];
                    error = null;
                    if (typeof recordCounters[collectionName] === 'undefined') {
                        recordCounters[collectionName] = 0;
                    }
                    if (limit > 0 && recordCounters[collectionName] >= limit) {
                        return [2 /*return*/, { data: data, error: error }];
                    }
                    if (limit > 0) {
                        batchSize = Math.min(batchSize, limit - recordCounters[collectionName]);
                    }
                    console.log("Fetching batch: ".concat(batchSize, " documents from ").concat(collectionName));
                    return [4 /*yield*/, db.collection(collectionName)
                            .limit(batchSize)
                            .get()
                            .then(function (snapshot) { return __awaiter(void 0, void 0, void 0, function () {
                            var _i, _a, fsdoc, doc, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        console.log("Found ".concat(snapshot.docs.length, " documents"));
                                        _i = 0, _a = snapshot.docs;
                                        _c.label = 1;
                                    case 1:
                                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                                        fsdoc = _a[_i];
                                        doc = fsdoc.data();
                                        if (!doc.firestore_id)
                                            doc.firestore_id = fsdoc.id;
                                        else if (!doc.firestoreid)
                                            doc.firestoreid = fsdoc.id;
                                        else if (!doc.original_id)
                                            doc.original_id = fsdoc.id;
                                        else if (!doc.originalid)
                                            doc.originalid = fsdoc.id;
                                        if (!includeSubcollections) return [3 /*break*/, 3];
                                        // Export subcollections as separate JSON files instead of nesting
                                        return [4 /*yield*/, exportSubcollectionsAsSeparateFiles(fsdoc.ref, collectionName, fsdoc.id, maxDepth, 0, subcollectionLimit)];
                                    case 2:
                                        _c.sent();
                                        _c.label = 3;
                                    case 3:
                                        if (processDocument) {
                                            doc = processDocument(collectionName, doc, recordCounters, utils_1.writeRecord);
                                        }
                                        (0, utils_1.writeRecord)(collectionName, doc, recordCounters);
                                        data.push(doc);
                                        _i++;
                                        return [3 /*break*/, 1];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); })["catch"](function (err) {
                            error = err;
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { data: data, error: error }];
            }
        });
    });
}
// Export subcollections as separate JSON files (separate tables)
function exportSubcollectionsAsSeparateFiles(docRef, parentCollectionName, parentDocId, maxDepth, currentDepth, subcollectionLimit) {
    if (maxDepth === void 0) { maxDepth = 3; }
    if (currentDepth === void 0) { currentDepth = 0; }
    if (subcollectionLimit === void 0) { subcollectionLimit = 100; }
    return __awaiter(this, void 0, void 0, function () {
        var collections, _i, collections_1, collection, subcollectionName, tablePrefix, tableName, snapshot, _a, _b, doc, docData, error_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // Prevent infinite recursion by limiting depth
                    if (currentDepth >= maxDepth) {
                        console.log("Max depth (".concat(maxDepth, ") reached, stopping recursion"));
                        return [2 /*return*/];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 8, , 9]);
                    return [4 /*yield*/, docRef.listCollections()];
                case 2:
                    collections = _c.sent();
                    // If no subcollections, return quickly
                    if (collections.length === 0) {
                        return [2 /*return*/];
                    }
                    console.log("Found ".concat(collections.length, " subcollections at depth ").concat(currentDepth + 1));
                    _i = 0, collections_1 = collections;
                    _c.label = 3;
                case 3:
                    if (!(_i < collections_1.length)) return [3 /*break*/, 7];
                    collection = collections_1[_i];
                    subcollectionName = collection.id;
                    tablePrefix = currentDepth === 0 ? parentCollectionName : parentCollectionName + "_" + subcollectionName.replace(/[^a-zA-Z0-9]/g, '_');
                    tableName = currentDepth === 0 ? parentCollectionName + "_" + subcollectionName : tablePrefix;
                    console.log("Processing subcollection: ".concat(subcollectionName, " -> ").concat(tableName, ".json"));
                    return [4 /*yield*/, collection.limit(subcollectionLimit).get()];
                case 4:
                    snapshot = _c.sent();
                    console.log("Found ".concat(snapshot.docs.length, " documents in ").concat(subcollectionName));
                    // Process each document in this subcollection and write to separate file
                    for (_a = 0, _b = snapshot.docs; _a < _b.length; _a++) {
                        doc = _b[_a];
                        docData = doc.data();
                        // Add document ID
                        if (!docData.firestore_id)
                            docData.firestore_id = doc.id;
                        // Add reference to parent document
                        docData.parent_collection = parentCollectionName;
                        docData.parent_document_id = parentDocId;
                        // Add collection path for deeper nesting
                        docData.collection_path = currentDepth === 0 ? 
                            parentCollectionName + "/" + parentDocId + "/" + subcollectionName :
                            docData.collection_path + "/" + subcollectionName;
                        // Write this document to the subcollection's JSON file
                        (0, utils_1.writeRecord)(tableName, docData, recordCounters);
                        // Recursively process nested subcollections
                        if (currentDepth + 1 < maxDepth) {
                            exportSubcollectionsAsSeparateFiles(doc.ref, tableName, doc.id, maxDepth, currentDepth + 1, subcollectionLimit);
                        }
                    }
                    _c.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 9];
                case 7:
                    return [3 /*break*/, 6];
                case 8:
                    error_1 = _c.sent();
                    console.error('Error processing subcollections:', error_1.message || error_1);
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/];
            }
        });
    });
}
