/**
*
* Script Type: MapReduceScript
* @NApiVersion 2.0
* @NScriptType MapReduceScript
**/

define(['N/error', 'N/record', 'N/runtime','N/render','N/email','N/search','N/task','N/format'], mapReduce);
function mapReduce(error, record, runtime,render,email,search,task,format) {
  function getInputData(inputContext){
    try{
      
      var curScriptObj = runtime.getCurrentScript();
      var userObj = runtime.getCurrentUser().id;
      log.debug({title:'userObj',details:userObj})
      var selectedPurchaseOrder = JSON.parse(curScriptObj.getParameter({name:'custscript_ts_selec_to_update'}));
      log.debug({title:'selectedPurchaseOrder',details:selectedPurchaseOrder})

      var shipment_Date = selectedPurchaseOrder[0]['shipment_date']
      var location_new = selectedPurchaseOrder[0]['location_new']
      var create_shipping_rec = selectedPurchaseOrder[0]['create_shipping_rec']
      var location_name = selectedPurchaseOrder[0]['locationto']
      //var customerID = selectedPurchaseOrder[0]['customerID']

      var subid = selectedPurchaseOrder[0]['subidto']



      
      var gropedByCustomer = groupByItem(selectedPurchaseOrder,'internalID');
      log.debug({title:'gropedByCustomer',details:gropedByCustomer})
      
      var keys = Object.keys(gropedByCustomer);
      log.debug({title:'keys',details:keys})
      
      for (var soKeys = 0; soKeys < keys.length; soKeys++) {
        log.debug('Key', keys[soKeys]);
        
        var salesorderSearchObj = search.create({
          type: "transferorder",
          filters:
          [
            ["type","anyof","TrnfrOrd"], 
            "AND", 
            ["internalid","anyof",keys[soKeys]], 
            "AND", 
            ["item","anyof","156"],//creating fee
             "AND", 
            ["custcol_tc_related_shipping_record","anyof","@NONE@"]
          ],
          columns:
          [
            search.createColumn({name: "internalid", label: "Internal ID"}),
            search.createColumn({name: "item", label: "Item"}),
            search.createColumn({name: "quantity", label: "Quantity"}),
            search.createColumn({name: "quantityshiprecv", label: "Quantity Fulfilled/Received"}),
            search.createColumn({
              name: "formulanumeric",
              formula: "{quantity}-{quantityshiprecv}",
              label: "Formula (Numeric)"
            }),
            search.createColumn({name: "line", label: "Line ID"})

          ]
        });
        var searchResultCount = salesorderSearchObj.runPaged().count;
        log.debug("salesorderSearchObj result count",searchResultCount);
        salesorderSearchObj.run().each(function(result){
          
          var remaningCratingQty = result.getValue({
            name: "formulanumeric",
            formula: "{quantity}-{quantityshiprecv}",
            label: "Formula (Numeric)"
          })
          var itemID = result.getValue({
            name: "item", label: "item"
          })
          var lineID = result.getValue({
            name: "line", label: "Line ID"
          })
          
          
          if(remaningCratingQty >0){
            var object = {
              internalID: keys[soKeys],
              itemID: itemID,
              qty: remaningCratingQty,
              shipment_date: shipment_Date,
              create_shipping_rec: create_shipping_rec,
              location_new: location_new,
              line_id: lineID,
              shippingQty: null,
              //customerID: customerID,
              location_name: location_name,
              subid: subid
            }
            selectedPurchaseOrder.push(object)
          }
          return true;
        });
      }
      
      //var customerForConShipping = selectedPurchaseOrder[0].customerID
      var createShipingrec = selectedPurchaseOrder[0].create_shipping_rec
      var shipDate = selectedPurchaseOrder[0].shipment_date
      log.debug({title:'shipDate',details:shipDate})
      log.debug('selectedPurchaseOrder', selectedPurchaseOrder[0])
      
      var subForConShipping = selectedPurchaseOrder[0].subidto
      var location_new = selectedPurchaseOrder[0].location_new
      var location_name = selectedPurchaseOrder[0].locationto
      
      if(createShipingrec == 'T'){
        var consolidateRecord =  record.create({
          type: 'customtransaction118',
          isDynamic:true
        });
        
        //consolidateRecord.setValue({fieldId:'custbody_tc_customer',value:customerForConShipping})
        consolidateRecord.setValue({fieldId:'custbody_tc_load_owner',value:userObj})
        consolidateRecord.setValue({fieldId:'subsidiary',value:subForConShipping})
        if(subForConShipping == "5") {
          consolidateRecord.setValue({fieldId:'custbody_tc_customer',value: 148861})
        }

        if(subForConShipping == "6") {
          consolidateRecord.setValue({fieldId:'custbody_tc_customer',value: 148862})
        }
        log.debug("This is the subsidiary, then subForConShipping ", subForConShipping);
        var data = search.lookupFields({
          type: record.Type.TRANSFER_ORDER,
          id: selectedPurchaseOrder[0].internalID,
          columns: ['location'] 
        });
        log.debug('Data.location', data.location[0].value);
        consolidateRecord.setValue({fieldId:'custbody_tc_shipping_loc',value:data.location[0].value});
        //consolidateRecord.setText({fieldId:'custbody_tc_shipping_loc',text:location_name});
        
        /*
        if(location_new){
          log.debug("This is the new location code " + location_new);
          consolidateRecord.setValue({fieldId:'custbody_tc_shipping_loc',value:location_new})
        }else{
          consolidateRecord.setText({fieldId:'custbody_tc_shipping_loc',text:location_name})
        }*/
        
        if(shipDate){
          consolidateRecord.setValue({fieldId:'custbody_tc_schedule_shipment_date',value:new Date(shipDate)})
        }
        
        
        log.debug('selectedPurchaseOrder', selectedPurchaseOrder)
        for (var i = 0; i < selectedPurchaseOrder.length; i++) {
          //log.debug({title:'selectedPurchaseOrder',details:selectedPurchaseOrder})
          
          consolidateRecord.selectLine({sublistId:'line',line:i})
          log.debug('i', i)
          
          consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_sales_order',value:selectedPurchaseOrder[i].internalID})
          consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'account',value:54})
          // consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_ship_to',value:selectedPurchaseOrder[i].custaddress})
          
          
          consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'amount',value:"0.001"})
          consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_line_id',value:selectedPurchaseOrder[i].line_id})
          
          
          consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_item',value:selectedPurchaseOrder[i].itemID})
          log.debug({title:'coming after item',details:'coming after item'})
          
          consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_item_qty',value:parseFloat(selectedPurchaseOrder[i].qty)})
          log.debug({title:'coming after qty',details:'coming after qty'})
          
          if(!isEmpty(selectedPurchaseOrder[i].shippingQty)){
            log.debug({title:'(selectedPurchaseOrder[i].shippingQty)',details:selectedPurchaseOrder[i].shippingQty})
            
            consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_shipping_qty',value:selectedPurchaseOrder[i].shippingQty})
          }else{
            
            consolidateRecord.setCurrentSublistValue({sublistId:'line',fieldId:'custcol_tc_shipping_qty',value:parseFloat(selectedPurchaseOrder[i].qty)})
            log.debug({title:'coming after else',details:'coming after else'})
            
          }
          
          consolidateRecord.commitLine({sublistId:'line'})
          log.debug({title:'Line',details:selectedPurchaseOrder[i]})
          
        }
        var recIDD = consolidateRecord.save();
        log.debug({title:'recIDD',details:recIDD})
        
      }
      
      
      return gropedByCustomer;
      
    }catch (error) {
      log.error({ title: 'mapReduce.getInputData', details: error});
      throw error;
    }
  }
  
  function map(context){
    try{
      
      var userObj = runtime.getCurrentUser();
      var curScriptObj = runtime.getCurrentScript();
      var purchaseOrderID = JSON.parse(context.value);
      log.debug({title:'purchaseOrderID',details:purchaseOrderID})
      var salesorderID = purchaseOrderID[0]['internalID']
      log.debug({title:'salesorderID',details:salesorderID})
      var load_sales_order = record.load({type:record.Type.TRANSFER_ORDER,id:salesorderID,isDynamic:true});
      log.debug({title:'load_sales_order',details:load_sales_order})
      
      for (var i = 0; i < purchaseOrderID.length; i++) {
        
        var itemID = purchaseOrderID[i].itemID;
        var qty = purchaseOrderID[i].qty;
        var shipment_Date = purchaseOrderID[i].shipment_date;
        var new_location = purchaseOrderID[i].location_new
        var linenumber = purchaseOrderID[i].line_id
        
        
        var lineID = load_sales_order.findSublistLineWithValue({sublistId:'item',fieldId:'line',value:linenumber});
        log.debug({title:'lineID',details:lineID})
        
        var lineQty = load_sales_order.getSublistValue({sublistId:'item',fieldId:'quantity',line:lineID});
        log.debug({title:'lineQty',details:lineQty})
        
        if(lineID != -1){
          load_sales_order.selectLine({sublistId:'item',line:lineID});
          
          if(shipment_Date){
            log.debug({title:'shipDate',details:shipment_Date})
            
            shipment_Date = format.format({value:new Date(shipment_Date),type:format.Type.DATE});
            log.debug({title:'shipment_Date',details:shipment_Date})
            load_sales_order.setCurrentSublistValue({sublistId:'item',fieldId:'custcol_tc_scheduled_ship_date',value: new Date(shipment_Date)});
          }
          
          /*if(new_location){
            load_sales_order.setCurrentSublistValue({sublistId:'item',fieldId:'inventorylocation',value:new_location});
          }*/
          load_sales_order.commitLine({sublistId:'item'})
        }
        
      }
      load_sales_order.save({enableSourcing:true,ignoreMandatoryFields:true})
      log.debug({title:'shipment_Date',details:"shipment_Date"})
      
      
      
      
    }catch(error){
      log.error({ title: 'mapReduce.map', details: error});
      throw error;
    }
  }
  
  function summarize(summary) {
    
    summary.mapSummary.errors.iterator().each(function(key, value) {
      log.error(key, 'ERROR String: '+value);
      return true;
    });
  }
  
  function groupByItem(list, key){
    return list.reduce(function(rv, x) {
      (rv[x[key]] = rv[x[key]] || []).push(x);
      return rv;
    }, {});
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
    getInputData: getInputData,
    map: map,
    summarize: summarize
  };
};
