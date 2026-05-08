/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 */
define(['N/record', 'N/runtime', 'N/log'], function (record, runtime, log) {

  function onAction(context) {
    try {
      var bankDetailsRec = context.newRecord;
      log.debug('bankDetailsRec',bankDetailsRec)
      var vendorId = bankDetailsRec.getValue({ fieldId: 'custrecord_2663_parent_vendor' });
      log.debug('vendorId',vendorId)

      if (vendorId) {
        // Load Vendor record
        var vendorRec = record.load({
          type: record.Type.VENDOR,
          id: vendorId,
        });
      var script = runtime.getCurrentScript();
      var onHoldValue = script.getParameter({ name: 'custscript_on_hold' });
        log.debug('onHoldValue',onHoldValue)
        if(!onHoldValue){
          onHoldValue = false;
        }
        // Set checkbox field to true
        vendorRec.setValue({
          fieldId: 'custentity_tc_onhold_payments',
          value: onHoldValue,
        });

        // Save Vendor record
        vendorRec.save();
        log.audit('Vendor Updated', 'Vendor ID: ' + vendorId + ' checkbox set to true');
      } else {
        log.error('Missing Vendor', 'No vendor linked to bank details record');
      }
    } catch (e) {
      log.error('Error in Workflow Action Script', e.toString());
    }
  }

  return {
    onAction: onAction,
  };
});
