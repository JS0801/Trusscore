/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/log'], (search, record, log) => {

  function beforeLoad(context) {
    try {
      if (context.type == context.UserEventType.DELETE) return;

      var rec = context.newRecord;
      var recId = rec.id;
      if (!recId) return;

      var statusText = '';
      var pickwave = recId;

      try {
        statusText = rec.getText({ fieldId: 'status' }) || '';
      } catch (e1) {
        log.error('Unable to get status text', e1);
        return;
      }

      log.debug('Wave Status', statusText);
      log.debug('Wave Id', pickwave);

      if (statusText !== 'Released') {
        log.debug('Skipped', 'Wave status is not Released');
        return;
      }

      const picktaskSearchObj = search.create({
        type: 'picktask',
        filters: [
          ['item.custitem_tc_is_crating_item', 'is', 'T'],
          'AND',
          ['status', 'anyof', 'READY'],
          'AND',
          ['wavename', 'anyof', pickwave]
        ],
        columns: [
          search.createColumn({ name: 'internalid', label: 'Internal ID' })
        ]
      });

      var searchResultCount = picktaskSearchObj.runPaged().count;
      log.debug('picktaskSearchObj result count', searchResultCount);

      picktaskSearchObj.run().each(function(result) {
        try {
          var pickId = result.getValue({ name: 'internalid' });
          log.debug('pickId', pickId);

          var PICK_task = record.load({
            type: 'picktask',
            id: pickId,
            isDynamic: false
          });

          var lineCount = PICK_task.getLineCount({ sublistId: 'pickactions' });
          log.debug('lineCount', lineCount);

          for (var i = 0; i < lineCount; i++) {
            PICK_task.setSublistText({
              sublistId: 'pickactions',
              fieldId: 'status',
              line: i,
              text: 'Done'
            });

            var qty = PICK_task.getSublistValue({
              sublistId: 'pickactions',
              fieldId: 'quantity',
              line: i
            });

            PICK_task.setSublistValue({
              sublistId: 'pickactions',
              fieldId: 'pickedquantity',
              line: i,
              value: qty
            });
          }

          PICK_task.setText({
            fieldId: 'status',
            text: 'Done'
          });

          var savedId = PICK_task.save({
            enableSourcing: false,
            ignoreMandatoryFields: true
          });

          log.debug('Pick Task Updated', savedId);

        } catch (pickErr) {
          log.error('Error updating pick task', pickErr);
        }

        return true;
      });

    } catch (e) {
      log.error('beforeLoad error', e);
    }
  }

  return {
    beforeLoad: beforeLoad
  };
});