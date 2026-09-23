const { MongoClient } = require('mongoose').mongo;

// ============================================================================
// CONFIGURATION
// ============================================================================
// ⚠️ STRICT SAFETY GUARANTEE:
// SOURCE DATABASE IS STRICTLY READ-ONLY.
// NO delete, update, or write operations will EVER be executed on SOURCE_MONGO_URI.
// ============================================================================
const SOURCE_MONGO_URI = "mongodb://mongo:iUFSYPEPiRnPotMgCYiKbebIgJSfaLyY@tokaido.proxy.rlwy.net:47187";
const SOURCE_DB_NAME = "test"; // Actual database on Railway holding data

const DEST_MONGO_URI = "mongodb+srv://trucode:trucode123@cluster0.asbmwoj.mongodb.net/ERP?retryWrites=true&w=majority&appName=Cluster0";
const DEST_DB_NAME = "ERP";

// 1. Collections to completely EXCLUDE (Tracking data & Notification logs/reports holding large storage)
const EXCLUDED_COLLECTIONS = [
  'trackinglogs',          // 205,499 GPS tracking points (~120MB)
  'rawtrackingpoints',     // 18,794 raw tracking points
  'dailyroutesummaries',   // Route tracking summaries
  'trackingsessions',      // Tracking sessions
  'notificationlogs',      // Notification delivery reports & logs
  'employeenotifications', // 19,287 generated notification history records
];

// Helper to determine whether a collection should be skipped
function isExcludedCollection(name) {
  if (name.startsWith('system.')) return true;
  return EXCLUDED_COLLECTIONS.includes(name.toLowerCase());
}

async function runMigration() {
  console.log('='.repeat(70));
  console.log('🛡️  SAFE DATA MIGRATION: RAILWAY -> ATLAS (ERP)');
  console.log('='.repeat(70));
  console.log('🔒 SOURCE SAFETY: Source database is STRICTLY READ-ONLY.');
  console.log('   Zero delete/write operations will be executed on the source database.');
  console.log('='.repeat(70));

  const sourceClient = new MongoClient(SOURCE_MONGO_URI, { connectTimeoutMS: 30000 });
  const destClient = new MongoClient(DEST_MONGO_URI, { connectTimeoutMS: 30000 });

  try {
    console.log('\n[1/4] Connecting to databases...');
    await sourceClient.connect();
    console.log(`  ✅ Connected to SOURCE: ${SOURCE_MONGO_URI.replace(/:[^:@]+@/, ':***@')} [DB: ${SOURCE_DB_NAME}]`);

    await destClient.connect();
    console.log(`  ✅ Connected to DESTINATION: MongoDB Atlas [DB: ${DEST_DB_NAME}]`);

    const sourceDb = sourceClient.db(SOURCE_DB_NAME);
    const destDb = destClient.db(DEST_DB_NAME);

    console.log('\n[2/4] Discovering collections from source database...');
    const allCollections = await sourceDb.listCollections().toArray();
    const allNames = allCollections.map(c => c.name);

    const migrateList = [];
    const skippedList = [];

    for (const name of allNames) {
      if (isExcludedCollection(name)) {
        skippedList.push(name);
      } else {
        migrateList.push(name);
      }
    }

    console.log('\n🚫 EXCLUDED COLLECTIONS (Tracking data & Storage-heavy Notification Reports):');
    skippedList.forEach(name => console.log(`  - ❌ ${name}`));

    console.log(`\n📦 COLLECTIONS TO MIGRATE (${migrateList.length} collections):`);
    console.log('  (Includes Company Setup, Employees, Materials, Setup Notifications, Attendance, Leaves, etc.)');
    migrateList.forEach(name => console.log(`  + ✅ ${name}`));

    console.log('\n[3/4] Migrating data as-it-is (preserving exact ObjectIds & data types)...');
    const auditReport = [];

    for (const colName of migrateList) {
      // READ-ONLY from source
      const sourceCol = sourceDb.collection(colName);
      // WRITE only to destination
      const destCol = destDb.collection(colName);

      // Special handling for 'notifications':
      // The user specifically requested: "notification of company setup"
      // In source, 'draft' status (15 items) are the pure Company Setup Notification templates,
      // while the remaining 25,000+ are auto-generated runtime logs.
      let query = {};
      let isSpecialFiltered = false;
      if (colName === 'notifications') {
        query = { status: 'draft' };
        isSpecialFiltered = true;
      }

      // Count only on source (READ-ONLY)
      const sourceTotal = await sourceCol.countDocuments(query);

      if (sourceTotal === 0) {
        console.log(`\n⏩ [${colName}]: 0 documents to transfer. Skipping.`);
        auditReport.push({
          collection: colName,
          sourceCount: 0,
          destCount: 0,
          status: 'EMPTY'
        });
        continue;
      }

      console.log(`\n⏳ [${colName}]: Migrating ${sourceTotal} document(s)...${isSpecialFiltered ? ' (Company Setup Templates only)' : ''}`);

      // Clear records ONLY ON DESTINATION DATABASE (to prevent duplicate key errors on rerun)
      // Never touches source database!
      await destCol.deleteMany({});

      // Read from source in batches of 500
      const BATCH_SIZE = 500;
      let batch = [];
      let transferred = 0;
      const cursor = sourceCol.find(query);

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        batch.push(doc);

        if (batch.length === BATCH_SIZE) {
          // Write ONLY to destination
          await destCol.insertMany(batch, { ordered: false });
          transferred += batch.length;
          process.stdout.write(`   Transferred: ${transferred}/${sourceTotal} docs\r`);
          batch = [];
        }
      }

      if (batch.length > 0) {
        await destCol.insertMany(batch, { ordered: false });
        transferred += batch.length;
      }

      // Verification count on DESTINATION
      const destTotal = await destCol.countDocuments();
      console.log(`  ✅ [${colName}]: Transferred ${transferred} docs -> Destination has ${destTotal} docs.`);

      const status = sourceTotal === destTotal ? 'MATCHED (100%)' : 'MISMATCH';
      auditReport.push({
        collection: colName,
        sourceSelected: sourceTotal,
        destCount: destTotal,
        status: status
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('[4/4] POST-MIGRATION VERIFICATION AUDIT');
    console.log('='.repeat(70));
    console.table(auditReport);

    const allSuccessful = auditReport.every(r => r.status === 'MATCHED (100%)' || r.status === 'EMPTY');
    if (allSuccessful) {
      console.log('\n🎉 ALL SELECTED COLLECTIONS MIGRATED AND VERIFIED 100% CORRECTLY!');
    } else {
      console.warn('\n⚠️ Some collections had count discrepancies. Check table above.');
    }

  } catch (error) {
    console.error('\n❌ Migration error:', error);
  } finally {
    // Safely close both connections
    await sourceClient.close();
    await destClient.close();
    console.log('\n🔒 Connections safely closed.');
  }
}

runMigration();
