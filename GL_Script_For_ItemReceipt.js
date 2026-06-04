// Interface defined by the plug-in
function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
  try {

    var transaction_record_id = transactionRecord.id;
    nlapiLogExecution('DEBUG', 'DEBUG', transaction_record_id);

    var creditAmount = 0;
    var debitAmount = 0;
    var memo;
    var amount;
    var customerDepositAmount = 0;
    var entityId;
    var final_invoice_amount;
    var shipmentQnty;
    var locationId;
    var postingPeriod;
    //  var PRE_PAYMENT_ACCOUNT =  743;
    // for (var i = 0; i < standardLines.getCount(); i++){
    //
    // }
    //
    var updateGL_line_for_return = updateGL(transaction_record_id,transactionRecord,customLines);
  }
  catch (ex) {
    nlapiLogExecution('ERROR', 'ERROR', ex);
  }
}

function updateGL(transaction_record_id,transactionRecord,customLines){
  var order_reason,credit_amount;
  var class_id,department,location,memo,postingPeriod,subsidiary;
  var account;
  var prePaidAmount;
  var entity;
  var GL_Array = [];
  var data = {};





  var itemfulfillmentSearch = nlapiSearchRecord("itemreceipt",null,
  [
    ["type","anyof","ItemRcpt"],
    "AND",
    ["internalid","anyof",transaction_record_id],
    "AND",
    ["mainline","is","F"],
    "AND",
    ["creditamount","greaterthan","0.00"],
    "AND",
    ["custbody_tc_rma_reason","noneof","14",'9','17',"@NONE@"]
  ],
  [
    new nlobjSearchColumn("internalid"),
    new nlobjSearchColumn("postingperiod"),
    new nlobjSearchColumn("trandate"),
    new nlobjSearchColumn("currency"),
    new nlobjSearchColumn("inventorysubsidiary"),
    new nlobjSearchColumn("creditfxamount"),
    new nlobjSearchColumn("creditamount"),
    new nlobjSearchColumn("account"),
    new nlobjSearchColumn("custbody_tc_rma_reason"),
    new nlobjSearchColumn("ordertype").setSort(false),
    new nlobjSearchColumn("class"),
    new nlobjSearchColumn("department"),
    new nlobjSearchColumn("location"),
    new nlobjSearchColumn("memo"),
    new nlobjSearchColumn("entity"),
        new nlobjSearchColumn("subsidiary"),

    new nlobjSearchColumn("expenseaccount","item",null)
  ]
);

if(itemfulfillmentSearch){

  for (var i = 0; i < itemfulfillmentSearch.length; i++) {

    order_reason = itemfulfillmentSearch[i].getValue('custbody_tc_rma_reason');

    class_id = itemfulfillmentSearch[i].getValue('class');
    postingPeriod = itemfulfillmentSearch[i].getValue('postingperiod');
    department = itemfulfillmentSearch[i].getValue('department');
    location = itemfulfillmentSearch[i].getValue('location');
    account = itemfulfillmentSearch[i].getValue('account');
    entity = itemfulfillmentSearch[i].getValue('entity');
    memo = itemfulfillmentSearch[i].getValue('memo');
    date = itemfulfillmentSearch[i].getValue('trandate');
    inventorysubsidiary = itemfulfillmentSearch[i].getValue('inventorysubsidiary');
        nlapiLogExecution('DEBUG', 'inventorysubsidiary',  inventorysubsidiary);

    currency = itemfulfillmentSearch[i].getValue('currency');
    subsidiary = itemfulfillmentSearch[i].getValue('subsidiary');
    nlapiLogExecution('DEBUG', 'subsidiary',  subsidiary);
    nlapiLogExecution('DEBUG', 'entity',  entity);

    
          credit_amount = itemfulfillmentSearch[i].getValue('creditamount');

    
    nlapiLogExecution('DEBUG', 'credit_amount',  credit_amount);

    var itemAccount =  itemfulfillmentSearch[i].getValue("expenseaccount","item",null);
    nlapiLogExecution('DEBUG', 'IF postingPeriod',  postingPeriod);


    if(inventorysubsidiary != 5 && inventorysubsidiary != 6){
      nlapiLogExecution('DEBUG', 'IF ENTRY', 'IF ENTRY');
  
      var consolidatedexchangerateSearch = nlapiSearchRecord("consolidatedexchangerate",null,
      [
        ["period.internalid","anyof",postingPeriod],
        "AND",
        ["fromsubsidiary","anyof","12"],
        "AND",
        ["tosubsidiary","anyof","13"]
      ],
      [
        new nlobjSearchColumn("periodname").setSort(false),
        new nlobjSearchColumn("closed"),
        new nlobjSearchColumn("fromsubsidiary"),
        new nlobjSearchColumn("fromcurrency"),
        new nlobjSearchColumn("tosubsidiary"),
        new nlobjSearchColumn("tocurrency"),
        new nlobjSearchColumn("currentrate"),
        new nlobjSearchColumn("averagerate"),
        new nlobjSearchColumn("historicalrate")
      ]
    );
    if(consolidatedexchangerateSearch){
  
      for (var rate = 0; rate < 1; rate++) {
        var exchangeRate = consolidatedexchangerateSearch[rate].getValue('averagerate');
        nlapiLogExecution('DEBUG', 'exchangeRate', exchangeRate);
      }
      credit_amount = (credit_amount/exchangeRate).toFixed(2)
    }
  
  }


  var debit_line = customLines.addNewLine();
  debit_line.setDebitAmount(credit_amount);
  debit_line.setAccountId(parseInt(account));
  debit_line.setDepartmentId(parseInt(department));
  debit_line.setEntityId(parseInt(entity));
  debit_line.setLocationId(parseInt(location));
  debit_line.setClassId(parseInt(class_id))
  debit_line.setMemo(memo)


  nlapiLogExecution('DEBUG', 'credit_amount', credit_amount);
  var credit_line = customLines.addNewLine();
  credit_line.setCreditAmount(credit_amount);
  credit_line.setAccountId(parseInt(itemAccount));
  credit_line.setDepartmentId(parseInt(department))
  credit_line.setEntityId(parseInt(entity))
  credit_line.setLocationId(parseInt(location));
  credit_line.setClassId(parseInt(class_id))
  credit_line.setMemo(memo);


}

}
}
