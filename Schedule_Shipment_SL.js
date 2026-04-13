/**
* @NApiVersion 2.1
* @NScriptType Suitelet
* @NModuleScope SameAccount
*/
//customworkflow_eb_split_so
define(['N/ui/serverWidget', 'N/search', 'N/task', 'N/config', 'N/http', 'N/runtime','N/format','N/url','N/record','N/redirect', 'N/email'], suitelet);
function suitelet(serverWidget, search, task, config, http, runtime,format,url,record,redirect, email){
  function onRequest(context) {
    if (context.request.method === 'GET') {
      
      var curScriptObj = runtime.getCurrentScript();
      var clientScriptFileId = curScriptObj.getParameter({name:'custscript_tc_client_script_id1'});
      
      var itemname = context.request.parameters.itemname;
      var salesordernum = context.request.parameters.salesordernumber;
      var locationID = context.request.parameters.locationid;
      var supplyReqBy = context.request.parameters.supplyreqdate;
      var shipDate = context.request.parameters.shipDate;
      var customer = context.request.parameters.customer;
      var reschedule = context.request.parameters.reschedule;
      var buttontrigger = context.request.parameters.buttonTriggered;
      var shippingcity = context.request.parameters.shippingcity;
      var shipCityID =context.request.parameters.shipcityID;
      var emailparam = context.request.parameters.email;
      var shipdate = context.request.parameters.shipdate;

      var shipLoc = context.request.parameters.shipLoc;
      var csrbox = context.request.parameters.csrbox;
      var subject1 = context.request.parameters.subject;
      var body1 = context.request.parameters.body;
      var emailcc = context.request.parameters.emailcc;
      var emailto = context.request.parameters.emailto;
      log.debug({title:'buttontrigger',details:buttontrigger})
      
      var formParams = {
        'itemname':itemname,
        'salesordernum':salesordernum,
        'locationid' : locationID,
        'supplyreqdate':supplyReqBy,
        'shipDate':shipDate,
        'customer' :customer,
        'reschedule':reschedule,
        'shippingcity':shippingcity,
        "shipCityID":shipCityID,
        "email": emailparam
      }
      
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

      var emailbox = formObj.addField({id:'custpage_send_email', type: serverWidget.FieldType.CHECKBOX, label: 'Send Email to Customer',container: 'email'}); //.updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN});
      
      if (emailparam == "true" || emailparam == true) {
        emailbox.defaultValue = "T";

        var emailnotify    = formObj.addField({id:'custpage_email_notify', type: serverWidget.FieldType.RICHTEXT, label: 'Instructions',container: 'email'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.INLINE});
        var email_to = formObj.addField({id:'custpage_email_to', type: serverWidget.FieldType.TEXT, label: 'To:',container: 'email'});
        var email_cc = formObj.addField({id:'custpage_email_cc', type: serverWidget.FieldType.TEXTAREA, label: 'CC:',container: 'email'});
        var subject = formObj.addField({id:'custpage_email_subject', type: serverWidget.FieldType.TEXT, label: 'Subject',container: 'email'});
        var body    = formObj.addField({id:'custpage_email_body', type: serverWidget.FieldType.RICHTEXT, label: 'Body',container: 'email'});

        var notify = "<p><strong>To</strong>: The email will always be sent to the customer's primary email address. If another email address is entered in the 'To' field, the email will be sent only to that specified address. Leave this field blank to send the email to the customer's primary email address.</p><p>  <strong>CC</strong>: You can add up to 8 email addresses in the 'CC' field, separated by commas. The sales representative's email will be automatically included as a CC. If the 'CC' field is left blank, only the sales representative will be CC'd.</p>"

        emailnotify.defaultValue = notify;

        

        if (emailto) email_to.defaultValue = emailto;
        if (emailcc) email_cc.defaultValue = emailcc;


        if (!subject1) subject.defaultValue = 'We have scheduled your shipment';
        else subject.defaultValue = subject1;
        

        var userObjname = runtime.getCurrentUser().name;
        
        var bodymsg = "<div class='container'>" +
        "<div class='header'>" +
        "We are preparing your order(s) for shipment." +
        "<br />" +
        "Please note we are unable to accept changes on the referenced orders below." +
        "<br />" +
        "&nbsp;" +
        "</div>" +
        "<div class='content'>" +
        "<p>" +
        "<strong>Estimated Ship Date: </strong>"+ shipdate +
        "</p>" +
        "<p>" +
        "<strong>Estimated Arrival Date: </strong>" +
        "</p>" +
        "<p>" +        
        "<strong>Estimated Freight: </strong>" +
        "</p>" +
        "<p>" +
        "<strong>Trusscore SO Number(s): </strong>SO(s) will be filled automatically, once you process." +
        "</p>" +
        "<p>" +
        "<strong>Customer PO(s): </strong>PO(s) will be filled automatically, once you process." +
        "<br />" +
        "&nbsp;" +
        "</p>" +
        "<p>" +
        "We will email a copy of the packing list once your order ships." +
        "</p>" +
        "<p>" +
        "<b><i><u>Please note* Unforeseen shipping delays may occur due to longer border wait times, weather disruptions, and driver workforce capacity.</u></i></b>" +
        "</p>" +
        "</div>" +
        "<div class='footer'>" +
        "<p>" +
        "Thanks again. We appreciate your business." +
        "</p>" +
        "<p>" +
        "Sincerely," +
        "<br />" +
        "<strong>"+ userObjname +"</strong>" +
        "<br />" +
        "<strong>Trusscore Inc.</strong>" +
        "</p>" +
        "</div>" +
        "</div>";


        if (!body1) body.defaultValue = bodymsg;
        else body.defaultValue = body1;
        
      }
      
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
      var purchaseOrderNumber = formObj.addField({id:'custpage_sonumber', type: serverWidget.FieldType.TEXT, label: 'SEARCH SALES ORDER',container: 'filters'});
      var customer = formObj.addField({id:'custpage_customer', type: serverWidget.FieldType.TEXT, label: 'SEARCH SALES ORDER BY CUSTOMER',container: 'filters'});
      var itemname = formObj.addField({id:'custpage_itemname', type: serverWidget.FieldType.TEXT, label: 'SEARCH ITEM',container: 'filters'});
      var setshippingcity = formObj.addField({id:'custpage_shipping_city', type: serverWidget.FieldType.SELECT, label: 'SHIPPING City',container: 'filters'});
      setshippingcity.addSelectOption({
        value: '',
        text: ''
      });
      list_of_shipping_city(setshippingcity);
      
      
      //  var reschedule = formObj.addField({id:'custpage_reschedule', type: serverWidget.FieldType.CHECKBOX, label: 'RESCHEDULING?'});
      var locationField = formObj.addField({
        id: 'custpage_location',
        type: serverWidget.FieldType.SELECT,
        label: 'Location'
        ,container: 'filters'
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
      
      salesOrderSublist.addField({id: 'custpage_custinternalid', type: serverWidget.FieldType.TEXT, label: 'Internal ID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN});

      salesOrderSublist.addField({ id: 'custpage_commitmentstatus', type: serverWidget.FieldType.TEXTAREA, label: 'Commitment Status' }); //.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
      
      salesOrderSublist.addField({id: 'custpage_custorderreason', type: serverWidget.FieldType.TEXT, label: 'Order Reason'});
      salesOrderSublist.addField({id: 'custpage_custordernum', type: serverWidget.FieldType.TEXT, label: 'Sales Order Number'});
      salesOrderSublist.addField({id: 'custpage_custrefnumber', type: serverWidget.FieldType.TEXT, label: 'Customer PO#'})
      salesOrderSublist.addField({id: 'custpage_custentityid', type: serverWidget.FieldType.TEXT, label: 'ENTITY/ID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({ id: 'custpage_custentity_shipping', type: serverWidget.FieldType.TEXTAREA, label: 'Shipping Contact' })
      salesOrderSublist.addField({ id: 'custpage_custentity_orderconfirmation', type: serverWidget.FieldType.TEXTAREA, label: 'Order Confirmation Contact' })
      salesOrderSublist.addField({ id: 'custpage_custentity_shipping_list', type: serverWidget.FieldType.TEXTAREA, label: 'Shipping Contact List' }).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({ id: 'custpage_custentity_orderconfirmation_list', type: serverWidget.FieldType.TEXTAREA, label: 'Order Confirmation Contact List' }).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custentityidhidden', type: serverWidget.FieldType.TEXT, label: 'CustID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_empidhidden', type: serverWidget.FieldType.TEXT, label: 'EmpID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_customeremail', type: serverWidget.FieldType.TEXT, label: 'customer Email'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custsubid', type: serverWidget.FieldType.TEXT, label: 'Subsidiary'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custentity', type: serverWidget.FieldType.TEXT, label: 'Customer'});
      salesOrderSublist.addField({id: 'custpage_custmemo', type: serverWidget.FieldType.TEXT, label: 'Memo'});
      salesOrderSublist.addField({id: 'custpage_custshippingcharg', type: serverWidget.FieldType.TEXT, label: 'Shipping Charge'});
      salesOrderSublist.addField({id: 'custpage_location', type: serverWidget.FieldType.TEXT, label: 'Ship From Location'});
      salesOrderSublist.addField({id: 'custpage_requesteddate', type: serverWidget.FieldType.DATE, label: 'Supply Required By Date'});
      salesOrderSublist.addField({id: 'custpage_scheduledate', type: serverWidget.FieldType.DATE, label: 'Scheduled Ship Date'});
      salesOrderSublist.addField({id: 'custpage_shipcomplete', type: serverWidget.FieldType.CHECKBOX, label: 'Ship Complete'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.DISABLED})
      salesOrderSublist.addField({id: 'custpage_custitem', type: serverWidget.FieldType.TEXT, label: 'Product Code'});
      salesOrderSublist.addField({id: 'custpage_custlinememo', type: serverWidget.FieldType.TEXT, label: 'Product Description'});
      salesOrderSublist.addField({id: 'custpage_custcity', type: serverWidget.FieldType.TEXT, label: 'Shipping City'});
      salesOrderSublist.addField({id: 'custpage_custshipto', type: serverWidget.FieldType.TEXT, label: 'Ship To'});
      salesOrderSublist.addField({id: 'custpage_qty', type: serverWidget.FieldType.TEXT, label: 'Quantity'});
      salesOrderSublist.addField({id: 'custpage_lefttoship', type: serverWidget.FieldType.TEXT, label: 'Left To Ship'});
      salesOrderSublist.addField({id: 'custpage_shippingqty', type: serverWidget.FieldType.TEXT, label: 'Shipping Quantity'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.ENTRY})
      salesOrderSublist.addField({id: 'custpage_custqtycommited', type: serverWidget.FieldType.TEXT, label: 'QUANTITY COMMITTED'});
      salesOrderSublist.addField({id: 'custpage_custqtypicked', type: serverWidget.FieldType.TEXT, label: 'QUANTITY PICKED'});
      salesOrderSublist.addField({id: 'custpage_custqtypacked', type: serverWidget.FieldType.TEXT, label: 'QUANTITY PACKED'});
      salesOrderSublist.addField({id: 'custpage_custitemid', type: serverWidget.FieldType.TEXT, label: 'ItemID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custlineid', type: serverWidget.FieldType.TEXT, label: 'lineID'}).updateDisplayType({displayType : serverWidget.FieldDisplayType.HIDDEN})
      salesOrderSublist.addField({id: 'custpage_custstatus', type: serverWidget.FieldType.TEXT, label: 'Status'});
      salesOrderSublist.addField({id: 'custpage_custreqdate', type: serverWidget.FieldType.DATE, label: 'Customer Requested Date'});
      
      
      salesOrderSublist.addMarkAllButtons();
      
      var searchFilter = [
        ["type","anyof","SalesOrd"],
        "AND",
        ["mainline","is","F"],
        "AND",
        ["closed","is","F"],
        "AND",
        ["status","anyof","SalesOrd:D","SalesOrd:B","SalesOrd:E"],
        "AND",
        ["custbody_tc_rma_reason","anyof","1","3","5","7",'21'],
        "AND",
        ["taxline","is","F"],
        "AND",
        ["shipping","is","F"],
        "AND",
        ["formulanumeric: {quantity}-{quantityshiprecv}","greaterthan","0"],
        "AND", 
        ["item.custitem_tc_is_crating_item","is","F"]//CRATING
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
      if(!isEmpty(formParams.customer)){
        searchFilter.push("AND");
        searchFilter.push(["customermain.entityid","haskeywords",formParams.customer]);
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
      
      if(!isEmpty(formParams.salesordernum)){
        searchFilter.push("AND");
        searchFilter.push(["numbertext","haskeywords",formParams.salesordernum]);
        searchFilter.push("OR");
        searchFilter.push(["poastext","is",formParams.salesordernum]);
        searchFilter.push("AND");
        searchFilter.push(["mainline","is","F"]);
        searchFilter.push("AND");
        searchFilter.push(["taxline","is","F"]);
        searchFilter.push("AND");
        searchFilter.push(["shipping","is","F"]);
      }
      // else if(formParams.reschedule == 'T'){
      //   searchFilter.push("AND");
      //   searchFilter.push(["custcol_tc_scheduled_ship_date","isnotempty",""]);
      // }
      //log.debug({title:'searchFilter.reschedule',details:searchFilter})
      var salesorderSearchObj = search.create({
        type: "salesorder",
        filters:searchFilter,
        columns:
        [
          search.createColumn({name: "custbody_tc_rma_reason", label: "Order Reason"}),
          search.createColumn({name: "tranid", label: "Document Number"}),
          search.createColumn({name: "otherrefnum", label: "PO/Check Number"}),
          search.createColumn({name: "entity", label: "Name"}),
          search.createColumn({name: "subsidiary", label: "Subsidiary"}),
          search.createColumn({name: "memomain", label: "Memo (Main)"}),
          search.createColumn({name: "inventorylocation", label: "Inventory Location"}),
          //search.createColumn({name: "custcol_tc_requesteddate", label: "Supply Required By Date"}),
          //search.createColumn({name: "requesteddate", label: "Supply Required By Date"}),
          search.createColumn({name: "custbody_tc_ship_date_estimated", label: "Estimated Ship Date"}),
          search.createColumn({name: "custcol_tc_scheduled_ship_date", label: "Scheduled Ship Date"}),
          search.createColumn({name: "shipcomplete", label: "Ship Complete"}),
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
          search.createColumn({name: "linesequencenumber", label: "Line Sequence Number"}),
          search.createColumn({name: "quantityuom", label: "Quantity"}),
          search.createColumn({name: "lineuniquekey", label: "Line Unique Key"}),
          search.createColumn({name: "custbody_tc_shipping_charge", label: "Shipping Charge"}),
          search.createColumn({
            name: "internalid",
            join: "item",
            label: "Internal ID"
          }),
          search.createColumn({name: "custcol_tc_related_shipping_record", label: "RELATED CONSOLIDATED SHIPPING RECORD"}),
          search.createColumn({name: "shipaddress", label: "Ship To"}),
          search.createColumn({name: "custcol_tc_cust_req_date", label: "Customer requested date"}),
          search.createColumn({
         name: "email",
         join: "salesRep",
         label: "Email"
      }),
      search.createColumn({
         name: "email",
         join: "customer",
         label: "Email"
      })
          
          
        ]
      });
      
      var sublistObj = formObj.getSublist({id: 'custpage_salesorderlist'});
      //log.debug({title:'sublistObj',details:sublistObj});
      var resultArray = getResults(salesorderSearchObj);
      log.audit({title:'resultArray',details:resultArray});

      // Track remaining qty per sales order
      var orderCommitMap = getSalesOrderCommitStatus(resultArray);
      var customerContacts = buildCustomerContactObj();
            log.audit('customerContacts', customerContacts)

      // for (var i = 0; i < resultArray.length; i++) {
      //   var soId = resultArray[i].id;
      //   var qty = parseFloat(resultArray[i].getValue('quantityuom')) || 0;
      //   var committed = parseFloat(resultArray[i].getValue('quantitycommitted')) || 0;
    
      //   if (!orderCommitMap[soId]) {
      //       orderCommitMap[soId] = { allCommitted: true };
      //   }
    
      //   // If any line is not fully committed, mark the order as not fully committed
      //   if (committed < qty) {
      //       orderCommitMap[soId].allCommitted = false;
      //   }
      // }

      log.debug('orderCommitMap', orderCommitMap);
      
      for(var i=0; i<resultArray.length ; i++){
        var shipRecordName = '';
        
        var scheme = 'https://';
        var host = url.resolveDomain({
          hostType: url.HostType.APPLICATION
        });
        var relativePath = url.resolveRecord({
          recordType: record.Type.SALES_ORDER,
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
          // shipUrl.linkText = shipRecordName;
          // sublistObj.setSublistValue({id:'custpage_shipping_link', line:i, value:myURL});
          
        }
                var custID = null;
                var shipping = null;
                var ordConfirmation = null;
                var shippingList = null;
                var ordConfirmationList = null;
                custID = resultArray[i].getValue('entity');
                if (custID && customerContacts[custID]){
                  var shipArr = customerContacts[custID].shipping;
                  var orderArr = customerContacts[custID].orderconfirmation;
                  var shipArrList = customerContacts[custID].shippingList;
                  var orderArrList = customerContacts[custID].orderconfirmationList;
                  
                  
                  if (shipArr.length > 0) shipping = shipArr.join('\n');
                  if (orderArr.length > 0) ordConfirmation = orderArr.join('\n');
                  if (shipArrList.length > 0) shippingList = shipArrList.join(',');
                  if (orderArrList.length > 0) ordConfirmationList = orderArrList.join(',');
                }
        
        
        
        
        var itemDetails = resultArray[i]
        //  log.debug({title:'itemDetails',details:itemDetails})
        
        sublistObj.setSublistValue({id:'custpage_custinternalid', line:i, value:resultArray[i].id});
        sublistObj.setSublistValue({id:'custpage_custorderreason', line:i, value:resultArray[i].getText('custbody_tc_rma_reason')});
        sublistObj.setSublistValue({id:'custpage_custordernum', line:i, value:resultArray[i].getValue('tranid')});
        if(!isEmpty(resultArray[i].getValue('otherrefnum'))){
          sublistObj.setSublistValue({id:'custpage_custrefnumber', line:i, value:resultArray[i].getValue('otherrefnum')});
        }
        if(!isEmpty(resultArray[i].getValue('entity'))){
          sublistObj.setSublistValue({id:'custpage_custentity', line:i, value:resultArray[i].getText('entity')});
          sublistObj.setSublistValue({id:'custpage_custentityidhidden', line:i, value:resultArray[i].getValue('entity')});
        }
        if (resultArray[i].getValue({ name: "email",join: "salesRep"})) {
          sublistObj.setSublistValue({id:'custpage_empidhidden', line:i, value:resultArray[i].getValue({ name: "email",join: "salesRep"})});
        }
        if (shipping) sublistObj.setSublistValue({ id: 'custpage_custentity_shipping', line: i, value: shipping });
        if (ordConfirmation) sublistObj.setSublistValue({ id: 'custpage_custentity_orderconfirmation', line: i, value: ordConfirmation });

        if (shippingList) sublistObj.setSublistValue({ id: 'custpage_custentity_shipping_list', line: i, value: shippingList });
        if (ordConfirmationList) sublistObj.setSublistValue({ id: 'custpage_custentity_orderconfirmation_list', line: i, value: ordConfirmationList });

        if (resultArray[i].getValue({ name: "email",join: "customer"})) {
          sublistObj.setSublistValue({id:'custpage_customeremail', line:i, value:resultArray[i].getValue({ name: "email",join: "customer"})});
        }
        if(!isEmpty(resultArray[i].getValue('memomain'))){
          sublistObj.setSublistValue({id:'custpage_custmemo', line:i, value:resultArray[i].getValue('memomain')});
        }
        
        sublistObj.setSublistValue({id:'custpage_custsubid', line:i, value:resultArray[i].getValue('subsidiary')});
        
        // sublistObj.setSublistValue({id:'custpage_custmemo', line:i, value:'test'});
        // sublistObj.setSublistText({id:'custpage_custmemo', line:i, text:resultArray[i].getValue('memomain')});
        
        if(!isEmpty(resultArray[i].getValue('inventorylocation'))){
          sublistObj.setSublistValue({id:'custpage_location', line:i, value:resultArray[i].getText('inventorylocation')});
        }
        if(!isEmpty(resultArray[i].getValue('custbody_tc_ship_date_estimated'))){
          sublistObj.setSublistValue({id:'custpage_requesteddate', line:i, value:resultArray[i].getValue('custbody_tc_ship_date_estimated')});
        }
        if(!isEmpty(resultArray[i].getValue('custcol_tc_scheduled_ship_date'))){
          sublistObj.setSublistValue({id:'custpage_scheduledate', line:i, value:resultArray[i].getValue('custcol_tc_scheduled_ship_date')});
        }
        
        if(!isEmpty(resultArray[i].getValue('shipcity'))){
          sublistObj.setSublistValue({id:'custpage_custcity', line:i, value:resultArray[i].getValue('shipcity')});
          sublistObj.setSublistValue({id:'custpage_custshipto', line:i, value:resultArray[i].getValue('shipaddress')});
          
        }
        if(!isEmpty(resultArray[i].getValue('custcol_tc_cust_req_date'))){
          sublistObj.setSublistValue({id:'custpage_custreqdate', line:i, value:resultArray[i].getValue('custcol_tc_cust_req_date')});
        }
        
        sublistObj.setSublistValue({id:'custpage_custstatus', line:i, value:resultArray[i].getText({name:'statusref'})});
        //sublistObj.setSublistValue({id:'custpage_custamount', line:i, value:resultArray[i].getValue('amount')});
        if(!isEmpty(resultArray[i].getValue('item'))){
          //  log.debug({title:'test',details:resultArray[i].getText('memo')})
          //  log.debug({title:'test',details:resultArray[i].getValue('memo')})
          sublistObj.setSublistValue({id:'custpage_custitem', line:i, value:resultArray[i].getText('item')});
          if(!isEmpty(resultArray[i].getValue('memo'))){
            sublistObj.setSublistValue({id:'custpage_custlinememo', line:i, value:resultArray[i].getValue('memo')});
          }
          sublistObj.setSublistValue({id:'custpage_custitemid', line:i, value:resultArray[i].getValue('item')});
          sublistObj.setSublistValue({id:'custpage_custlineid', line:i, value:resultArray[i].getValue('line')});
          sublistObj.setSublistValue({id:'custpage_qty', line:i, value:resultArray[i].getValue('quantityuom')});
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
        sublistObj.setSublistValue({id:'custpage_shipcomplete', line:i, value:shipComplete});


        try {
           const soId = resultArray[i].id;
           var commitFlag = '';

           if (orderCommitMap[soId].allCommitted) {
             commitFlag = '✔️ Fully Commited';
           } else {
             commitFlag = '⏳ Partially Commited';
           }

          sublistObj.setSublistValue({
             id: 'custpage_commitmentstatus',
             line: i,
            value: commitFlag
          }); 
        } catch (error) {
          log.debug('error', error)
        }
      }
      
      
      context.response.writePage(formObj);
    }
    else if (context.request.method === 'POST'){
      
      // location, supply req date, customer,
      
      var selectedLine = getSelectedLine(context)
      log.debug({title:'selectedLine',details:selectedLine})
      
      var selectedSalesOrder = [];
      var soNumber = [];
      var poNumber = [];
      var to = '';
      var cc = '';
      
      for(var selectedCount=0; selectedCount<context.request.getLineCount({group:'custpage_salesorderlist'}); selectedCount++){
        //log.debug({title:'isselected',details:context.request.getSublistValue({group:'custpage_salesorderlist',name:'custpage_custselect', line:selectedCount})});
        if(context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custselect', line:selectedCount}) == 'T'){

         // if (!to) to = context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custentityidhidden', line:selectedCount})
         if (!to) to = context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_customeremail', line:selectedCount})
         if (!cc) cc = context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_empidhidden', line:selectedCount})

          var object = {
            internalID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custinternalid', line:selectedCount}),
            itemID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custitemid', line:selectedCount}),
            qty: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_qty', line:selectedCount}),
            shipment_date: context.request.parameters.custpage_startdate,
            create_shipping_rec: context.request.parameters.custpage_createshippingrec,
            location_new: context.request.parameters.custpage_shipping_location,
            line_id:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custlineid', line:selectedCount}),
            shippingQty: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_shippingqty', line:selectedCount}),
            customerID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custentityidhidden', line:selectedCount}),
            location_name:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_location', line:selectedCount}),
            subid: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custsubid', line:selectedCount}),
            //custaddress: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custshipto', line:selectedCount})
          }
          selectedSalesOrder.push(object);
          log.audit('object', object)

          soNumber.push(context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custordernum', line:selectedCount}));
          poNumber.push(context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custrefnumber', line:selectedCount}));
        }
      }
      
      log.debug({title:'selectedSalesOrder',details:selectedSalesOrder})
      
      var get_deploy = isDeploymentRunning();
      get_deploy = get_deploy.toLowerCase();
      log.audit('get_deploy', get_deploy);
      
      var scheduleMRScriptTask = task.create({
        taskType: task.TaskType.MAP_REDUCE,
        scriptId: 'customscript3300',
        deploymentId: get_deploy,
        params: {
          'custscript_param11': selectedSalesOrder
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

      var emailvalidation = context.request.parameters.custpage_send_email;

      if (emailvalidation == "T") {

        var emailto = context.request.parameters.custpage_email_to;
        
        if (!emailto) {
                          var shippingEmails = [];
                var orderEmails = [];

                var customerSearchObj = search.create({
                    type: "customer",
                    filters:
                        [
                            ["internalid", "anyof", to]
                        ],
                    columns:
                        [
                            search.createColumn({
                                name: "formulatext",
                                formula: "case when {contact.role} = 'Shipping' then {contact.email} end",
                                label: "Shipping Role"
                            }),
                            search.createColumn({
                                name: "formulatext1",
                                formula: "case when {contact.role} = 'Order Confirmation' then {contact.email} end",
                                label: "Order Role"
                            })
                        ]
                });
                var searchResultCount = customerSearchObj.runPaged().count;
                log.debug("customerSearchObj result count", searchResultCount);
                var to = [];
                customerSearchObj.run().each(function (result) {
                    //  var shippingEmail = result.getValue({name: "formulatext"});
                    //  var orderEmail = result.getValue({name: "formulatext1"});
                    // log.debug('orderEmail',orderEmail)


                    //  if (shippingEmail) to.push(shippingEmail);
                    //  log.debug('to.length',to.length)
                    //  if (orderEmail && to.length == 0) to.push(orderEmail);
                    //  return true;


                    var shippingEmail = result.getValue({ name: "formulatext" });
                    var orderEmail = result.getValue({ name: "formulatext1" });

                    if (shippingEmail) {
                        shippingEmail = (shippingEmail + "").trim();
                        if (shippingEmails.indexOf(shippingEmail) == -1) shippingEmails.push(shippingEmail);
                    }

                    if (orderEmail) {
                        orderEmail = (orderEmail + "").trim();
                        if (orderEmails.indexOf(orderEmail) == -1) orderEmails.push(orderEmail);
                    }

                    return true;
                });
                if (shippingEmails.length > 0) {
                    to = shippingEmails;
                } else {
                    to = orderEmails;
                }

                log.audit('to', to);
        }
          
        else var to = emailto;
        
        var emailcc = context.request.parameters.custpage_email_cc;
        if (emailcc) cc += ","+emailcc
        
        var emailsubject = context.request.parameters.custpage_email_subject;
        var emailbody = context.request.parameters.custpage_email_body;
        var from = userObj;

        emailbody = emailbody.replace("SO(s) will be filled automatically, once you process.", convertArray(soNumber))
        emailbody = emailbody.replace("PO(s) will be filled automatically, once you process.", convertArray(poNumber))

        log.debug('emailbody', emailbody)
        log.debug('to', to)
        log.debug('cc', cc)
        log.debug('emailsubject', emailsubject)
        log.debug('from', from)

        var ccArray = cc.split(',');


        email.send({
          author: from,
          recipients: [to],
          cc: ccArray,
          subject: emailsubject,
          body: emailbody
          // relatedRecords: {
          //     transactionId: selectedSalesOrder[0].internalID
          // }
        });

        log.debug('email', 'send')
      }
      
      
      redirect.toSuitelet({
        scriptId:'customscript3299',
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
          customerID: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custentityidhidden', line:selectedCount}),
          location_name:context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_location', line:selectedCount}),
          subid: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custsubid', line:selectedCount}),
          // custaddress: context.request.getSublistValue({group:'custpage_salesorderlist', name:'custpage_custshipto', line:selectedCount})
        }
        selectedSalesOrder.push(object);
      }
    }
    return selectedSalesOrder;
  }

  function buildCustomerContactObj() {
  var customerMap = {};

  var customerSearchObj = search.create({
    type: "customer",
    filters: [
      ["contact.role","anyof","1","7"],
      "AND",
      ["isinactive","is","F"]
    ],
    columns: [
      search.createColumn({ name: "internalid" }),
      search.createColumn({ name: "entityid", join: "contact" }),
      search.createColumn({ name: "contactrole", join: "contact" }),
      search.createColumn({ name: "email", join: "contact" })
    ]
  });

  customerSearchObj.run().each(function (result) {
    var customerId = result.getValue({ name: "internalid" });

    // contact fields (joined)
    var contactName = result.getValue({ name: "entityid", join: "contact" }) || "";
    var contactEmail = result.getValue({ name: "email", join: "contact" }) || "";
    var roleId = result.getValue({ name: "contactrole", join: "contact" }); // usually internal id

    if (!customerMap[customerId]) {
      customerMap[customerId] = { shipping: [], orderconfirmation: [], shippingList: [], orderconfirmationList: []  };
    }

    var entry = (contactName ? contactName : "Unknown") + " - " + (contactEmail ? contactEmail : "");
    var email = contactEmail ? contactEmail : ""
    if (String(roleId) === "1") {
      customerMap[customerId].shipping.push(entry);
      if (email)  customerMap[customerId].shippingList.push(email);
    } else if (String(roleId) === "7") {
      customerMap[customerId].orderconfirmation.push(entry);
      if (email)  customerMap[customerId].orderconfirmationList.push(email);
    }

    return true;
  });

    log.audit('customerMap', customerMap)

  return customerMap;
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
  
  function getSalesOrderCommitStatus(resultArray) {
        const orderCommitMap = {};
        const uniqueSOIds = [];

        // Build unique SO ID list and initialize commitment map
        resultArray.forEach(result => {
            const soId = result.id;

            if (!orderCommitMap[soId]) {
                orderCommitMap[soId] = { allCommitted: true };
                uniqueSOIds.push(soId);
            }
        });

        if (uniqueSOIds.length === 0) {
            return orderCommitMap;
        }

        log.debug('uniqueSOIds', uniqueSOIds);

        // Create a search for these SOs to find lines not fully committed
        const salesorderSearchObj = search.create({
            type: "salesorder",
            settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
            filters: [
                ["type", "anyof", "SalesOrd"],
                "AND",
                ["internalid", "anyof", uniqueSOIds], // use all unique SO IDs
                "AND",
                ["mainline", "is", "F"],
                "AND",
                ["closed", "is", "F"],
                "AND",
                ["item.custitem_tc_is_crating_item", "is", "F"],
                "AND",
                ["taxline", "is", "F"],
                "AND",
                ["shipping", "is", "F"],
                "AND",
                ["item.type", "anyof", "Assembly", "InvtPart"],
                "AND",
                ["formulanumeric: {quantity} - NVL({quantitycommitted}, 0)", "greaterthan", "0"]
            ],
            columns: [
                search.createColumn({ name: "internalid", label: "Internal ID" }),
                search.createColumn({ name: "tranid", label: "Document Number" }),
                search.createColumn({ name: "item", label: "Item" }),
                search.createColumn({ name: "quantity", label: "Quantity" }),
                search.createColumn({ name: "quantitycommitted", label: "Quantity Committed" })
            ]
        });

        // Run the search and mark SOs with uncommitted items
        salesorderSearchObj.run().each(function (result) {
            const soId = result.getValue({ name: "internalid" });
            if (orderCommitMap[soId]) {
                orderCommitMap[soId].allCommitted = false;
            }
            return true; // continue iteration
        });

        return orderCommitMap;
    }
  
  return {
    onRequest: onRequest
  };
};
