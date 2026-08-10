/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/log', 'N/search', 'N/workflow'], function (record, log, search, workflow) {

  function afterSubmit(context) {
    try {
      log.debug('START', 'afterSubmit triggered. Type=' + context.type);

      if (context.type !== context.UserEventType.CREATE &&
        context.type !== context.UserEventType.EDIT) {
        log.debug('EXIT', 'Not create/edit');
        return;
      }

      var trxRec = context.newRecord;
      var trxId = trxRec.id;

      var carrier = trxRec.getValue({ fieldId: 'custbody_tc_carrier' });
      var customer = trxRec.getValue({ fieldId: 'custbody_tc_customer' }); // added by sim  
      var memoText = trxRec.getValue({ fieldId: 'memo' }); // added by sim 
      var shippingLocation = trxRec.getValue({ fieldId: 'custbody_tc_shipping_loc' }); // added by sim - value for Pickups state
      var deliveryAddress = trxRec.getValue({ fieldId: 'custbody_tc_shipping_address' }); // added by sim - value for Delivery state
      var oldPO = trxRec.getValue({ fieldId: 'custbody_ds_freight_purchase_order' });
      var poItem = trxRec.getValue({ fieldId: 'custbody_tc_po_item' });
      var owner = trxRec.getValue({ fieldId: 'custbody_tc_load_owner' });
      var locID = trxRec.getValue({ fieldId: 'custbody_tc_shipping_loc' });
      var subID = trxRec.getValue({ fieldId: 'custbody_po_subsidiary' });
      var isScrap = trxRec.getValue({ fieldId: 'custbody_ds_scrap_record' });
      var isPO_Item_Changed = trxRec.getValue({ fieldId: 'custbody_csr_po_item_changed' });
      var isPO_item_original = trxRec.getValue({ fieldId: 'custbody_csr_original_po_item' });
      var isPO_freight_amount_changed = trxRec.getValue({ fieldId: 'custbody_csr_freight_changed' });
      var isPO_freight_amount_original = trxRec.getValue({ fieldId: 'custbody_csr_original_vendor_freight' });

      log.debug('Header Values', JSON.stringify({
        trxId: trxId,
        carrier: carrier,
        customer: customer, // added by sim
        memoText: memoText, // added by sim
        shippingLocation: shippingLocation, // added by sim
        deliveryAddress: deliveryAddress, // added by sim
        oldPO: oldPO,
        poItem: poItem,
        owner: owner,
        locID: locID,
        subID: subID,
        isScrap: isScrap,
        isPO_Item_Changed: isPO_Item_Changed,
        isPO_item_original: isPO_item_original,
        isPO_freight_amount_changed: isPO_freight_amount_changed,
        isPO_freight_amount_original: isPO_freight_amount_original
      }));

      // --------------------------------------------------
      // SCRAP LOGIC
      // If scrap record is true and PO already exists, close that PO
      // --------------------------------------------------
      if (isScrap === true || isScrap === 'T') {
        log.debug('SCRAP CHECK', 'Record marked as scrap');

        if (oldPO) {
          closePurchaseOrder(oldPO);
          log.debug('SCRAP EXIT', 'Related PO closed. PO ID=' + oldPO);
        } else {
          log.debug('SCRAP EXIT', 'Scrap is true but no related PO found');
        }

        return;
      }

      // Remove the oldPO condition
      // If PO already exists, do not create again
      if (!carrier || !poItem || !subID) { //|| oldPO
        log.debug('EXIT', 'Missing carrier / PO Item / subsidiary or PO already created');
        return;
      }

      var currency = trxRec.getValue({ fieldId: 'custbodycustbody_vendor_fr_currency' });
      var freightAmount = parseFloat(trxRec.getValue({ fieldId: 'custbody_ts_vendor_freight' })) || 0;
      var tranId = trxRec.getValue({ fieldId: 'tranid' });

      log.debug('Freight Values', JSON.stringify({
        currency: currency,
        freightAmount: freightAmount,
        tranId: tranId
      }));

      // Once PO created, after that Frieght Amount updated as 0 in CSR record then what we need to do. Do we need to delete or Close the existing PO.
      if (freightAmount <= 0) {
        log.debug('EXIT', 'Freight amount is zero or blank');
        return;
      }

      // var soLines = [];
      // var totalCommitted = 0;

      // var transactionSearchObj = search.create({
      //   type: 'transaction',
      //   filters: [
      //     ['type', 'anyof', 'Custom116'],
      //     'AND',
      //     ['internalid', 'anyof', trxId],
      //     'AND',
      //     ['mainline', 'is', 'F'],
      //     'AND',
      //     ['custcol_tc_sales_order.mainline', 'is', 'T']
      //   ],
      //   columns: [
      //     search.createColumn({
      //       name: 'internalid',
      //       join: 'CUSTCOL_TC_SALES_ORDER',
      //       summary: 'GROUP'
      //     }),
      //     search.createColumn({
      //       name: 'custbody_tc_customer',
      //       summary: 'GROUP'
      //     }),
      //     search.createColumn({
      //       name: 'custcol_tc_commited',
      //       summary: 'SUM'
      //     }),
      //     search.createColumn({
      //       name: 'shipstate',
      //       join: 'CUSTCOL_TC_SALES_ORDER',
      //       summary: 'MAX'
      //     }),
      //     search.createColumn({
      //       name: 'state',
      //       join: 'CUSTBODY_TC_SHIPPING_LOC',
      //       summary: 'MAX'
      //     }),
      //     search.createColumn({
      //       name: 'state',
      //       join: 'subsidiary',
      //       summary: 'MAX'
      //     })
      //   ]
      // });

      // transactionSearchObj.run().each(function (result) {
      //   var soId = result.getValue({
      //     name: 'internalid',
      //     join: 'CUSTCOL_TC_SALES_ORDER',
      //     summary: 'GROUP'
      //   });

      //   var customerText = result.getText({
      //     name: 'custbody_tc_customer',
      //     summary: 'GROUP'
      //   }) || '';

      //   var committedQty = parseFloat(result.getValue({
      //     name: 'custcol_tc_commited',
      //     summary: 'SUM'
      //   })) || 0;

      //   var pickupState = result.getValue({
      //     name: 'state',
      //     join: 'CUSTBODY_TC_SHIPPING_LOC',
      //     summary: 'MAX'
      //   }) || result.getValue({
      //     name: 'state',
      //     join: 'subsidiary',
      //     summary: 'MAX'
      //   }) || '';

      //   var delState = result.getValue({
      //     name: 'shipstate',
      //     join: 'CUSTCOL_TC_SALES_ORDER',
      //     summary: 'MAX'
      //   }) || '';

      //   if (soId && committedQty > 0) {
      //     soLines.push({
      //       soId: soId,
      //       customerText: customerText,
      //       committedQty: committedQty,
      //       pickupState: pickupState,
      //       delState: delState
      //     });
      //     totalCommitted += committedQty;
      //   }

      //   return true;
      // });

      // log.debug('SO DATA', JSON.stringify({
      //   soLineCount: soLines.length,
      //   totalCommitted: totalCommitted
      // }));

      // commenting this as PO needs to be created even if the committed quantity is zero on the CSR
      // if (!soLines.length || totalCommitted <= 0) {
      //   log.debug('EXIT', 'No valid related SO lines found');
      //   return;
      // }

      const uniqueObj = {};
      const lineCount = trxRec.getLineCount({ sublistId: 'line' });
      log.debug('lineCount', lineCount);

      // Collect and build object from CSR record

      for (let i = 0; i < lineCount; i++) {
        const salesOrderId = trxRec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_sales_order', line: i });
        const poItemId = trxRec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_csr_po_item', line: i });
        const poAmount = trxRec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_trusscore_po_amount', line: i });
        log.debug('lineCount : ' + i, "salesOrderId : " + salesOrderId + " -- poItemId : " + poItemId + " -- poAmount : " + poAmount);

        if (!salesOrderId || !poItemId) continue;

        const key = salesOrderId + '_' + poItemId;

        if (!uniqueObj[key]) {
          uniqueObj[key] = {
            salesOrderId: salesOrderId,
            poItemId: poItemId,
            totalAmount: 0,
            lines: []
          };
        }

        uniqueObj[key].totalAmount += Number(poAmount || 0);
        uniqueObj[key].lines.push({
          line: i,
          salesOrderId: salesOrderId,
          poItemId: poItemId,
          poAmount: poAmount
        });
      }

      log.debug('Unique SO + PO Item Object', uniqueObj);

      var poRecord = null;
      if (oldPO)//then load hte PO
      {

        poRecord = record.load({
          type: record.Type.PURCHASE_ORDER,
          id: oldPO,
          isDynamic: true
        });
        var is_Freight_CSR_PO = poRecord.getValue({ fieldId: 'custbody_tc_freight_csr_po' });
        log.debug('oldPO', oldPO + ' oldPO found so will load and update' + '  || is_Freight_CSR_PO : ' + is_Freight_CSR_PO);

        poRecord.setValue({ fieldId: 'memo', value: tranId });
        var pickupState = getLocationState(shippingLocation);
        var deliveryState = getStateFromAddress(deliveryAddress);
        log.emergency('asdf', 'pickupState : ' + pickupState + ' -- deliveryState : ' + deliveryState)
        poRecord.setValue({ fieldId: 'custbody_tc_frt_pickup_state', value: pickupState });
        poRecord.setValue({ fieldId: 'custbody_tc_frt_delivery_state', value: deliveryState });
        poRecord.setValue({ fieldId: 'custbody_memo_notes_from_csr', value: memoText });// added by sim

        // set freight changed and item changed fields in PO (should happen only in EDIT)
        poRecord.setValue({ fieldId: 'custbody_is_ven_freight_changed', value: isPO_freight_amount_changed });
        poRecord.setValue({ fieldId: 'custbody_is_po_item_changed', value: isPO_Item_Changed });

        const lineCount = poRecord.getLineCount({ sublistId: 'item' });

        for (let i = lineCount - 1; i >= 0; i--) {
          log.debug('oldPO', oldPO + ' removing line  ' + i);
          poRecord.removeLine({ sublistId: 'item', line: i });
        }

        // 
        // a. Item Code Edit   PO reapproval should triggered
        // b.	$$$ Value Edit   PO reapproval should triggered
        if (is_Freight_CSR_PO == true && (isPO_freight_amount_changed == true || isPO_Item_Changed == true)) {
          try {
            // const WORKFLOW_ID = 'customworkflow7';
            // const WORKFLOW_SUBMIT_FOR_APPROVAL_STATE_ID = 'workflowstate48';
            // Trigger the workflow specific action
            // var workflowInstanceId = workflow.trigger({
            //   recordType: 'purchaseorder', // The record type (e.g., 'salesorder', 'customer')
            //   recordId: oldPO, // The ID of the record
            //   workflowId: WORKFLOW_ID, // STANDALONE BILL APROVAL
            //   actionId: 'workflowaction186'  // Script ID of the specific action/button
            // });
            // log.debug('Workflow Triggered', 'Instance ID: ' + workflowInstanceId);

            // var workflowInstanceId = workflow.initiate({
            //   recordType: 'purchaseorder', // The record type (e.g., 'salesorder', 'customer')
            //   recordId: oldPO, // The ID of the record
            //   workflowId: WORKFLOW_ID, // STANDALONE BILL APROVAL
            // });
            // log.debug('Workflow initiate', 'Instance ID: ' + workflowInstanceId);

            poRecord.setValue({ fieldId: 'nextapprover', value: 2004 }); //commeted to test approval process
            // resetting the status to avoid Submit for approval extra step and make it to auto
            poRecord.setValue({
              fieldId: 'approvalstatus',
              value: 1
            });
            // Define your NetSuite Workflow Script ID
            // log.debug('approvalstatus', ' approvalstatus udpated to ');
          } catch (e) {
            log.error('Workflow Trigger Error', e.message);
          }
        }

      }
      // Else create a new PO
      else {
        log.debug('oldPO', 'oldPO NOT found so will create new one');

        poRecord = record.create({
          type: record.Type.PURCHASE_ORDER,
          isDynamic: true
        });

        poRecord.setValue({ fieldId: 'entity', value: carrier });
        poRecord.setValue({ fieldId: 'subsidiary', value: subID });
        poRecord.setValue({ fieldId: 'custbody_tc_freight_csr_po', value: true });
        poRecord.setValue({ fieldId: 'memo', value: tranId });
        poRecord.setValue({ fieldId: 'department', value: 9 });
        poRecord.setValue({ fieldId: 'nextapprover', value: 2004 }); //commeted to test approval process

        var pickupState = getLocationState(shippingLocation);
        var deliveryState = getStateFromAddress(deliveryAddress);
        log.emergency('asdf', 'pickupState : ' + pickupState + ' -- deliveryState : ' + deliveryState)
        poRecord.setValue({ fieldId: 'custbody_tc_frt_pickup_state', value: pickupState });
        poRecord.setValue({ fieldId: 'custbody_tc_frt_delivery_state', value: deliveryState });
        poRecord.setValue({ fieldId: 'custbody_memo_notes_from_csr', value: memoText });// added by sim

      }

      if (currency) {
        poRecord.setValue({ fieldId: 'currency', value: currency });
      }

      if (owner) {
        poRecord.setValue({ fieldId: 'employee', value: owner });
      }

      poRecord.setValue({ fieldId: 'tobeemailed', value: false });

      // if (locID) {
      //   poRecord.setValue({ fieldId: 'location', value: locID });
      // }

      // Get the line count of existing PO and get the Item and rate values as well as Header values of Subsidiary and Carrier
      // If any changes happen then delete all existing line items and create new lines based on solInes array

      // var allocatedTotal = 0;
      var i, line, amount, pickupStateId, delStateId;
      var arrayLength = Object.keys(uniqueObj).length;
      // amount = roundToTwo(freightAmount / arrayLength);
      log.debug('Unique combinations count arrayLength', arrayLength);
      // log.debug('amount', amount);
      var poGroups = Object.keys(uniqueObj).map(function (key) {
        return uniqueObj[key];
      });

      var allocatedTotal = 0;

      // added for amount rounding fix
      poGroups.forEach(function (group, index) {
        var lineAmount;

        if (index === poGroups.length - 1) {
          // Allocate any rounding difference to the last PO line
          lineAmount = roundToTwo(freightAmount - allocatedTotal);
        } else {
          lineAmount = roundToTwo(group.totalAmount);
          allocatedTotal = roundToTwo(allocatedTotal + lineAmount);
        }

        log.debug('PO LINE AMOUNT', JSON.stringify({
          index: index,
          salesOrderId: group.salesOrderId,
          poItemId: group.poItemId,
          originalGroupAmount: group.totalAmount,
          finalLineAmount: lineAmount,
          allocatedTotalBeforeLast: allocatedTotal,
          freightAmount: freightAmount
        }));

        poRecord.selectNewLine({ sublistId: 'item' });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: group.poItemId });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_po_customer', value: customer });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_trx_line', value: group.salesOrderId });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_trx_line_ship', value: trxId });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: lineAmount });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: lineAmount });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'department', value: 9 });
        poRecord.commitLine({ sublistId: 'item' });
      });
      /*
      // commneted on 4-jul Sim to fix Amount not rounding issue
      Object.keys(uniqueObj).forEach((key) => {
        const group = uniqueObj[key];

        poRecord.selectNewLine({ sublistId: 'item' });

        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: group.poItemId });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_po_customer', value: customer });

        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_trx_line', value: group.salesOrderId });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_trx_line_ship', value: trxId });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: group.totalAmount });
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: group.totalAmount });  //amount
        poRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'department', value: 9 });

        poRecord.commitLine({ sublistId: 'item' });
      });
      */
      // END COMMENT
      // for (i = 0; i < soLines.length; i++) {
      //   line = soLines[i];

      //   if (i === soLines.length - 1) {
      //     amount = roundToTwo(freightAmount - allocatedTotal);
      //   } else {
      //     amount = roundToTwo((freightAmount * line.committedQty) / totalCommitted);
      //     allocatedTotal += amount;
      //   }

      //   pickupStateId = getStateId(line.pickupState);
      //   delStateId = getStateId(line.delState);

      //   log.debug('LINE BUILD', JSON.stringify({
      //     index: i,
      //     soId: line.soId,
      //     amount: amount,
      //     pickupState: line.pickupState,
      //     pickupStateId: pickupStateId,
      //     delState: line.delState,
      //     delStateId: delStateId
      //   }));

      //   poRecord.selectNewLine({ sublistId: 'item' });

      //   poRecord.setCurrentSublistValue({
      //     sublistId: 'item',
      //     fieldId: 'item', // new field custcol_csr_po_items
      //     value: poaccount
      //   });

      //   poRecord.setCurrentSublistValue({
      //     sublistId: 'item',
      //     fieldId: 'amount',
      //     value: amount
      //   });

      //   poRecord.setCurrentSublistValue({
      //     sublistId: 'item',
      //     fieldId: 'department',
      //     value: 9
      //   });

      //   if (pickupStateId) {
      //     poRecord.setCurrentSublistValue({
      //       sublistId: 'item',
      //       fieldId: 'custcol_tc_frt_pickup_state',
      //       value: pickupStateId
      //     });
      //   }

      //   if (delStateId) {
      //     poRecord.setCurrentSublistValue({
      //       sublistId: 'item',
      //       fieldId: 'custcol_tc_frt_delivery_state',
      //       value: delStateId
      //     });
      //   }

      //   if (line.customerText) {
      //     poRecord.setCurrentSublistValue({
      //       sublistId: 'item',
      //       fieldId: 'description',
      //       value: line.customerText
      //     });
      //   }

      //   poRecord.setCurrentSublistValue({
      //     sublistId: 'item',
      //     fieldId: 'custcol_tc_trx_line',
      //     value: line.soId
      //   });

      //   poRecord.setCurrentSublistValue({
      //     sublistId: 'item',
      //     fieldId: 'custcol_tc_trx_line_ship',
      //     value: trxId
      //   });

      //   poRecord.commitLine({ sublistId: 'item' });
      // }

      var poId = poRecord.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });

      log.debug('PO CREATED', 'PO ID=' + poId);

      record.submitFields({
        type: 'customtransaction118',
        id: trxId,
        values: {
          custbody_ds_freight_purchase_order: poId
        }
      });

      log.debug('END', 'PO linked back to transaction. trxId=' + trxId + ', poId=' + poId);

    } catch (e) {
      log.error('ERROR', e.name + ': ' + e.message + ' | Stack: ' + e.stack);
    }
  }

  // added by sim
  /**
   * Get state/province from Location main address
   *
   * @param {number|string} locationId
   * @returns {string}a
   */
  function getLocationState(locationId) {
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

    log.debug('getLocationState 1', stateCode)
    if (stateCode) {
      var stateId = getStateIdByCode(stateCode);
      log.debug('getLocationState 2', stateId)
      return stateId;
    }
    else {
      return '';
    }
  }

  // added by sim
  /**
   * Extract state/province from address text
   * Works with NetSuite address fields
   *
   * @param {string} address
   * @returns {string}
   */
  function getStateFromAddress(address) {

    if (!address) {
      return '';
    }

    // Match: City, ST ZIP
    // Example: Calgary, AB T2P 1J9
    // Example: Dallas, TX 75201

    var match = (address || '').match(/(?:,\s*|\s+)([A-Z]{2})\s+\d{5}(?:-\d{4})?/i);

    var stateCode = match ? match[1].toUpperCase() : '';
    log.debug('getStateFromAddress 1', stateCode)
    if (stateCode) {
      var stateId = getStateIdByCode(stateCode);
      log.debug('getStateFromAddress 2', stateId)
      return stateId;
    }
    else {
      return '';
    }
  }

  // added by sim, common method to get State Internal id 
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

  function closePurchaseOrder(poId) {
    try {
      log.debug('CLOSE PO START', 'poId=' + poId);

      var poRec = record.load({
        type: record.Type.PURCHASE_ORDER,
        id: poId,
        isDynamic: false
      });

      var lineCount = poRec.getLineCount({ sublistId: 'item' });
      log.debug('CLOSE PO', 'lineCount=' + lineCount);

      for (var i = 0; i < lineCount; i++) {
        var isClosed = poRec.getSublistValue({
          sublistId: 'item',
          fieldId: 'isclosed',
          line: i
        });

        if (isClosed !== true && isClosed !== 'T') {
          poRec.setSublistValue({
            sublistId: 'item',
            fieldId: 'isclosed',
            line: i,
            value: true
          });
          log.debug('CLOSE PO LINE', 'Closed line=' + i);
        } else {
          log.debug('CLOSE PO LINE', 'Already closed line=' + i);
        }
      }
      // closing PO
      var savedId = poRec.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });

      log.debug('CLOSE PO END', 'PO closed successfully. savedId=' + savedId);

    } catch (e) {
      log.error('CLOSE PO ERROR', e.name + ': ' + e.message + ' | PO ID=' + poId);
      throw e;
    }
  }

  function getStateId(stateValue) {
    try {
      if (!stateValue) {
        return '';
      }

      var stateId = '';

      var stateSearchObj = search.create({
        type: 'state',
        filters: [
          [
            ['shortname', 'is', stateValue],
            'OR',
            ['fullname', 'is', stateValue]
          ]
        ],
        columns: [
          search.createColumn({ name: 'id' })
        ]
      });

      stateSearchObj.run().each(function (result) {
        stateId = result.getValue({ name: 'id' });
        return false;
      });

      return stateId || '';

    } catch (e) {
      log.error('STATE ERROR', e.name + ': ' + e.message + ' | stateValue=' + stateValue);
      return '';
    }
  }

  function roundToTwo(value) {
    return Math.round((parseFloat(value) || 0) * 100) / 100;
  }

  return {
    afterSubmit: afterSubmit
  };
});