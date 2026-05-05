/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 */
define(['N/record', 'N/file', 'N/search', 'N/log'], function(record, file, search, log) {

  // ----- Config --------------------------------------------------------------
  const SAVED_SEARCH_ID = 7955; // your existing saved search

  const PREFIXES = [
    'shipping_','billing_',
    'contact_p','contact_a','contact_b','contact_r',
    'file_',
    'bank_H','bank_ACH_','bank_WIRE_','bank_EFT_','billingbank_'
  ];

  // ----- Helpers -------------------------------------------------------------

  function normalizeUrl(url) {
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : 'http://' + url;
  }

  function mapSubsidiaryToTaxCode(sub) {
    if (sub == 6)  return 11;
    if (sub == 13) return 11;
    if (sub == 12) return 37;
    if (sub == 5)  return 49;
    return null;
  }

  // From your CASE mapping: EFT->169, ACH->172, WIRE->170, CHEQUE->179
  function mapPaymentMethodToFileFormat(val) {
    if (val == null || val === '') return null;
    const s = String(val).toUpperCase().trim();
    if (s === 'EFT' || s === '1' || s === '169')  return 169;
    if (s === 'ACH' || s === '2' || s === '172')  return 172;
    if (s === 'WIRE'|| s === '3' || s === '170')  return 170;
  //  if (s === 'CHEQUE' || s === 'CHECK' || s === '4' || s === '179') return 179;
    return null;
  }

  function groupByLabelPrefixes(result, columns) {
    const grouped = {
      header: {},
      shipping_: {},
      billing_: {},
      billingbank_: {},
      contact_p: {},
      contact_a: {},
      contact_b: {},
      contact_r: {},
      file_: {},
      bank_H: {},
      bank_ACH_: {},
      bank_WIRE_: {},
      bank_EFT_: {}
    };

columns.forEach(col => {
    const label = col.label || '';
    const value = result.getValue(col);
    const text  = result.getText(col);

    const lower = label.toLowerCase();
    const isFile    = lower.indexOf('file_') === 0;
    const needsVal  = false;// lower.indexOf('_entity_state') !== -1 || lower.indexOf('_entity_country') !== -1 ;

    // prefer TEXT normally, but force VALUE for files and *_state / *_country
    const val = (isFile || needsVal)
      ? value
      : (text !== null && text !== undefined && text !== '' ? text : value);

    let bucket = 'header';
    for (const p of PREFIXES) {
      if (label.indexOf(p) === 0) { bucket = p; break; }
    }
    grouped[bucket][label] = val;
  });

  return grouped;
  }

  function safeSet(rec, fieldId, value, type) {
    if (value !== null && value !== undefined && value !== '') {
      if (!type) rec.setValue({ fieldId, value });
      else rec.setText({ fieldId: fieldId, text: value });
    }
  }

  function addAddress(vendorRec, addr, opts) {
    if (!addr) return;
    const hasAny = addr.addr1 || addr.addr2 || addr.city || addr.state || addr.zip || addr.country;
    if (!hasAny) return;

    vendorRec.selectNewLine({ sublistId: 'addressbook' });
    const sub = vendorRec.getCurrentSublistSubrecord({
      sublistId: 'addressbook',
      fieldId: 'addressbookaddress'
    });
    if (addr.country) sub.setText({ fieldId: 'country', text: addr.country });
    if (addr.addr1) sub.setValue({ fieldId: 'addr1', value: addr.addr1 });
    if (addr.addr2) sub.setValue({ fieldId: 'addr2', value: addr.addr2 });
    if (addr.city)  sub.setValue({ fieldId: 'city',  value: addr.city });
    if (addr.state) sub.setText({ fieldId: 'state', text: addr.state });
    if (addr.zip)   sub.setValue({ fieldId: 'zip',   value: addr.zip });
    

    if (opts && opts.defaultBilling) {
      vendorRec.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'defaultbilling', value: true });
    }
    if (opts && opts.defaultShipping) {
      vendorRec.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'defaultshipping', value: true });
    }
    vendorRec.commitLine({ sublistId: 'addressbook' });
  }

  function splitName(full) {
    const s = (full || '').trim();
    if (!s) return { first: '', last: '' };
    const parts = s.split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: '.' };
    const first = parts.shift();
    const last  = parts.join(' ');
    return { first, last };
  }

  function createContactFromBucket(bucket, vendorId, role, addr) {
    log.debug('bucket', bucket)
    log.debug('role', role)
    log.debug('addr', addr)

    // entityid, email, phone, title, custentity_alt_phone_number
    const name  = bucket.entityid || '';
    const email = bucket.email || '';
    const phone = bucket.phone || '';
    const title = bucket.title || '';
    const alt   = bucket.custentity_alt_phone_number || '';
    const ext   = bucket.custentity_ext || '';
    const altext   = bucket.custentity_alt_ext || '';
    const bName    = bucket.custentity_bank_name || '';    

    if (!name && !email && !phone) return null;

    const names = splitName(name);
    log.debug('names', names)
    const c = record.create({ type: record.Type.CONTACT, isDynamic: true });
    // Link to Vendor via 'company'
    safeSet(c, 'company', vendorId);
    safeSet(c, 'firstname', names.first);
    safeSet(c, 'lastname', names.last);
    safeSet(c, 'contactrole', role);
    safeSet(c, 'entityid', name);
    safeSet(c, 'email', email);
    safeSet(c, 'phone', phone);
    safeSet(c, 'custentity_ext', ext);
    safeSet(c, 'custentity_alt_phone_number', alt);
    safeSet(c, 'custentity_alt_ext', altext);
    safeSet(c, 'title', title);
    if (bName) safeSet(c, 'custentity_bank_name', bName);
    var opts = {defaultBilling: true, defaultShipping: true}

    if (role == 9) addAddress(c, addr, opts)

    const id = c.save({ enableSourcing: true, ignoreMandatoryFields: false });
    return id;
  }

  // ----- Main ---------------------------------------------------------------

  function onAction(ctx) {
    log.debug('Start', 'Start')
    const stagingRec = ctx.newRecord;
    const stagingId = stagingRec.id;
    log.debug('stagingId', stagingId)

    try {
      // 1) Load saved search and filter for this staging record
      const searchObj = search.load({ id: SAVED_SEARCH_ID });
      searchObj.filters.push(
        search.createFilter({ name: 'internalidnumber', operator: search.Operator.EQUALTO, values: String(stagingId) })
      );

      const paged = searchObj.runPaged({ pageSize: 1 });
      if (paged.count === 0) {
        log.error('Create Vendor', `Saved search( ${SAVED_SEARCH_ID} ) returned no rows for staging ${stagingId}`);
        return;
      }

      const res = paged.fetch({ index: 0 }).data[0];
      log.debug('res', res)
      log.debug('columns', searchObj.columns)
      const grouped = groupByLabelPrefixes(res, searchObj.columns);
      log.audit('Grouped Data', JSON.stringify(grouped));

      // Shortcuts
      const H   = grouped.header;
      const SH  = grouped.shipping_;
      const BL  = grouped.billing_;
      const BN  = grouped.billingbank_;
      const P   = grouped.contact_p;
      const A   = grouped.contact_a;
      const B   = grouped.contact_b;
      const R   = grouped.contact_r;
      const BK  = grouped.bank_;
      const BK_EFT  = grouped.bank_EFT_;
      const BK_ACH  = grouped.bank_ACH_;
      const BK_WIRE = grouped.bank_WIRE_;
      const FILES = grouped.file_;

      // 2) Create Vendor
      const subsidiary = stagingRec.getValue({ fieldId: 'custrecord_primary_subsidiary' }) || 6;
      const legalName  = stagingRec.getValue({ fieldId: 'custrecord_vendor_legal_name' }) || H.legalname || '';
      const company    = stagingRec.getValue({ fieldId: 'custrecord_vendor_dba' }) || H.companyname || legalName || '';
      const website    = normalizeUrl(stagingRec.getValue({ fieldId: 'custrecord_vendor_website' }) || H.url);

      const firstName  = stagingRec.getValue({ fieldId: 'custrecord_first_name' }) || H.legalname || '';
      const lastName  = stagingRec.getValue({ fieldId: 'custrecord_last_name' }) || H.legalname || '';

      const emailMain  = stagingRec.getValue({ fieldId: 'custrecord_vendor_purch_email' });
      const phoneMain  = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_phone' });
      const phoneMainExt  = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_ext' });
      const altPhone   = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_alt_phone' });
      const altPhoneExt   = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_alt_ext' });
      const terms      = stagingRec.getValue({ fieldId: 'custrecord_vendor_payment_terms' }) || H.terms || null;
      const isPerson   = stagingRec.getValue({ fieldId: 'custrecord_vendor_type' }) == 2;
      const taxCode = mapSubsidiaryToTaxCode(subsidiary);
      const businessNum = stagingRec.getValue({ fieldId: 'custrecord_vendor_tin' });
      const emailPayNotif = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_email' });

      const vendorRec = record.create({ type: record.Type.VENDOR, isDynamic: true });
      vendorRec.setValue({ fieldId: 'subsidiary', value: subsidiary });
      safeSet(vendorRec, 'companyname', company || legalName);
      if (isPerson) {
        safeSet(vendorRec, 'firstname', firstName);
        safeSet(vendorRec, 'lastname', lastName);
      }
      safeSet(vendorRec, 'url', website);
      safeSet(vendorRec, 'currency', H.currency);
      safeSet(vendorRec, 'email', emailMain);
      safeSet(vendorRec, 'phone', phoneMain);
      safeSet(vendorRec, 'custentity_tc_payment_method', H.custentity_tc_payment_method);
      safeSet(vendorRec, 'custentity_vendor_contact_email', H.custentity_vendor_contact_email);      
      safeSet(vendorRec, 'custentity_trusscore_contact_email', H.custentity_trusscore_contact_email);      
      safeSet(vendorRec, 'custentity_ext', phoneMainExt);
      safeSet(vendorRec, 'altphone', altPhone);
      safeSet(vendorRec, 'custentity_alt_ext', altPhoneExt);
      safeSet(vendorRec, 'taxitem', taxCode);
      safeSet(vendorRec, 'custentity_tc_onhold_payments', true);
      safeSet(vendorRec, 'custentity_tc_onhold_trans', true);
      safeSet(vendorRec, 'custentity_2663_email_address_notif', emailPayNotif);
      safeSet(vendorRec, 'custentity_other_payment_method', H.custentity_other_payment_method);

      // Financial tab
      safeSet(vendorRec, 'legalname', legalName);
      safeSet(vendorRec, 'bcn',       businessNum);
      if (terms && terms != 0) safeSet(vendorRec, 'terms', terms);

      // Person/Company toggle
      vendorRec.setValue({ fieldId: 'isperson', value: isPerson ? 'T' : 'F' });

      // Addresses
      addAddress(vendorRec, {
        addr1: SH.shipping_addr1, addr2: SH.shipping_addr2,
        city: SH.shipping_city, state: SH.shipping_state,
        zip: SH.shipping_zip, country: SH.shipping_country
      }, { defaultBilling: false, defaultShipping: true });

      addAddress(vendorRec, {
        addr1: BL.billing_addr1, addr2: BL.billing_addr2,
        city: BL.billing_city, state: BL.billing_state,
        zip: BL.billing_zip, country: BL.billing_country
      }, { defaultBilling: true, defaultShipping: false });

      const vendorId = vendorRec.save({ enableSourcing: true, ignoreMandatoryFields: false });
      log.audit('Vendor Created', vendorId);

      if (!isPerson) {

      // 3) Contacts (create + attach roles on Vendor)
      // Expected role IDs from your labels: contact_p_role=6, contact_a_role=4, contact_b_role=9
      const roleP = Number(H.contact_p_role || P.contact_p_role || 6) || 6;
      const roleA = Number(H.contact_a_role || A.contact_a_role || 9) || 9;
      const roleB = Number(H.contact_b_role || B.contact_b_role || 8) || 8;
      const roleR = Number(H.contact_r_role || R.contact_r_role || 4) || 4;

      // Normalize bucket keys (so we can reuse the helper)
      function remapContactKeys(src, prefix) {
        if (!src) return {};
        return {
          entityid: src[`${prefix}_entityid`],
          email:    src[`${prefix}_email`],
          phone:    src[`${prefix}_phone`],
          title:    src[`${prefix}_title`],
          custentity_alt_phone_number: src[`${prefix}_custentity_alt_phone_number`],
          custentity_ext: src[`${prefix}_custentity_ext`],
          custentity_alt_ext: src[`${prefix}_custentity_alt_ext`],
          custentity_bank_name: src[`${prefix}_custentity_bank_name`]
        };
      }

      const bucketP = remapContactKeys(P, 'contact_p');
      const bucketA = remapContactKeys(A, 'contact_a');
      const bucketB = remapContactKeys(B, 'contact_b');
      const bucketR = remapContactKeys(R, 'contact_r');

      const contactPId = createContactFromBucket(bucketP, vendorId, roleP);

      const contactAId = createContactFromBucket(bucketA, vendorId, roleA);

      const contactRId = createContactFromBucket(bucketR, vendorId, roleR);

      const contactBId = createContactFromBucket(bucketB, vendorId, roleB, {
        addr1: BN.billingbank_custrecord_2663_entity_address1, addr2: BN.billingbank_custrecord_2663_entity_address2,
        city: BN.billingbank_custrecord_2663_entity_city, state: BN.billingbank_custrecord_2663_entity_state,
        zip: BN.billingbank_custrecord_2663_entity_zip, country: BN.billingbank_custrecord_2663_entity_country
      });
      }

      // 4) Bank Details
      const paymentMethodRaw = stagingRec.getValue({ fieldId: 'custrecord_vendor_payment_method' });
      const bankFileFormatId = mapPaymentMethodToFileFormat(paymentMethodRaw) ||
                               mapPaymentMethodToFileFormat(grouped.header.bank_custpage_2663_entity_file_format);
      const bankName = stagingRec.getValue({ fieldId: 'custrecord_vendor_bank_name' }) || BK.bank_name;


      if (bankFileFormatId) {
        const bankRec = record.create({ type: 'customrecord_2663_entity_bank_details', isDynamic: true });
      bankRec.setValue({ fieldId: 'custrecord_2663_parent_vendor', value: vendorId });
      safeSet(bankRec, 'name', bankName);
      if (bankFileFormatId) bankRec.setValue({ fieldId: 'custrecord_2663_entity_file_format', value: bankFileFormatId });

      const pm = (String(paymentMethodRaw || '').toUpperCase());
      if (pm === '1' || pm === 'EFT') {
        safeSet(bankRec, 'custrecord_2663_entity_acct_no', BK_EFT.bank_EFT_custrecord_2663_entity_acct_no);
        safeSet(bankRec, 'custrecord_2663_entity_bank_no', BK_EFT.bank_EFT_custrecord_2663_entity_bank_no);
        safeSet(bankRec, 'custrecord_2663_entity_branch_no', BK_EFT.bank_EFT_custrecord_2663_entity_branch_no);
      } else if (pm === '2' || pm === 'ACH') {
        safeSet(bankRec, 'custrecord_2663_entity_acct_no', BK_ACH.bank_ACH_custrecord_2663_entity_acct_no);
        safeSet(bankRec, 'custrecord_2663_entity_bank_no', BK_ACH.bank_ACH_custrecord_2663_entity_bank_no);
        safeSet(bankRec, 'custrecord_2663_entity_swift',   BK_ACH.bank_ACH_custrecord_2663_entity_swift);
        safeSet(bankRec, 'custrecord_2663_entity_country',   BK_ACH.bank_ACH_custrecord_2663_entity_country, 'set');
        safeSet(bankRec, 'custrecord_2663_entity_bank_type_2', BK_ACH.bank_ACH_custrecord_2663_entity_bank_type_2,'set');
        
      } else if (pm === '3' || pm === 'WIRE') {
        safeSet(bankRec, 'custrecord_2663_entity_country',    BK_WIRE.bank_WIRE_custrecord_2663_entity_country, 'country');
        safeSet(bankRec, 'custrecord_2663_entity_acct_no', BK_WIRE.bank_WIRE_custrecord_2663_entity_acct_no);
        safeSet(bankRec, 'custrecord_2663_entity_swift',   BK_WIRE.bank_WIRE_custrecord_2663_entity_swift);
        safeSet(bankRec, 'custrecord_2663_entity_bank_code', BK_WIRE.bank_WIRE_custrecord_2663_entity_bank_code);
        safeSet(bankRec, 'custrecord_tc_2663_currency',    BK_WIRE.bank_WIRE_custrecord_tc_2663_currency);
      } else {
        // generic bank addr fields if present
        // safeSet(bankRec, 'custrecord_2663_entity_country',    BK.bank_custrecord_2663_entity_country, 'country');
        // safeSet(bankRec, 'custrecord_2663_entity_address1', BK.bank_custrecord_2663_entity_address1);
        // safeSet(bankRec, 'custrecord_2663_entity_address2', BK.bank_custrecord_2663_entity_address2);
        // safeSet(bankRec, 'custrecord_2663_entity_state',    BK.bank_custrecord_2663_entity_state);
        // safeSet(bankRec, 'custrecord_2663_entity_zip',      BK.bank_custrecord_2663_entity_zip);
      }

      const bankRecId = bankRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
      log.audit('Bank Details Created', bankRecId);

      if (FILES.file_bank){
        record.attach({
            to: { type: "customrecord_2663_entity_bank_details", id: bankRecId },
            record: { type: 'file', id: FILES.file_bank }
          });
      }
      }

      

      // 5) Attach files (bank, W9, insurance)
      const filesToAttach = [
        { id: FILES.file_bank,      label: 'Bank File' },
        { id: FILES.file_w9,        label: 'W9 File' },
        { id: FILES.file_insurance, label: 'Insurance File' },
        { id: FILES.file_workers, label: 'Workers Compensation Clearance Certificate' },
        { id: FILES.file_form_pdf,  label: 'Form PDF File' }
      ];

      filesToAttach.forEach(fInfo => {
        if (!fInfo.id) return;
        try {
          const f = file.load({ id: fInfo.id });
          record.attach({
            to: { type: record.Type.VENDOR, id: vendorId },
            record: { type: 'file', id: f.id }
          });
          log.audit('File Attached', `${fInfo.label}: ${f.name}`);
        } catch (e) {
          log.error(`Attach ${fInfo.label} failed`, e);
        }
      });


      // 6) Write-back vendor id to staging
      record.submitFields({
        type: stagingRec.type,
        id: stagingId,
        values: { custrecord_related_vendor: vendorId }
      });

      log.audit('Create Vendor - Done', `Vendor ${vendorId} from staging ${stagingId}`);

    } catch (e) {
      log.error('Error Creating Vendor', e);
    }
  }

  return { onAction };
});
