/**
* @NApiVersion 2.1
* @NScriptType Suitelet
* @NModuleScope SameAccount
*/

define([
    'N/ui/serverWidget',
    'N/search',
    'N/task',
    'N/config',
    'N/http',
    'N/runtime',
    'N/format',
    'N/url',
    'N/record',
    'N/redirect',
    'N/email'
], function (serverWidget, search, task, config, http, runtime, format, url, record, redirect, email) {

    const DEPLOY_MR_SCRIPT_ID = 5803;
    const PALMERSTON_SAMPLE_LOCATION = '68';
    const CAL_SAMPLE_LOCATION = '76';

    // ================= MAIN =================
    function onRequest(context) {
        if (context.request.method === 'GET') {
            handleGet(context);
        } else if (context.request.method === 'POST') {
            handlePost(context);
        }
    }

    // ================= GET =================
    function handleGet(context) {
        var curScriptObj = runtime.getCurrentScript();
        var clientScriptFileId = curScriptObj.getParameter({ name: 'custscript_client_script_id_v3' });

        var itemname = context.request.parameters.itemname;
        var salesordernum = context.request.parameters.salesordernumber;
        var locationID = context.request.parameters.locationid;
        var supplyReqBy = context.request.parameters.supplyreqdate;
        var shipDateParam = context.request.parameters.shipDate;
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

        var formParams = {
            itemname: itemname,
            salesordernum: salesordernum,
            locationid: locationID,
            supplyreqdate: supplyReqBy,
            shipDate: shipDateParam,
            customer: customer,
            reschedule: reschedule,
            shippingcity: shippingcity,
            shipCityID: shipCityID,
            email: emailparam
        };

        var formObj = serverWidget.createForm({ title: 'Sample Shipment' });
        formObj.clientScriptFileId = clientScriptFileId;

        var submitBtn = formObj.addSubmitButton({
            id: 'custpage_submit',
            label: 'Update',
            functionName: 'createShipmentRecord();'
        });

        // Field groups
        formObj.addFieldGroup({ id: 'update', label: 'Submit New Values' });
        formObj.addFieldGroup({ id: 'filters', label: 'Filters' });
        formObj.addFieldGroup({ id: 'email', label: 'Email' });

        // ============== EMAIL SECTION ==============
        var emailbox = formObj.addField({
            id: 'custpage_send_email',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Send Email to Customer',
            container: 'email'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        if (emailparam == 'true' || emailparam === true) {
            emailbox.defaultValue = 'T';

            var emailnotify = formObj.addField({
                id: 'custpage_email_notify',
                type: serverWidget.FieldType.RICHTEXT,
                label: 'Instructions',
                container: 'email'
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

            var email_to = formObj.addField({
                id: 'custpage_email_to',
                type: serverWidget.FieldType.TEXT,
                label: 'To:',
                container: 'email'
            });
            var email_cc = formObj.addField({
                id: 'custpage_email_cc',
                type: serverWidget.FieldType.TEXTAREA,
                label: 'CC:',
                container: 'email'
            });
            var subject = formObj.addField({
                id: 'custpage_email_subject',
                type: serverWidget.FieldType.TEXT,
                label: 'Subject',
                container: 'email'
            });
            var body = formObj.addField({
                id: 'custpage_email_body',
                type: serverWidget.FieldType.RICHTEXT,
                label: 'Body',
                container: 'email'
            });

            var notify =
                "<p><strong>To</strong>: The email will always be sent to the customer's primary email address. If another email address is entered in the 'To' field, the email will be sent only to that specified address. Leave this field blank to send the email to the customer's primary email address.</p>" +
                "<p><strong>CC</strong>: You can add up to 8 email addresses in the 'CC' field, separated by commas. The sales representative's email will be automatically included as a CC. If the 'CC' field is left blank, only the sales representative will be CC'd.</p>";

            emailnotify.defaultValue = notify;

            if (emailto) email_to.defaultValue = emailto;
            if (emailcc) email_cc.defaultValue = emailcc;

            if (!subject1) subject.defaultValue = 'We have scheduled your shipment';
            else subject.defaultValue = subject1;

            var userObjname = runtime.getCurrentUser().name;

            var bodymsg =
                "<div class='container'>" +
                "<div class='header'>" +
                "We are preparing your order(s) for shipment." +
                "<br />" +
                "Please note we are unable to accept changes on the referenced orders below." +
                "<br />" +
                "&nbsp;" +
                "</div>" +
                "<div class='content'>" +
                "<p>" +
                "<strong>Estimated Ship Date: </strong>" + safe(shipdate) +
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
                "</div>" +
                "<div class='footer'>" +
                "<p>" +
                "Thanks again. We appreciate your business." +
                "</p>" +
                "<p>" +
                "Sincerely," +
                "<br />" +
                "<strong>" + safe(userObjname) + "</strong>" +
                "<br />" +
                "<strong>Trusscore Inc.</strong>" +
                "</p>" +
                "</div>" +
                "</div>";

            if (!body1) body.defaultValue = bodymsg;
            else body.defaultValue = body1;
        }

        // ============== UPDATE SECTION ==============
        var stmtDtFld = formObj.addField({
            id: 'custpage_startdate',
            type: serverWidget.FieldType.DATE,
            label: 'SCHEDULED SHIP DATE',
            container: 'update'
        });
        // stmtDtFld.isMandatory = true;

        var seLocation = formObj.addField({
            id: 'custpage_shipping_location',
            type: serverWidget.FieldType.SELECT,
            label: 'SHIPPING Location',
            container: 'update'
        });

        var createShipRec = formObj.addField({
            id: 'custpage_createshippingrec',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'CREATE SHIPPING RECORD',
            container: 'update'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        var fulfillmentChecbox = formObj.addField({
            id: 'custpage_item_fulfillment',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Item Fulfillment',
            container: 'update'
        });

        // Hard-coded shipping location
        seLocation.addSelectOption({
            value: PALMERSTON_SAMPLE_LOCATION,
            text: 'Palmerston - Sample'
        });

        // ============== FILTER SECTION ==============
        var shipreqby = formObj.addField({
            id: 'custpage_shipreqby',
            type: serverWidget.FieldType.DATE,
            label: 'SUPPLY REQUIRED BY DATE(ON OR AFTER)',
            container: 'filters'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        var shipDate = formObj.addField({
            id: 'custpage_shipdate',
            type: serverWidget.FieldType.DATE,
            label: 'SCHEDULED SHIP DATE(ON OR AFTER)',
            container: 'filters'
        });
        var purchaseOrderNumber = formObj.addField({
            id: 'custpage_sonumber',
            type: serverWidget.FieldType.TEXT,
            label: 'SEARCH SALES ORDER',
            container: 'filters'
        });
        var customerField = formObj.addField({
            id: 'custpage_customer',
            type: serverWidget.FieldType.TEXT,
            label: 'SEARCH SALES ORDER BY CUSTOMER',
            container: 'filters'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        var itemnameField = formObj.addField({
            id: 'custpage_itemname',
            type: serverWidget.FieldType.TEXT,
            label: 'SEARCH ITEM',
            container: 'filters'
        });

        var setshippingcity = formObj.addField({
            id: 'custpage_shipping_city',
            type: serverWidget.FieldType.SELECT,
            label: 'SHIPPING City',
            container: 'filters'
        });
        setshippingcity.addSelectOption({ value: '', text: '' });
        list_of_shipping_city(setshippingcity);

        var locationField = formObj.addField({
            id: 'custpage_location',
            type: serverWidget.FieldType.SELECT,
            label: 'Location',
            container: 'filters'
        });
        locationField.addSelectOption({ value: '', text: '' });
        locationField.addSelectOption({ value: PALMERSTON_SAMPLE_LOCATION, text: 'Palmerston - Samples' });
        locationField.addSelectOption({ value: CAL_SAMPLE_LOCATION, text: 'Calgary - Samples' });

        var rescheduleField = formObj.addField({
            id: 'custpage_reschedule',
            type: serverWidget.FieldType.SELECT,
            label: 'RESCHEDULING?',
            container: 'filters'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        rescheduleField.addSelectOption({ value: 'isempty', text: 'NO' });
        rescheduleField.addSelectOption({ value: 'isnotempty', text: 'YES' });

        formObj.addButton({
            id: 'reset',
            label: 'Reset',
            functionName: 'onReset();'
        });

        // set defaults from formParams
        locationField.defaultValue = formParams.locationid;
        if (!isEmpty(formParams.shipCityID)) {
            setshippingcity.defaultValue = formParams.shipCityID;
        }
        purchaseOrderNumber.defaultValue = formParams.salesordernum;
        //itemname
        if (!isEmpty(formParams.supplyreqdate)) {
            shipreqby.defaultValue = formParams.supplyreqdate;
        }
        if (!isEmpty(formParams.shipDate)) {
            shipDate.defaultValue = formParams.shipDate;
        }
        customerField.defaultValue = formParams.customer;
        rescheduleField.defaultValue = formParams.reschedule;

        // ============== SUBLISTS ==============
        // 1) To Be Scheduled
        var sublistToBeScheduled = formObj.addSublist({
            id: 'custpage_tobescheduled',
            type: serverWidget.SublistType.LIST,
            label: 'To Be Scheduled'
        });

        // 2) To Be Shipped (this is the one used in POST / MR)
        var salesOrderSublist = formObj.addSublist({
            id: 'custpage_salesorderlist',
            type: serverWidget.SublistType.LIST,
            label: 'To Be Shipped'
        });

        // 3) Shipped (Picked)
        var shippedSublist = formObj.addSublist({
            id: 'custpage_shippedlist',
            type: serverWidget.SublistType.LIST,
            label: 'Picked Orders'
        });

        // 4) Fulfilled
        var fulfillSublist = formObj.addSublist({
            id: 'custpage_fulfillorderlist',
            type: serverWidget.SublistType.LIST,
            label: 'Fulfilled'
        });

        // Columns
        addSalesOrderSublistFields(sublistToBeScheduled, true);
        addSalesOrderSublistFields(salesOrderSublist, true);
        sublistToBeScheduled.addMarkAllButtons();
        salesOrderSublist.addMarkAllButtons();

        addFulfillSublistFields(shippedSublist, true, true);

        // 1) Shipping Method (SELECT)
        var ifShipMethodField = shippedSublist.addField({
            id: 'custpage_if_shipmethod',
            type: serverWidget.FieldType.SELECT,
            label: 'Shipping Method'
        });

        // populate shipping method options
        var shipitemSearchForPicked = search.create({
            type: 'shipitem',
            filters: [],
            columns: [
                search.createColumn({ name: 'itemid', label: 'Name' })
            ]
        });
        shipitemSearchForPicked.run().each(function (result) {
            var internalId = result.id;
            var name = result.getValue({ name: 'itemid' });

            ifShipMethodField.addSelectOption({
                value: internalId,
                text: name,
                isSelected: (name === "Fedex - LTL Courier")
            });
            return true;
        });

        // 2) Tracking Number (TEXT)
        var ifTrackingField = shippedSublist.addField({
            id: 'custpage_if_tracking',
            type: serverWidget.FieldType.TEXT,
            label: 'Tracking Number'
        });

        // 3) Shipping Cost (FLOAT)
        var ifShipCostField = shippedSublist.addField({
            id: 'custpage_if_shipcost',
            type: serverWidget.FieldType.TEXT,
            label: 'Shipping Cost'
        });

        ifTrackingField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.ENTRY
        });

        ifShipCostField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.ENTRY
        });

        shippedSublist.getField({ id: 'custpage_if_number' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        shippedSublist.getField({ id: 'custpage_if_packslip' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        shippedSublist.getField({ id: 'custpage_if_so' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        shippedSublist.getField({ id: 'custpage_if_customer' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        shippedSublist.getField({ id: 'custpage_if_schedship' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        shippedSublist.getField({ id: 'custpage_if_city' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });


        addFulfillSublistFields(fulfillSublist, false);

        // ============== COMMON SALES ORDER COLUMNS (for searches) ==============
        var soColumns = [
            search.createColumn({ name: 'custbody_tc_rma_reason', label: 'Order Reason' }),
            search.createColumn({ name: 'tranid', label: 'Document Number' }),
            search.createColumn({ name: 'otherrefnum', label: 'PO/Check Number' }),
            search.createColumn({ name: 'entity', label: 'Name' }),
            search.createColumn({ name: 'subsidiary', label: 'Subsidiary' }),
            search.createColumn({ name: 'memomain', label: 'Memo (Main)' }),
            search.createColumn({ name: 'inventorylocation', label: 'Inventory Location' }),
            search.createColumn({ name: 'custbody_tc_ship_date_estimated', label: 'Estimated Ship Date' }),
            search.createColumn({ name: 'custcol_tc_scheduled_ship_date', label: 'Scheduled Ship Date' }),
            search.createColumn({ name: 'shipcomplete', label: 'Ship Complete' }),
            search.createColumn({ name: 'item', label: 'Item' }),
            search.createColumn({ name: 'memo', label: 'Memo' }),
            search.createColumn({ name: 'shipcity', label: 'Shipping City' }),
            search.createColumn({
                name: 'formulanumeric',
                formula: '{quantity}-{quantityshiprecv}',
                label: 'Left to Ship'
            }),
            search.createColumn({ name: 'quantitycommitted', label: 'Quantity Committed' }),
            search.createColumn({ name: 'quantitypicked', label: 'Quantity Picked' }),
            search.createColumn({ name: 'quantitypacked', label: 'Quantity Packed' }),
            search.createColumn({ name: 'line', label: 'Line ID' }),
            search.createColumn({ name: 'linesequencenumber', label: 'Line Sequence Number' }),
            search.createColumn({ name: 'quantityuom', label: 'Quantity' }),
            search.createColumn({ name: 'lineuniquekey', label: 'Line Unique Key' }),
            search.createColumn({ name: 'custbody_tc_shipping_charge', label: 'Shipping Charge' }),
            search.createColumn({
                name: 'internalid',
                join: 'item',
                label: 'Internal ID'
            }),
            search.createColumn({ name: 'custcol_tc_related_shipping_record', label: 'RELATED CONSOLIDATED SHIPPING RECORD' }),
            search.createColumn({ name: 'shipaddress', label: 'Ship To' }),
            search.createColumn({ name: 'shippingattention', label: 'Shipping Attention' }),
            search.createColumn({ name: 'shipaddressee', label: 'Shipping Addressee' }),
            search.createColumn({ name: 'custcol_tc_cust_req_date', label: 'Customer requested date' }),
            search.createColumn({
                name: 'email',
                join: 'salesRep',
                label: 'Email'
            }),
            search.createColumn({
                name: 'email',
                join: 'customer',
                label: 'Email'
            }),
            search.createColumn({ name: 'statusref', label: 'Status Ref' }),
            search.createColumn({ name: 'custbody_tc_end_customer_contact_email', label: 'End Customer Contact Email' }),
            search.createColumn({ name: 'custbody_tc_end_customer_contact', label: 'End Customer Contact' }),
            search.createColumn({ name: 'custbody_tc_end_customer_phone', label: 'End Customer Phone' }),
            search.createColumn({ name: 'datecreated', label: 'Date Created' })
        ];

        // ============== BASE FILTER (shared) ==============
        function buildBaseFilter() {
            var searchFilter = [
                ['type', 'anyof', 'SalesOrd'],
                'AND',
                ['mainline', 'is', 'F'],
                'AND',
                ['closed', 'is', 'F'],
                'AND',
                ['status', 'anyof', 'SalesOrd:D', 'SalesOrd:B', 'SalesOrd:E'],
                'AND',
                ['custbody_tc_rma_reason', 'anyof', '4'],
                'AND',
                ['taxline', 'is', 'F'],
                'AND',
                ['shipping', 'is', 'F'],
                'AND',
                ['formulanumeric: {quantity}-{quantityshiprecv}', 'greaterthan', '0'],
                'AND',
                ['item', 'noneof', '156'] // CRATING
            ];

            if (!isEmpty(formParams.itemname)) {

                itemnameField.defaultValue = formParams.itemname;

                searchFilter.push('AND');
                searchFilter.push(['item.name', 'haskeywords', formParams.itemname]);
            }
            if (!isEmpty(formParams.shippingcity)) {
                searchFilter.push('AND');
                searchFilter.push(['shipcity', 'is', formParams.shippingcity]);
            }
            if (!isEmpty(formParams.locationid)) {
                searchFilter.push('AND');
                searchFilter.push(['inventorylocation', 'anyof', formParams.locationid]);
            }
            if (!isEmpty(formParams.supplyreqdate)) {
                searchFilter.push('AND');
                searchFilter.push(['requesteddate', 'onorafter', formParams.supplyreqdate]);
            }
            if (!isEmpty(formParams.customer)) {
                searchFilter.push('AND');
                searchFilter.push(['customermain.entityid', 'haskeywords', formParams.customer]);
            }

            // SO / PO search
            if (!isEmpty(formParams.salesordernum)) {
                searchFilter.push('AND');
                searchFilter.push(['numbertext', 'haskeywords', formParams.salesordernum]);
                searchFilter.push('OR');
                searchFilter.push(['poastext', 'is', formParams.salesordernum]);
                searchFilter.push('AND');
                searchFilter.push(['mainline', 'is', 'F']);
                searchFilter.push('AND');
                searchFilter.push(['taxline', 'is', 'F']);
                searchFilter.push('AND');
                searchFilter.push(['shipping', 'is', 'F']);
            }

            return searchFilter;
        }

        // ============== 1) TO BE SCHEDULED ==============
        var tbsFilter = buildBaseFilter();
        tbsFilter.push('AND');
        tbsFilter.push(['custcol_tc_scheduled_ship_date', 'isempty', '']);

        log.debug('formParams.shipDate', formParams.shipDate);
        log.debug('shipDateParam', shipDateParam);
        log.debug('salesordernumber', context.request.parameters.salesordernumber);

        if (formParams.shipDate) {
            tbsFilter.push('AND');
            tbsFilter.push(['internalid', 'anyof', ['-1']]);
        }

        if (context.request.parameters.salesordernumber) {
            tbsFilter = [
                ["type", "anyof", "SalesOrd"],
                "AND", ["mainline", "is", "F"],
                "AND", ["closed", "is", "F"],
                "AND", ["status", "anyof", "SalesOrd:D", "SalesOrd:B", "SalesOrd:E"],
                "AND", ["custbody_tc_rma_reason", "anyof", "4"], "AND", ["taxline", "is", "F"],
                "AND", ["shipping", "is", "F"],
                "AND", ["formulanumeric: {quantity}-{quantityshiprecv}", "greaterthan", "0"],
                "AND", ["item", "noneof", "156"],
                "AND", ["numbertext", "haskeywords", context.request.parameters.salesordernumber],
                "AND", ["mainline", "is", "F"],
                "AND", ["taxline", "is", "F"],
                "AND", ["shipping", "is", "F"],
                "AND", ["custcol_tc_scheduled_ship_date", "isempty", ""]
            ]

            if (formParams.shipDate) {
                tbsFilter.push('AND');
                tbsFilter.push(['internalid', 'anyof', ['-1']]);
            }

            if (formParams.itemname) {
                tbsFilter.push('AND');
                tbsFilter.push(['item.name', 'haskeywords', formParams.itemname]);
            }

            //formParams.shipCityID
            if (formParams.shippingcity) {
                tbsFilter.push('AND');
                tbsFilter.push(['shipcity', 'is', formParams.shippingcity]);
            }

            if (formParams.locationid) {
                tbsFilter.push('AND');
                tbsFilter.push(['inventorylocation', 'anyof', formParams.locationid]);
            }


        }

        log.debug('tbsFilter', tbsFilter);

        var soSearchToBeScheduled = search.create({
            type: 'salesorder',
            filters: tbsFilter,
            columns: soColumns
        });

        var resultTBS = getResults(soSearchToBeScheduled);

        var orderCommitMapTBS = {};
        for (var i1 = 0; i1 < resultTBS.length; i1++) {
            var soId1 = resultTBS[i1].id;
            var qty1 = parseFloat(resultTBS[i1].getValue('quantityuom')) || 0;
            var committed1 = parseFloat(resultTBS[i1].getValue('quantitycommitted')) || 0;

            if (!orderCommitMapTBS[soId1]) {
                orderCommitMapTBS[soId1] = { allCommitted: true };
            }
            if (committed1 < qty1) {
                orderCommitMapTBS[soId1].allCommitted = false;
            }
        }

        sublistToBeScheduled.label = 'To Be Scheduled (' + resultTBS.length + ')';

        populateSalesOrderSublist(sublistToBeScheduled, resultTBS, orderCommitMapTBS);

        // ============== 2) TO BE SHIPPED (scheduled date not empty) ==============
        var tbsShipFilter = buildBaseFilter();
        tbsShipFilter.push('AND');
        tbsShipFilter.push(['custcol_tc_scheduled_ship_date', 'isnotempty', '']);
        tbsShipFilter.push('AND');
        tbsShipFilter.push(['quantitypicked', 'equalto', 0]);

        if (!isEmpty(formParams.shipDate)) {
            tbsShipFilter.push('AND');
            tbsShipFilter.push(['custcol_tc_scheduled_ship_date', 'onorafter', formParams.shipDate]);
        }

        if (context.request.parameters.salesordernumber) {
            tbsShipFilter = [
                ["type", "anyof", "SalesOrd"],
                "AND", ["mainline", "is", "F"],
                "AND", ["closed", "is", "F"],
                "AND", ["status", "anyof", "SalesOrd:D", "SalesOrd:B", "SalesOrd:E"],
                "AND", ["custbody_tc_rma_reason", "anyof", "4"], "AND", ["taxline", "is", "F"],
                "AND", ["shipping", "is", "F"],
                "AND", ["formulanumeric: {quantity}-{quantityshiprecv}", "greaterthan", "0"],
                "AND", ["item", "noneof", "156"],
                "AND", ["numbertext", "haskeywords", context.request.parameters.salesordernumber],
                "AND", ["mainline", "is", "F"],
                "AND", ["taxline", "is", "F"],
                "AND", ["custcol_tc_scheduled_ship_date", "isnotempty", ""],
                "AND", ["quantitypicked", "equalto", 0]
            ]

            if (formParams.itemname) {
                tbsShipFilter.push('AND');
                tbsShipFilter.push(['item.name', 'haskeywords', formParams.itemname]);
            }

            if (formParams.shippingcity) {
                tbsShipFilter.push('AND');
                tbsShipFilter.push(['shipcity', 'is', formParams.shippingcity]);
            }

            if (formParams.locationid) {
                tbsShipFilter.push('AND');
                tbsShipFilter.push(['inventorylocation', 'anyof', formParams.locationid]);
            }
        }

        var salesorderSearchObj = search.create({
            type: 'salesorder',
            filters: tbsShipFilter,
            columns: soColumns
        });

        var resultArray = getResults(salesorderSearchObj);

        var orderCommitMap = {};
        for (var j = 0; j < resultArray.length; j++) {
            var soId2 = resultArray[j].id;
            var qty2 = parseFloat(resultArray[j].getValue('quantityuom')) || 0;
            var committed2 = parseFloat(resultArray[j].getValue('quantitycommitted')) || 0;

            if (!orderCommitMap[soId2]) {
                orderCommitMap[soId2] = { allCommitted: true };
            }
            if (committed2 < qty2) {
                orderCommitMap[soId2].allCommitted = false;
            }
        }

        salesOrderSublist.label = 'To Be Shipped (' + resultArray.length + ')';

        populateSalesOrderSublist(salesOrderSublist, resultArray, orderCommitMap);

        // ============== 3) PICKED ==============
        var pickedRows = getPickedOrders();
        populateFulfillSublist(shippedSublist, pickedRows, true);

        shippedSublist.label = 'Picked Orders(' + pickedRows.length + ')';

        // ============== 4) FULFILLED ==============
        var fulfilledRows = getFulfilledOrders();
        populateFulfillSublist(fulfillSublist, fulfilledRows, false);

        fulfillSublist.label = 'Fulfilled (' + fulfilledRows.length + ')'

        context.response.writePage(formObj);
    }

    function handlePost(context) {
        try {
            var request = context.request;

            var selectedSalesOrder = [];
            var soNumber = [];
            var poNumber = [];
            var to = '';
            var cc = '';
            var selectedIF = [];

            // ===== helper to read lines from a sublist (TBS + TBSHIPPED) =====
            function collectFromSublist(groupId) {
                var lineCount = request.getLineCount({ group: groupId }) || 0;

                for (var line = 0; line < lineCount; line++) {
                    var isSelected = request.getSublistValue({
                        group: groupId,
                        name: 'custpage_custselect',
                        line: line
                    });

                    if (isSelected !== 'T') continue;

                    // First TO/CC we find – reuse same logic as old script
                    if (!to) {
                        to = request.getSublistValue({
                            group: groupId,
                            name: 'custpage_customeremail',
                            line: line
                        }) || '';
                    }
                    if (!cc) {
                        cc = request.getSublistValue({
                            group: groupId,
                            name: 'custpage_empidhidden',
                            line: line
                        }) || '';
                    }

                    var obj = {
                        internalID: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_custinternalid',
                            line: line
                        }),
                        itemID: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_custitemid',
                            line: line
                        }),
                        // original line quantity
                        qty: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_qty',
                            line: line
                        }),
                        // this will be used as "how much to ship"
                        shippingQty: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_shippingqty',
                            line: line
                        }),
                        shipment_date: request.parameters.custpage_startdate,
                        create_shipping_rec: request.parameters.custpage_item_fulfillment,
                        tracking_number: request.parameters.custpage_tracking_number,
                        shipping_cost: request.parameters.custpage_shipping_cost,
                        shipping_method: request.parameters.custpage_shipping_method,
                        location_new: request.parameters.custpage_shipping_location,
                        line_id: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_custlineid',
                            line: line
                        }),
                        customerID: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_custentityidhidden',
                            line: line
                        }),
                        location_name: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_location',
                            line: line
                        }),
                        subid: request.getSublistValue({
                            group: groupId,
                            name: 'custpage_custsubid',
                            line: line
                        })
                    };

                    selectedSalesOrder.push(obj);

                    soNumber.push(request.getSublistValue({
                        group: groupId,
                        name: 'custpage_custordernum',
                        line: line
                    }));

                    poNumber.push(request.getSublistValue({
                        group: groupId,
                        name: 'custpage_custrefnumber',
                        line: line
                    }));
                }
            }

            function collectFromPickSublist() {
                const selectedIFLines = request.getLineCount({ group: 'custpage_shippedlist' }) || 0;

                log.debug('selectedIFLines', selectedIFLines);

                for (var IFline = 0; IFline < selectedIFLines; IFline++) {
                    const isSelected = request.getSublistValue({
                        group: 'custpage_shippedlist',
                        name: 'custpage_if_select',
                        line: IFline
                    });

                    log.debug('isSelected', isSelected);

                    if (isSelected !== 'T') continue;

                    let IFObj = {
                        IFnum: request.getSublistValue({
                            group: 'custpage_shippedlist',
                            name: 'custpage_if_internalid',
                            line: IFline
                        }),
                        trackingNum: request.getSublistValue({
                            group: 'custpage_shippedlist',
                            name: 'custpage_if_tracking',
                            line: IFline
                        }),
                        shippingCost: request.getSublistValue({
                            group: 'custpage_shippedlist',
                            name: 'custpage_if_shipcost',
                            line: IFline
                        }),
                        shippingMethod: request.getSublistValue({
                            group: 'custpage_shippedlist',
                            name: 'custpage_if_shipmethod',
                            line: IFline
                        }),
                        isIFOrder: true
                    }

                    log.debug('IFObj', IFObj);

                    selectedIF.push(IFObj);
                }
            }

            // Collect from BOTH subtabs
            collectFromSublist('custpage_tobescheduled');   // To Be Scheduled
            collectFromSublist('custpage_salesorderlist'); // To Be Shipped
            collectFromPickSublist();

            log.debug({ title: 'selectedSalesOrder (merged)', details: selectedSalesOrder });

            if (!selectedSalesOrder.length && !selectedIF.length) {
                // nothing selected – just bounce back
                redirect.toSuitelet({
                    scriptId: 'customscript_tc_schedule_sample_scr_v3',
                    deploymentId: 'customdeploy_tc_schedule_sample_scr_v3'
                });
                return;
            }

            var get_deploy = isDeploymentRunning();
            get_deploy = get_deploy.toLowerCase();
            log.audit('get_deploy', get_deploy);

            var scheduleMRScriptTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_tc_sample_screen_mr_v3',
                deploymentId: get_deploy,
                params: {
                    custscript_tc_script_object: selectedIF.length ? JSON.stringify(selectedIF) : JSON.stringify(selectedSalesOrder)
                }
            });

            var scriptTaskId = scheduleMRScriptTask.submit();
            var userObj = runtime.getCurrentUser().id;

            var redirectParams = {};

            if (selectedIF.length) {

                if (scriptTaskId) {
                    redirectParams.scriptTaskId = scriptTaskId;
                }

                if (userObj) {
                    redirectParams.userObj = userObj;
                }

                redirectParams.creation = 'F'

                redirect.toSuitelet({
                    scriptId: 'customscript_tc_schedule_sample_scr_v3',
                    deploymentId: 'customdeploy_tc_schedule_sample_scr_v3',
                    parameters: redirectParams
                });
            }

            log.debug({ title: 'userObj', details: userObj });

            if (scriptTaskId) {
                redirectParams.scriptTaskId = scriptTaskId;
            }
            if (userObj) {
                redirectParams.userObj = userObj;
            }
            // use create_shipping_rec from first line as before
            redirectParams.creation = selectedSalesOrder[0].create_shipping_rec;

            // ===== EMAIL handling (same logic as before) =====
            var emailvalidation = request.parameters.custpage_send_email;

            if (emailvalidation == 'T') {
                var emailtoParam = request.parameters.custpage_email_to;
                if (emailtoParam) {
                    to = emailtoParam;
                }

                var emailccParam = request.parameters.custpage_email_cc;
                if (emailccParam) {
                    if (cc) cc += ',' + emailccParam;
                    else cc = emailccParam;
                }

                var emailsubject = request.parameters.custpage_email_subject;
                var emailbody = request.parameters.custpage_email_body;
                var from = userObj;

                emailbody = emailbody.replace(
                    'SO(s) will be filled automatically, once you process.',
                    convertArray(soNumber)
                );
                emailbody = emailbody.replace(
                    'PO(s) will be filled automatically, once you process.',
                    convertArray(poNumber)
                );

                var ccArray = [];
                if (cc) {
                    ccArray = cc.split(',');
                }

                if (selectedSalesOrder.length > 0) {
                    email.send({
                        author: from,
                        recipients: [to],
                        cc: ccArray,
                        subject: emailsubject,
                        body: emailbody,
                        relatedRecords: {
                            transactionId: selectedSalesOrder[0].internalID
                        }
                    });
                }
            }

            redirect.toSuitelet({
                scriptId: 'customscript_tc_schedule_sample_scr_v3',
                deploymentId: 'customdeploy_tc_schedule_sample_scr_v3',
                parameters: redirectParams
            });
        } catch (error) {
            log.debug('Error in Shipment page', error);
        }
    }

    // ================= SUBLIST FIELD DEFINITIONS =================
    function addSalesOrderSublistFields(sublist, addSelect) {
        if (addSelect) {
            sublist.addField({
                id: 'custpage_custselect',
                type: serverWidget.FieldType.CHECKBOX,
                label: 'Select'
            });
        }
        sublist.addField({
            id: 'custpage_link',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Link'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        sublist.addField({
            id: 'custpage_shipping_link',
            type: serverWidget.FieldType.TEXT,
            label: 'Shipping Record Link'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custinternalid',
            type: serverWidget.FieldType.TEXT,
            label: 'Internal ID'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_commitmentstatus',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Commitment Status'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custorderreason',
            type: serverWidget.FieldType.TEXT,
            label: 'Order Reason'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custordernum',
            type: serverWidget.FieldType.TEXT,
            label: 'Sales Order Number'
        });

        sublist.addField({
            id: 'custpage_custrefnumber',
            type: serverWidget.FieldType.TEXT,
            label: 'Customer PO#'
        });

        sublist.addField({
            id: 'custpage_custentityid',
            type: serverWidget.FieldType.TEXT,
            label: 'ENTITY/ID'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custentityidhidden',
            type: serverWidget.FieldType.TEXT,
            label: 'CustID'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_empidhidden',
            type: serverWidget.FieldType.TEXT,
            label: 'EmpID'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_customeremail',
            type: serverWidget.FieldType.TEXT,
            label: 'customer Email'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custsubid',
            type: serverWidget.FieldType.TEXT,
            label: 'Subsidiary'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custentity',
            type: serverWidget.FieldType.TEXT,
            label: 'Customer'
        });

        sublist.addField({
            id: 'custpage_custmemo',
            type: serverWidget.FieldType.TEXT,
            label: 'Memo'
        });
        sublist.addField({
            id: 'custpage_end_customer_contact_email',
            type: serverWidget.FieldType.TEXT,
            label: 'End Customer Contact Email'
        });
        sublist.addField({
            id: 'custpage_end_customer_contact',
            type: serverWidget.FieldType.TEXT,
            label: 'End Customer Contact'
        });
        sublist.addField({
            id: 'custpage_end_customer_phone',
            type: serverWidget.FieldType.TEXT,
            label: 'End Customer Phone'
        });

        sublist.addField({
            id: 'custpage_custshippingcharg',
            type: serverWidget.FieldType.TEXT,
            label: 'Shipping Charge'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_location',
            type: serverWidget.FieldType.TEXT,
            label: 'Ship From Location'
        });

        sublist.addField({
            id: 'custpage_dateentered',
            type: serverWidget.FieldType.TEXT,
            label: 'Date Entered'
        });

        sublist.addField({
            id: 'custpage_custreqdate',
            type: serverWidget.FieldType.DATE,
            label: 'Customer Requested Date'
        });

        sublist.addField({
            id: 'custpage_requesteddate',
            type: serverWidget.FieldType.DATE,
            label: 'Supply Required By Date'
        });

        sublist.addField({
            id: 'custpage_scheduledate',
            type: serverWidget.FieldType.DATE,
            label: 'Scheduled Ship Date'
        });

        sublist.addField({
            id: 'custpage_shipcomplete',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Ship Complete'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublist.addField({
            id: 'custpage_custitem',
            type: serverWidget.FieldType.TEXT,
            label: 'Product Code'
        });

        sublist.addField({
            id: 'custpage_custlinememo',
            type: serverWidget.FieldType.TEXT,
            label: 'Product Description'
        });

        sublist.addField({
            id: 'custpage_custcity',
            type: serverWidget.FieldType.TEXT,
            label: 'Shipping City'
        });

        sublist.addField({
            id: 'custpage_custshipto',
            type: serverWidget.FieldType.TEXT,
            label: 'Ship To Address'
        });

        sublist.addField({
            id: 'custpage_qty',
            type: serverWidget.FieldType.TEXT,
            label: 'Quantity'
        });

        sublist.addField({
            id: 'custpage_lefttoship',
            type: serverWidget.FieldType.TEXT,
            label: 'Left To Ship'
        });

        sublist.addField({
            id: 'custpage_shippingqty',
            type: serverWidget.FieldType.TEXT,
            label: 'Shipping Quantity'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custqtycommited',
            type: serverWidget.FieldType.TEXT,
            label: 'QUANTITY COMMITTED'
        });

        sublist.addField({
            id: 'custpage_custqtypicked',
            type: serverWidget.FieldType.TEXT,
            label: 'QUANTITY PICKED'
        });

        sublist.addField({
            id: 'custpage_custqtypacked',
            type: serverWidget.FieldType.TEXT,
            label: 'QUANTITY PACKED'
        });

        sublist.addField({
            id: 'custpage_custitemid',
            type: serverWidget.FieldType.TEXT,
            label: 'ItemID'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custlineid',
            type: serverWidget.FieldType.TEXT,
            label: 'lineID'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_custstatus',
            type: serverWidget.FieldType.TEXT,
            label: 'Status'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    function addFulfillSublistFields(sublist, addSelect, addInlineEditing) {
        if (addSelect) {
            sublist.addField({
                id: 'custpage_if_select',
                type: serverWidget.FieldType.CHECKBOX,
                label: 'Select'
            });
        }

        sublist.addField({
            id: 'custpage_if_number',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Item Fulfillment #'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        sublist.addField({
            id: 'custpage_if_packslip',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Packing Slip'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        sublist.addField({
            id: 'custpage_if_so',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Sales Order #'
        });

        sublist.addField({
            id: 'custpage_if_customer',
            type: serverWidget.FieldType.TEXT,
            label: 'Customer'
        });

        sublist.addField({
            id: 'custpage_if_schedship',
            type: serverWidget.FieldType.DATE,
            label: 'Scheduled Ship Date'
        });

        sublist.addField({
            id: 'custpage_if_city',
            type: serverWidget.FieldType.TEXT,
            label: 'Ship City'
        });

        sublist.addField({
            id: 'custpage_if_shipname',
            type: serverWidget.FieldType.TEXT,
            label: 'Ship to'
        });

        sublist.addField({
            id: 'custpage_if_shipadd',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Shipping Address'
        });

        sublist.addField({
            id: 'custpage_if_createddate',
            type: serverWidget.FieldType.TEXT,
            label: 'Actual Ship Date'
        });

        sublist.addField({
            id: 'custpage_if_line',
            type: serverWidget.FieldType.TEXT,
            label: 'SO Line Unique Key'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublist.addField({
            id: 'custpage_if_internalid',
            type: serverWidget.FieldType.TEXT,
            label: 'IF Internal ID'
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    // ================= SUBLIST POPULATORS =================
    function setLineValue(sublistObj, fieldId, line, value) {
        try {
            if (!sublistObj || !fieldId || line === null || line === undefined) {
                log.debug('setLineValue - skip (bad args)', {
                    fieldId: fieldId,
                    line: line,
                    value: value
                });
                return;
            }

            if (value === undefined || value === null) {
                value = '';
            }

            if (value === '') {
                // Do not write empty – avoids SSS_MISSING_REQD_ARGUMENT
                return;
            }

            if (typeof value !== 'string') {
                value = value.toString();
            }

            sublistObj.setSublistValue({
                id: fieldId,
                line: line,
                value: value
            });
        } catch (e) {
            log.debug('setLineValue error', {
                fieldId: fieldId,
                line: line,
                value: value,
                errName: e.name,
                errMsg: e.message
            });
            throw e;
        }
    }

    function populateSalesOrderSublist(sublistObj, resultArray, orderCommitMap) {
        var scheme = 'https://';
        var host = url.resolveDomain({
            hostType: url.HostType.APPLICATION
        });

        for (var i = 0; i < resultArray.length; i++) {
            var soInternalId = resultArray[i].id;

            // SO link
            var relativePath = url.resolveRecord({
                recordType: record.Type.SALES_ORDER,
                recordId: soInternalId,
                isEditMode: false
            });
            var myURL = scheme + host + relativePath;
            var linkHtml = '<a href="' + myURL + '" target="_blank">View</a>';
            setLineValue(sublistObj, 'custpage_link', i, linkHtml);

            // Shipping record link if exists
            var shipRecordName = resultArray[i].getText({ name: 'custcol_tc_related_shipping_record' });
            var shipRecordId = resultArray[i].getValue({ name: 'custcol_tc_related_shipping_record' });

            if (!isEmpty(shipRecordId)) {
                var relPathShip = url.resolveRecord({
                    recordType: 'customtransaction118',
                    recordId: shipRecordId,
                    isEditMode: false
                });
                var shipURL = scheme + host + relPathShip;
                var shipLink = '<a href="' + shipURL + '" target="_blank">' + shipRecordName + '</a>';
                setLineValue(sublistObj, 'custpage_shipping_link', i, shipLink);
            }

            setLineValue(sublistObj, 'custpage_custinternalid', i, safe(soInternalId));
            setLineValue(sublistObj, 'custpage_custorderreason', i, safe(resultArray[i].getText('custbody_tc_rma_reason')));
            setLineValue(sublistObj, 'custpage_custordernum', i, safe(resultArray[i].getValue('tranid')));

            if (!isEmpty(resultArray[i].getValue('otherrefnum'))) {
                setLineValue(sublistObj, 'custpage_custrefnumber', i, safe(resultArray[i].getValue('otherrefnum')));
            }
            if (!isEmpty(resultArray[i].getValue('entity'))) {
                setLineValue(sublistObj, 'custpage_custentity', i, safe(resultArray[i].getText('entity')));
                setLineValue(sublistObj, 'custpage_custentityidhidden', i, safe(resultArray[i].getValue('entity')));
            }

            var salesRepEmail = resultArray[i].getValue({ name: 'email', join: 'salesRep' });
            if (salesRepEmail) {
                setLineValue(sublistObj, 'custpage_empidhidden', i, safe(salesRepEmail));
            }

            var custEmail = resultArray[i].getValue({ name: 'email', join: 'customer' });
            if (custEmail) {
                setLineValue(sublistObj, 'custpage_customeremail', i, safe(custEmail));
            }

            if (!isEmpty(resultArray[i].getValue('memomain'))) {
                setLineValue(sublistObj, 'custpage_custmemo', i, safe(resultArray[i].getValue('memomain')));
            }

            setLineValue(sublistObj, 'custpage_end_customer_contact_email', i, safe(resultArray[i].getValue('custbody_tc_end_customer_contact_email')));
            var contactName = resultArray[i].getText('custbody_tc_end_customer_contact') || resultArray[i].getValue('custbody_tc_end_customer_contact');
            setLineValue(sublistObj, 'custpage_end_customer_contact', i, safe(contactName));
            setLineValue(sublistObj, 'custpage_end_customer_phone', i, safe(resultArray[i].getValue('custbody_tc_end_customer_phone')));

            setLineValue(sublistObj, 'custpage_custsubid', i, safe(resultArray[i].getValue('subsidiary')));

            if (!isEmpty(resultArray[i].getValue('inventorylocation'))) {
                setLineValue(sublistObj, 'custpage_location', i, safe(resultArray[i].getText('inventorylocation')));
            }
            if (!isEmpty(resultArray[i].getValue('custbody_tc_ship_date_estimated'))) {
                setLineValue(sublistObj, 'custpage_requesteddate', i, safe(resultArray[i].getValue('custbody_tc_ship_date_estimated')));
            }
            if (!isEmpty(resultArray[i].getValue('custcol_tc_scheduled_ship_date'))) {
                setLineValue(sublistObj, 'custpage_scheduledate', i, safe(resultArray[i].getValue('custcol_tc_scheduled_ship_date')));
            }

            if (!isEmpty(resultArray[i].getValue('shipcity'))) {
                setLineValue(sublistObj, 'custpage_custcity', i, safe(resultArray[i].getValue('shipcity')));

                const shipAddressee = safe(resultArray[i].getValue('shipaddressee'));
                const shipAttention = safe(resultArray[i].getValue('shippingattention'));

                if (shipAddressee && shipAttention) {
                    const newShipTo = shipAttention + ' - ' + shipAddressee;
                    setLineValue(sublistObj, 'custpage_custshipto', i, newShipTo);
                } else if (!shipAddressee && shipAttention) {
                    const newShipTo = shipAttention;
                    setLineValue(sublistObj, 'custpage_custshipto', i, newShipTo);
                } else if (shipAddressee && !shipAttention) {
                    const newShipTo = shipAddressee;
                    setLineValue(sublistObj, 'custpage_custshipto', i, newShipTo);
                }
                // setLineValue(sublistObj, 'custpage_custshipto', i, safe(resultArray[i].getValue('shipaddress')));
            }
            if (!isEmpty(resultArray[i].getValue('custcol_tc_cust_req_date'))) {
                setLineValue(sublistObj, 'custpage_custreqdate', i, safe(resultArray[i].getValue('custcol_tc_cust_req_date')));
            }

            if (!isEmpty(resultArray[i].getValue('datecreated'))) {
                setLineValue(sublistObj, 'custpage_dateentered', i, safe(resultArray[i].getValue('datecreated')));
            }

            setLineValue(sublistObj, 'custpage_custstatus', i, safe(resultArray[i].getText({ name: 'statusref' })));

            if (!isEmpty(resultArray[i].getValue('item'))) {
                setLineValue(sublistObj, 'custpage_custitem', i, safe(resultArray[i].getText('item')));
                if (!isEmpty(resultArray[i].getValue('memo'))) {
                    setLineValue(sublistObj, 'custpage_custlinememo', i, safe(resultArray[i].getValue('memo')));
                }
                setLineValue(sublistObj, 'custpage_custitemid', i, safe(resultArray[i].getValue('item')));
                setLineValue(sublistObj, 'custpage_custlineid', i, safe(resultArray[i].getValue('line')));
                setLineValue(sublistObj, 'custpage_qty', i, safe(resultArray[i].getValue('quantityuom')));
                setLineValue(sublistObj, 'custpage_lefttoship', i, safe(resultArray[i].getValue('formulanumeric')));

                // DEFAULT ShippingQty = Left To Ship (needed for MR)
                var leftToShip = resultArray[i].getValue('formulanumeric');
                if (!isEmpty(leftToShip)) {
                    setLineValue(sublistObj, 'custpage_shippingqty', i, safe(leftToShip));
                }

                if (!isEmpty(resultArray[i].getValue('custbody_tc_shipping_charge'))) {
                    setLineValue(sublistObj, 'custpage_custshippingcharg', i, safe(resultArray[i].getText('custbody_tc_shipping_charge')));
                }
                if (!isEmpty(resultArray[i].getValue('quantitycommitted'))) {
                    setLineValue(sublistObj, 'custpage_custqtycommited', i, safe(resultArray[i].getValue('quantitycommitted')));
                }
                setLineValue(sublistObj, 'custpage_custqtypicked', i, safe(resultArray[i].getValue('quantitypicked')));
                setLineValue(sublistObj, 'custpage_custqtypacked', i, safe(resultArray[i].getValue('quantitypacked')));
            }

            var shipComplete = resultArray[i].getValue('shipcomplete');
            var shipCompleteFlag = (shipComplete === true || shipComplete === 'T') ? 'T' : 'F';
            setLineValue(sublistObj, 'custpage_shipcomplete', i, shipCompleteFlag);

            var commitFlag = '';
            if (orderCommitMap[soInternalId] && orderCommitMap[soInternalId].allCommitted) {
                commitFlag = '✅ Fully';
            } else {
                commitFlag = '⏳ Partially';
            }
            setLineValue(sublistObj, 'custpage_commitmentstatus', i, commitFlag);
        }
    }

    function populateFulfillSublist(fulfillSublist, rows, withSelect) {
        for (var i = 0; i < rows.length; i++) {
            if (withSelect) {
                setLineValue(fulfillSublist, 'custpage_if_select', i, 'F');
            }

            // IF link
            var ifLink = '';
            if (rows[i].ifInternalId) {
                ifLink =
                    '<a href="/app/accounting/transactions/itemship.nl?whence=&id=' +
                    safe(rows[i].ifInternalId) +
                    '" target="_blank">' +
                    safe(rows[i].ifNumber) +
                    '</a>';
            } else {
                ifLink = safe(rows[i].ifNumber);
            }
            setLineValue(fulfillSublist, 'custpage_if_number', i, ifLink);

            // SO link
            var soLink = '';
            if (rows[i].soInternalId) {
                soLink =
                    '<a href="/app/accounting/transactions/salesord.nl?id=' +
                    safe(rows[i].soInternalId) +
                    '" target="_blank">' +
                    safe(rows[i].soNumber) +
                    '</a>';
            } else {
                soLink = safe(rows[i].soNumber);
            }
            setLineValue(fulfillSublist, 'custpage_if_so', i, soLink);

            // Packing Slip link
            var packLink = '';
            if (rows[i].ifInternalId) {
                var scheme2 = 'https://';
                var host2 = url.resolveDomain({
                    hostType: url.HostType.APPLICATION
                });

                var packUrl =
                    scheme2 + host2 +
                    '/app/accounting/print/hotprint.nl' +
                    '?regular=T&sethotprinter=T' +
                    '&id=' + encodeURIComponent(rows[i].ifInternalId) +
                    '&label=' + encodeURIComponent('Packing Slip') +
                    '&printtype=packingslip' +
                    '&trantype=itemship';

                packLink = '<a href="' + packUrl + '" target="_blank">View</a>';
            }
            setLineValue(fulfillSublist, 'custpage_if_packslip', i, packLink);

            // Other fields
            setLineValue(fulfillSublist, 'custpage_if_customer', i, safe(rows[i].customer));

            if (rows[i].scheduledShip) {
                setLineValue(fulfillSublist, 'custpage_if_schedship', i, safe(rows[i].scheduledShip));
            }
            if (rows[i].shipCity) {
                setLineValue(fulfillSublist, 'custpage_if_city', i, safe(rows[i].shipCity));
            }
            if (rows[i].shipName) {
                setLineValue(fulfillSublist, 'custpage_if_shipname', i, safe(rows[i].shipName));
            }
            if (rows[i].shipAdd) {
                setLineValue(fulfillSublist, 'custpage_if_shipadd', i, safe(rows[i].shipAdd));
            }
            if (rows[i].soLineKey) {
                setLineValue(fulfillSublist, 'custpage_if_line', i, safe(rows[i].soLineKey));
            }

            if (rows[i].ifCreatedDate) {
                setLineValue(fulfillSublist, 'custpage_if_createddate', i, safe(rows[i].ifCreatedDate));
            }
            setLineValue(fulfillSublist, 'custpage_if_internalid', i, safe(rows[i].ifInternalId));
        }
    }

    // ================= HELPERS =================
    function getSelectedLine(context) {
        var selectedSalesOrder = [];

        for (var selectedCount = 0; selectedCount < context.request.getLineCount({ group: 'custpage_salesorderlist' }); selectedCount++) {
            if (context.request.getSublistValue({
                group: 'custpage_salesorderlist',
                name: 'custpage_custselect',
                line: selectedCount
            }) == 'T') {

                var object = {
                    internalID: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_custinternalid',
                        line: selectedCount
                    }),
                    itemID: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_custitemid',
                        line: selectedCount
                    }),
                    qty: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_qty',
                        line: selectedCount
                    }),
                    shipment_date: context.request.parameters.custpage_startdate,
                    location_new: context.request.parameters.custpage_shipping_location,
                    line_id: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_custlineid',
                        line: selectedCount
                    }),
                    shippingQty: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_shippingqty',
                        line: selectedCount
                    }),
                    customerID: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_custentityidhidden',
                        line: selectedCount
                    }),
                    location_name: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_location',
                        line: selectedCount
                    }),
                    subid: context.request.getSublistValue({
                        group: 'custpage_salesorderlist',
                        name: 'custpage_custsubid',
                        line: selectedCount
                    })
                };

                selectedSalesOrder.push(object);
            }
        }
        return selectedSalesOrder;
    }

    function getResults(searchObj) {
        var resultSet = searchObj.run();
        var results = [];
        var index = 0;
        var slice = [];
        do {
            slice = resultSet.getRange(index, index + 1000);
            if (slice && slice.length > 0) {
                results = results.concat(slice);
            }
            index += 1000;
        } while (slice && slice.length === 1000);
        return results;
    }

    function isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (value === '') return true;
        if (value === ' ') return true;
        if (value === 'null') return true;
        return false;
    }

    function safe(v) {
        return (v === null || v === undefined) ? '' : v;
    }

    function list_of_shipping_city(setshippingcity) {
        var salesorderSearchObj = search.create({
            type: 'salesorder',
            filters: [
                ['type', 'anyof', 'SalesOrd'],
                'AND',
                ['mainline', 'is', 'T'],
                'AND',
                ['shipcity', 'isnotempty', '']
            ],
            columns: [
                search.createColumn({
                    name: 'shipcity',
                    summary: 'GROUP',
                    label: 'Shipping City'
                })
            ]
        });
        var iterationCount = 1;
        salesorderSearchObj.run().each(function (result) {
            var shippingcity = result.getValue({
                name: 'shipcity',
                summary: 'GROUP'
            });

            setshippingcity.addSelectOption({
                value: iterationCount,
                text: shippingcity
            });
            iterationCount++;
            return true;
        });
    }

    function isDeploymentRunning() {
        var deploymentIDs = [];
        var list_deployment = [
            'customdeploy_tc_sample_screen_mr_v3'
        ];

        var scheduledscriptinstanceSearchObj = search.create({
            type: 'scheduledscriptinstance',
            filters: [
                ['script.internalid', 'anyof', DEPLOY_MR_SCRIPT_ID],
                'AND',
                ['status', 'anyof', 'PENDING', 'PROCESSING']
            ],
            columns: [
                search.createColumn({
                    name: 'internalid',
                    join: 'scriptDeployment',
                    label: 'Internal ID'
                }),
                search.createColumn({
                    name: 'scriptid',
                    join: 'scriptDeployment',
                    label: 'Custom ID'
                })
            ]
        });

        scheduledscriptinstanceSearchObj.run().each(function (result) {
            deploymentIDs.push(result.getValue({
                name: 'scriptid',
                join: 'scriptDeployment'
            }));
            return true;
        });

        log.audit('deploymentIDs', deploymentIDs);

        for (var index = 0; index < deploymentIDs.length; index++) {
            var indexToRemove = list_deployment.indexOf(deploymentIDs[index]);
            if (indexToRemove !== -1) {
                list_deployment.splice(indexToRemove, 1);
            }
        }

        log.audit('list_deployment', list_deployment);

        var returndeploy = 'customdeploy_tc_sample_screen_mr_v3';

        if (list_deployment.length > 0) {
            return list_deployment[0];
        } else {
            return returndeploy;
        }
    }

    function convertArray(array1) {
        if (!array1 || array1.length === 0) return '';
        var uniqueArray = [];
        for (var i = 0; i < array1.length; i++) {
            if (uniqueArray.indexOf(array1[i]) === -1) {
                uniqueArray.push(array1[i]);
            }
        }
        return uniqueArray.join(', ');
    }

    // ================= PICKED / FULFILLED SEARCHES =================
    function getPickedOrders() {
        var fulfillOrders = [];

        var soSearch = search.create({
            type: 'salesorder',
            filters: [
                ['type', 'anyof', 'SalesOrd'],
                'AND',
                ['mainline', 'is', 'F'],
                'AND',
                ['status', 'anyof', 'SalesOrd:D', 'SalesOrd:F', 'SalesOrd:E', 'SalesOrd:B'],
                // 'AND',
                // ['custcol_tc_scheduled_ship_date', 'isnotempty', ''],
                'AND',
                ['custbody_tc_rma_reason', 'anyof', '4'],
                'AND',
                ['applyingtransaction.type', 'anyof', 'ItemShip'],
                'AND',
                ['applyingtransaction.status', 'anyof', 'ItemShip:A']
            ],
            columns: [
                // SO #
                search.createColumn({
                    name: 'tranid',
                    summary: search.Summary.GROUP
                }),
                // Customer
                search.createColumn({
                    name: 'entity',
                    summary: search.Summary.GROUP
                }),
                // Ship City
                search.createColumn({
                    name: 'shipcity',
                    summary: search.Summary.GROUP
                }),
                // Scheduled Ship Date (latest)
                search.createColumn({
                    name: 'custcol_tc_scheduled_ship_date',
                    summary: search.Summary.MAX
                }),
                // SO internal ID
                search.createColumn({
                    name: 'internalid',
                    summary: search.Summary.GROUP,
                    label: 'Internal ID'
                }),
                // IF #
                search.createColumn({
                    name: 'tranid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP,
                    label: 'IF Number'
                }),
                // IF internal ID
                search.createColumn({
                    name: 'internalid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP,
                    label: 'IF Internal ID'
                }),
                // IF Date (latest)
                search.createColumn({
                    name: 'trandate',
                    join: 'applyingTransaction',
                    summary: search.Summary.MAX,
                    label: 'IF Date',
                    sort: search.Sort.DESC
                })
            ]
        });

        var allResults = getResults(soSearch);

        for (var i = 0; i < allResults.length; i++) {
            var result = allResults[i];

            fulfillOrders.push({
                soNumber: result.getValue({
                    name: 'tranid',
                    summary: search.Summary.GROUP
                }),
                customer: result.getText({
                    name: 'entity',
                    summary: search.Summary.GROUP
                }),
                shipCity: result.getValue({
                    name: 'shipcity',
                    summary: search.Summary.GROUP
                }),
                scheduledShip: result.getValue({
                    name: 'custcol_tc_scheduled_ship_date',
                    summary: search.Summary.MAX
                }),
                soInternalId: result.getValue({
                    name: 'internalid',
                    summary: search.Summary.GROUP
                }),
                ifNumber: result.getValue({
                    name: 'tranid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP
                }),
                ifInternalId: result.getValue({
                    name: 'internalid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP
                }),
                ifDate: result.getValue({
                    name: 'trandate',
                    join: 'applyingTransaction',
                    summary: search.Summary.MAX
                })
            });
        }

        return fulfillOrders;
    }

    function getFulfilledOrders() {
        var fulfillOrders = [];
        const d = new Date();

        let currentDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
        let thirtyDaysBack = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 30, 0, 0, 0);

        var soSearch = search.create({
            type: 'salesorder',
            filters: [
                ['type', 'anyof', 'SalesOrd'],
                'AND',
                ['mainline', 'is', 'F'],
                'AND',
                ['status', 'anyof', 'SalesOrd:D', 'SalesOrd:F', 'SalesOrd:E', 'SalesOrd:G', 'SalesOrd:H'],
                // 'AND',
                // ['custcol_tc_scheduled_ship_date', 'isnotempty', ''],
                'AND',
                ['custbody_tc_rma_reason', 'anyof', '4'],
                'AND',
                ['applyingtransaction.type', 'anyof', 'ItemShip'],
                "AND",
                ["applyingtransaction.status", "anyof", "ItemShip:C"],
                "AND",
                ["applyingtransaction.datecreated", "within", formatDateIs(thirtyDaysBack), formatDateIs(currentDate)]
            ],
            columns: [
                // SO #
                search.createColumn({
                    name: 'tranid',
                    summary: search.Summary.GROUP
                }),
                // Customer
                search.createColumn({
                    name: 'entity',
                    summary: search.Summary.GROUP
                }),
                search.createColumn({ name: 'shipaddress', summary: search.Summary.GROUP, label: 'Ship To' }),
                search.createColumn({ name: 'shippingattention', summary: search.Summary.GROUP, label: 'Shipping Attention' }),
                // Ship City
                search.createColumn({
                    name: 'shipcity',
                    summary: search.Summary.GROUP
                }),
                // Scheduled Ship Date (latest)
                search.createColumn({
                    name: 'custcol_tc_scheduled_ship_date',
                    summary: search.Summary.MAX
                }),
                // SO internal ID
                search.createColumn({
                    name: 'internalid',
                    summary: search.Summary.GROUP,
                    label: 'Internal ID'
                }),
                // IF #
                search.createColumn({
                    name: 'tranid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP,
                    label: 'IF Number'
                }),
                // IF internal ID
                search.createColumn({
                    name: 'internalid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP,
                    label: 'IF Internal ID'
                }),
                // IF Date (latest)
                search.createColumn({
                    name: 'trandate',
                    join: 'applyingTransaction',
                    summary: search.Summary.MAX,
                    label: 'IF Date',
                    sort: search.Sort.DESC
                }),
                search.createColumn({
                    name: 'datecreated',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP,
                    label: 'Actual Ship Date'
                })
            ]
        });

        var allResults = getResults(soSearch);

        for (var i = 0; i < allResults.length; i++) {
            var result = allResults[i];

            fulfillOrders.push({
                soNumber: result.getValue({
                    name: 'tranid',
                    summary: search.Summary.GROUP
                }),
                customer: result.getText({
                    name: 'entity',
                    summary: search.Summary.GROUP
                }),
                shipCity: result.getValue({
                    name: 'shipcity',
                    summary: search.Summary.GROUP
                }),
                shipName: result.getValue({
                    name: 'shippingattention',
                    summary: search.Summary.GROUP
                }),
                shipAdd: result.getValue({
                    name: 'shipaddress',
                    summary: search.Summary.GROUP
                }),
                scheduledShip: result.getValue({
                    name: 'custcol_tc_scheduled_ship_date',
                    summary: search.Summary.MAX
                }),
                soInternalId: result.getValue({
                    name: 'internalid',
                    summary: search.Summary.GROUP
                }),
                ifNumber: result.getValue({
                    name: 'tranid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP
                }),
                ifInternalId: result.getValue({
                    name: 'internalid',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP
                }),
                ifDate: result.getValue({
                    name: 'trandate',
                    join: 'applyingTransaction',
                    summary: search.Summary.MAX
                }),
                ifCreatedDate: result.getValue({
                    name: 'datecreated',
                    join: 'applyingTransaction',
                    summary: search.Summary.GROUP
                })
            });
        }

        return fulfillOrders;
    }

    function formatDateIs(dt) {
        return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + dt.getFullYear();
    }

    return {
        onRequest: onRequest
    };
});