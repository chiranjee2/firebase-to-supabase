# Firestore to Supabase Migration Guide
## Complete Guide for Collections with Subcollections

This guide explains how to migrate Firebase Firestore collections (including subcollections) to Supabase PostgreSQL database using the enhanced migration tools.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Step 1: Export Firestore Collections](#step-1-export-firestore-collections)
5. [Step 2: Import to Supabase](#step-2-import-to-supabase)
6. [Step 3: Verify Migration](#step-3-verify-migration)
7. [Advanced Options](#advanced-options)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## 🎯 Overview

The migration process involves two main steps:
1. **Export**: Extract data from Firestore collections and subcollections into JSON files
2. **Import**: Create PostgreSQL tables in Supabase from the JSON files

### Key Features:
- ✅ **Subcollection Support**: Exports subcollections as separate tables (proper relational structure)
- ✅ **Parent-Child Relationships**: Maintains foreign key relationships between parent and child tables
- ✅ **Depth Control**: Configurable recursion depth to prevent infinite loops
- ✅ **Performance Optimized**: Limits and batching to handle large datasets
- ✅ **Error Handling**: Robust error handling and logging

---

## 🔧 Prerequisites

### Required Files:
- `firestore2json.js` - Export script (enhanced with subcollection support)
- `json2supabase.js` - Import script
- `firebase-service.json` - Firebase Admin SDK credentials
- `supabase-service.json` - Supabase database connection details

### Dependencies:
- Node.js (v14+)
- Firebase Admin SDK
- PostgreSQL client (`pg`)
- Required npm packages (see package.json)

---

## ⚙️ Configuration

### 1. Firebase Configuration
Create `firebase-service.json` with your Firebase Admin SDK credentials:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "...",
  "auth_provider_x509_cert_url": "...",
  "client_x509_cert_url": "..."
}
```

### 2. Supabase Configuration
Create `supabase-service.json` with your Supabase database details:
```json
{
  "host": "your-project-ref.supabase.co",
  "port": 5432,
  "database": "postgres",
  "user": "postgres",
  "password": "your-database-password"
}
```

---

## 📤 Step 1: Export Firestore Collections

### Basic Export (Collection Only)
```bash
node firestore2json.js <collectionName> [batchSize] [limit]
```

### Export with Subcollections (Recommended)
```bash
node firestore2json.js <collectionName> [batchSize] [limit] --include-subcollections [options]
```

### Command Parameters:
- `<collectionName>`: Name of the Firestore collection to export
- `[batchSize]`: Number of documents per batch (default: 1000)
- `[limit]`: Maximum documents to export (default: 0 = no limit)
- `--include-subcollections`: Enable subcollection export

### Advanced Options:
- `--max-depth=N`: Maximum recursion depth for nested subcollections (default: 3)
- `--subcollection-limit=N`: Maximum documents per subcollection (default: 100)

### Examples:

#### Export Schools collection with subcollections:
```bash
node firestore2json.js Schools 1000 50 --include-subcollections --max-depth=2 --subcollection-limit=50
```

#### Export all documents from Users collection:
```bash
node firestore2json.js Users 500 0 --include-subcollections
```

#### Export limited data for testing:
```bash
node firestore2json.js Schools 10 5 --include-subcollections --max-depth=1 --subcollection-limit=3
```

### Output Structure:

**Without Subcollections:**
- `Schools.json` - Main collection data

**With Subcollections:**
- `Schools.json` - Main collection data
- `Schools_BookTransactions.json` - Subcollection as separate table
- `Schools_CheckList.json` - Another subcollection as separate table
- `Schools_Events.json` - Another subcollection as separate table
- ... (one file per subcollection)

### Subcollection Data Structure:
Each subcollection document includes:
```json
{
  "firestore_id": "original-doc-id",
  "parent_collection": "Schools",
  "parent_document_id": "parent-school-id",
  "collection_path": "Schools/parent-id/subcollection-name",
  // ... original document fields
}
```

---

## 📥 Step 2: Import to Supabase

### Import Single Table:
```bash
node json2supabase.js <json_file> [primary_key_strategy] [primary_key_name]
```

### Primary Key Strategies:
- `none`: No primary key added
- `serial`: Auto-incrementing integer (recommended for new data)
- `bigserial`: Auto-incrementing big integer (for large datasets)
- `uuid`: UUID primary key with auto-generation
- `firestore_id`: Use existing Firestore ID as primary key (recommended for migration)

### Import Examples:

#### Import main collection:
```bash
node json2supabase.js Schools.json firestore_id
```

#### Import all subcollection tables:
```bash
# Import each subcollection file
node json2supabase.js Schools_BookTransactions.json firestore_id
node json2supabase.js Schools_CheckList.json firestore_id
node json2supabase.js Schools_Events.json firestore_id
# ... repeat for each subcollection
```

#### Bulk Import Script:
```bash
# Import main collection
node json2supabase.js Schools.json firestore_id

# Import all subcollections
for file in Schools_*.json; do 
  echo "Importing $file..."
  node json2supabase.js "$file" firestore_id
done
```

---

## ✅ Step 3: Verify Migration

### 1. Check Tables in Supabase Dashboard:
- Go to your Supabase project dashboard
- Navigate to Table Editor
- Verify all tables are created:
  - `schools` (main table)
  - `schools_booktransactions`
  - `schools_checklist`
  - `schools_events`
  - etc.

### 2. Verify Data Integrity:
```sql
-- Check record counts
SELECT COUNT(*) FROM schools;
SELECT COUNT(*) FROM schools_booktransactions;

-- Verify parent-child relationships
SELECT 
  s.firestore_id as school_id,
  s.name as school_name,
  COUNT(bt.firestore_id) as transaction_count
FROM schools s
LEFT JOIN schools_booktransactions bt ON s.firestore_id = bt.parent_document_id
GROUP BY s.firestore_id, s.name;

-- Check for orphaned records (should return 0)
SELECT COUNT(*) 
FROM schools_booktransactions bt
WHERE bt.parent_document_id NOT IN (SELECT firestore_id FROM schools);
```

### 3. Test Queries:
```sql
-- Get school with its book transactions
SELECT 
  s.name as school_name,
  bt.booktitle,
  bt.transactiontype,
  bt.issuedate
FROM schools s
JOIN schools_booktransactions bt ON s.firestore_id = bt.parent_document_id
WHERE s.firestore_id = 'MC9Rnpx2eO9zpCd1l1tT';
```

---

## 🔧 Advanced Options

### Batch Processing for Large Collections:
```bash
# Process in smaller batches to avoid memory issues
node firestore2json.js LargeCollection 100 1000 --include-subcollections --max-depth=1
```

### Custom Processing Hooks:
Create a `<CollectionName>.js` file to customize document processing:
```javascript
// Schools.js - Custom processing hook
module.exports = function(collectionName, doc, recordCounters, writeRecord) {
  // Custom processing logic
  if (doc.status === 'inactive') {
    doc.archived = true;
  }
  
  // Transform nested objects
  if (doc.address) {
    doc.full_address = `${doc.address.streetName}, ${doc.address.city}`;
  }
  
  return doc;
};
```

### Environment-Specific Exports:
```bash
# Development environment (limited data)
node firestore2json.js Schools 10 20 --include-subcollections --max-depth=1

# Production environment (full data)
node firestore2json.js Schools 1000 0 --include-subcollections --max-depth=3
```

---

## 🔍 Troubleshooting

### Common Issues:

#### 1. **"Cannot find module" Error**
```bash
# Install dependencies
npm install
```

#### 2. **Firebase Authentication Error**
- Verify `firebase-service.json` file exists and has correct credentials
- Check Firebase project permissions
- Ensure Firebase Admin SDK is enabled

#### 3. **Supabase Connection Error**
```bash
# Test connection
psql -h your-project-ref.supabase.co -U postgres -d postgres
```
- Verify `supabase-service.json` credentials
- Check network connectivity
- Confirm Supabase project is active

#### 4. **Memory Issues with Large Collections**
```bash
# Reduce batch size and add limits
node firestore2json.js LargeCollection 50 1000 --include-subcollections --subcollection-limit=20
```

#### 5. **Timeout Issues**
```bash
# Reduce depth and limits for complex structures
node firestore2json.js Schools 100 100 --include-subcollections --max-depth=1 --subcollection-limit=10
```

### Debug Mode:
Enable verbose logging by checking console output during export and import processes.

---

## 📝 Best Practices

### 1. **Migration Strategy:**
- Start with a small subset of data for testing
- Export and import main collections first
- Then handle subcollections
- Verify data integrity at each step

### 2. **Performance Optimization:**
- Use appropriate batch sizes (100-1000 depending on document size)
- Limit subcollection documents to prevent memory issues
- Set reasonable depth limits for nested structures

### 3. **Data Integrity:**
- Always use `firestore_id` as primary key for migration
- Maintain parent-child relationships via `parent_document_id`
- Verify foreign key constraints after import

### 4. **Backup Strategy:**
```bash
# Create backup before migration
pg_dump -h your-host -U postgres -d postgres > backup_before_migration.sql
```

### 5. **Post-Migration Steps:**
- Create indexes on frequently queried fields
- Set up foreign key constraints
- Update application code to use relational queries
- Test application functionality thoroughly

### 6. **Security:**
- Remove service account files after migration
- Use environment variables for sensitive data
- Enable Row Level Security (RLS) in Supabase

---

## 📊 Complete Migration Example

### Full workflow for migrating Schools collection:

```bash
# Step 1: Export Firestore data
node firestore2json.js Schools 1000 0 --include-subcollections --max-depth=2 --subcollection-limit=100

# Step 2: Import main table
node json2supabase.js Schools.json firestore_id

# Step 3: Import all subcollection tables
for file in Schools_*.json; do 
  echo "Importing $file..."
  node json2supabase.js "$file" firestore_id
done

# Step 4: Verify in Supabase dashboard
# - Check all tables are created
# - Verify data counts
# - Test relationships
```

### Expected Results:
- ✅ 1 main table: `schools`
- ✅ 16 subcollection tables: `schools_booktransactions`, `schools_checklist`, etc.
- ✅ Proper parent-child relationships maintained
- ✅ All data successfully migrated with integrity preserved

---

## 🎉 Conclusion

This enhanced migration tool successfully converts hierarchical Firestore data into properly structured relational tables in Supabase. The subcollection support ensures that complex Firebase data structures are preserved while taking advantage of PostgreSQL's relational capabilities.

The migration maintains data integrity through foreign key relationships and provides a solid foundation for building scalable applications with Supabase.

---

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review console logs for specific error messages
3. Verify configuration files are properly set up
4. Test with smaller datasets first

Happy migrating! 🚀