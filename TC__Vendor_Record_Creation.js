/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 */
define(['N/record', 'N/file', 'N/search', 'N/log'], function(record, file, search, log) {

  // ----- Config --------------------------------------------------------------
  const SAVED_SEARCH_ID = 7955;

  // TODO: replace this with the actual staging-record long text/free-form text field.
  const ERROR_FIELD_ID = 'custrecord_vendor_creation_errors';
  const ERROR_FIELD_MAX_CHARS = 95000;
  const ERROR_STACK_MAX_CHARS = 3000;

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
    // if (s === 'CHEQUE' || s === 'CHECK' || s === '4' || s === '179') return 179;
    return null;
  }

  function truncate(value, max) {
    const s = value == null ? '' : String(value);
    if (s.length <= max) return s;
    return s.substring(0, max) + '... [truncated]';
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  function addError(errors, step, err, context) {
    const item = {
      step: step,
      name: err && err.name ? err.name : 'Error',
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? truncate(err.stack, ERROR_STACK_MAX_CHARS) : '',
      context: context || {}
    };

    errors.push(item);
    log.error(step, {
      message: item.message,
      name: item.name,
      context: item.context,
      stack: item.stack
    });
  }

  function runStep(errors, step, fn, context) {
    try {
      return fn();
    } catch (e) {
      addError(errors, step, e, context);
      return null;
    }
  }

  function buildErrorBlock(status, stagingId, vendorId, errors) {
    return [
      '----- Vendor Creation Run -----',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        status: status,
        stagingId: stagingId,
        vendorId: vendorId || null,
        errorCount: errors.length,
        errors: errors
      }, null, 2)
    ].join('\n');
  }

  function appendErrorsToStaging(stagingRec, stagingId, status, vendorId, errors) {
    if (!errors || errors.length === 0) return;

    const newBlock = buildErrorBlock(status, stagingId, vendorId, errors);
    let existing = '';

    try {
      existing = stagingRec.getValue({ fieldId: ERROR_FIELD_ID }) || '';
    } catch (e) {
      log.error('Read Existing Error Log Failed', e);
    }

    let combined = existing ? existing + '\n\n' + newBlock : newBlock;
    if (combined.length > ERROR_FIELD_MAX_CHARS) {
      combined = '[Older error log text trimmed]\n' +
        combined.substring(combined.length - ERROR_FIELD_MAX_CHARS + 31);
    }

    try {
      const values = {};
      values[ERROR_FIELD_ID] = combined;
      record.submitFields({
        type: stagingRec.type,
        id: stagingId,
        values: values,
        options: {
          enableSourcing: false,
          ignoreMandatoryFields: true
        }
      });
    } catch (e) {
      log.error('Write Error Log To Staging Failed', e);
    }
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

    columns.forEach(function(col) {
      const label = col.label || '';
      const value = result.getValue(col);
      const text  = result.getText(col);

      const lower = label.toLowerCase();
      const isFile = lower.indexOf('file_') === 0;
      const needsVal = false;

      // Prefer TEXT normally, but force VALUE for files and any future value-only fields.
      const val = (isFile || needsVal)
        ? value
        : (text !== null && text !== undefined && text !== '' ? text : value);

      let bucket = 'header';
      for (let i = 0; i < PREFIXES.length; i++) {
        const p = PREFIXES[i];
        if (label.indexOf(p) === 0) {
          bucket = p;
          break;
        }
      }
      grouped[bucket][label] = val;
    });

    return grouped;
  }

  function safeSet(rec, fieldId, value, type, errors, step) {
    if (value === null || value === undefined || value === '') return true;

    try {
      if (!type) {
        rec.setValue({ fieldId: fieldId, value: value });
      } else {
        rec.setText({ fieldId: fieldId, text: value });
      }
      return true;
    } catch (e) {
      if (!errors) throw e;

      addError(errors, step || ('Set field ' + fieldId), e, {
        fieldId: fieldId,
        mode: type ? 'setText' : 'setValue',
        value: truncate(safeJson(value), 500)
      });
      return false;
    }
  }

  function addAddress(rec, addr, opts, errors, step) {
    if (!addr) return false;

    const hasAny = addr.addr1 || addr.addr2 || addr.city || addr.state || addr.zip || addr.country;
    if (!hasAny) return false;

    try {
      rec.selectNewLine({ sublistId: 'addressbook' });
      const sub = rec.getCurrentSublistSubrecord({
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
        rec.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'defaultbilling', value: true });
      }
      if (opts && opts.defaultShipping) {
        rec.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'defaultshipping', value: true });
      }

      rec.commitLine({ sublistId: 'addressbook' });
      return true;
    } catch (e) {
      try {
        rec.cancelLine({ sublistId: 'addressbook' });
      } catch (cancelErr) {
        log.debug('Cancel Address Line Failed', cancelErr);
      }

      if (!errors) throw e;

      addError(errors, step || 'Add Address', e, {
        address: addr,
        options: opts || {}
      });
      return false;
    }
  }

  function splitName(full) {
    const s = (full || '').trim();
    if (!s) return { first: '', last: '' };
    const parts = s.split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: '.' };
    const first = parts.shift();
    const last  = parts.join(' ');
    return { first: first, last: last };
  }

  function createContactFromBucket(bucket, vendorId, role, addr, errors) {
    const name  = bucket.entityid || '';
    const email = bucket.email || '';
    const phone = bucket.phone || '';
    const title = bucket.title || '';
    const alt   = bucket.custentity_alt_phone_number || '';
    const ext   = bucket.custentity_ext || '';
    const altext = bucket.custentity_alt_ext || '';
    const bName = bucket.custentity_bank_name || '';

    if (!name && !email && !phone) return null;

    const names = splitName(name);
    const c = record.create({ type: record.Type.CONTACT, isDynamic: true });

    safeSet(c, 'company', vendorId, null, errors, 'Set Contact Company');
    safeSet(c, 'firstname', names.first, null, errors, 'Set Contact First Name');
    safeSet(c, 'lastname', names.last, null, errors, 'Set Contact Last Name');
    safeSet(c, 'contactrole', role, null, errors, 'Set Contact Role');
    safeSet(c, 'entityid', name, null, errors, 'Set Contact Name');
    safeSet(c, 'email', email, null, errors, 'Set Contact Email');
    safeSet(c, 'phone', phone, null, errors, 'Set Contact Phone');
    safeSet(c, 'custentity_ext', ext, null, errors, 'Set Contact Phone Ext');
    safeSet(c, 'custentity_alt_phone_number', alt, null, errors, 'Set Contact Alt Phone');
    safeSet(c, 'custentity_alt_ext', altext, null, errors, 'Set Contact Alt Ext');
    safeSet(c, 'title', title, null, errors, 'Set Contact Title');
    safeSet(c, 'custentity_bank_name', bName, null, errors, 'Set Contact Bank Name');

    if (role == 9) {
      addAddress(c, addr, { defaultBilling: true, defaultShipping: true }, errors, 'Add Bank Contact Address');
    }

    return c.save({ enableSourcing: true, ignoreMandatoryFields: false });
  }

  function remapContactKeys(src, prefix) {
    if (!src) return {};
    return {
      entityid: src[prefix + '_entityid'],
      email: src[prefix + '_email'],
      phone: src[prefix + '_phone'],
      title: src[prefix + '_title'],
      custentity_alt_phone_number: src[prefix + '_custentity_alt_phone_number'],
      custentity_ext: src[prefix + '_custentity_ext'],
      custentity_alt_ext: src[prefix + '_custentity_alt_ext'],
      custentity_bank_name: src[prefix + '_custentity_bank_name']
    };
  }

  function attachFileToRecord(targetType, targetId, fileId, label, errors) {
    if (!fileId) return;

    runStep(errors, 'Attach ' + label, function() {
      const f = file.load({ id: fileId });
      record.attach({
        to: { type: targetType, id: targetId },
        record: { type: 'file', id: f.id }
      });
      log.audit('File Attached', label + ': ' + f.name);
    }, {
      targetType: targetType,
      targetId: targetId,
      fileId: fileId,
      label: label
    });
  }

  // ----- Main ---------------------------------------------------------------

  function onAction(ctx) {
    const errors = [];
    const stagingRec = ctx.newRecord;
    const stagingId = stagingRec.id;
    let vendorId = null;

    log.debug('Start', 'Start');
    log.debug('stagingId', stagingId);

    try {
      // 1) Load saved search and filter for this staging record.
      const searchObj = search.load({ id: SAVED_SEARCH_ID });
      searchObj.filters.push(
        search.createFilter({
          name: 'internalidnumber',
          operator: search.Operator.EQUALTO,
          values: String(stagingId)
        })
      );

      const paged = searchObj.runPaged({ pageSize: 1 });
      if (paged.count === 0) {
        throw new Error('Saved search ' + SAVED_SEARCH_ID + ' returned no rows for staging ' + stagingId);
      }

      const res = paged.fetch({ index: 0 }).data[0];
      const grouped = groupByLabelPrefixes(res, searchObj.columns);
      log.audit('Grouped Data', JSON.stringify(grouped));

      // Shortcuts
      const H = grouped.header;
      const SH = grouped.shipping_;
      const BL = grouped.billing_;
      const BN = grouped.billingbank_;
      const P = grouped.contact_p;
      const A = grouped.contact_a;
      const B = grouped.contact_b;
      const R = grouped.contact_r;
      const BK = grouped.bank_H;
      const BK_EFT = grouped.bank_EFT_;
      const BK_ACH = grouped.bank_ACH_;
      const BK_WIRE = grouped.bank_WIRE_;
      const FILES = grouped.file_;

      // 2) Create Vendor.
      const subsidiary = stagingRec.getValue({ fieldId: 'custrecord_primary_subsidiary' }) || 6;
      const legalName = stagingRec.getValue({ fieldId: 'custrecord_vendor_legal_name' }) || H.legalname || '';
      const company = stagingRec.getValue({ fieldId: 'custrecord_vendor_dba' }) || H.companyname || legalName || '';
      const website = normalizeUrl(stagingRec.getValue({ fieldId: 'custrecord_vendor_website' }) || H.url);

      const firstName = stagingRec.getValue({ fieldId: 'custrecord_first_name' }) || H.legalname || '';
      const lastName = stagingRec.getValue({ fieldId: 'custrecord_last_name' }) || H.legalname || '';

      const emailMain = stagingRec.getValue({ fieldId: 'custrecord_vendor_purch_email' });
      const phoneMain = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_phone' });
      const phoneMainExt = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_ext' });
      const altPhone = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_alt_phone' });
      const altPhoneExt = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_alt_ext' });
      const terms = stagingRec.getValue({ fieldId: 'custrecord_vendor_payment_terms' }) || H.terms || null;
      const isPerson = stagingRec.getValue({ fieldId: 'custrecord_vendor_type' }) == 2;
      const taxCode = mapSubsidiaryToTaxCode(subsidiary);
      const businessNum = stagingRec.getValue({ fieldId: 'custrecord_vendor_tin' });
      const emailPayNotif = stagingRec.getValue({ fieldId: 'custrecord_vendor_acc_email' });

      const vendorRec = record.create({ type: record.Type.VENDOR, isDynamic: true });
      vendorRec.setValue({ fieldId: 'subsidiary', value: subsidiary });

      safeSet(vendorRec, 'companyname', company || legalName, null, errors, 'Set Vendor Company Name');
      if (isPerson) {
        safeSet(vendorRec, 'firstname', firstName, null, errors, 'Set Vendor First Name');
        safeSet(vendorRec, 'lastname', lastName, null, errors, 'Set Vendor Last Name');
      }
      safeSet(vendorRec, 'url', website, null, errors, 'Set Vendor URL');
      safeSet(vendorRec, 'currency', H.currency, null, errors, 'Set Vendor Currency');
      safeSet(vendorRec, 'email', emailMain, null, errors, 'Set Vendor Email');
      safeSet(vendorRec, 'phone', phoneMain, null, errors, 'Set Vendor Phone');
      safeSet(vendorRec, 'custentity_tc_payment_method', H.custentity_tc_payment_method, null, errors, 'Set Vendor Payment Method');
      safeSet(vendorRec, 'custentity_vendor_contact_email', H.custentity_vendor_contact_email, null, errors, 'Set Vendor Contact Email');
      safeSet(vendorRec, 'custentity_trusscore_contact_email', H.custentity_trusscore_contact_email, null, errors, 'Set Trusscore Contact Email');
      safeSet(vendorRec, 'custentity_ext', phoneMainExt, null, errors, 'Set Vendor Phone Ext');
      safeSet(vendorRec, 'altphone', altPhone, null, errors, 'Set Vendor Alt Phone');
      safeSet(vendorRec, 'custentity_alt_ext', altPhoneExt, null, errors, 'Set Vendor Alt Ext');
      safeSet(vendorRec, 'taxitem', taxCode, null, errors, 'Set Vendor Tax Code');
      safeSet(vendorRec, 'custentity_tc_onhold_payments', true, null, errors, 'Set Vendor Payment Hold');
      safeSet(vendorRec, 'custentity_tc_onhold_trans', true, null, errors, 'Set Vendor Transaction Hold');
      safeSet(vendorRec, 'custentity_2663_email_address_notif', emailPayNotif, null, errors, 'Set Vendor Payment Notification Email');
      safeSet(vendorRec, 'custentity_other_payment_method', H.custentity_other_payment_method, null, errors, 'Set Vendor Other Payment Method');

      // Financial tab.
      safeSet(vendorRec, 'legalname', legalName, null, errors, 'Set Vendor Legal Name');
      safeSet(vendorRec, 'bcn', businessNum, null, errors, 'Set Vendor Business Number');
      if (terms && terms != 0) safeSet(vendorRec, 'terms', terms, null, errors, 'Set Vendor Terms');

      vendorRec.setValue({ fieldId: 'isperson', value: isPerson ? 'T' : 'F' });

      addAddress(vendorRec, {
        addr1: SH.shipping_addr1,
        addr2: SH.shipping_addr2,
        city: SH.shipping_city,
        state: SH.shipping_state,
        zip: SH.shipping_zip,
        country: SH.shipping_country
      }, { defaultBilling: false, defaultShipping: true }, errors, 'Add Vendor Shipping Address');

      addAddress(vendorRec, {
        addr1: BL.billing_addr1,
        addr2: BL.billing_addr2,
        city: BL.billing_city,
        state: BL.billing_state,
        zip: BL.billing_zip,
        country: BL.billing_country
      }, { defaultBilling: true, defaultShipping: false }, errors, 'Add Vendor Billing Address');

      vendorId = vendorRec.save({ enableSourcing: true, ignoreMandatoryFields: false });
      log.audit('Vendor Created', vendorId);

      // Everything below this point is best-effort. One failure is logged and
      // appended to the staging field, but the remaining work continues.

      if (!isPerson) {
        const roleP = Number(H.contact_p_role || P.contact_p_role || 6) || 6;
        const roleA = Number(H.contact_a_role || A.contact_a_role || 9) || 9;
        const roleB = Number(H.contact_b_role || B.contact_b_role || 8) || 8;
        const roleR = Number(H.contact_r_role || R.contact_r_role || 4) || 4;

        const bucketP = remapContactKeys(P, 'contact_p');
        const bucketA = remapContactKeys(A, 'contact_a');
        const bucketB = remapContactKeys(B, 'contact_b');
        const bucketR = remapContactKeys(R, 'contact_r');

        runStep(errors, 'Create Primary Contact', function() {
          return createContactFromBucket(bucketP, vendorId, roleP, null, errors);
        }, { role: roleP, bucket: bucketP });

        runStep(errors, 'Create AP Contact', function() {
          return createContactFromBucket(bucketA, vendorId, roleA, null, errors);
        }, { role: roleA, bucket: bucketA });

        runStep(errors, 'Create Receiving Contact', function() {
          return createContactFromBucket(bucketR, vendorId, roleR, null, errors);
        }, { role: roleR, bucket: bucketR });

        runStep(errors, 'Create Bank Contact', function() {
          return createContactFromBucket(bucketB, vendorId, roleB, {
            addr1: BN.billingbank_custrecord_2663_entity_address1,
            addr2: BN.billingbank_custrecord_2663_entity_address2,
            city: BN.billingbank_custrecord_2663_entity_city,
            state: BN.billingbank_custrecord_2663_entity_state,
            zip: BN.billingbank_custrecord_2663_entity_zip,
            country: BN.billingbank_custrecord_2663_entity_country
          }, errors);
        }, { role: roleB, bucket: bucketB });
      }

      // 4) Bank Details.
      const paymentMethodRaw = stagingRec.getValue({ fieldId: 'custrecord_vendor_payment_method' });
      const bankFileFormatId = mapPaymentMethodToFileFormat(paymentMethodRaw) ||
        mapPaymentMethodToFileFormat(H.bank_custpage_2663_entity_file_format);
      const bankName = stagingRec.getValue({ fieldId: 'custrecord_vendor_bank_name' }) ||
        BK.bank_name ||
        BK.bank_H_bank_name ||
        '';

      let bankRecId = null;
      if (bankFileFormatId) {
        bankRecId = runStep(errors, 'Create Bank Details', function() {
          const bankRec = record.create({ type: 'customrecord_2663_entity_bank_details', isDynamic: true });
          bankRec.setValue({ fieldId: 'custrecord_2663_parent_vendor', value: vendorId });
          safeSet(bankRec, 'name', bankName, null, errors, 'Set Bank Name');
          bankRec.setValue({ fieldId: 'custrecord_2663_entity_file_format', value: bankFileFormatId });

          const pm = String(paymentMethodRaw || '').toUpperCase();
          if (pm === '1' || pm === 'EFT') {
            safeSet(bankRec, 'custrecord_2663_entity_acct_no', BK_EFT.bank_EFT_custrecord_2663_entity_acct_no, null, errors, 'Set EFT Account Number');
            safeSet(bankRec, 'custrecord_2663_entity_bank_no', BK_EFT.bank_EFT_custrecord_2663_entity_bank_no, null, errors, 'Set EFT Bank Number');
            safeSet(bankRec, 'custrecord_2663_entity_branch_no', BK_EFT.bank_EFT_custrecord_2663_entity_branch_no, null, errors, 'Set EFT Branch Number');
          } else if (pm === '2' || pm === 'ACH') {
            safeSet(bankRec, 'custrecord_2663_entity_acct_no', BK_ACH.bank_ACH_custrecord_2663_entity_acct_no, null, errors, 'Set ACH Account Number');
            safeSet(bankRec, 'custrecord_2663_entity_bank_no', BK_ACH.bank_ACH_custrecord_2663_entity_bank_no, null, errors, 'Set ACH Bank Number');
            safeSet(bankRec, 'custrecord_2663_entity_swift', BK_ACH.bank_ACH_custrecord_2663_entity_swift, null, errors, 'Set ACH Swift');
            safeSet(bankRec, 'custrecord_2663_entity_country', BK_ACH.bank_ACH_custrecord_2663_entity_country, 'text', errors, 'Set ACH Country');
            safeSet(bankRec, 'custrecord_2663_entity_bank_type_2', BK_ACH.bank_ACH_custrecord_2663_entity_bank_type_2, 'text', errors, 'Set ACH Bank Type');
          } else if (pm === '3' || pm === 'WIRE') {
            safeSet(bankRec, 'custrecord_2663_entity_country', BK_WIRE.bank_WIRE_custrecord_2663_entity_country, 'text', errors, 'Set WIRE Country');
            safeSet(bankRec, 'custrecord_2663_entity_acct_no', BK_WIRE.bank_WIRE_custrecord_2663_entity_acct_no, null, errors, 'Set WIRE Account Number');
            safeSet(bankRec, 'custrecord_2663_entity_swift', BK_WIRE.bank_WIRE_custrecord_2663_entity_swift, null, errors, 'Set WIRE Swift');
            safeSet(bankRec, 'custrecord_2663_entity_bank_code', BK_WIRE.bank_WIRE_custrecord_2663_entity_bank_code, null, errors, 'Set WIRE Bank Code');
            safeSet(bankRec, 'custrecord_tc_2663_currency', BK_WIRE.bank_WIRE_custrecord_tc_2663_currency, null, errors, 'Set WIRE Currency');
          }

          return bankRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
        }, {
          paymentMethodRaw: paymentMethodRaw,
          bankFileFormatId: bankFileFormatId
        });

        if (bankRecId) {
          log.audit('Bank Details Created', bankRecId);
          attachFileToRecord('customrecord_2663_entity_bank_details', bankRecId, FILES.file_bank, 'Bank File To Bank Details', errors);
        }
      }

      // 5) Attach files to the Vendor. Each file is attempted independently.
      [
        { id: FILES.file_bank, label: 'Bank File To Vendor' },
        { id: FILES.file_w9, label: 'W9 File To Vendor' },
        { id: FILES.file_insurance, label: 'Insurance File To Vendor' },
        { id: FILES.file_workers, label: 'Workers Compensation Clearance Certificate To Vendor' },
        { id: FILES.file_form_pdf, label: 'Form PDF File To Vendor' }
      ].forEach(function(fInfo) {
        attachFileToRecord(record.Type.VENDOR, vendorId, fInfo.id, fInfo.label, errors);
      });

      // 6) Write back vendor id to staging.
      runStep(errors, 'Write Related Vendor To Staging', function() {
        record.submitFields({
          type: stagingRec.type,
          id: stagingId,
          values: { custrecord_related_vendor: vendorId },
          options: {
            enableSourcing: false,
            ignoreMandatoryFields: true
          }
        });
      }, { vendorId: vendorId });

      appendErrorsToStaging(
        stagingRec,
        stagingId,
        errors.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        vendorId,
        errors
      );

      log.audit('Create Vendor - Done', {
        stagingId: stagingId,
        vendorId: vendorId,
        errorCount: errors.length
      });

    } catch (e) {
      addError(errors, 'Create Vendor Failed Before Vendor Save', e, {
        stagingId: stagingId,
        vendorId: vendorId
      });

      appendErrorsToStaging(stagingRec, stagingId, 'FAILED', vendorId, errors);
    }
  }

  return { onAction: onAction };
});
