/**
* @NApiVersion 2.x
* @NScriptType Suitelet
* @NModuleScope SameAccount
*/

define(['N/render', 'N/record', 'N/xml', 'N/search', 'N/runtime', 'N/file'], function(render, record, xml, search, runtime, file) {
      function onRequest(context) {

          var response = context.response;

        if (context.request.method == 'POST'){
          var pickwave = context.request.parameters.recid;

          if (pickwave) {
            log.debug('pickwave', pickwave)


const picktaskSearchObj = search.create({
   type: "picktask",
   filters:
   [
      ["item.custitem_tc_is_crating_item","is","T"], 
      "AND", 
      ["status","anyof","READY"], 
      "AND", 
      ["wavename","anyof",pickwave]
   ],
   columns:
   [
      search.createColumn({name: "internalid", label: "Internal ID"})
   ]
});
const searchResultCount = picktaskSearchObj.runPaged().count;
log.debug("picktaskSearchObj result count",searchResultCount);
picktaskSearchObj.run().each(function(result){
   var pickId = result.getValue('internalid');
   log.debug('pickId', pickId)

  var PICK_task = record.load({
        type: 'picktask',
        id: pickId,
        isDynamic:false
      });
      
      var lineCount = PICK_task.getLineCount({sublistId:'pickactions'})
      log.debug('lineCount', lineCount)
      
      for (var i = 0; i < lineCount; i++) {
        
        PICK_task.setSublistText({sublistId:'pickactions',fieldId:'status',line:i,text:'Done'})
        var qty = PICK_task.getSublistValue({sublistId:'pickactions',fieldId:'quantity',line:i})
        PICK_task.setSublistValue({sublistId:'pickactions',fieldId:'pickedquantity',line:i,value:qty})
        PICK_task.setText({fieldId:'status',text:'Done'})
      }
      PICK_task.save();

    
   return true;
});

            response.write('SUCCESS');

            
            return; 
          }
         }

           if (context.request.method == 'GET'){

          var ifid = context.request.parameters.recId;
          var idBol = context.request.parameters.recIdBOL;
          var idLOAD = context.request.parameters.recIdLoad;
          var idPerforma = context.request.parameters.recIdPforma;
          var idUSMAC = context.request.parameters.recIdPUsmac;


          
          if(ifid){
            //SD - Print Image Change
            var recObj = record.load({
                type: 'customtransaction118',
                id: ifid
             });
            var transactionSearchObj = search.create({
               type: "transaction",
               filters:
               [
                  ["type","anyof","Custom116"], 
                  "AND", 
                  ["internalid","anyof",ifid], 
                  "AND", 
                  ["custcol_tc_sales_order.custbody_so_delivery_map","noneof","@NONE@"], 
                  "AND", 
                  ["mainline","is","F"], 
                  "AND", 
                  ["custcol_tc_sales_order.mainline","is","T"]
               ],
               columns:
               [
                  "custcol_tc_sales_order",
                  "custbody_so_delivery_map"
               ]
            });
            var results = transactionSearchObj.run().getRange({ start: 0, end: 1 });
            //log.debug('results:', results);

            if (results.length > 0) {
              var firstResult = results[0];

              var soId = firstResult.getValue({
                name: "custcol_tc_sales_order"
              });

              log.debug('Sales Order ID:', soId);

                 var foundImage = '';
                 var imageId = '';
                 var lookup = search.lookupFields({
                    type: search.Type.SALES_ORDER,
                    id: soId,
                    columns: ['custbody_so_delivery_map']
                  });

                  const imageField = lookup.custbody_so_delivery_map;

                  if (imageField && imageField.length > 0) {
                    foundImage = imageField[0].text;
                    imageId = imageField[0].value;
                  }
                
                if (foundImage) {
                    var accountId = runtime.accountId.toLowerCase().replace('_', '-');
                    var domain = 'https://' + accountId + '.app.netsuite.com';
                    var url = domain + foundImage;
                    log.debug('URL', url);
                    recObj.setValue({
                        fieldId: 'custbody_ts_delivery_loc_url',
                        value: url
                    });
                    var myFile = file.load({
                      id: imageId
                    });
                    myFile.isOnline = true;
                    myFile.save();
                }
            } else {
              log.debug('No results found.');
            }

            //SD - End
            
            var pdfFileName = "Order Confirmation ";
            var renderer = render.create(ifid);
            renderer.setTemplateByScriptId("CUSTTMPL_131_6518122_SB1_863");
            renderer.addRecord( 'record' , recObj);  //SD - Print Image Change
          }

          //   CUSTTMPL_BOL_STANDALONE_TEMPLATE
          if(idBol){
            var market = context.request.parameters.market;
            var newPDF = context.request.parameters.newPDF;
            var pdfFileName = "BOL";
            var renderer = render.create(idBol);
            

            if (market == 'false' && newPDF == 'true') renderer.setTemplateByScriptId("CUSTTMPL_151_6518122_512"); // CUSTTMPL_140_6518122_311
            else if (market == 'true' && newPDF == 'false') renderer.setTemplateByScriptId("CUSTTMPL_136_6518122_376");
            else if (market == 'true' && newPDF == 'true') renderer.setTemplateByScriptId("CUSTTMPL_152_6518122_254"); // CUSTTMPL_146_6518122_375
            else renderer.setTemplateByScriptId("CUSTTMPL_136_6518122_376");
            renderer.addRecord( 'record' , record.load({
                type: 'customtransaction118',
                id: idBol
             })
            );
          }


          if(idLOAD){
            var pdfFileName = "load Confirmation";
            var renderer = render.create(idLOAD);
            renderer.setTemplateByScriptId("CUSTTMPL_147_6518122_325");
            renderer.addRecord( 'record' , record.load({
                type: 'customtransaction118',
                id: idLOAD
             })
            );
          }

          if(idPerforma){

            var pdfFileName = "BOL";   
            var renderer = render.create(idPerforma);

            var market = context.request.parameters.market;
            var newPDF = context.request.parameters.newPDF;

            if (market == 'false' && newPDF == 'true') renderer.setTemplateByScriptId("CUSTTMPL_149_6518122_102"); //CUSTTMPL_139_6518122_800
            else if (market == 'true' && newPDF == 'false') renderer.setTemplateByScriptId("CUSTTMPL_138_6518122_783");
            else if (market == 'true' && newPDF == 'true') renderer.setTemplateByScriptId("CUSTTMPL_150_6518122_198"); // CUSTTMPL_145_6518122_442
            else renderer.setTemplateByScriptId("CUSTTMPL_133_6518122_SB1_694");
            renderer.addRecord( 'record' , record.load({
                type: 'customtransaction118',
                id: idPerforma
             })
            );
          }

             if(idUSMAC){
            var pdfFileName = "Order Confirmation ";
            var renderer = render.create(idUSMAC);
            renderer.setTemplateByScriptId("CUSTTMPL_134_6518122_SB1_256");
            renderer.addRecord( 'record' , record.load({
                type: 'customtransaction118',
                id: idUSMAC
             })
            );
          }
          
          //context.response.setHeader({
          //  name: 'content-disposition',
          //  value: 'inline; filename="' + pdfFileName + '_' + ifid + '.pdf"'
          //});
          //context.response.writeFile(renderer.renderAsPdf());
        }

        var newfile=renderer.renderAsPdf();

        context.response.writeFile(newfile, true);
           }

           return {
              onRequest: onRequest
          };
      });
