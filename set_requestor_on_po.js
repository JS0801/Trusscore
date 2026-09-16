/**
* @NApiVersion 2.0
* @NScriptType UserEventScript
* @NModuleScope SameAccount
*/
define(['N/record','N/log', 'N/search','N/runtime'], function(record,log, search,runtime) {

  function afterSubmit(context) {
    try {

      if (context.type !== context.UserEventType.CREATE) {
          return;
      }

      var currentRecord = context.newRecord;
      var recid = currentRecord.id;
      var aligned = currentRecord.getValue({fieldId:'custbody_ds_aligned_with_pr'});
      var currentUser = runtime.getCurrentUser();
      var userId = currentUser.id;

      if (aligned != true) {
      var purchaserequisitionSearchObj = search.create({
        type: "purchaserequisition",
        filters:
        [
          ["type","anyof","PurchReq"],
          "AND",
          ["mainline","is","F"],
          "AND",
          ["purchaseorder.internalid","anyof",recid]
        ],
        columns:
        [
          search.createColumn({name: "internalid", label: "Internal ID"}),
          search.createColumn({
            name: "internalid",
            join: "requestor",
            label: "Internal ID"
          })
        ]
      });
      var searchResultCount = purchaserequisitionSearchObj.runPaged().count;
      log.debug("purchaserequisitionSearchObj result count",searchResultCount);
      purchaserequisitionSearchObj.run().each(function(result){

        var req_id = result.getValue({
          name: "internalid",
          join: "requestor",
          label: "Internal ID"
        })

        record.submitFields({type:'purchaseorder',id:recid,values:{employee:req_id, custbody_ds_aligned_with_pr: true,custbody_tc_created_by: userId}})

        return true;
      });

}

    } catch (e) {
      log.error({
        title: 'Error',
        details: e
      });
    }
  }


  return {
    afterSubmit: afterSubmit
  };

});
