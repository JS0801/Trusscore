/**
* @NApiVersion 2.0
* @NScriptType UserEventScript
*/
define(['N/record', 'N/log', 'N/search'], function(record, log, search) {
  
  function afterSubmit(context) {
    // Run only on Create or Edit
    if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
      return;
    }
    
    try {
      var rec = context.newRecord;
      var recid = rec.id;
      var recType = rec.type;
      log.debug('recType',recType)
      
      var recload = record.load({ type: recType, id: recid });
      
      var sublistId = '';
      var field = '';
      var qtyField = '';

      
      if (recType == 'salesorder' ) {
        sublistId = 'item'
        field = 'item'
        qtyField =  'quantity'
        
      }else{
        sublistId = 'line'
        field = 'custcol_tc_item'
        qtyField = 'custcol_tc_item_qty'
        
      }
      
      var lineCount = recload.getLineCount({ sublistId: sublistId });
      
      log.debug('Processing Sales Order', 'ID: ' + context.newRecord.id + ' | Total Lines: ' + lineCount);
      
      for (var i = 0; i < lineCount; i++) {
        var itemId = recload.getSublistValue({ sublistId: sublistId, fieldId:field, line: i });
        
        var marketValue = 0;
        if (!itemId) continue; // Skip if no item found

        var itemSearchObj = search.create({
   type: "item",
   filters:
   [
      ["internalid","anyof",itemId]
   ],
   columns:
   [
      search.createColumn({name: "custitem_tc_us_market_value", label: "Market Value [USD] "})
   ]
});
var searchResultCount = itemSearchObj.runPaged().count;
log.debug("itemSearchObj result count",searchResultCount);
itemSearchObj.run().each(function(result){
   marketValue = result.getValue('custitem_tc_us_market_value');
   return true;
});
        
        // // Lookup Market Value from Item Record
        // var marketValue = search.lookupFields({
        //   type: "lotnumberedassemblyitem",
        //   id: itemId,
        //   columns: ['custitem_tc_us_market_value']
        // }).custitem_tc_us_market_value;
        
        // // If field is empty, default to 0
        // marketValue = marketValue ? parseFloat(marketValue) : 0;

        // if(!marketValue){
        //   var marketValue = search.lookupFields({
        //   type: "lotnumberedassemblyitem",
        //   id: itemId,
        //   columns: ['custitem_tc_us_market_value']
        // }).custitem_tc_us_market_value;

        //   marketValue = marketValue ? parseFloat(marketValue) : 0;
        // }
        
        
        
        var quantity = recload.getSublistValue({ sublistId: sublistId, fieldId: qtyField, line: i }) || 0;
        var bolGrp = recload.getSublistValue({ sublistId: sublistId, fieldId: 'custcol_bol_group', line: i })
        log.debug('bolGrp', bolGrp)
        var countryString = '';
        var countryId = 37;
        if (bolGrp == 43){
          countryString = 'China Melt/Pour';
          countryId = 47;
        } else if (bolGrp == 38){
          countryString = 'Canada Melt/Pour\nFinished product does not contain aluminum';
          countryId = 37;
        }  else if (bolGrp == 37){
          countryString = 'Smelt/Cast USA';
          countryId = 230;
        } 



        recload.setSublistValue({
          sublistId: sublistId,
          fieldId: 'custcol_tc_cntry_of_orig',
          line: i,
          value: countryId
        });

        recload.setSublistValue({
          sublistId: sublistId,
          fieldId: 'custcol_tc_bol_description',
          line: i,
          value: countryString
        });
        
        
        var extendedMarketValue = marketValue * quantity;
        
        log.debug('Item ID: ' + itemId, {
          MarketValue: marketValue,
          Quantity: quantity,
          ExtendedMarketValue: extendedMarketValue,
          countryId: countryId,
          countryString: countryString
        });
        
        
        recload.setSublistValue({
          sublistId: sublistId,
          fieldId: 'custcol_tc_market_value',
          line: i,
          value: marketValue
        });
        
        
        recload.setSublistValue({
          sublistId: sublistId,
          fieldId: 'custcol_tc_extended_market_value',
          line: i,
          value: extendedMarketValue
        });
      }
      
      
      recload.save();
      
      
    } catch (e) {
      log.error('Error in afterSubmit', e.message);
    }
  }
  
  return {
    afterSubmit: afterSubmit
  };
  
});
