/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget', 'N/url', 'N/record', 'N/runtime', 'N/search'], function (ui, url, record, runtime, search) {

  function beforeLoad(context) {
    if (context.type === context.UserEventType.VIEW) {
      var form = context.form;

      // Add a custom button to the form
      var scriptUrl = url.resolveScript({
        scriptId: 'customscript3587',
        deploymentId: 'customdeploy1'
      });
      var recordId = context.newRecord.id;
      var newPDF = true; //(context.newRecord).getValue({fieldId: 'custbody_tc_print_new_pdf'})

      var customerid = (context.newRecord).getValue({ fieldId: 'custbody_tc_customer' })
      var doc = (context.newRecord).getText({ fieldId: 'tranid' })
      var date = (context.newRecord).getText({ fieldId: 'custbody_tc_actual_ship_date' })
      var shipdate = (context.newRecord).getText({ fieldId: 'custbody_tc_schedule_shipment_date' })
      var salesorder = (context.newRecord).getText({ fieldId: 'custbody_tc_related_tran' }).split("#")[1];
      var owner = (context.newRecord).getText({ fieldId: 'custbody_tc_load_owner' })

      //       if(customerid){
      //         var customerSearchObj = search.create({
      //    type: "customer",
      //    filters:
      //    [
      //       ["internalid","anyof",customerid]
      //    ],
      //    columns:
      //    [
      //      search.createColumn({
      //          name: "custentity_market_value_automation",
      //          label: "custentity_market_value_automation"
      //       }),
      //       search.createColumn({
      //          name: "email",
      //          join: "CUSTENTITY_TC_SALES_OPS",
      //          label: "Email"
      //       }),
      //       search.createColumn({
      //          name: "formulatext",
      //          formula: "case when {contact.role} = 'Shipping' then {contact.email} end",
      //          label: "Shipping Role"
      //       }),
      //       search.createColumn({
      //          name: "formulatext1",
      //          formula: "case when {contact.role} = 'Order Confirmation' then {contact.email} end",
      //          label: "Order Role"
      //       })
      //    ]
      // });
      // var searchResultCount = customerSearchObj.runPaged().count;
      // var rep_mail = '';
      // var customermail = '';
      // var market = false;
      // customerSearchObj.run().each(function(result){
      //    var opsEmail = result.getValue({name: "email",join: "CUSTENTITY_TC_SALES_OPS"})
      //    var shippingEmail = result.getValue({name: "formulatext"});
      //    var orderEmail = result.getValue({name: "formulatext1"});
      //    var marketCheck = result.getValue({name: "custentity_market_value_automation"});
      //    if (marketCheck) market = true;
      //    if (opsEmail) rep_mail = opsEmail;
      //    if (shippingEmail || orderEmail) customermail = shippingEmail || orderEmail;
      //    return true;
      // });
      //       }
      var customermail, market, sales_rep;
      if (customerid) {
        var customerRec = record.load({ type: 'customer', id: customerid })
        customermail = customerRec.getValue({ fieldId: 'email' })
        market = customerRec.getValue({ fieldId: 'custentity_market_value_automation' })
        sales_rep = customerRec.getValue({ fieldId: 'salesrep' })
      }

      var rep_mail = '';
      if (sales_rep) {
        var empRec = record.load({ type: 'employee', id: sales_rep })
        rep_mail = empRec.getValue({ fieldId: 'email' })
      }

      var uniqueSales = [];
      var uniquePO = [];
      var lineCount = (context.newRecord).getLineCount({ sublistId: 'line' })
      for (var i = 0; i < lineCount; i++) {
        var sales = (context.newRecord).getSublistText({ sublistId: 'line', fieldId: 'custcol_tc_sales_order', line: i }).split("#")[1]
        if (sales && uniqueSales.indexOf(sales) === -1) {
          uniqueSales.push(sales); // Add it to the array
          var po = (context.newRecord).getSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_po_number', line: i })
          uniquePO.push(po);
        }

      }
      var salesString = uniqueSales.join(', ');
      var poString = uniquePO.join(', ');
      log.debug('customermail', customermail)


      var buttonScript = "window.open('" + scriptUrl + "&recId=" + recordId + "', '_blank');";
      var buttonScript2 = "window.open('" + scriptUrl + "&recIdBOL=" + recordId + "&newPDF=" + newPDF + "&market=" + market + "', '_blank');";
      var buttonScript3 = "window.open('" + scriptUrl + "&recIdLoad=" + recordId + "', '_blank');";
      //  if (market) var buttonScript4 = "window.open('" + scriptUrl + "&recIdPforma=" + recordId + "&market=" + recordId + "', '_blank');";
      //   else 
      var buttonScript4 = "window.open('" + scriptUrl + "&recIdPforma=" + recordId + "&newPDF=" + newPDF + "&market=" + market + "', '_blank');";
      var buttonScript5 = "window.open('" + scriptUrl + "&recIdPUsmac=" + recordId + "', '_blank');";


      form.addButton({
        id: 'custpage_my_button',
        label: 'Print Packing Slip',
        functionName: buttonScript
      });

      form.addButton({
        id: 'custpage_my_button2',
        label: 'Print BOL',
        functionName: buttonScript2
      });

      form.addButton({
        id: 'custpage_my_button3',
        label: 'Print Load Confirmation',
        functionName: buttonScript3
      });

      form.addButton({
        id: 'custpage_my_button4',
        label: 'Print Invoice',
        functionName: buttonScript4
      });

      form.addButton({
        id: 'custpage_my_button5',
        label: 'Print USMCA',
        functionName: buttonScript5
      });

      var baseURL_PROD = "https://6518122.app.netsuite.com";
      var baseURL_SB = "https://6518122-sb1.app.netsuite.com";
      var baseURL = baseURL_SB;
      const envType = runtime.envType;
      if (envType === runtime.EnvType.PRODUCTION) {
        baseURL = baseURL_PROD;
      }
      log.debug("envType", envType + baseURL);

      var buttonScript6 = "window.open('" + baseURL + "/app/common/custom/custrecordentry.nl?rectype=2529&csr=" + recordId + "&salesString=" + salesString + "&poString=" + poString + "&email=" + customermail + "&custid=" + customerid + "&shipdate=" + shipdate + "&salesorder=" + salesorder + "&date=" + date + "&owner=" + owner + "&repmail=" + rep_mail + "&doc=" + doc + "', 'popUpWindow', 'popup=yes,toolbar=no,menubar=no,scrollbars=no,resizable=no,top=0,left=0,width=1100,height=700')"
      form.addButton({
        id: 'custpage_my_button6',
        label: 'Email',
        functionName: buttonScript6
      });

      var currentUserId = runtime.getCurrentUser().id;


      // var buttonScript7 = "window.open('https://6518122.app.netsuite.com/app/common/custom/custrecordentry.nl?rectype=2529&csrid=" + recordId + "&custid=" + customerid + "', 'popUpWindow', 'popup=yes,toolbar=no,menubar=no,scrollbars=no,resizable=no,top=0,left=0,width=1100,height=700')"
      var buttonScript7 = "window.open('" + baseURL + "/app/common/custom/custrecordentry.nl?rectype=2529&csrid=" + recordId + "&custid=" + customerid + "', 'popUpWindow', 'popup=yes,toolbar=no,menubar=no,scrollbars=no,resizable=no,top=0,left=0,width=1100,height=700')"
      form.addButton({
        id: 'custpage_my_button7',
        label: 'Email Load Confirmation',
        functionName: buttonScript7
      });


    }
  }

  return {
    beforeLoad: beforeLoad
  };
});