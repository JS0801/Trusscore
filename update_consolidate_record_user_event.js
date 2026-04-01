/*
**************
*
*
* Author:      DHRUV SONI
*
***************
* Script Description:
***************
*/
/**
*@NApiVersion 2.x
*@NScriptType UserEventScript
*@NModuleScope SameAccount
*/
define(['N/error','N/log','N/record','N/search','N/format'],
function(error,log,record,search,format) {
  
  function afterSubmit(context) {
    
    try {
      
      if(context.type == context.UserEventType.CREATE || context.type == context.UserEventType.EDIT){
        
        var array = [];
        var allSOArr = [];
        var allPOArr = [];
        var mainSO = '';
        var consolidated_shippingrecord = context.newRecord;
        var recID = consolidated_shippingrecord.id;
        var recType = consolidated_shippingrecord.type;
        log.debug({title:'consolidated_shippingrecord',details:consolidated_shippingrecord})
        
        consolidated_shippingrecord = record.load({type:'customtransaction118',id:recID,isDynamic:true})
        var shipDate = consolidated_shippingrecord.getValue({fieldId:'custbody_tc_schedule_shipment_date'})
        var shipLocation = consolidated_shippingrecord.getValue({fieldId:'custbody_tc_shipping_loc'})
        var scraprec = consolidated_shippingrecord.getValue({fieldId:'custbody_ds_scrap_record'})


        
        
        var getLineCount = consolidated_shippingrecord.getLineCount({sublistId:'line'})
        
        for (var i = 0; i < getLineCount; i++) {
          
          consolidated_shippingrecord.selectLine({sublistId:'line',line:i})


          
          var salesorder = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_sales_order'})
          log.debug({title:'salesorder',details:salesorder})
          
          var item = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_item'})
          var line = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_line_id'})
          var shippingrecordLine = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'line'})
          
          
          
          var object = {
            salesorder : salesorder,
            item :item ,
            line : line,
            shippingrecordLine:i
          }
          consolidated_shippingrecord.commitLine({sublistId:'line'})
          
          array.push(object)
        }

        if (array.length === 0) {
          log.debug('No lines found on CSR to process');
          return;
        }
       //SD - TO Chnage
        var lookup = search.lookupFields({
          type: search.Type.TRANSACTION,
          id: array[0].salesorder,
          columns: ['type']
        });

        var lookupType = (lookup && lookup.type && lookup.type[0]) ? lookup.type[0].value : '';
        log.debug('Lookup.type', lookupType);

        var groupedBySalesOrder = groupByItem(array, 'salesorder');
        log.debug({ title: 'groupedBySalesOrder', details: groupedBySalesOrder });

        // Process Sales Orders
        if (lookupType == 'SalesOrd') {
          var total_cal_weight = 0;
          for (var key in groupedBySalesOrder) {
            //SD - TO Chnage End
          
          var keySO = key;
          log.debug({title:'keySO',details:keySO})
          
          var data = groupedBySalesOrder[keySO]
          log.debug('data', data)
          
          var load_SO = record.load({type:'salesorder',id:keySO,isDynamic:true})
          var currency = load_SO.getValue({fieldId:'currency'})
          consolidated_shippingrecord.setValue({fieldId:'custbody_tc_con_ship_currency',value:currency})
          
          
          for (var i = 0; i < data.length; i++) {
            
            var item = data[i].item;
            var line = data[i].line;
            var shippingRecLine = data[i].shippingrecordLine;
            
            var SO_LINE =  load_SO.findSublistLineWithValue({sublistId:'item',fieldId:'line',value:line});
            log.debug({title:'SO_LINE',details:SO_LINE})
            
            load_SO.selectLine({sublistId:'item',line:SO_LINE})
            
            load_SO.setCurrentSublistValue({sublistId:'item',fieldId:'custcol_tc_related_shipping_record',value:recID})
            if(shipDate){
               load_SO.setCurrentSublistValue({sublistId:'item',fieldId:'custcol_tc_scheduled_ship_date',value:new Date(shipDate)});
            }
            
            load_SO.setCurrentSublistValue({sublistId:'item',fieldId:'inventorylocation',value:shipLocation});
            load_SO.commitLine({sublistId:'item'})
            
            
            var getRelatedData = getSalesOrderData(item,line,keySO)
            allSOArr.push(getRelatedData.tranid)
            allPOArr.push(getRelatedData.po_num)
            log.debug({title:'getRelatedData',details:getRelatedData})
            log.debug({title:'shippingRecLine',details:shippingRecLine})

            consolidated_shippingrecord.setValue({fieldId:'custbodycustbody_tc_buyer_tax_id',value:getRelatedData.buyerTaxId})
            consolidated_shippingrecord.setValue({fieldId:'custbodycustbody_tc_consignee_tax_id',value:getRelatedData.shippingTaxId})

            consolidated_shippingrecord.selectLine({sublistId:'line',line:shippingRecLine})
            var testcheck = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_sales_order'})
            var currentqty = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_shipping_qty'})
            log.debug({title:'testcheck',details:testcheck})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_po_number',value:getRelatedData.po_num})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_commited',value:getRelatedData.quantitycommitted})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_item_qty',value:getRelatedData.quantity})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_cntry_of_orig',value:getRelatedData.countryofmanufacture})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_supp_req_date',value:new Date(getRelatedData.requesteddate)})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_product_group',value:getRelatedData.productGroup})
            if(parseInt((currentqty)/(getRelatedData.bundleSize))>0){
                          consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_crate_size',value:parseInt((currentqty)/(getRelatedData.bundleSize))})

            }
            var linear_feet = Math.round(((getRelatedData.length) * (currentqty)) / 12 * 100) / 100;
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'memo',value:getRelatedData.memo})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_linear_feet',value:linear_feet})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_available',value:getRelatedData.quantityshiprecv})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_line_hs_code',value:getRelatedData.item_hscode})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_bol_group',value:getRelatedData.item_bol_group})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_ts_item_rate',value:getRelatedData.item_rate})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_ts_item_discount',value:parseFloat(getRelatedData.item_discount)})
            consolidated_shippingrecord.setCurrentSublistText({sublistId:'line',fieldId:'custcol_tc_cntry_of_orig',text:'Canada'})
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_if_bol_col_weight_item',value:Math.round(getRelatedData.weight * 100)/100})
            if (scraprec == true || scraprec == 'true') {
            consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_ds_remove',value:true})
            }

            if(getRelatedData.weight && getRelatedData.weight>0 && currentqty){
              var final_weight =  Math.floor((parseFloat(getRelatedData.weight) * parseFloat(currentqty)) );
              log.audit('final_weight',final_weight)

            total_cal_weight = parseFloat(total_cal_weight) + parseFloat(final_weight);
             log.audit('total_cal_weight',total_cal_weight)

              consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_total_item_weight',value: Math.floor((parseFloat(getRelatedData.weight) * parseFloat(currentqty)) )})
            }
              consolidated_shippingrecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_ship_unit',value:getRelatedData.shipunit})

            
            if(i == 0){
              consolidated_shippingrecord.setValue({fieldId:'custbody_tc_shipping_charge',value:getRelatedData.shipping_charge})
              consolidated_shippingrecord.setValue({fieldId:'custbody_tc_related_tran',value:keySO})
              mainSO = keySO;

              if(context.type == context.UserEventType.CREATE){
                if(getRelatedData.ship_date){
                  consolidated_shippingrecord.setValue({fieldId:'custbody_tc_schedule_shipment_date',value:new Date(getRelatedData.ship_date)})
                  
                }
              }
            }
            
            consolidated_shippingrecord.commitLine({sublistId:'line'})
            
            
            
          }
          load_SO.save()

}
          //-------------------------------------------------------------------------------------------------
          for (var i = 0; i < getLineCount; i++) {
            
            consolidated_shippingrecord.selectLine({sublistId:'line',line:i})
            var remove = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_ds_remove'})
            log.debug({title:'remove',details:remove})
  
            if (remove == true) {
              log.debug({title:'remove - if',details:'-'})
  
              var salesorder1 = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_sales_order'})
              var lineid1 = consolidated_shippingrecord.getCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_line_id'})
              log.debug({title:'salesorder1',details:salesorder1})
              log.debug({title:'lineid1',details:lineid1})
              consolidated_shippingrecord.removeLine({sublistId:'line',line:i,ignoreRecalc: false})
              getLineCount = getLineCount - 1;
              i = i - 1;

  
                var load_SO1 = record.load({type:'salesorder',id:salesorder1,isDynamic:true})
                log.debug({title:'load_SO1',details:load_SO1})
  
              var lineNum =  load_SO1.findSublistLineWithValue({sublistId:'item',fieldId:'line',value:lineid1})
                log.debug({title:'lineNum',details:lineNum})
  
                if(lineNum != -1){
                  var selline = load_SO1.selectLine({sublistId:'item',line:lineNum})
                  log.debug({title:'selline',details:selline})
        
              
                          load_SO1.setCurrentSublistValue({sublistId:'item',fieldId:'custcol_tc_related_shipping_record',value:''})
                          load_SO1.setCurrentSublistValue({sublistId:'item',fieldId:'custcol_tc_scheduled_ship_date',value:''})
                          load_SO1.commitLine({sublistId:'item'})
        
                }
                    load_SO1.save();


                
  
        }
  
  }
  
          
        
        consolidated_shippingrecord.setValue({fieldId:'custbody_ds_final_cal_weight',value:total_cal_weight})
        var fob_name = getFOB(recID);
        log.debug('fob_name', fob_name)
        consolidated_shippingrecord.setValue({fieldId:'custbody_tc_fob_point',value:fob_name.point})
        consolidated_shippingrecord.setValue({fieldId:'custbody_tc_other_deliver_information',value:removeDuplicates(allPOArr)})
        consolidated_shippingrecord.setValue({fieldId:'custbody_tc_related_so',value:removeDuplicates(allSOArr)})
      //  consolidated_shippingrecord.setValue({fieldId:'custbody_tc_fob_point_summary',value:fob_name.table})

        // var loadOwner = consolidated_shippingrecord.getValue({fieldId: 'custbody_tc_load_owner'})
        // var loadOwnerName = consolidated_shippingrecord.getText({fieldId: 'custbody_tc_load_owner'})
        // var empRec = record.load({type: 'employee', id: loadOwner})
        // var loademail = empRec.getValue({fieldId: 'email'})
        // var loadphone = empRec.getValue({fieldId: 'officephone'})

        // consolidated_shippingrecord.setValue({fieldId:'custbody_tc_load_contact_name',value:loadOwnerName})
        // consolidated_shippingrecord.setValue({fieldId:'custbody_tc_load_contact_number',value:loadphone})
        // consolidated_shippingrecord.setValue({fieldId:'custbody_tc_load_contact_email',value:loademail})
       if (mainSO){
        var salesorderSearchObj = search.create({
   type: "salesorder",
   settings:[{"name":"consolidationtype","value":"ACCTTYPE"}],
   filters:
   [
      ["type","anyof","SalesOrd"], 
      "AND", 
      ["internalid","anyof",mainSO]
   ],
   columns:
   [
      search.createColumn({
         name: "shippingattention",
         summary: "GROUP",
         label: "Shipping Attention"
      }),
      search.createColumn({
         name: "shipphone",
         summary: "GROUP",
         label: "Shipping Phone"
      })
   ]
});
var searchResultCount = salesorderSearchObj.runPaged().count;
log.debug("salesorderSearchObj result count",searchResultCount);
salesorderSearchObj.run().each(function(result){
  log.debug('result', result)
  var phoneNum = result.getValue({name: 'shipphone', summary: 'GROUP'});
   consolidated_shippingrecord.setValue({fieldId:'custbody_tc_receiver_contact_name',value:result.getValue({name: 'shippingattention', summary: 'GROUP'})})
   if (phoneNum && phoneNum != '- None -') consolidated_shippingrecord.setValue({fieldId:'custbody_tc_receiver_number',value: String(phoneNum).slice(0, 32)})
   return false;
});
       }
        

        consolidated_shippingrecord.save()
        //SD - TO Chnage
        } else if (lookupType == 'TrnfrOrd') {
          // Transfer Order path
          var total_cal_weight_to = 0;
          for (var key in groupedBySalesOrder) {
            if (!groupedBySalesOrder.hasOwnProperty(key)) continue;

            var keySO = key;
            log.debug({ title: 'keySO', details: keySO });

            var data = groupedBySalesOrder[keySO];
            var load_SO = record.load({ type: record.Type.TRANSFER_ORDER, id: keySO, isDynamic: true });
            var currency = load_SO.getValue({ fieldId: 'currency' });
            consolidated_shippingrecord.setValue({ fieldId: 'custbody_tc_con_ship_currency', value: currency });

            for (var i = 0; i < data.length; i++) {
              var item = data[i].item;
              var line = data[i].line;
              var shippingRecLine = data[i].shippingrecordLine;

              var SO_LINE = load_SO.findSublistLineWithValue({ sublistId: 'item', fieldId: 'line', value: line });
              log.debug({ title: 'SO_LINE', details: SO_LINE });

              if (SO_LINE !== -1) {
                load_SO.selectLine({ sublistId: 'item', line: SO_LINE });
                load_SO.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_related_shipping_record', value: recID });
                if (shipDate) {
                  //load_SO.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_scheduled_ship_date', value: new Date(shipDate) });
                }
                load_SO.commitLine({ sublistId: 'item' });
              }

              var getRelatedData = getTransferOrderData(item, line, keySO);
              log.debug({ title: 'getRelatedData', details: getRelatedData });
              log.debug({ title: 'shippingRecLine', details: shippingRecLine });

              consolidated_shippingrecord.selectLine({ sublistId: 'line', line: shippingRecLine });
              var currentqty = consolidated_shippingrecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_shipping_qty' });

              var displayQty = String(Math.round(Math.abs(parseFloat(getRelatedData.quantity) || 0)));
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_po_number', value: getRelatedData.po_num });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_commited', value: String(Math.round(parseFloat(getRelatedData.quantitycommitted) || 0)) });

              consolidated_shippingrecord.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_tc_item_qty',
                value: displayQty
              });

              var countryTextTO = (getRelatedData && getRelatedData.countryofmanufacture_text) ? getRelatedData.countryofmanufacture_text : '';
              if (!countryTextTO && getRelatedData && getRelatedData.countryofmanufacture) {
                var codeTO = String(getRelatedData.countryofmanufacture).toUpperCase();
                if (codeTO === 'CA') countryTextTO = 'Canada';
              }
              if (countryTextTO) {
                try {
                  consolidated_shippingrecord.setCurrentSublistText({
                    sublistId: 'line',
                    fieldId: 'custcol_tc_cntry_of_orig',
                    text: countryTextTO
                  });
                } catch (eCountryTO) {
                  log.debug({ title: 'set country fail TO', details: eCountryTO });
                }
              }

              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_supp_req_date', value: new Date(getRelatedData.requesteddate) });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_product_group', value: getRelatedData.productGroup });
              if (parseInt((currentqty) / (getRelatedData.bundleSize)) > 0) {
                consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_crate_size', value: parseInt((currentqty) / (getRelatedData.bundleSize)) });
              }

              var linear_feet_to = Math.round(((getRelatedData.length) * (currentqty)) / 12 * 100) / 100;
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'memo', value: getRelatedData.memo });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_linear_feet', value: linear_feet_to });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_available', value: String(Math.round(parseFloat(getRelatedData.quantityshiprecv) || 0)) });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_line_hs_code', value: getRelatedData.item_hscode });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_bol_group', value: getRelatedData.item_bol_group });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_ts_item_rate', value: getRelatedData.item_rate });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_ts_item_discount', value: parseFloat(getRelatedData.item_discount) });
              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_if_bol_col_weight_item', value: Math.round(getRelatedData.weight * 100) / 100 });

              if (scraprec == true || scraprec == 'true') {
                consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_ds_remove', value: true });
              }

              if (getRelatedData.weight && getRelatedData.weight > 0 && currentqty) {
                var final_weight_to = Math.round(parseFloat((getRelatedData.weight) * (currentqty)) * 100) / 100;
                log.audit('final_weight', final_weight_to);
                total_cal_weight_to = parseFloat(total_cal_weight_to) + parseFloat(final_weight_to);
                log.audit('total_cal_weight', total_cal_weight_to);
                consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_total_item_weight', value: Math.round(parseFloat((getRelatedData.weight) * (currentqty)) * 100) / 100 });
              }

              consolidated_shippingrecord.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_ship_unit', value: getRelatedData.shipunit });

              if (i == 0) {
                consolidated_shippingrecord.setValue({ fieldId: 'custbody_tc_shipping_charge', value: getRelatedData.shipping_charge });
                consolidated_shippingrecord.setValue({ fieldId: 'custbody_tc_related_tran', value: keySO });

                if (context.type == context.UserEventType.CREATE) {
                  if (getRelatedData.ship_date) {
                    consolidated_shippingrecord.setValue({ fieldId: 'custbody_tc_schedule_shipment_date', value: new Date(getRelatedData.ship_date) });
                  }
                }
              }

              consolidated_shippingrecord.commitLine({ sublistId: 'line' });
            } // end data loop

            load_SO.save();
          } // end grouped keys for TrnfrOrd

          // Remove marked lines (same pattern as in SalesOrd branch)
          var gc2 = consolidated_shippingrecord.getLineCount({ sublistId: 'line' });
          for (var j = 0; j < gc2; j++) {
            consolidated_shippingrecord.selectLine({ sublistId: 'line', line: j });
            var remove2 = consolidated_shippingrecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_ds_remove' });
            if (remove2 == true) {
              var salesorder1b = consolidated_shippingrecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_sales_order' });
              var lineid1b = consolidated_shippingrecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_tc_line_id' });
              consolidated_shippingrecord.removeLine({ sublistId: 'line', line: j, ignoreRecalc: false });
              gc2 = gc2 - 1;
              j = j - 1;
              try {
                var load_SO1b = record.load({ type: record.Type.TRANSFER_ORDER, id: salesorder1b, isDynamic: true });
                var lineNumb = load_SO1b.findSublistLineWithValue({ sublistId: 'item', fieldId: 'line', value: lineid1b });
                if (lineNumb != -1) {
                  load_SO1b.selectLine({ sublistId: 'item', line: lineNumb });
                  load_SO1b.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_related_shipping_record', value: '' });
                  load_SO1b.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_tc_scheduled_ship_date', value: '' });
                  load_SO1b.commitLine({ sublistId: 'item' });
                }
                load_SO1b.save();
              } catch (eLoad1b) {
                log.debug({ title: 'Error cleaning TO on remove (TrnfrOrd)', details: eLoad1b });
              }
            }
          }

          consolidated_shippingrecord.setValue({ fieldId: 'custbody_ds_final_cal_weight', value: total_cal_weight_to });
          var fob_name_to = getFOB(recID);
          consolidated_shippingrecord.setValue({ fieldId: 'custbody_tc_fob_point', value: fob_name_to.point });
          consolidated_shippingrecord.save();
        } // end else if TrnfrOrd
        //SD - TO Chnage End
        
      }
    }catch(e){
      log.debug({title:'Error',details:e})
    }
  }
  
  function groupByItem(list, key){
    return list.reduce(function(rv, x) {
      (rv[x[key]] = rv[x[key]] || []).push(x);
      return rv;
    }, {});
  }

  function removeDuplicates(arr) {
  var seen = {};
  var result = [];

  for (var i = 0; i < arr.length; i++) {
    var value = arr[i];
    if (!seen[value]) {
      seen[value] = true;
      result.push(value);
    }
  }

  return result.join('\n');
}
  
  function getSalesOrderData(item,line,keySO){
    var object;
    var salesorderSearchObj = search.create({
      type: "salesorder",
      filters:
      [
        ["type","anyof","SalesOrd"],
        "AND",
        ["internalid","anyof",keySO],
        "AND",
        ["item","anyof",item],
        "AND",
        ["line","equalto",line]
      ],
      columns:
      [
        search.createColumn({name: "tranid", label: "tranid"}),
        search.createColumn({name: "memo", label: "Memo"}),
        search.createColumn({name: "quantitycommitted", label: "Quantity Committed"}),
        search.createColumn({name: "quantity", label: "Quantity"}),
        search.createColumn({name: "requesteddate", label: "Supply Required By Date"}),
        search.createColumn({name: "otherrefnum", label: "PO/Check Number"}),
        search.createColumn({name: "custbody_tc_shipping_charge", label: "Shipping Charge"}),
        search.createColumn({name: "shipaddress", label: "Shipping Address"}),
        search.createColumn({
         name: "custrecord_tc_tax_id",
         join: "billingAddress",
         label: "Tax ID"
      }),
      search.createColumn({
         name: "custrecord_tc_tax_id",
         join: "shippingAddress",
         label: "Tax ID"
      }),
        search.createColumn({name: "line", label: "Line ID"}),
        search.createColumn({name: "quantityshiprecv", label: "Quantity Fulfilled/Received"}),
        search.createColumn({
          name: "custitem_tc_item_length",
          join: "item",
          label: "Length (IN)"
        }),
        search.createColumn({name: "custcol_tc_scheduled_ship_date", label: "Scheduled Ship Date"}),
        search.createColumn({
          name: "custitem_tc_product_group",
          join: "item",
          label: "Product Group"
        }),
        search.createColumn({
          name: "custitem_tc_item_bundle_size",
          join: "item",
          label: "Bundle Size"
        }),
        search.createColumn({name: "item", label: "Item"}),
        //search.createColumn({ name: "fxrate", label: "Item Rate" }),
      search.createColumn({ name: "averagecost", join:"item", label: "Item Rate" }),
      search.createColumn({name: "custcol_tc_discount", label: "Discount"}),
      search.createColumn({
         name: "custitem_ts_hs_code",
         join: "item",
         label: "HS CODE"
      }),
      search.createColumn({
         name: "custitem_tc_item_bol_group",
         join: "item",
         label: "BOL Group"
      }),
        search.createColumn({
         name: "countryofmanufacture",
         join: "item",
         label: "MANUFACTURER COUNTRY"
      }),
         search.createColumn({
         name: "weight",
         join: "item",
         label: "Item weight"
      }),
         search.createColumn({
         name: "custitem_ds_shipping_unit",
         join: "item",
         label: "Shipping Unit"
      })
        
        
      ]
    });
    var searchResultCount = salesorderSearchObj.runPaged().count;
    log.debug("salesorderSearchObj result count",searchResultCount);
    salesorderSearchObj.run().each(function(result){
      object = {
        tranid: result.getValue({name:'tranid'}),
        po_num: result.getValue({name:'otherrefnum'}),
        memo : result.getValue({name:'memo'}),
        quantitycommitted:result.getValue({name:'quantitycommitted'}),
        quantity:result.getValue({name:'quantity'}),
        shipping_charge:result.getValue({name:'custbody_tc_shipping_charge'}),
        requesteddate:result.getValue({name:'requesteddate'}),
        quantityshiprecv:result.getValue({name:'quantityshiprecv'}),
        length:result.getValue({
          name: "custitem_tc_item_length",
          join: "item",
          label: "Length (IN)"}),
        ship_date:result.getValue({name:'custcol_tc_scheduled_ship_date'}),
        productGroup:result.getValue({ name: "custitem_tc_product_group",join: "item",label: "Product Group"}),
        bundleSize:result.getValue({ name: "custitem_tc_item_bundle_size",join: "item",label: "Bundle Size"}),
        item_rate:result.getValue({ name: "averagecost", join:"item" }),
        item_discount:result.getValue({name: "custcol_tc_discount", label: "Discount"}),
        item_hscode:result.getValue({ name: "custitem_ts_hs_code",
        join: "item",
        label: "HS CODE"}),
        item_bol_group:result.getValue({name: "custitem_tc_item_bol_group",
        join: "item",
        label: "BOL Group"}),
        country:result.getValue({name: "countryofmanufacture",
        join: "item",
        label: "MANUFACTURER COUNTRY"}),
        weight:result.getValue({ name: "weight",
         join: "item",
         label: "Item weight"}),
        shipunit:result.getValue({ name: "custitem_ds_shipping_unit",
         join: "item",
         label: "Shipping Unit"}),
        buyerTaxId: result.getValue({
         name: "custrecord_tc_tax_id",
         join: "billingAddress",
         label: "Tax ID"
      }),
        shippingTaxId: result.getValue({
         name: "custrecord_tc_tax_id",
         join: "shippingAddress",
         label: "Tax ID"
      })
        
        }
        
        
        return true;
      });
      
      return object;
    }

  function getTransferOrderData(item, line, keySO) {
    var object = {};
    try {
      var salesorderSearchObj = search.create({
        type: "transaction",
        filters:
          [
            ["type", "anyof", "TrnfrOrd"],
            "AND",
            ["internalid", "anyof", keySO],
            "AND",
            ["mainline", "is", "F"],
            "AND",
            ["taxline", "is", "F"],
            "AND",
            ["item", "anyof", item],
            "AND",
            ["line", "equalto", line]
          ],
        columns:
          [
            search.createColumn({ name: "memo", label: "Memo" }),
            search.createColumn({ name: "quantitycommitted", label: "Quantity Committed" }),
            search.createColumn({ name: "quantity", label: "Quantity" }),
            search.createColumn({ name: "requesteddate", label: "Supply Required By Date" }),
            search.createColumn({ name: "custbody_tc_to_po_num", label: "PO/Check Number" }),
            search.createColumn({ name: "custbody_tc_shipping_charge", label: "Shipping Charge" }),
            search.createColumn({ name: "shipaddress", label: "Shipping Address" }),
            search.createColumn({ name: "line", label: "Line ID" }),
            search.createColumn({ name: "quantityshiprecv", label: "Quantity Fulfilled/Received" }),
            search.createColumn({ name: "custitem_tc_item_length", join: "item", label: "Length (IN)" }),
            search.createColumn({ name: "custcol_tc_scheduled_ship_date", label: "Scheduled Ship Date" }),
            search.createColumn({ name: "custitem_tc_product_group", join: "item", label: "Product Group" }),
            search.createColumn({ name: "custitem_tc_item_bundle_size", join: "item", label: "Bundle Size" }),
            search.createColumn({ name: "item", label: "Item" }),
          //search.createColumn({ name: "fxrate", label: "Item Rate" }),
            search.createColumn({ name: "averagecost", join:"item", label: "Item Rate" }),
            search.createColumn({ name: "custcol_tc_discount", label: "Discount" }),
            search.createColumn({ name: "custitem_ts_hs_code", join: "item", label: "HS CODE" }),
            search.createColumn({ name: "custitem_tc_item_bol_group", join: "item", label: "BOL Group" }),
            search.createColumn({ name: "countryofmanufacture", join: "item", label: "MANUFACTURER COUNTRY" }),
            search.createColumn({ name: "weight", join: "item", label: "Item weight" }),
            search.createColumn({ name: "custitem_ds_shipping_unit", join: "item", label: "Shipping Unit" })
          ]
      });

      var paged = salesorderSearchObj.runPaged();
      log.debug('getSalesOrderData - result count', paged.count);

      if (paged.count === 0) {
        log.debug('getSalesOrderData - NO RESULTS', { keySO: keySO, item: item, line: line });
        return {
          po_num: '',
          memo: '',
          quantitycommitted: 0,
          quantity: 0,
          shipping_charge: '',
          requesteddate: '',
          quantityshiprecv: 0,
          length: 0,
          ship_date: '',
          productGroup: '',
          bundleSize: 1,
          item_rate: 0,
          item_discount: 0,
          item_hscode: '',
          item_bol_group: '',
          countryofmanufacture: '',
          countryofmanufacture_text: '',
          weight: 0,
          shipunit: ''
        };
      }

      var found = null;
      salesorderSearchObj.run().each(function (result) {
        found = result;
        return false;
      });

      if (!found) {
        log.debug('getSalesOrderData - unexpected no found result', { keySO: keySO, item: item, line: line });
        return null;
      }

      object = {
        po_num: found.getValue({ name: 'custbody_tc_to_po_num' }) || '',
        memo: found.getValue({ name: 'memo' }) || '',
        quantitycommitted: found.getValue({ name: 'quantitycommitted' }) || 0,
        quantity: found.getValue({ name: 'quantity' }) || 0,
        shipping_charge: found.getValue({ name: 'custbody_tc_shipping_charge' }) || '',
        requesteddate: found.getValue({ name: 'requesteddate' }) || '',
        quantityshiprecv: found.getValue({ name: 'quantityshiprecv' }) || 0,
        length: found.getValue({ name: "custitem_tc_item_length", join: "item" }) || 0,
        ship_date: found.getValue({ name: 'custcol_tc_scheduled_ship_date' }) || '',
        productGroup: found.getValue({ name: "custitem_tc_product_group", join: "item" }) || '',
        bundleSize: found.getValue({ name: "custitem_tc_item_bundle_size", join: "item" }) || 1,
        item_rate: found.getValue({ name: "averagecost",join:"item" }) || 0,
        item_discount: found.getValue({ name: "custcol_tc_discount" }) || 0,
        item_hscode: found.getValue({ name: "custitem_ts_hs_code", join: "item" }) || '',
        item_bol_group: found.getValue({ name: "custitem_tc_item_bol_group", join: "item" }) || '',
        countryofmanufacture: found.getValue({ name: "countryofmanufacture", join: "item" }) || '',
        countryofmanufacture_text: found.getText({ name: "countryofmanufacture", join: "item" }) || '',
        weight: found.getValue({ name: "weight", join: "item" }) || 0,
        shipunit: found.getValue({ name: "custitem_ds_shipping_unit", join: "item" }) || ''
      };

      log.debug('getSalesOrderData - found object', object);

      // FALLBACK: read committed qty from loaded TO when search returned 0
      if (!object.quantitycommitted || object.quantitycommitted == 0 || object.quantitycommitted === "0") {
        try {
          var toRec = toCache[keySO];
          if (!toRec) {
            toRec = record.load({
              type: record.Type.TRANSFER_ORDER,
              id: keySO,
              isDynamic: false
            });
            toCache[keySO] = toRec;
          }

          var lineIndex = toRec.findSublistLineWithValue({
            sublistId: 'item',
            fieldId: 'line',
            value: line
          });

          if (lineIndex !== -1) {
            var qcomm = toRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'quantitycommitted',
              line: lineIndex
            });
            object.quantitycommitted = qcomm || 0;
            log.debug({ title: 'FALLBACK committed from TO line', details: qcomm });
          } else {
            log.debug({ title: 'FALLBACK - line not found on TO', details: { keySO: keySO, line: line } });
          }
        } catch (e) {
          log.debug({ title: 'Fallback committed error', details: e });
        }
      }

      return object;
    } catch (e) {
      log.debug({ title: 'getSalesOrderData ERROR', details: e });
      return {
        po_num: '',
        memo: '',
        quantitycommitted: 0,
        quantity: 0,
        shipping_charge: '',
        requesteddate: '',
        quantityshiprecv: 0,
        length: 0,
        ship_date: '',
        productGroup: '',
        bundleSize: 1,
        item_rate: 0,
        item_discount: 0,
        item_hscode: '',
        item_bol_group: '',
        countryofmanufacture: '',
        countryofmanufacture_text: '',
        weight: 0,
        shipunit: ''
      };
    }
  }

  function getFOB(recID) {
    var transactionSearchObj = search.create({
        type: "transaction",
        settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
        filters: [
            ["type", "anyof", "Custom116"],
            "AND",
            ["internalid", "anyof", recID],
            "AND",
            ["custcol_tc_sales_order", "noneof", "@NONE@"],
            "AND",
            ["custcol_tc_sales_order.mainline", "is", "T"]
        ],
        columns: [
            search.createColumn({
         name: "internalid",
         summary: "GROUP",
         label: "Internal ID"
      }),
      search.createColumn({
         name: "tranid",
         join: "CUSTCOL_TC_SALES_ORDER",
         summary: "GROUP",
         label: "Document Number"
      }),
      search.createColumn({
         name: "custbody_tc_fob_point",
         join: "CUSTCOL_TC_SALES_ORDER",
         summary: "GROUP",
         label: "FOB Point"
      })
        ]
    });

    var tableHTML = '<table border="1" style="border-collapse: collapse; width: 100%;">';
    tableHTML += '<tr><th>Sales Order</th><th>FOB Point</th></tr>';

    var fobValues = [];
    var allRows = '';

    transactionSearchObj.run().each(function (result) {
        var salesOrder = result.getValue({
            name: "tranid",
            join: "CUSTCOL_TC_SALES_ORDER",
            summary: "GROUP"
        });
        var fobPoint = result.getValue({
            name: "custbody_tc_fob_point",
            join: "CUSTCOL_TC_SALES_ORDER",
            summary: "GROUP"
        });
              var fobPointname = result.getText({
            name: "custbody_tc_fob_point",
            join: "CUSTCOL_TC_SALES_ORDER",
            summary: "GROUP"
        });

        fobValues.push(fobPoint);
        allRows += "<tr><td>"+ salesOrder +"</td><td>"+ fobPointname +"</td></tr>";
        return true;
    });

var allFOBsSame = true;
for (var i = 0; i < fobValues.length; i++) {
    for (var j = 0; j < fobValues.length; j++) {
        if (fobValues[i] !== fobValues[j] && i != j) {
            allFOBsSame = false;
            break;
        }
    }
    if (!allFOBsSame) {
        break;
    }
}

    if (allFOBsSame) {
        tableHTML = ''; // Set tableHTML to empty if all FOB Points are the same
        log.debug("FOB Points", "All FOB Points are the same. Table not generated.");
    } else {
        tableHTML += allRows;
        tableHTML += '</table>';
    }

    if (fobValues.length > 0) var pointname = fobValues[0];
    else var pointname = "";
      

    log.debug("Generated HTML Table", tableHTML);
    return {table: tableHTML, point: fobValues[0]};
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
    
    return {
      afterSubmit: afterSubmit
    };
  });
