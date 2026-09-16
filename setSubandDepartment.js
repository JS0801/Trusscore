/**
* @NApiVersion 2.x
* @NScriptType UserEventScript
*/
define(['N/record', 'N/search', 'N/log'], function(record, search, log) {

    function beforeSubmit(context) {

      try {
         var newRecord = context.newRecord;
        var customform = newRecord.getValue({fieldId:'customform'})

        var lineCount = newRecord.getLineCount({
            sublistId: 'item'
        });

        var subsidiary = newRecord.getValue({
               fieldId: 'subsidiary'
           });

           var location = newRecord.getValue({
                  fieldId: 'location'
              });

if(location && customform != 240){
  for (var lineIndex = 0; lineIndex < lineCount; lineIndex++) {

          newRecord.setSublistValue({
                 sublistId: 'item',
                 fieldId: 'targetlocation',
                 line: lineIndex,
                 value: location // Set subsidiary value as the location
             });

             newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'targetsubsidiary',
                    line: lineIndex,
                    value: subsidiary // Set subsidiary value as the location
                });


        }
}
        
      } catch (error) {
        log.error('error',error)
      }
       
    }

    return {
        beforeSubmit: beforeSubmit
    };

});
