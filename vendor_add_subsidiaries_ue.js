/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record'], (record) => {
  const SUBSIDIARIES = [5, 6, 12];

  function afterSubmit(context) {
    if (context.type === context.UserEventType.DELETE) return;

    const vendor = record.load({
      type: record.Type.VENDOR,
      id: context.newRecord.id,
      isDynamic: true
    });

    const existing = {};
    const carrier = vendor.getValue({ fieldId: 'custentity_tc_carriers_csr' });
    if(!carrier) return;
    
    const primarySub = vendor.getValue({ fieldId: 'subsidiary' });
    if (primarySub) existing[String(primarySub)] = true;

    const lineCount = vendor.getLineCount({ sublistId: 'submachine' });
    for (let i = 0; i < lineCount; i++) {
      const subId = vendor.getSublistValue({
        sublistId: 'submachine',
        fieldId: 'subsidiary',
        line: i
      });

      if (subId) existing[String(subId)] = true;
    }

    let changed = false;

    for (const subId of SUBSIDIARIES) {
      if (existing[String(subId)]) continue;

      vendor.selectNewLine({ sublistId: 'submachine' });
      vendor.setCurrentSublistValue({
        sublistId: 'submachine',
        fieldId: 'subsidiary',
        value: subId
      });
      vendor.commitLine({ sublistId: 'submachine' });

      changed = true;
      existing[String(subId)] = true;
    }

    if (changed) {
      vendor.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });
    }
  }

  return { afterSubmit };
});
