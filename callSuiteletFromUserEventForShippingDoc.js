/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @description Fires when a Shipment record is opened in View mode.
 *   Adds 7 action buttons to the form: 5 print buttons (Packing Slip,
 *   BOL, Load Confirmation, Invoice, USMCA) that call the print Suitelet
 *   (customscript3587), and 2 email buttons that open a popup to send
 *   documents to the customer.
 *
 * @scriptId customscript3586
 * @file callSuiteletFromUserEventForShippingDoc.js
 * @lastModified 2026-09-28
 * @dependencies N/ui/serverWidget, N/url, N/record, N/runtime, N/search
 */
define(['N/ui/serverWidget', 'N/url', 'N/record', 'N/runtime', 'N/search'],
  function (ui, url, record, runtime, search) {

  /**
   * Runs when a Shipment record is opened in View mode.
   * Gathers record data, loads related customer/employee records,
   * then injects 7 custom buttons into the form.
   *
   * @param {Object} context
   * @param {Record} context.newRecord - The Shipment record being viewed
   * @param {Form} context.form - The UI form object to add buttons to
   * @param {string} context.type - The event type (VIEW, EDIT, CREATE, etc.)
   * @returns {void}
   */
  function beforeLoad(context) {

    // Only add buttons when the record is being viewed, not edited or created
    if (context.type === context.UserEventType.VIEW) {
      const form = context.form;

      // ─── SUITELET URL + RECORD CONTEXT ───────────────────────────────────

      // Resolve the URL of the print Suitelet (customscript3587)
      // All print buttons call this same Suitelet with different parameters
      const scriptUrl = url.resolveScript({
        scriptId: 'customscript3587',
        deploymentId: 'customdeploy1'
      });

      const recordId = context.newRecord.id;

      // Flag to control whether a new PDF is generated vs reusing an existing one
      // Note: the original field-based check is commented out below — hardcoded to true for now
      const newPDF = true;
      // const newPDF = context.newRecord.getValue({ fieldId: 'custbody_tc_print_new_pdf' });

      // ─── RECORD FIELD VALUES ─────────────────────────────────────────────

      // Pull key fields from the Shipment record for use in button URLs and email popup
      const customerid = context.newRecord.getValue({ fieldId: 'custbody_tc_customer' });
      const doc = context.newRecord.getText({ fieldId: 'tranid' });
      const date = context.newRecord.getText({ fieldId: 'custbody_tc_actual_ship_date' });
      const shipdate = context.newRecord.getText({ fieldId: 'custbody_tc_schedule_shipment_date' });

      // Extract the sales order number from the related transaction field
      // The field value contains a "#" separator — we take the part after it
      const salesorder = context.newRecord.getText({ fieldId: 'custbody_tc_related_tran' }).split("#")[1];
      const owner = context.newRecord.getText({ fieldId: 'custbody_tc_load_owner' });

      // ─── CUSTOMER + SALES REP LOOKUP ─────────────────────────────────────

      // Note: An earlier search-based approach to get customer email and market flag
      // is preserved below in comments. The current approach loads the record directly,
      // which is simpler but uses more governance units for large volumes.

      // [commented-out search approach preserved here for reference]
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

      // Load the customer record to get email, market automation flag, and sales rep ID
      let customermail, market, sales_rep;
      if (customerid) {
        const customerRec = record.load({ type: 'customer', id: customerid });
        customermail = customerRec.getValue({ fieldId: 'email' });
        market = customerRec.getValue({ fieldId: 'custentity_market_value_automation' });
        sales_rep = customerRec.getValue({ fieldId: 'salesrep' });
      }

      // Load the sales rep's employee record to get their email for the email popup
      let rep_mail = '';
      if (sales_rep) {
        const empRec = record.load({ type: 'employee', id: sales_rep });
        rep_mail = empRec.getValue({ fieldId: 'email' });
      }

      // ─── LINE ITEM PROCESSING ─────────────────────────────────────────────

      // Build deduplicated lists of sales orders and PO numbers from line items
      // These are passed to the email popup so the customer sees all related orders
      const uniqueSales = [];
      const uniquePO = [];
      const lineCount = context.newRecord.getLineCount({ sublistId: 'line' });

      for (let i = 0; i < lineCount; i++) {
        // Extract the sales order number from the line field (after the "#" separator)
        const sales = context.newRecord.getSublistText({
          sublistId: 'line',
          fieldId: 'custcol_tc_sales_order',
          line: i
        }).split("#")[1];

        // Only add if not already in the list (deduplicate)
        if (sales && uniqueSales.indexOf(sales) === -1) {
          uniqueSales.push(sales);
          const po = context.newRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_tc_po_number',
            line: i
          });
          uniquePO.push(po);
        }
      }

      // Join into comma-separated strings for URL parameters
      const salesString = uniqueSales.join(', ');
      const poString = uniquePO.join(', ');

      log.debug('customermail', customermail);

      // ─── BUTTON SCRIPTS (PRINT) ───────────────────────────────────────────

      // Each button opens the print Suitelet (customscript3587) in a new tab
      // with a different parameter to tell it which document type to generate
      const buttonScript = "window.open('" + scriptUrl + "&recId=" + recordId + "', '_blank');";
      const buttonScript2 = "window.open('" + scriptUrl + "&recIdBOL=" + recordId + "&newPDF=" + newPDF + "&market=" + market + "', '_blank');";
      const buttonScript3 = "window.open('" + scriptUrl + "&recIdLoad=" + recordId + "', '_blank');";

      // Invoice/Proforma — market flag controls which template is used in the Suitelet
      // Note: an earlier market-based branch is commented out below
      // if (market) var buttonScript4 = "window.open('" + scriptUrl + "&recIdPforma=" + recordId + "&market=" + recordId + "', '_blank');";
      // else
      const buttonScript4 = "window.open('" + scriptUrl + "&recIdPforma=" + recordId + "&newPDF=" + newPDF + "&market=" + market + "', '_blank');";
      const buttonScript5 = "window.open('" + scriptUrl + "&recIdPUsmac=" + recordId + "', '_blank');";

      // ─── PRINT BUTTONS ───────────────────────────────────────────────────

      form.addButton({ id: 'custpage_my_button',  label: 'Print Packing Slip',       functionName: buttonScript });
      form.addButton({ id: 'custpage_my_button2', label: 'Print BOL',                functionName: buttonScript2 });
      form.addButton({ id: 'custpage_my_button3', label: 'Print Load Confirmation',  functionName: buttonScript3 });
      form.addButton({ id: 'custpage_my_button4', label: 'Print Invoice',            functionName: buttonScript4 });
      form.addButton({ id: 'custpage_my_button5', label: 'Print USMCA',             functionName: buttonScript5 });

      // ─── ENVIRONMENT DETECTION ────────────────────────────────────────────

      // Dynamically set the base URL based on whether we're in Production or Sandbox
      // This ensures email popup links point to the correct environment
      const baseURL_PROD = "https://6518122.app.netsuite.com";
      const baseURL_SB = "https://6518122-sb1.app.netsuite.com";
      let baseURL = baseURL_SB;

      const envType = runtime.envType;
      if (envType === runtime.EnvType.PRODUCTION) {
        baseURL = baseURL_PROD;
      }
      log.debug("envType", envType + baseURL);

      // ─── EMAIL BUTTONS ────────────────────────────────────────────────────

      // Opens a popup to the custom Email record (rectype 2529) pre-filled with
      // shipment data so staff can send documents directly to the customer
      const buttonScript6 = "window.open('" + baseURL + "/app/common/custom/custrecordentry.nl?rectype=2529&csr=" + recordId +
        "&salesString=" + salesString +
        "&poString=" + poString +
        "&email=" + customermail +
        "&custid=" + customerid +
        "&shipdate=" + shipdate +
        "&salesorder=" + salesorder +
        "&date=" + date +
        "&owner=" + owner +
        "&repmail=" + rep_mail +
        "&doc=" + doc +
        "', 'popUpWindow', 'popup=yes,toolbar=no,menubar=no,scrollbars=no,resizable=no,top=0,left=0,width=1100,height=700')";

      form.addButton({ id: 'custpage_my_button6', label: 'Email', functionName: buttonScript6 });

      const currentUserId = runtime.getCurrentUser().id;

      // Opens a popup for emailing Load Confirmation specifically
      // Note: an earlier hardcoded Production URL version is commented out below
      // var buttonScript7 = "window.open('https://6518122.app.netsuite.com/app/common/custom/custrecordentry.nl?rectype=2529&csrid=" + recordId + "&custid=" + customerid + "', ...)"
      const buttonScript7 = "window.open('" + baseURL + "/app/common/custom/custrecordentry.nl?rectype=2529&csrid=" + recordId +
        "&custid=" + customerid +
        "', 'popUpWindow', 'popup=yes,toolbar=no,menubar=no,scrollbars=no,resizable=no,top=0,left=0,width=1100,height=700')";

      form.addButton({ id: 'custpage_my_button7', label: 'Email Load Confirmation', functionName: buttonScript7 });
    }
  }

  return {
    beforeLoad: beforeLoad
  };
});