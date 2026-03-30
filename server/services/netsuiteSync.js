import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { NetSuiteClient, getNetSuiteConfig } from './netsuiteClient.js';

/**
 * Sync CRM financial data with NetSuite Oracle
 * - Push: NFes → Vendor Bills, Commissions → Journal Entries, Users → Vendors
 * - Pull: Payment confirmations from NetSuite
 */
export async function runNetSuiteSync(db) {
  const config = await getNetSuiteConfig(db);
  if (!config) {
    console.log('[NetSuite Sync] Skipped — not configured');
    return { synced: 0, pulled: 0, error: null, skipped: true };
  }

  const client = new NetSuiteClient(config);
  const result = { vendors_pushed: 0, bills_pushed: 0, journals_pushed: 0, payments_pulled: 0, errors: [] };

  try {
    // Phase 1: Sync parceiros as Vendors
    await syncVendors(db, client, result);
  } catch (err) {
    console.error('[NetSuite Sync] Vendors error:', err.message);
    result.errors.push(`Vendors: ${err.message}`);
  }

  try {
    // Phase 2: Sync approved NFes as Vendor Bills
    await syncNfesToVendorBills(db, client, result);
  } catch (err) {
    console.error('[NetSuite Sync] VendorBills error:', err.message);
    result.errors.push(`VendorBills: ${err.message}`);
  }

  try {
    // Phase 3: Sync commissions as Journal Entries
    await syncCommissionsToJournalEntries(db, client, result);
  } catch (err) {
    console.error('[NetSuite Sync] JournalEntries error:', err.message);
    result.errors.push(`JournalEntries: ${err.message}`);
  }

  try {
    // Phase 4: Pull payment confirmations
    await syncPaymentConfirmations(db, client, result);
  } catch (err) {
    console.error('[NetSuite Sync] PaymentPull error:', err.message);
    result.errors.push(`PaymentPull: ${err.message}`);
  }

  // Log sync result
  const totalPushed = result.vendors_pushed + result.bills_pushed + result.journals_pushed;
  await db.prepare(
    'INSERT INTO netsuite_sync_log (id, sync_type, status, details, records_pushed, records_pulled, error_message, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    uuidv4(),
    'scheduled',
    result.errors.length > 0 ? 'partial' : 'completed',
    JSON.stringify(result),
    totalPushed,
    result.payments_pulled,
    result.errors.length > 0 ? result.errors.join('; ') : null,
    new Date().toISOString()
  );

  console.log(`[NetSuite Sync] Done — pushed: ${totalPushed}, pulled: ${result.payments_pulled}, errors: ${result.errors.length}`);
  return result;
}

/**
 * Sync parceiro users → NetSuite Vendors
 */
async function syncVendors(db, client, result) {
  const unsyncedUsers = await db.prepare(
    "SELECT id, name, email, empresa, cnpj, tel FROM users WHERE role = 'parceiro' AND is_active = 1 AND (netsuite_vendor_id IS NULL OR netsuite_vendor_id = '')"
  ).all();

  for (const user of unsyncedUsers) {
    try {
      const vendorData = {
        companyName: user.empresa || user.name,
        email: user.email,
        phone: user.tel || '',
        externalId: user.id,
        subsidiary: { id: '1' }, // Default subsidiary — configure as needed
      };

      if (user.cnpj) {
        vendorData.taxIdNum = user.cnpj.replace(/\D/g, '');
      }

      const response = await client.createVendor(vendorData);
      const vendorId = response?.id || response;

      await db.prepare('UPDATE users SET netsuite_vendor_id = ? WHERE id = ?').run(String(vendorId), user.id);
      result.vendors_pushed++;
    } catch (err) {
      console.error(`[NetSuite Sync] Vendor push failed for ${user.name}:`, err.message);
      result.errors.push(`Vendor ${user.name}: ${err.message}`);
    }
  }
}

/**
 * Sync approved NFes → NetSuite Vendor Bills
 */
async function syncNfesToVendorBills(db, client, result) {
  const unsyncedNfes = await db.prepare(`
    SELECT n.id, n.number, n.value, n.user_id, n.created_at, n.notes,
           u.netsuite_vendor_id, u.name as user_name
    FROM nfes n
    LEFT JOIN users u ON n.user_id = u.id
    WHERE n.status IN ('approved', 'paid')
      AND (n.netsuite_id IS NULL OR n.netsuite_id = '')
      AND u.netsuite_vendor_id IS NOT NULL
  `).all();

  for (const nfe of unsyncedNfes) {
    try {
      const billData = {
        entity: { id: nfe.netsuite_vendor_id },
        tranId: nfe.number,
        tranDate: nfe.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        memo: `NFe ${nfe.number} - ${nfe.user_name}`,
        externalId: nfe.id,
        item: {
          items: [{
            item: { id: '1' }, // Default expense item — configure as needed
            amount: nfe.value,
            memo: nfe.notes || `NFe ${nfe.number}`,
          }],
        },
      };

      const response = await client.createVendorBill(billData);
      const billId = response?.id || response;

      await db.prepare('UPDATE nfes SET netsuite_id = ? WHERE id = ?').run(String(billId), nfe.id);
      result.bills_pushed++;
    } catch (err) {
      console.error(`[NetSuite Sync] VendorBill push failed for NFe ${nfe.number}:`, err.message);
      result.errors.push(`VendorBill NFe ${nfe.number}: ${err.message}`);
    }
  }
}

/**
 * Sync approved/paid commissions → NetSuite Journal Entries
 */
async function syncCommissionsToJournalEntries(db, client, result) {
  const unsyncedComms = await db.prepare(`
    SELECT c.id, c.amount, c.percentage, c.status, c.created_at,
           u.name as user_name, u.netsuite_vendor_id,
           i.razao_social, i.cnpj
    FROM commissions c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN indications i ON c.indication_id = i.id
    WHERE c.status IN ('approved', 'paid')
      AND (c.netsuite_id IS NULL OR c.netsuite_id = '')
  `).all();

  for (const comm of unsyncedComms) {
    try {
      const journalData = {
        tranDate: comm.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        memo: `Comissão ${comm.user_name} - ${comm.razao_social || 'N/A'} (${comm.percentage}%)`,
        externalId: comm.id,
        line: {
          items: [
            {
              account: { id: '1' }, // Debit: Commission expense account — configure
              debit: comm.amount,
              memo: `Comissão ${comm.user_name}`,
              entity: comm.netsuite_vendor_id ? { id: comm.netsuite_vendor_id } : undefined,
            },
            {
              account: { id: '2' }, // Credit: Accounts payable — configure
              credit: comm.amount,
              memo: `Comissão a pagar ${comm.user_name}`,
            },
          ],
        },
      };

      const response = await client.createJournalEntry(journalData);
      const journalId = response?.id || response;

      await db.prepare('UPDATE commissions SET netsuite_id = ? WHERE id = ?').run(String(journalId), comm.id);
      result.journals_pushed++;
    } catch (err) {
      console.error(`[NetSuite Sync] JournalEntry push failed for commission ${comm.id}:`, err.message);
      result.errors.push(`JournalEntry ${comm.user_name}: ${err.message}`);
    }
  }
}

/**
 * Pull payment confirmations from NetSuite
 * Vendor Bills marked as "Paid In Full" update local NFe status
 */
async function syncPaymentConfirmations(db, client, result) {
  // Get last sync date
  const lastSync = await db.prepare(
    "SELECT synced_at FROM netsuite_sync_log WHERE sync_type = 'scheduled' AND status IN ('completed', 'partial') ORDER BY synced_at DESC LIMIT 1"
  ).get();

  const since = lastSync?.synced_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const paidBills = await client.searchPaidVendorBills(since.split('T')[0]);

    if (paidBills?.items) {
      for (const bill of paidBills.items) {
        // Find local NFe by netsuite_id
        const nfe = await db.prepare('SELECT id, status FROM nfes WHERE netsuite_id = ?').get(String(bill.id));
        if (nfe && nfe.status !== 'paid') {
          await db.prepare("UPDATE nfes SET status = 'paid', updated_at = ? WHERE id = ?").run(new Date().toISOString(), nfe.id);
          result.payments_pulled++;
        }
      }
    }
  } catch (err) {
    // SuiteQL query may fail if not available — non-critical
    console.warn('[NetSuite Sync] Payment pull query failed:', err.message);
    result.errors.push(`PaymentPull: ${err.message}`);
  }
}

/**
 * Start scheduled NetSuite sync
 */
export function startNetSuiteScheduler(db) {
  cron.schedule('0 9,13,18 * * *', async () => {
    console.log(`[NetSuite Sync] Scheduled run at ${new Date().toISOString()}`);
    try {
      await runNetSuiteSync(db);
    } catch (err) {
      console.error('[NetSuite Sync] Scheduled run error:', err.message);
    }
  });
  console.log('[NetSuite Sync] Scheduler started — runs at 09:00, 13:00, 18:00');
}
