/**
* @NApiVersion 2.x
* @NScriptType workflowactionscript
*/

define(['N/record', 'N/runtime', 'N/search', 'N/format'],
function(record, runtime, search, format) {
  
  function onAction(scriptContext) {
    
    var bill_record = scriptContext.newRecord;
    var recType = bill_record.type;
    log.debug({title:'recType',details:recType})
    if(recType == 'vendorbill'){
      var created_by = bill_record.getValue('custbody_tc_employee');
      log.debug({title:'created_by',details:created_by})
    }else{
      var created_by = bill_record.getValue('employee');
      log.debug({title:'created_by',details:created_by})
    }
    
    var next_approver = bill_record.getValue('nextapprover');
    log.debug({title:'next_approver',details:next_approver})
    
    if(!isEmpty(next_approver)){
      if(next_approver != -1){
        
        created_by = next_approver;
      }
    }
    
    var supervisor = search.lookupFields({
      type: search.Type.EMPLOYEE,
      id: created_by,
      columns: ['supervisor']
    });
    log.debug({title:'supervisor',details:supervisor})
    
    supervisor = supervisor['supervisor'][0].value;
    log.debug({title:'supervisor',details:supervisor})
    
    var checkIfaway = isSupervisorAway(supervisor);
    log.debug({title:'checkIfaway',details:checkIfaway})

    if(checkIfaway){
      supervisor = checkIfaway
    }
    
        log.debug({title:'supervisor',details:supervisor})

    return supervisor;
  }
  //log.debug('***Matrix ID***',MatrixID);
  function isEmpty(value) {
    if (value === null) {
      return true;
    } else if (value === undefined) {
      return true;
    } else if (value === '') {
      return true;
    } else if (value === ' ') {
      return true;
    } else if (value === 'null') {
      return true;
    } else {
      return false;
    }
  }
  
  function isSupervisorAway(supervisor){
    var nextsupID;
    var employeeSearchObj = search.create({
      type: "employee",
      filters:
      [
        ["custentity_sas_delegation_isdelegated","is","T"], 
        "AND", 
        ["internalid","anyof",supervisor]
      ],
      columns:
      [
        search.createColumn({name: "entityid", label: "Name"}),
        search.createColumn({name: "custentity_sas_delegation_isdelegated", label: "Delegate Approval"}),
        search.createColumn({name: "custentity_sas_delegation_delegateto", label: "Delegate To"})
      ]
    });
    var searchResultCount = employeeSearchObj.runPaged().count;
    log.debug("employeeSearchObj result count",searchResultCount);
    employeeSearchObj.run().each(function(result){

      nextsupID = result.getValue({
        name: "custentity_sas_delegation_delegateto"
      })
      // .run().each has a limit of 4,000 results
      return true;
    });
    
    return nextsupID;
  }
  
  return {
    onAction : onAction
  };
  
});
