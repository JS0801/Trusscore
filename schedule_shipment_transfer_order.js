/**
* @NApiVersion 2.x
* @NScriptType Suitelet
* @NModuleScope SameAccount
*/
//customworkflow_eb_split_so
define(['N/ui/serverWidget', 'N/search', 'N/task', 'N/config', 'N/http', 'N/runtime','N/format','N/url','N/record','N/redirect', 'N/email'], suitelet);
function suitelet(serverWidget, search, task, config, http, runtime,format,url,record,redirect, email){
  function onRequest(context) {
    if (context.request.method === 'GET') {
      
      var curScriptObj = runtime.getCurrentScript();
      var clientScriptFileId = curScriptObj.getParameter({name:'custscript_tc_client_scriptid'});
      
      var itemname = context.request.parameters.itemname;
      var transferordernum = context.request.parameters.transferordernumber;
      var locationID = context.request.parameters.locationid;
      var supplyReqBy = context.request.parameters.supplyreqdate;
      var shipDate = context.request.parameters.shipDate;
      var customer = context.request.parameters.customer;
      var reschedule = context.request.parameters.reschedule;
      var buttontrigger = context.request.parameters.buttonTriggered;
      var shippingcity = context.request.parameters.shippingcity;
      var shipCityID = context.request.parameters.shipcityID;
      var emailparam = context.request.parameters.email;
      var shipdate = context.request.parameters.shipdate;

      var shipLoc = context.request.parameters.shipLoc;
      var csrbox = context.request.parameters.csrbox;
      var subject1 = context.request.parameters.subject;
      var body1 = context.request.parameters.body;
      var emailcc = context.request.parameters.emailcc;
      var emailto = context.request.parameters.emailto;
      log.debug({ title: 'buttontrigger', details: buttontrigger})
      
      var formParams = {
        'itemname' : itemname,
        'transferordernum' : transferordernum,
        'locationid' : locationID,
        'supplyreqdate' : supplyReqBy,
        'shipDate' : shipDate,
        'customer' : customer,
        'reschedule' : reschedule,
        'shippingcity' : shippingcity,
        "shipCityID" : shipCityID,
        "email" : emailparam
      }
      log.debug('formParams', formParams);
      
      var formObj = serverWidget.createForm({title:'Schedule Shipment'});
      var submitBtn = formObj.addSubmitButton({ id:'custpage_submit', label: "Update Shipment Details"});
      //  var submitBtn2 = formObj.addButton({ id:'custpage_submit2', label: "Create Consolidated Shipping Record",functionName: 'createShipmentRecord();'});
      
      formObj.addFieldGroup({
        id: 'update',
        label: 'Submit New Values'
      });
      formObj.addFieldGroup({
        id: 'filters',
        label: 'Filters'
      });
      formObj.addFieldGroup({
        id: 'email',
        label: 'Email'
      });

    
      var stmtDtFld = formObj.addField({id:'custpage_startdate', type: serverWidget.FieldType.DATE, label: 'SCHEDULED SHIP DATE',container: 'update'});
      var seLocation = formObj.addField({id:'custpage_shipping_location', type: serverWidget.FieldType.SELECT, label: 'SHIPPING Location',container: 'update'});
      var createShipRec = formObj.addField({id:'custpage_createshippingrec', type: serverWidget.FieldType.CHECKBOX, label: 'CREATE SHIPPING RECORD',container: 'update'});
      
      //var allocation = formObj.addField({id:'custpage_allocation',label:'ALLOCATION STRATEGY',type:serverWidget.FieldType.SELECT,source:'orderallocationstrategy',container:'update'})
      seLocation.addSelectOption({
        value: '',
        text: ''
      });
      seLocation.addSelectOption({
        value: '18',
        text: 'Palmerston - Main'
      });
      seLocation.addSelectOption({
        value: '28',
        text: 'Dayton - Main'
      });
      seLocation.addSelectOption({
        value: '11',
        text: 'Calgary - Main'
      });
      seLocation.addSelectOption({
        value: '56',
        text: 'Palmerston - Agway'
      });
      seLocation.addSelectOption({
        value: '43',
        text: 'Kitchener'
      });
      seLocation.addSelectOption({
        value: '37',
        text: 'Dixie - Houston Consignment'
      });
      seLocation.addSelectOption({
        value: '50',
        text: 'Dixie - San Antonio Consignment'
      });
      seLocation.addSelectOption({
        value: '35',
        text: 'Dixie - Dallas Consignment'
      });
      seLocation.addSelectOption({
        value: '61',
        text: 'Calgary - Daren Industries'
      });
      var shipreqby = formObj.addField({id:'custpage_shipreqby', type: serverWidget.FieldType.DATE, label: 'SUPPLY REQUIRED BY DATE(ON OR AFTER)',container: 'filters'});
      var shipDate = formObj.addField({id:'custpage_shipdate', type: serverWidget.FieldType.DATE, label: 'SCHEDULED SHIP DATE(ON OR AFTER)',container: 'filters'});
      var purchaseOrderNumber = formObj.addField({id:'custpage_sonumber', type: serverWidget.FieldType.TEXT, label: 'SEARCH TRANSFER ORDER',container: 'filters'});
      var customer = formObj.addField({id:'custpage_customer', type: serverWidget.FieldType.TEXT, label: 'SEARCH TRANSFER ORDER BY LOCATION',container: 'filters'});
      var itemname = formObj.addField({id:'custpage_itemname', type: serverWidget.FieldType.TEXT, label: 'SEARCH ITEM',container: 'filters'});
      var setshippingcity = formObj.addField({id:'custpage_shipping_city', type: serverWidget.FieldType.SELECT, label: 'SHIPPING City',container: 'filters'});
      setshippingcity.addSelectOption({
        value: '',
        text: ''
      });
      list_of_shipping_city(setshippingcity);
      
      
      var locationField = formObj.addField({
        id: 'custpage_location',
        type: serverWidget.FieldType.SELECT,
        label: 'Location',
        container: 'filters'
      });
      
      locationField.addSelectOption({
        value: '',
        text: ''
      });
      locationField.addSelectOption({
        value: '18',
        // value: '220',
        text: 'Palmerston - Main'
      });
      locationField.addSelectOption({
        value: '28',
        //value: '230',
        text: 'Dayton - Main'
      });
      locationField.addSelectOption({
        value: '11',
        //value: '243',
        text: 'Calgary - Main'
      });
      locationField.addSelectOption({
        value: '56',
        //value: '243',
        text: 'Palmerston - Agway'
      });
      
      locationField.addSelectOption({
        value: '43',
        text: 'Kitchener'
      });

      locationField.addSelectOption({
        value: '37',
        text: 'Dixie - Houston Consignment'
      });

      locationField.addSelectOption({
        value: '50',
        text: 'Dixie - San Antonio Consignment'
      });
      locationField.addSelectOption({
        value: '35',
        text: 'Dixie - Dallas Consignment'
      });
      locationField.addSelectOption({
        value: '61',
        text: 'Calgary - Daren Industries'
      });
      
      var reschedule = formObj.addField({
        id: 'custpage_reschedule',
        type: serverWidget.FieldType.SELECT,
        label: 'RESCHEDULING?'
        ,container: 'filters'
      });
      reschedule.addSelectOption({
        value: 'isempty',
        text: 'NO'
      });
      reschedule.addSelectOption({
        value: 'isnotempty',
        text: 'YES'
      });
      
      
      // Set the source of the location field to the ID of the standard location list.
      formObj.clientScriptFileId = clientScriptFileId;
      
      formObj.addButton({
        id : 'reset',
        label : 'Reset',
        functionName: 'onReset();'
      });
      
      locationField.defaultValue = formParams.locationid;
      if(!isEmpty(formParams.shipCityID)){
        
        setshippingcity.defaultValue = formParams.shipCityID;
      }
      purchaseOrderNumber.defaultValue = formParams.salesordernum;
      if(!isEmpty(formParams.supplyreqdate)){
        supplyReqBy.defaultValue = formParams.supplyreqdate;
      }
      if(!isEmpty(formParams.shipDate)){
        shipDate.defaultValue = formParams.shipDate;
      }
      customer.defaultValue = formParams.customer;
      reschedule.defaultValue = formParams.reschedule;
      
      
      
      // if(isEmpty(formParams.reschedule)){
      //   reschedule.defaultValue = 'isempty';
      //   formParams.reschedule = 'isempty'
      // }
      
      
      
      
      var salesOrderSublist = formObj.addSublist({id:'custpage_salesorderlist', type: serverWidget.SublistType.LIST, label: 'Schedule Shipment' });
      
      salesOrderSublist.addField({id: 'custpage_custselect', type: serverWidget.FieldType.CHECKBOX, label: 'Select'});
      var urlEdit =  salesOrderSublist.addField({id: 'custpage_link', type: serverWidget.FieldType.URL, label: 'Link'});
      var shipUrl =  salesOrderSublist.addField({id: 'custpage_shipping_link', type: serverWidget.FieldType.TEXT, label: 'Shipping Record Link'});
      
      salesOrderSublist.addField({id: 'custpage_custinternalid', type: serverWidget.FieldType.TEXT, label: 'Internal ID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custordernum', type: serverWidget.FieldType.TEXT, label: 'TRANSFER Order Number'});
      salesOrderSublist.addField({id: 'custpage_custmemo', type: serverWidget.FieldType.TEXT, label: 'Memo'});
      salesOrderSublist.addField({id: 'custpage_from_sub', type: serverWidget.FieldType.TEXT, label: 'Ship From Subsidiary'});
      salesOrderSublist.addField({id: 'custpage_location', type: serverWidget.FieldType.TEXT, label: 'Ship From Location'});
      salesOrderSublist.addField({id: 'custpage_to_sub', type: serverWidget.FieldType.TEXT, label: 'Ship To Subsidiary'});
      salesOrderSublist.addField({id: 'custpage_to_sub_id', type: serverWidget.FieldType.TEXT, label: 'Ship To Subsidiary ID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN});  // SD - TO Change
      salesOrderSublist.addField({id: 'custpage_to_location', type: serverWidget.FieldType.TEXT, label: 'Ship To Location'});
      salesOrderSublist.addField({id: 'custpage_requesteddate', type: serverWidget.FieldType.DATE, label: 'Supply Required By Date'});
      salesOrderSublist.addField({id: 'custpage_scheduledate', type: serverWidget.FieldType.DATE, label: 'Scheduled Ship Date'});
      salesOrderSublist.addField({id: 'custpage_custitem', type: serverWidget.FieldType.TEXT, label: 'Product Code'});
      salesOrderSublist.addField({id: 'custpage_custlinememo', type: serverWidget.FieldType.TEXT, label: 'Product Description'});
      salesOrderSublist.addField({id: 'custpage_qty', type: serverWidget.FieldType.TEXT, label: 'Quantity'});
      salesOrderSublist.addField({id: 'custpage_lefttoship', type: serverWidget.FieldType.TEXT, label: 'Left To Ship'});
      salesOrderSublist.addField({id: 'custpage_shippingqty', type: serverWidget.FieldType.TEXT, label: 'Shipping Quantity'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.ENTRY})
      salesOrderSublist.addField({id: 'custpage_custqtycommited', type: serverWidget.FieldType.TEXT, label: 'QUANTITY COMMITTED'});
      salesOrderSublist.addField({id: 'custpage_custqtypicked', type: serverWidget.FieldType.TEXT, label: 'QUANTITY PICKED'});
      salesOrderSublist.addField({id: 'custpage_custqtypacked', type: serverWidget.FieldType.TEXT, label: 'QUANTITY PACKED'});
      salesOrderSublist.addField({id: 'custpage_custitemid', type: serverWidget.FieldType.TEXT, label: 'ItemID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custlineid', type: serverWidget.FieldType.TEXT, label: 'lineID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custstatus', type: serverWidget.FieldType.TEXT, label: 'Status'});
      salesOrderSublist.addField({id: 'custpage_custreqdate', type: serverWidget.FieldType.DATE, label: 'Requested Date'});
      
      salesOrderSublist.addMarkAllButtons();
      
      var searchFilter = [
        ["mainline","is","F"],
        "AND",
        ["closed","is","F"],
        "AND",
        ["status","anyof","TrnfrOrd:B","TrnfrOrd:D","TrnfrOrd:E"],
        "AND",
        ["taxline","is","F"],
        "AND",
        ["shipping","is","F"],
        "AND", 
        ["formulanumeric: {quantity}-{quantityshiprecv}","greaterthan","0"],
        "AND", 
        ["transactionlinetype","anyof","RECEIVING"]  // SD - TO Chnage
      ]
      
      log.debug({title:'formParams.locationid',details:formParams.locationid})
      if(!isEmpty(formParams.itemname))
      {
        searchFilter.push("AND");
        searchFilter.push( ["item.name","haskeywords",formParams.itemname]);
      }
      if(!isEmpty(formParams.shippingcity))
      {
        searchFilter.push("AND");
        searchFilter.push( ["shipcity","is",formParams.shippingcity]);
      }
      if(!isEmpty(formParams.locationid)){
        searchFilter.push("AND");
        searchFilter.push(["inventorylocation","anyof",formParams.locationid]);
      }
      if(!isEmpty(formParams.supplyreqdate)){
        searchFilter.push("AND");
        searchFilter.push(["requesteddate","onorafter",formParams.supplyreqdate]);
      }
      log.debug({title:'formParams.reschedule',details:formParams.reschedule});
      
      if(isEmpty(formParams.reschedule)){
        searchFilter.push("AND");
        searchFilter.push(["custcol_tc_scheduled_ship_date",'isempty',""]);
      }
      if(!isEmpty(formParams.reschedule)){
        searchFilter.push("AND");
        searchFilter.push(["custcol_tc_scheduled_ship_date",formParams.reschedule,""]);
      }  
      if(!isEmpty(formParams.shipDate)){
        searchFilter.push("AND");
        searchFilter.push(["custcol_tc_scheduled_ship_date","onorafter",formParams.shipDate]);
      }
      
      if(!isEmpty(formParams.transferordernum)){
        searchFilter.push("AND");
        searchFilter.push(["numbertext","haskeywords",formParams.transferordernum]);
        searchFilter.push("OR");
        searchFilter.push(["poastext","is",formParams.transferordernum]);
        searchFilter.push("AND");
        searchFilter.push(["mainline","is","F"]);
        searchFilter.push("AND");
        searchFilter.push(["taxline","is","F"]);
        searchFilter.push("AND");
        searchFilter.push(["shipping","is","F"]);
      }
      
      var salesorderSearchObj = search.create({
        type: "transferorder",
        filters:searchFilter,
        columns:
        [
          search.createColumn({name: "tranid", label: "Document Number"}),
          search.createColumn({name: "otherrefnum", label: "PO/Check Number"}),
          search.createColumn({name: "memomain", label: "Memo (Main)"}),
          search.createColumn({name: "subsidiarynohierarchy", label: "Subsidiary (no hierarchy)"}),
          search.createColumn({name: "tosubsidiarynohierarchy", label: "To Subsidiary (no hierarchy)"}),
          search.createColumn({name: "tosubsidiary", label: "To Subsidiary"}),  // SD - TO Change
          search.createColumn({name: "locationnohierarchy", label: "Location (no hierarchy)"}),
          search.createColumn({name: "transferlocation", label: "To Location"}),
          search.createColumn({name: "ordertype", label: "Order Type"}),
          search.createColumn({name: "custbody_tc_ship_date_estimated", label: "Estimated Ship Date"}),
          search.createColumn({name: "custcol_tc_scheduled_ship_date", label: "Scheduled Ship Date"}),
          search.createColumn({name: "item", label: "Item"}),
          search.createColumn({name: "memo", label: "Memo"}),
          search.createColumn({name: "shipcity", label: "Shipping City"}),
          search.createColumn({
            name: "formulanumeric",
            formula: "{quantity}-{quantityshiprecv}",
            label: "Left to Ship"
          }),
          search.createColumn({name: "quantitycommitted", label: "Quantity Committed"}),
          search.createColumn({name: "quantitypicked", label: "Quantity Picked"}),
          search.createColumn({name: "quantitypacked", label: "Quantity Packed"}),
          search.createColumn({name: "line", label: "Line ID"}),
          search.createColumn({  //SD - TO Change
             name: "formulanumericline",
             formula: "{line}-2",
             label: "Custom Line ID"
          }),
          search.createColumn({name: "linesequencenumber", label: "Line Sequence Number"}),
          search.createColumn({name: "quantityuom", label: "Quantity"}),
          search.createColumn({name: "lineuniquekey", label: "Line Unique Key"}),
          search.createColumn({
            name: "internalid",
            join: "item",
            label: "Internal ID"
          }),
          search.createColumn({name: "custcol_tc_related_shipping_record", label: "RELATED CONSOLIDATED SHIPPING RECORD"}),
          search.createColumn({name: "shipaddress", label: "Ship To"}),
          search.createColumn({name: "requesteddate", label: "Customer requested date"}),
          search.createColumn({name: "expectedreceiptdate", label: "expectedshipdate date"})   
        ]
      });
      
      var sublistObj = formObj.getSublist({id: 'custpage_salesorderlist'});
      //log.debug({title:'sublistObj',details:sublistObj});
      var resultArray = [];
      salesorderSearchObj.run().each(function(result){
         resultArray.push(result);
      return true;
      });
      log.audit({title:'resultArray',details:resultArray});
      
      for(var i=0; i < resultArray.length ; i++){
        var shipRecordName = '';
        
        var scheme = 'https://';
        var host = url.resolveDomain({
          hostType: url.HostType.APPLICATION
        });
        var relativePath = url.resolveRecord({
          recordType: record.Type.TRANSFER_ORDER,
          recordId: resultArray[i].id,
          isEditMode: false
        });
        var myURL = scheme + host + relativePath;
        urlEdit.linkText = "View";
        sublistObj.setSublistValue({id:'custpage_link', line:i, value:myURL});
        
        shipRecordName = resultArray[i].getText({name:'custcol_tc_related_shipping_record'})
        var shipRecordId = resultArray[i].getValue({name:'custcol_tc_related_shipping_record'})
        var ship_to = resultArray[i].getValue({name:'shipaddress'})
        log.audit({title:'shipRecordName',details:shipRecordName});
        
        
        if(!isEmpty(shipRecordId)){
          var relativePath = url.resolveRecord({
            recordType: 'customtransaction118',
            recordId: shipRecordId,
            isEditMode: false
          });
          var myURL = scheme + host + relativePath;
          var shipLink = '<a href="' + myURL + '" target="_blank">' + shipRecordName + '</a>';
          sublistObj.setSublistValue({ id: 'custpage_shipping_link', line: i, value: shipLink });          
        }
        
        var itemDetails = resultArray[i]
        //  log.debug({title:'itemDetails',details:itemDetails})
        
        sublistObj.setSublistValue({id:'custpage_custinternalid', line:i, value:resultArray[i].id});
        sublistObj.setSublistValue({id:'custpage_custordernum', line:i, value:resultArray[i].getValue('tranid')});
        if(!isEmpty(resultArray[i].getValue('otherrefnum'))){
          sublistObj.setSublistValue({id:'custpage_custrefnumber', line:i, value:resultArray[i].getValue('otherrefnum')});
        }
        sublistObj.setSublistValue({id:'custpage_from_sub', line:i, value:resultArray[i].getText('subsidiarynohierarchy')});
        sublistObj.setSublistValue({id:'custpage_location', line:i, value:resultArray[i].getText('locationnohierarchy')});

        if(!isEmpty(resultArray[i].getValue('tosubsidiarynohierarchy'))){
        sublistObj.setSublistValue({id:'custpage_to_sub', line:i, value:resultArray[i].getValue('tosubsidiarynohierarchy')});
        sublistObj.setSublistValue({id:'custpage_to_sub_id', line:i, value:resultArray[i].getValue('tosubsidiary')});  // SD - TO Change
        }
        sublistObj.setSublistValue({id:'custpage_to_location', line:i, value:resultArray[i].getText('transferlocation')});



        if(!isEmpty(resultArray[i].getValue('memomain'))){
          sublistObj.setSublistValue({id:'custpage_custmemo', line:i, value:resultArray[i].getValue('memomain')});
        }

        if(!isEmpty(resultArray[i].getValue('requesteddate'))){
          sublistObj.setSublistValue({id:'custpage_requesteddate', line:i, value:resultArray[i].getValue('requesteddate')});
        }
        if(!isEmpty(resultArray[i].getValue('expectedreceiptdate'))){
          sublistObj.setSublistValue({id:'custpage_scheduledate', line:i, value:resultArray[i].getValue('expectedreceiptdate')});
        }
        
        if(!isEmpty(resultArray[i].getValue('requesteddate'))){
          sublistObj.setSublistValue({id:'custpage_custreqdate', line:i, value:resultArray[i].getValue('requesteddate')});
        }
        
        sublistObj.setSublistValue({id:'custpage_custstatus', line:i, value:resultArray[i].getText({name:'statusref'})});
        //sublistObj.setSublistValue({id:'custpage_custamount', line:i, value:resultArray[i].getValue('amount')});
        if(!isEmpty(resultArray[i].getValue('item'))){
          sublistObj.setSublistValue({id:'custpage_custitem', line:i, value:resultArray[i].getText('item')});
          if(!isEmpty(resultArray[i].getValue('memo'))){
            sublistObj.setSublistValue({id:'custpage_custlinememo', line:i, value:resultArray[i].getValue('memo')});
          }
          sublistObj.setSublistValue({id:'custpage_custitemid', line:i, value:resultArray[i].getValue('item')});
          sublistObj.setSublistValue({id:'custpage_custlineid', line:i, value:resultArray[i].getValue('formulanumericline')});  // SD - TO Chnage
          sublistObj.setSublistValue({id:'custpage_qty', line:i, value: parseInt(resultArray[i].getValue('quantityuom'))}); // SD - TO Change
          sublistObj.setSublistValue({id:'custpage_lefttoship', line:i, value:resultArray[i].getValue('formulanumeric')});
          if(!isEmpty(resultArray[i].getValue('custbody_tc_shipping_charge'))){
            sublistObj.setSublistValue({id:'custpage_custshippingcharg', line:i, value:resultArray[i].getText('custbody_tc_shipping_charge')});
          }
          if(!isEmpty(resultArray[i].getValue('quantitycommitted'))){
            sublistObj.setSublistValue({id:'custpage_custqtycommited', line:i, value:resultArray[i].getValue('quantitycommitted')});
          }
          sublistObj.setSublistValue({id:'custpage_custqtypicked', line:i, value:resultArray[i].getValue('quantitypicked')});
          sublistObj.setSublistValue({id:'custpage_custqtypacked', line:i, value:resultArray[i].getValue('quantitypacked')});
          
          
        }
        
        
        
        //  log.debug({title:'resultArray[i].getValue',details:resultArray[i].getValue('shipcomplete')})
        var shipComplete = resultArray[i].getValue('shipcomplete');
        //log.debug({title:'shipComplete',details:shipComplete})
        if(shipComplete == true){
          var shipComplete = 'T'
        }else{
          var shipComplete = 'F'
        }
        //log.debug({title:'shipComplete',details:shipComplete})
        sublistObj.setSublistValue({id:'custpage_shipcomplete', line:i, value:shipComplete})
      }
      
      
      context.response.writePage(formObj);
    }
    else if (context.request.method === 'POST'){
      
      // location, supply req date, customer,
      
      var selectedLine = getSelectedLine(context)
      log.debug({title:'selectedLine',details:selectedLine})
      
      var selectedSalesOrder = [];
      
      for(var selectedCount=0; selectedCount<context.request.getLineCount({group:'custpage_salesorderlist'}); selectedCount++){
        //log.debug({title:'isselected',details:context.request.getSublistValue({group:'custpage_salesorderlist',name:'custpage_custselect', line:selectedCount})});
        if(context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custselect', line:selectedCount}) == 'T'){

       
          var object = {
            internalID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custinternalid', line:selectedCount}),
            itemID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custitemid', line:selectedCount}),
            qty: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_qty', line:selectedCount}),
            shipment_date: context.request.parameters.custpage_startdate,
            create_shipping_rec: context.request.parameters.custpage_createshippingrec,
            location_new: context.request.parameters.custpage_shipping_location,
            line_id:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custlineid', line:selectedCount}),
            shippingQty: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_shippingqty', line:selectedCount}),
            locationfrom:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_location', line:selectedCount}),
            locationto:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_to_location', line:selectedCount}),
            subidto: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_to_sub_id', line:selectedCount}),  //  SD - TO Change

            subidfrom: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_from_sub', line:selectedCount}),
          }
          selectedSalesOrder.push(object);

        }
      }
      
      log.debug({title:'selectedSalesOrder',details:selectedSalesOrder})
      //return;
      
      // var get_deploy = isDeploymentRunning();
      // get_deploy = get_deploy.toLowerCase();
      // log.audit('get_deploy', get_deploy);
      
      var scheduleMRScriptTask = task.create({
        taskType: task.TaskType.MAP_REDUCE,
        scriptId: 'customscript_ts_mr_to_schedule_ship',  //SD - TO Update
      //  deploymentId: get_deploy,
        params: {
          'custscript_ts_selec_to_update': selectedSalesOrder  //SD - TO Update
        }
      });
      
      scriptTaskId = scheduleMRScriptTask.submit();
      
      var userObj = runtime.getCurrentUser().id;
      log.debug({title:'userObj',details:userObj})
      
      var redirectParams = {};
      if(scriptTaskId){
        redirectParams.scriptTaskId = scriptTaskId;
      }
      
      if(userObj){
        redirectParams.userObj = userObj;
      }
      redirectParams.creation = object.create_shipping_rec;
      
      
      redirect.toSuitelet({
        scriptId:'customscript_tc_ss_screen_transfer_order',  //SD - TO Update
        deploymentId:'customdeploy1',
        parameters:redirectParams
      });
    }
  }  
  function getSelectedLine(context){
    var selectedSalesOrder =[];
    
    for(var selectedCount=0; selectedCount<context.request.getLineCount({group:'custpage_salesorderlist'}); selectedCount++){
      //log.debug({title:'isselected',details:context.request.getSublistValue({group:'custpage_salesorderlist',name:'custpage_custselect', line:selectedCount})});
      if(context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custselect', line:selectedCount}) == 'T'){
        
        var object = {
          internalID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custinternalid', line:selectedCount}),
          itemID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custitemid', line:selectedCount}),
          qty: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_qty', line:selectedCount}),
          shipment_date: context.request.parameters.custpage_startdate,
          location_new: context.request.parameters.custpage_shipping_location,
          line_id:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custlineid', line:selectedCount}),
          shippingQty: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_shippingqty', line:selectedCount}),
          location_name:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_location', line:selectedCount}),
          subid: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custsubid', line:selectedCount}),
          // custaddress: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custshipto', line:selectedCount})
        }
        selectedSalesOrder.push(object);
      }
    }
    return selectedSalesOrder;
  }
  
  function getResults(searchObj) { // Return array of search results
    var resultSet = searchObj.run();
    var results = [];
    var index = 0;
    do {
      var result = resultSet.getRange(index, index + 1000);
      results = results.concat(result);
      index += 1000;
    } while (result.length == 1000);
    return results;
  }
  
  
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
  function list_of_shipping_city(setshippingcity){
    var salesorderSearchObj = search.create({
      type: "salesorder",
      filters:
      [
        ["type","anyof","SalesOrd"], 
        "AND", 
        ["mainline","is","T"], 
        "AND", 
        ["shipcity","isnotempty",""]
      ],
      columns:
      [
        search.createColumn({
          name: "shipcity",
          summary: "GROUP",
          label: "Shipping City"
        })
      ]
    });
    var searchResultCount = salesorderSearchObj.runPaged().count;
    log.debug("salesorderSearchObj result count",searchResultCount);
    var iterationCount = 1; 
    salesorderSearchObj.run().each(function(result){
      
      var shippingcity = result.getValue({
        name: "shipcity",
        summary: "GROUP",
        label: "Shipping City"
      })
      
      setshippingcity.addSelectOption({
        value: iterationCount,
        text: shippingcity
      });
      
      iterationCount++;
      
      return true;
    });
    
  }
  
  function isDeploymentRunning() {
    var runningDeploymentID;
    var deploymentIDs = [];
    var list_deployment = ['CUSTOMDEPLOY1','CUSTOMDEPLOY2','CUSTOMDEPLOY3']
    
    var scheduledscriptinstanceSearchObj = search.create({
      type: "scheduledscriptinstance",
      filters:
      [
        ["script.internalid","anyof",3300], 
        "AND", 
        ["status","anyof","PENDING","PROCESSING"]
      ],
      columns:
      [
        search.createColumn({
          name: "internalid",
          join: "scriptDeployment",
          label: "Internal ID"
        }),
        search.createColumn({
          name: "scriptid",
          join: "scriptDeployment",
          label: "Custom ID"
        })
      ]
    });
    var searchResultCount = scheduledscriptinstanceSearchObj.runPaged().count;
    log.debug("scheduledscriptinstanceSearchObj result count",searchResultCount);
    scheduledscriptinstanceSearchObj.run().each(function(result){
      deploymentIDs.push(result.getValue({
        name: "scriptid",
        join: "scriptDeployment",
        label: "Custom ID"
      }));
      
      return true;
    });
    
    log.audit('deploymentIDs',deploymentIDs)
    
    for (index = 0; index < deploymentIDs.length; index++) {
      
      var indexToRemove = list_deployment.indexOf(deploymentIDs[index]);
      if (indexToRemove !== -1) {
        list_deployment.splice(indexToRemove, 1);
      }
    }
    
    log.audit('list_deployment',list_deployment)
    
    var returndeploy = 'CUSTOMDEPLOY3';
    
    if (list_deployment.length > 0) {
      return list_deployment[0]; // Deployment is running
    } else {
      return returndeploy; // Deployment is not running
    }
  }  

  function convertArray(array1){
    var uniqueSO  = [];
    for (var i = 0; i < array1.length; i++) {
      if (uniqueSO.indexOf(array1[i]) === -1) {
        uniqueSO.push(array1[i]);
      }
    }
    
    // Convert to string and join with a comma
    return uniqueSO.join(', ');
  }
  
  
  
  
  
  return {
    onRequest: onRequest
  };
};
