/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/log', 'N/search', 'N/url', 'N/https'], function (record, log, search, url, https) {

  var CSR_RECORD_TYPE = 'customtransaction118';
  var PO_SUBLIST = 'item';

  var DEPARTMENT_ID = 9;
  var NEXT_APPROVER_ID = 2004;

  var PO_STATUS_PENDING_APPROVAL = 'A';
  var PO_STATUS_PENDING_RECEIPT = 'F';

  var FIELD_LINKED_PO = 'custbody_ds_freight_purchase_order';
  var FIELD_VENDOR_FREIGHT_CHANGED = 'custbody_is_ven_freight_changed';

  var PO_SUITELET_SCRIPT_ID = 'customscript3587';
  var PO_SUITELET_DEPLOYMENT_ID = 'customdeploy1';
  var PO_SUITELET_PO_PARAM = 'poid';

  var CSR_BODY_FIELDS_TO_WATCH = [
    'custbody_tc_carrier',
    'custbody_tc_customer',
    'memo',
    'custbody_tc_shipping_loc',
    'custbody_tc_shipping_address',
    'custbody_tc_load_owner',
    'custbodycustbody_vendor_fr_currency',
    'custbody_ts_vendor_freight',
    'custbody_ds_scrap_record',
    'custbody_tc_po_item',
    'custbody_csr_po_item_changed',
    'custbody_csr_freight_changed'
  ];

  var CSR_LINE_FIELDS_TO_WATCH = [
    'custcol_tc_sales_order',
    'custcol_csr_po_item',
    'custcol_trusscore_po_amount'
  ];

  function afterSubmit(context) {
    try {
      log.debug('START', 'afterSubmit triggered. Type=' + context.type);

      if (context.type !== context.UserEventType.CREATE &&
        context.type !== context.UserEventType.EDIT) {
        log.debug('EXIT', 'Not create/edit');
        return;
      }

      var csrRecord = context.newRecord;
      var values = getCsrHeaderValues(csrRecord);
      var relevantCsrChanged = hasRelevantCsrChange(context);

      log.debug('CSR HEADER VALUES', JSON.stringify(values));

      if (isTrue(values.isScrap)) {
        if (values.oldPO) {
          closePurchaseOrderIfAllowed(values.oldPO, true, 'CSR marked as scrap');
        } else {
          log.debug('SCRAP EXIT', 'CSR is marked as scrap but there is no linked PO');
        }
        return;
      }

      if (values.freightAmount <= 0) {
        if (values.oldPO) {
          closePurchaseOrderIfAllowed(values.oldPO, true, 'CSR vendor freight is zero or blank');
        } else {
          log.debug('ZERO FREIGHT EXIT', 'Freight is zero or blank and there is no linked PO');
        }
        return;
      }

      var poGroups = buildCsrPoGroups(csrRecord);
      if (!poGroups.length) {
        log.debug('EXIT', 'No valid CSR line groups found. PO was not created or updated.');
        return;
      }

      if (values.oldPO) {
        updateLinkedPurchaseOrder(values, poGroups, relevantCsrChanged);
      } else {
        createPurchaseOrderFromCsr(values, poGroups);
      }

      log.debug('END', 'CSR PO sync complete. CSR ID=' + values.trxId);

    } catch (e) {
      log.error('ERROR', e.name + ': ' + e.message + ' | Stack: ' + e.stack);
    }
  }

  function updateLinkedPurchaseOrder(values, poGroups, relevantCsrChanged) {
    if (!relevantCsrChanged) {
      log.debug('OLD PO EXIT', 'No watched CSR fields or CSR line fields changed. PO ID=' + values.oldPO);
      return;
    }

    var poRecord = record.load({
      type: record.Type.PURCHASE_ORDER,
      id: values.oldPO,
      isDynamic: true
    });

    if (!canUpdatePurchaseOrder(poRecord)) {
      log.debug('OLD PO EXIT', 'Linked PO is not Pending Approval or Pending Receipt. PO ID=' + values.oldPO);
      return;
    }

    var poWasUpdated = false;
    var desiredLines = buildDesiredPoLines(values, poGroups);

    poWasUpdated = syncPurchaseOrderHeader(poRecord, values, false) || poWasUpdated;

    if (poLinesAreDifferent(poRecord, desiredLines)) {
      rebuildPurchaseOrderLines(poRecord, desiredLines);
      poWasUpdated = true;
    } else {
      log.debug('PO LINES', 'Current PO lines already match the CSR calculation. PO ID=' + values.oldPO);
    }

    poWasUpdated = setBodyValueIfChanged(poRecord, FIELD_VENDOR_FREIGHT_CHANGED, true) || poWasUpdated;

    if (!poWasUpdated) {
      log.debug('OLD PO EXIT', 'CSR changed, but no PO field or line value needed to be saved. PO ID=' + values.oldPO);
      return;
    }

    var poId = poRecord.save({
      enableSourcing: true,
      ignoreMandatoryFields: true
    });

    log.debug('PO UPDATED', 'PO ID=' + poId);
    callPurchaseOrderSuitelet(poId);
  }

  function createPurchaseOrderFromCsr(values, poGroups) {
    if (!values.carrier || !values.subID) {
      log.debug('CREATE EXIT', 'Missing carrier or subsidiary. PO was not created.');
      return;
    }

    var poRecord = record.create({
      type: record.Type.PURCHASE_ORDER,
      isDynamic: true
    });

    syncPurchaseOrderHeader(poRecord, values, true);
    rebuildPurchaseOrderLines(poRecord, buildDesiredPoLines(values, poGroups));

    var poId = poRecord.save({
      enableSourcing: true,
      ignoreMandatoryFields: true
    });

    log.debug('PO CREATED', 'PO ID=' + poId);

    record.submitFields({
      type: CSR_RECORD_TYPE,
      id: values.trxId,
      values: {
        custbody_ds_freight_purchase_order: poId
      }
    });

    log.debug('PO LINKED', 'CSR ID=' + values.trxId + ', PO ID=' + poId);
  }

  function syncPurchaseOrderHeader(poRecord, values, isNewPo) {
    var poWasUpdated = false;

    if (values.carrier) {
      poWasUpdated = setBodyValueIfChanged(poRecord, 'entity', values.carrier) || poWasUpdated;
    }

    if (isNewPo) {
      poWasUpdated = setBodyValueIfChanged(poRecord, 'subsidiary', values.subID) || poWasUpdated;
      poWasUpdated = setBodyValueIfChanged(poRecord, 'custbody_tc_freight_csr_po', true) || poWasUpdated;
      poWasUpdated = setBodyValueIfChanged(poRecord, 'nextapprover', NEXT_APPROVER_ID) || poWasUpdated;
    }

    poWasUpdated = setBodyValueIfChanged(poRecord, 'memo', values.tranId) || poWasUpdated;
    poWasUpdated = setBodyValueIfChanged(poRecord, 'department', DEPARTMENT_ID) || poWasUpdated;
    poWasUpdated = setBodyValueIfChanged(poRecord, 'tobeemailed', false) || poWasUpdated;

    if (values.currency) {
      poWasUpdated = setBodyValueIfChanged(poRecord, 'currency', values.currency) || poWasUpdated;
    }

    poWasUpdated = setBodyValueIfChanged(poRecord, 'employee', values.owner || '') || poWasUpdated;
    poWasUpdated = setBodyValueIfChanged(poRecord, 'custbody_memo_notes_from_csr', values.memoText || '') || poWasUpdated;
    poWasUpdated = setBodyValueIfChanged(poRecord, 'custbody_tc_frt_pickup_state', getLocationState(values.shippingLocation)) || poWasUpdated;
    poWasUpdated = setBodyValueIfChanged(poRecord, 'custbody_tc_frt_delivery_state', getStateFromAddress(values.deliveryAddress)) || poWasUpdated;

    return poWasUpdated;
  }

  function buildCsrPoGroups(csrRecord) {
    var uniqueGroups = {};
    var orderedKeys = [];
    var lineCount = csrRecord.getLineCount({ sublistId: 'line' });

    log.debug('CSR LINE COUNT', lineCount);

    for (var i = 0; i < lineCount; i++) {
      var salesOrderId = csrRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_tc_sales_order',
        line: i
      });

      var poItemId = csrRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_csr_po_item',
        line: i
      });

      var poAmount = parseFloat(csrRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_trusscore_po_amount',
        line: i
      })) || 0;

      log.debug('CSR LINE', 'line=' + i + ', salesOrderId=' + salesOrderId +
        ', poItemId=' + poItemId + ', poAmount=' + poAmount);

      if (!salesOrderId || !poItemId) {
        continue;
      }

      var key = salesOrderId + '_' + poItemId;
      if (!uniqueGroups[key]) {
        uniqueGroups[key] = {
          salesOrderId: salesOrderId,
          poItemId: poItemId,
          totalAmount: 0
        };
        orderedKeys.push(key);
      }

      uniqueGroups[key].totalAmount = roundToTwo(uniqueGroups[key].totalAmount + poAmount);
    }

    var groups = orderedKeys.map(function (key) {
      return uniqueGroups[key];
    });

    log.debug('CSR PO GROUPS', JSON.stringify(groups));
    return groups;
  }

  function buildDesiredPoLines(values, poGroups) {
    var desiredLines = [];
    var allocatedTotal = 0;

    poGroups.forEach(function (group, index) {
      var lineAmount;

      if (index === poGroups.length - 1) {
        lineAmount = roundToTwo(values.freightAmount - allocatedTotal);
      } else {
        lineAmount = roundToTwo(group.totalAmount);
        allocatedTotal = roundToTwo(allocatedTotal + lineAmount);
      }

      desiredLines.push({
        item: group.poItemId,
        customer: values.customer || '',
        salesOrderId: group.salesOrderId,
        csrId: values.trxId,
        quantity: 1,
        rate: lineAmount,
        amount: lineAmount,
        department: DEPARTMENT_ID
      });
    });

    log.debug('DESIRED PO LINES', JSON.stringify(desiredLines));
    return desiredLines;
  }

  function rebuildPurchaseOrderLines(poRecord, desiredLines) {
    var lineCount = poRecord.getLineCount({ sublistId: PO_SUBLIST });

    for (var i = lineCount - 1; i >= 0; i--) {
      poRecord.removeLine({
        sublistId: PO_SUBLIST,
        line: i
      });
    }

    desiredLines.forEach(function (line) {
      poRecord.selectNewLine({ sublistId: PO_SUBLIST });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'item', value: line.item });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'custcol_po_customer', value: line.customer });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'custcol_tc_trx_line', value: line.salesOrderId });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'custcol_tc_trx_line_ship', value: line.csrId });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'quantity', value: line.quantity });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'rate', value: line.rate });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'amount', value: line.amount });
      poRecord.setCurrentSublistValue({ sublistId: PO_SUBLIST, fieldId: 'department', value: line.department });
      poRecord.commitLine({ sublistId: PO_SUBLIST });
    });

    log.debug('PO LINES REBUILT', 'lineCount=' + desiredLines.length);
  }

  function poLinesAreDifferent(poRecord, desiredLines) {
    var lineCount = poRecord.getLineCount({ sublistId: PO_SUBLIST });

    if (lineCount !== desiredLines.length) {
      log.debug('PO LINE DIFF', 'Line count differs. current=' + lineCount + ', desired=' + desiredLines.length);
      return true;
    }

    for (var i = 0; i < desiredLines.length; i++) {
      var desired = desiredLines[i];

      if (valuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'item', line: i }), desired.item) ||
        valuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'custcol_po_customer', line: i }), desired.customer) ||
        valuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'custcol_tc_trx_line', line: i }), desired.salesOrderId) ||
        valuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'custcol_tc_trx_line_ship', line: i }), desired.csrId) ||
        numericValuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'quantity', line: i }), desired.quantity) ||
        numericValuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'rate', line: i }), desired.rate) ||
        numericValuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'amount', line: i }), desired.amount) ||
        valuesAreDifferent(poRecord.getSublistValue({ sublistId: PO_SUBLIST, fieldId: 'department', line: i }), desired.department)) {
        log.debug('PO LINE DIFF', 'Line differs at index=' + i);
        return true;
      }
    }

    return false;
  }

  function closePurchaseOrderIfAllowed(poId, markVendorFreightChanged, reason) {
    var poRecord = record.load({
      type: record.Type.PURCHASE_ORDER,
      id: poId,
      isDynamic: false
    });

    if (!canUpdatePurchaseOrder(poRecord)) {
      log.debug('CLOSE PO EXIT', 'PO is not Pending Approval or Pending Receipt. PO ID=' + poId + ', reason=' + reason);
      return false;
    }

    var poWasUpdated = false;
    var lineCount = poRecord.getLineCount({ sublistId: PO_SUBLIST });

    if (markVendorFreightChanged) {
      poWasUpdated = setBodyValueIfChanged(poRecord, FIELD_VENDOR_FREIGHT_CHANGED, true) || poWasUpdated;
    }

    for (var i = 0; i < lineCount; i++) {
      var isClosed = poRecord.getSublistValue({
        sublistId: PO_SUBLIST,
        fieldId: 'isclosed',
        line: i
      });

      if (!isTrue(isClosed)) {
        poRecord.setSublistValue({
          sublistId: PO_SUBLIST,
          fieldId: 'isclosed',
          line: i,
          value: true
        });
        poWasUpdated = true;
      }
    }

    if (!poWasUpdated) {
      log.debug('CLOSE PO EXIT', 'PO was already closed/marked. PO ID=' + poId + ', reason=' + reason);
      return false;
    }

    var savedId = poRecord.save({
      enableSourcing: true,
      ignoreMandatoryFields: true
    });

    log.debug('PO CLOSED', 'PO ID=' + savedId + ', reason=' + reason);
    return true;
  }

  function callPurchaseOrderSuitelet(poId) {
    try {
      if (!poId) {
        log.debug('SUITELET EXIT', 'Missing PO ID');
        return;
      }

      var suiteletParams = {};
      suiteletParams[PO_SUITELET_PO_PARAM] = poId;

      var suiteletUrl = url.resolveScript({
        scriptId: PO_SUITELET_SCRIPT_ID,
        deploymentId: PO_SUITELET_DEPLOYMENT_ID,
        returnExternalUrl: true,
        params: suiteletParams
      });

      var response = https.post({
        url: suiteletUrl
      });

      log.debug('SUITELET CALLED', JSON.stringify({
        poId: poId,
        code: response.code,
        body: response.body
      }));

    } catch (e) {
      log.error('SUITELET CALL ERROR', e.name + ': ' + e.message + ' | PO ID=' + poId);
    }
  }

  function canUpdatePurchaseOrder(poRecord) {
    var orderStatus = poRecord.getValue({ fieldId: 'orderstatus' });
    var statusText = poRecord.getText({ fieldId: 'orderstatus' }) || '';

    log.debug('PO STATUS CHECK', 'orderstatus=' + orderStatus + ', text=' + statusText);

    return orderStatus === PO_STATUS_PENDING_APPROVAL ||
      orderStatus === PO_STATUS_PENDING_RECEIPT;
  }

  function hasRelevantCsrChange(context) {
    if (context.type === context.UserEventType.CREATE) {
      return true;
    }

    if (!context.oldRecord) {
      log.debug('CSR CHANGE CHECK', 'No oldRecord available, treating CSR as changed');
      return true;
    }

    for (var i = 0; i < CSR_BODY_FIELDS_TO_WATCH.length; i++) {
      var fieldId = CSR_BODY_FIELDS_TO_WATCH[i];
      var oldValue = context.oldRecord.getValue({ fieldId: fieldId });
      var newValue = context.newRecord.getValue({ fieldId: fieldId });

      if (valuesAreDifferent(oldValue, newValue)) {
        log.debug('CSR BODY CHANGE', fieldId + ': old=' + oldValue + ', new=' + newValue);
        return true;
      }
    }

    return csrLinesChanged(context.oldRecord, context.newRecord);
  }

  function csrLinesChanged(oldRecord, newRecord) {
    var oldLineCount = oldRecord.getLineCount({ sublistId: 'line' });
    var newLineCount = newRecord.getLineCount({ sublistId: 'line' });

    if (oldLineCount !== newLineCount) {
      log.debug('CSR LINE CHANGE', 'Line count changed. old=' + oldLineCount + ', new=' + newLineCount);
      return true;
    }

    for (var i = 0; i < newLineCount; i++) {
      for (var j = 0; j < CSR_LINE_FIELDS_TO_WATCH.length; j++) {
        var fieldId = CSR_LINE_FIELDS_TO_WATCH[j];
        var oldValue = oldRecord.getSublistValue({
          sublistId: 'line',
          fieldId: fieldId,
          line: i
        });
        var newValue = newRecord.getSublistValue({
          sublistId: 'line',
          fieldId: fieldId,
          line: i
        });

        if (valuesAreDifferent(oldValue, newValue)) {
          log.debug('CSR LINE CHANGE', 'line=' + i + ', field=' + fieldId +
            ', old=' + oldValue + ', new=' + newValue);
          return true;
        }
      }
    }

    return false;
  }

  function getCsrHeaderValues(csrRecord) {
    return {
      trxId: csrRecord.id,
      tranId: csrRecord.getValue({ fieldId: 'tranid' }),
      carrier: csrRecord.getValue({ fieldId: 'custbody_tc_carrier' }),
      customer: csrRecord.getValue({ fieldId: 'custbody_tc_customer' }),
      memoText: csrRecord.getValue({ fieldId: 'memo' }),
      shippingLocation: csrRecord.getValue({ fieldId: 'custbody_tc_shipping_loc' }),
      deliveryAddress: csrRecord.getValue({ fieldId: 'custbody_tc_shipping_address' }),
      oldPO: csrRecord.getValue({ fieldId: FIELD_LINKED_PO }),
      poItem: csrRecord.getValue({ fieldId: 'custbody_tc_po_item' }),
      owner: csrRecord.getValue({ fieldId: 'custbody_tc_load_owner' }),
      subID: csrRecord.getValue({ fieldId: 'custbody_po_subsidiary' }),
      isScrap: csrRecord.getValue({ fieldId: 'custbody_ds_scrap_record' }),
      currency: csrRecord.getValue({ fieldId: 'custbodycustbody_vendor_fr_currency' }),
      freightAmount: parseFloat(csrRecord.getValue({ fieldId: 'custbody_ts_vendor_freight' })) || 0,
      csrPoItemChanged: csrRecord.getValue({ fieldId: 'custbody_csr_po_item_changed' }),
      csrFreightChanged: csrRecord.getValue({ fieldId: 'custbody_csr_freight_changed' })
    };
  }

  function getLocationState(locationId) {
    try {
      if (!locationId) return '';

      var locRec = record.load({
        type: record.Type.LOCATION,
        id: locationId,
        isDynamic: false
      });

      var addrSubrec = locRec.getSubrecord({
        fieldId: 'mainaddress'
      });

      if (!addrSubrec) return '';

      var stateCode = addrSubrec.getValue({
        fieldId: 'state'
      });

      return stateCode ? getStateIdByCode(stateCode) : '';

    } catch (e) {
      log.error('LOCATION STATE ERROR', e.name + ': ' + e.message + ' | locationId=' + locationId);
      return '';
    }
  }

  function getStateFromAddress(address) {
    if (!address) {
      return '';
    }

    var match = String(address).match(/(?:,\s*|\s+)([A-Z]{2})\s+(?:\d{5}(?:-\d{4})?|[A-Z]\d[A-Z][ -]?\d[A-Z]\d)/i);
    var stateCode = match ? match[1].toUpperCase() : '';

    return stateCode ? getStateIdByCode(stateCode) : '';
  }

  function getStateIdByCode(stateCode, countryCode) {
    if (!stateCode) return '';

    var filters = [
      ['shortname', 'is', stateCode]
    ];

    if (countryCode) {
      filters.push('AND', ['country', 'anyof', countryCode]);
    }

    var stateSearch = search.create({
      type: 'state',
      filters: filters,
      columns: ['id', 'shortname', 'fullname']
    });

    var results = stateSearch.run().getRange({
      start: 0,
      end: 1
    });

    if (results && results.length) {
      return results[0].getValue({ name: 'id' });
    }

    return '';
  }

  function setBodyValueIfChanged(rec, fieldId, value) {
    var currentValue = rec.getValue({ fieldId: fieldId });

    if (!valuesAreDifferent(currentValue, value)) {
      return false;
    }

    rec.setValue({
      fieldId: fieldId,
      value: value
    });

    log.debug('PO FIELD UPDATED', fieldId + ': old=' + currentValue + ', new=' + value);
    return true;
  }

  function valuesAreDifferent(oldValue, newValue) {
    return normalizeValue(oldValue) !== normalizeValue(newValue);
  }

  function numericValuesAreDifferent(oldValue, newValue) {
    return roundToTwo(oldValue) !== roundToTwo(newValue);
  }

  function normalizeValue(value) {
    if (value === true || value === 'T') return 'T';
    if (value === false || value === 'F') return 'F';
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function isTrue(value) {
    return value === true || value === 'T';
  }

  function roundToTwo(value) {
    return Math.round((parseFloat(value) || 0) * 100) / 100;
  }

  return {
    afterSubmit: afterSubmit
  };
});
