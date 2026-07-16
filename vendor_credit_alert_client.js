/**
* @NApiVersion 2.1
* @NScriptType ClientScript
*/
define(['N/record', 'N/search', 'N/ui/dialog', 'N/ui/message', 'N/runtime'], function(record, search, dialog, message, runtime) {

  var holdMsgObj = null;

  function pageInit(context) {
    try {
      var currentRecord = context.currentRecord;

      var entityId = currentRecord.getValue({ fieldId: 'entity' });
      if (!entityId) return;

      var vendorRec = record.load({
        type: record.Type.VENDOR,
        id: entityId,
        isDynamic: false
      });

      var isOnHold = vendorRec.getValue({ fieldId: 'custentity_tc_onhold_payments' });

      if (isOnHold === true || isOnHold === 'T') {
        if (holdMsgObj) {
          try { holdMsgObj.hide(); } catch (e) {}
        }

        holdMsgObj = message.create({
          title: 'Vendor Payment On Hold',
          message: 'Vendor payment is on hold. This record will remain in Pending Approval until the vendor payment hold is lifted.',
          type: message.Type.ERROR
        });

        holdMsgObj.show({ duration: 0 });
      }

    } catch (e) {
      log.error({ title: 'pageInit error', details: e });
    }
  }

  function fieldChanged(context) {
    var currentRecord = context.currentRecord;
    var fieldId = context.fieldId;

        var scriptObj = runtime.getCurrentScript();        
        var validation = scriptObj.getParameter({ name: 'custscript_tc_vendor_customer' }); 

    try {
    if (fieldId === 'entity') {
      var entityId = currentRecord.getValue('entity');

      if (entityId) {
        // Fetch vendor credit
        var alertMsg = getAlert(entityId, validation);
        log.debug('alertMsg', alertMsg)

        // Show alert with remaining vendor credit
        if (alertMsg) {
          log.debug('alert', alertMsg)
          alert('Special Instruction: ' + alertMsg)
        }

      }
    }
      
      
    } catch (error) {
      log.error('error',error)
    }

  }


  // Function to fetch the vendor's msg
  function getAlert(entityId, validation) {

    if (validation == 1) var recType = 'customer';
    else var recType = 'vendor';

    
    var Rec = record.load({type:recType,id:entityId,isDynamic:true})
    var msg = Rec.getValue({fieldId:'custentity_tc_special_instruction_alert'})
    return msg;
  }

  return {
    pageInit: pageInit,
    fieldChanged: fieldChanged
  };
});
